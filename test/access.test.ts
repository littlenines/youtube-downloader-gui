import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { ACCESS_COOKIE, accessCookie, createApp, isSameKey, readCookie } from '../src/server/app.js';
import { decodePathPart, HttpError } from '../src/server/lib/http.js';
import { CONTENT_SECURITY_POLICY, serveStaticFile } from '../src/server/lib/static.js';
import type { RouteDependencies } from '../src/server/routes/index.js';

const ACCESS_KEY = 'k'.repeat(43);

describe('access key', () => {
  it('reads one cookie among several', () => {
    assert.equal(readCookie(`theme=dark; ${ACCESS_COOKIE}=abc; other=1`, ACCESS_COOKIE), 'abc');
    assert.equal(readCookie(undefined, ACCESS_COOKIE), null);
  });

  it('compares keys exactly', () => {
    assert.equal(isSameKey(ACCESS_KEY, ACCESS_KEY), true);
    assert.equal(isSameKey('k'.repeat(42), ACCESS_KEY), false);
    assert.equal(isSameKey(null, ACCESS_KEY), false);
  });

  it('stores the key in a cookie scripts and other sites cannot use', () => {
    assert.match(accessCookie(ACCESS_KEY), /HttpOnly/);
    assert.match(accessCookie(ACCESS_KEY), /SameSite=Strict/);
  });
});

describe('the API behind the access key', async () => {
  let server: Server;
  let baseUrl = '';
  const dependencies = {
    settings: { get: () => ({ downloadFolder: '/downloads', simultaneousDownloads: 2, lowLatencyRendering: true }) },
    history: { list: () => [] },
    queue: { list: () => [] },
  } as unknown as RouteDependencies;

  before(async () => {
    server = createApp(dependencies, { loopbackOnly: true, accessKey: ACCESS_KEY });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });
  after(() => server.close());

  it('refuses API requests without the key', async () => {
    assert.equal((await fetch(`${baseUrl}/api/downloads`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/downloads`, { headers: { cookie: `${ACCESS_COOKIE}=wrong` } })).status, 401);
  });

  it('turns an access link into a cookie and a clean address', async () => {
    const response = await fetch(`${baseUrl}/?url=https%3A%2F%2Fyoutu.be%2Fx&access=${ACCESS_KEY}`, { redirect: 'manual' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/?url=https%3A%2F%2Fyoutu.be%2Fx');
    assert.match(response.headers.get('set-cookie') ?? '', new RegExp(`^${ACCESS_COOKIE}=${ACCESS_KEY};`));
  });

  it('refuses a wrong access link', async () => {
    assert.equal((await fetch(`${baseUrl}/?access=wrong`, { redirect: 'manual' })).status, 401);
  });

  it('answers API requests that carry the key', async () => {
    const response = await fetch(`${baseUrl}/api/downloads`, { headers: { cookie: `${ACCESS_COOKIE}=${ACCESS_KEY}` } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { jobs: [], history: [] });
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  it('answers a malformed address with 400, not a server error', async () => {
    const response = await fetch(`${baseUrl}/api/downloads/%E0%A4%A/cancel`, {
      method: 'POST',
      headers: { cookie: `${ACCESS_COOKIE}=${ACCESS_KEY}` },
    });
    assert.equal(response.status, 400);
  });
});

describe('serveStaticFile', () => {
  const source = { read: async (name: string) => (name === 'index.html' ? Buffer.from('<!doctype html>') : null) };
  const fakeResponse = () => {
    const sent: { status?: number; headers?: Record<string, string> } = {};
    return {
      sent,
      response: {
        writeHead: (status: number, headers: Record<string, string>) => Object.assign(sent, { status, headers }),
        end: () => {},
      } as unknown as Parameters<typeof serveStaticFile>[0],
    };
  };

  it('sends the page with a Content-Security-Policy', async () => {
    const { sent, response } = fakeResponse();
    assert.equal(await serveStaticFile(response, source, '/'), true);
    assert.equal(sent.headers?.['content-security-policy'], CONTENT_SECURITY_POLICY);
    assert.match(CONTENT_SECURITY_POLICY, /default-src 'self'/);
  });

  it('ignores a malformed address instead of failing', async () => {
    const { response } = fakeResponse();
    assert.equal(await serveStaticFile(response, source, '/%E0%A4%A'), false);
  });
});

describe('decodePathPart', () => {
  it('decodes normal parts and turns malformed ones into a 400', () => {
    assert.equal(decodePathPart('a%20b'), 'a b');
    assert.throws(
      () => decodePathPart('%E0%A4%A'),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
  });
});
