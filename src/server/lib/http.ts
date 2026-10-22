import type { IncomingMessage, ServerResponse } from 'node:http';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RequestContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  parameters: string[];
}

type RouteHandler = (context: RequestContext) => Promise<unknown> | unknown;

interface Route {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
}

/** Handlers return a JSON-serialisable value; `:name` path segments arrive in `parameters`. */
export class Router {
  private readonly routes: Route[] = [];

  get(path: string, handler: RouteHandler): this {
    return this.add('GET', path, handler);
  }

  post(path: string, handler: RouteHandler): this {
    return this.add('POST', path, handler);
  }

  delete(path: string, handler: RouteHandler): this {
    return this.add('DELETE', path, handler);
  }

  /** Resolves to false when no route matches. */
  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    for (const route of this.routes) {
      if (route.method !== request.method) continue;
      const match = route.pattern.exec(url.pathname);
      if (!match) continue;
      try {
        const result = await route.handler({ request, response, url, parameters: match.slice(1).map(decodeURIComponent) });
        if (!response.headersSent) sendJson(response, 200, result ?? { ok: true });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        if (!response.headersSent) sendJson(response, status, { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    return false;
  }

  private add(method: string, path: string, handler: RouteHandler): this {
    this.routes.push({ method, pattern: new RegExp(`^${path.replace(/:[a-z]+/gi, '([^/]+)')}$`), handler });
    return this;
  }
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

export async function readJsonBody<T>(request: IncomingMessage, limitBytes = 1_000_000): Promise<Partial<T>> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > limitBytes) throw new HttpError(413, 'Request too large.');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Partial<T>;
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}
