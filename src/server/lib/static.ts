import { getAsset } from 'node:sea'
import { readFile, stat } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

export interface StaticFileSource {
  read(name: string): Promise<Buffer | null>
}

export const directorySource = (directory: string): StaticFileSource => {
  const root = resolve(directory)

  return {
    async read(name) {
      const file = resolve(join(root, name))

      if (!file.startsWith(root + sep)) return null

      try {
        return (await stat(file)).isFile() ? await readFile(file) : null
      } catch {
        return null
      }
    },
  }
}

export const embeddedSource = (names: readonly string[]): StaticFileSource => {
  const allowedNames = new Set(names)

  return {
    async read(name) {
      if (!allowedNames.has(name)) return null

      try {
        return Buffer.from(getAsset(name))
      } catch {
        return null
      }
    },
  }
}

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' https: data:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

export const serveStaticFile = async (
  response: ServerResponse,
  source: StaticFileSource,
  pathname: string,
): Promise<boolean> => {
  let name: string

  try {
    name = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.replace(/^\/+/, ''))
  } catch {
    return false
  }

  const body = await source.read(name)

  if (!body) return false

  const extension = extname(name).toLowerCase()

  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
    ...(extension === '.html' ? { 'content-security-policy': CONTENT_SECURITY_POLICY } : {}),
  })
  response.end(body)
  return true
}
