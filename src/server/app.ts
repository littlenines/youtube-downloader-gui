import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { IS_SINGLE_EXECUTABLE, PUBLIC_DIRECTORY } from './config.js';
import { Router, sendJson } from './lib/http.js';
import { directorySource, embeddedSource, serveStaticFile } from './lib/static.js';
import { registerRoutes, type RouteDependencies } from './routes/index.js';
import { WEB_ASSETS } from './web-assets.js';

const LOOPBACK_HOST_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

export const ACCESS_COOKIE = 'yt-downloader-access';
/** "?access=<key>" in a link sets the access cookie; the browser mode opens such a link. */
export const ACCESS_PARAMETER = 'access';
const ACCESS_COOKIE_MAXIMUM_AGE_SECONDS = 365 * 24 * 3600;

export const isLoopbackHost = (host: string): boolean => LOOPBACK_HOST_NAMES.has(host) || host === '::1';

function hostName(hostHeader: string | undefined): string | null {
  try {
    return hostHeader ? new URL(`http://${hostHeader}`).hostname : null;
  } catch {
    return null;
  }
}

export interface RequestGuardOptions {
  /** True when the server listens only on this computer, which is the case unless HOST was set to share it. */
  loopbackOnly: boolean;
}

export interface AppOptions extends RequestGuardOptions {
  /** Every API request must carry this key in the access cookie. */
  accessKey: string;
}

/**
 * Refuses requests other websites could make. A page open in the user's browser can POST to the local
 * API (caught by comparing Origin with Host), or use DNS rebinding to make its own name point at
 * 127.0.0.1 (caught by requiring a loopback Host while the server is local only).
 */
export function isForbiddenRequest(request: Pick<IncomingMessage, 'headers' | 'method'>, { loopbackOnly }: RequestGuardOptions): boolean {
  const host = request.headers.host;
  const name = hostName(host);
  if (!name || (loopbackOnly && !LOOPBACK_HOST_NAMES.has(name))) return true;
  const origin = request.headers.origin;
  if (!origin || request.method === 'GET' || request.method === 'HEAD') return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  for (const part of (cookieHeader ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

export function isSameKey(offered: string | null, accessKey: string): boolean {
  if (!offered) return false;
  const offeredBytes = Buffer.from(offered);
  const keyBytes = Buffer.from(accessKey);
  return offeredBytes.length === keyBytes.length && timingSafeEqual(offeredBytes, keyBytes);
}

export const accessCookie = (accessKey: string): string =>
  `${ACCESS_COOKIE}=${accessKey}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ACCESS_COOKIE_MAXIMUM_AGE_SECONDS}`;

/** Handles "?access=<key>": a matching key is stored as a cookie and the address is cleaned up. */
function acceptAccessLink(url: URL, accessKey: string, response: ServerResponse): boolean {
  const offered = url.searchParams.get(ACCESS_PARAMETER);
  if (offered === null) return false;
  url.searchParams.delete(ACCESS_PARAMETER);
  const cleanAddress = url.pathname + url.search;
  if (!isSameKey(offered, accessKey)) {
    sendJson(response, 401, { error: 'That access link is not valid. Use the link shown when the app started.' });
    return true;
  }
  response.writeHead(303, { location: cleanAddress, 'set-cookie': accessCookie(accessKey), 'cache-control': 'no-store' });
  response.end();
  return true;
}

export function createApp(dependencies: RouteDependencies, options: AppOptions): Server {
  const router = new Router();
  registerRoutes(router, dependencies);
  const webPage = IS_SINGLE_EXECUTABLE ? embeddedSource(WEB_ASSETS) : directorySource(PUBLIC_DIRECTORY);

  return createServer(async (request, response) => {
    try {
      response.setHeader('x-content-type-options', 'nosniff');
      response.setHeader('referrer-policy', 'no-referrer');
      if (isForbiddenRequest(request, options)) return sendJson(response, 403, { error: 'Forbidden' });
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'GET' && acceptAccessLink(url, options.accessKey, response)) return;
      if (url.pathname.startsWith('/api/') && !isSameKey(readCookie(request.headers.cookie, ACCESS_COOKIE), options.accessKey)) {
        return sendJson(response, 401, { error: 'Open the app with the link shown when it started.' });
      }
      if (await router.handle(request, response)) return;
      if (request.method === 'GET' && (await serveStaticFile(response, webPage, url.pathname))) return;
      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      if (!response.headersSent) sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}
