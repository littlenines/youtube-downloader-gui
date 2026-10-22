import { createServer, type IncomingMessage, type Server } from 'node:http';
import { IS_SINGLE_EXECUTABLE, PUBLIC_DIRECTORY } from './config.js';
import { Router, sendJson } from './lib/http.js';
import { directorySource, embeddedSource, serveStaticFile } from './lib/static.js';
import { registerRoutes, type RouteDependencies } from './routes/index.js';
import { WEB_ASSETS } from './web-assets.js';

const LOOPBACK_HOST_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

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

export function createApp(dependencies: RouteDependencies, guardOptions: RequestGuardOptions): Server {
  const router = new Router();
  registerRoutes(router, dependencies);
  const webPage = IS_SINGLE_EXECUTABLE ? embeddedSource(WEB_ASSETS) : directorySource(PUBLIC_DIRECTORY);

  return createServer(async (request, response) => {
    try {
      if (isForbiddenRequest(request, guardOptions)) return sendJson(response, 403, { error: 'Forbidden' });
      if (await router.handle(request, response)) return;
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'GET' && (await serveStaticFile(response, webPage, pathname))) return;
      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      if (!response.headersSent) sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}
