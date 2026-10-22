import { getAsset } from 'node:sea';
import { readFile, stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export interface StaticFileSource {
  read(name: string): Promise<Buffer | null>;
}

export function directorySource(directory: string): StaticFileSource {
  const root = resolve(directory);
  return {
    async read(name) {
      const file = resolve(join(root, name));
      if (!file.startsWith(root + sep)) return null;
      try {
        return (await stat(file)).isFile() ? await readFile(file) : null;
      } catch {
        return null;
      }
    },
  };
}

export function embeddedSource(names: readonly string[]): StaticFileSource {
  const allowedNames = new Set(names);
  return {
    async read(name) {
      if (!allowedNames.has(name)) return null;
      try {
        return Buffer.from(getAsset(name));
      } catch {
        return null;
      }
    },
  };
}

export async function serveStaticFile(response: ServerResponse, source: StaticFileSource, pathname: string): Promise<boolean> {
  const name = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.replace(/^\/+/, ''));
  const body = await source.read(name);
  if (!body) return false;
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  response.end(body);
  return true;
}
