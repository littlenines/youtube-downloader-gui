import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import type { PreviewSource } from '@shared/types.js'
import { HttpError } from '@server/lib/http/http-error.js'
import type { YtdlpFormat } from '@server/services/ytdlp/ytdlp-json.js'
import { choosePreviewFormat } from './preview-format.js'

const PREVIEW_LIFETIME_MILLISECONDS = 60 * 60 * 1000
const MAXIMUM_REMEMBERED_PREVIEWS = 50
const FORWARDED_HEADERS = ['content-type', 'content-length', 'content-range']
const RETRY_DELAYS_MILLISECONDS = [1000, 1500, 2000, 2500, 3000]
const FORBIDDEN_STATUS = 403

interface PreviewStream {
  url: string
  headers: Record<string, string>
  expiresAt: number
}

const previewStreams = new Map<string, PreviewStream>()

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const forgetOldPreviews = (now: number): void => {
  for (const [token, stream] of previewStreams) {
    if (stream.expiresAt < now || previewStreams.size > MAXIMUM_REMEMBERED_PREVIEWS) previewStreams.delete(token)
  }
}

export const registerPreview = (formats: YtdlpFormat[]): PreviewSource | null => {
  const choice = choosePreviewFormat(formats)

  if (!choice?.format.url) return null

  const now = Date.now()
  const token = randomUUID()

  forgetOldPreviews(now)
  previewStreams.set(token, {
    url: choice.format.url,
    headers: choice.format.http_headers ?? {},
    expiresAt: now + PREVIEW_LIFETIME_MILLISECONDS,
  })

  return { token, kind: choice.kind }
}

const fetchStream = async (stream: PreviewStream, rangeHeader: string | undefined): Promise<Response> => {
  const headers = { ...stream.headers, ...(rangeHeader ? { range: rangeHeader } : {}) }
  let upstream = await fetch(stream.url, { headers })

  for (const delay of RETRY_DELAYS_MILLISECONDS) {
    if (upstream.status !== FORBIDDEN_STATUS) break

    await upstream.body?.cancel()
    await wait(delay)
    upstream = await fetch(stream.url, { headers })
  }

  return upstream
}

const forwardedHeaders = (upstream: Response): Record<string, string> => {
  const headers: Record<string, string> = { 'accept-ranges': 'bytes', 'cache-control': 'no-store' }

  for (const name of FORWARDED_HEADERS) {
    const value = upstream.headers.get(name)

    if (value) headers[name] = value
  }

  return headers
}

export const streamPreview = async (
  token: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const stream = previewStreams.get(token)

  if (!stream || stream.expiresAt < Date.now())
    throw new HttpError(404, 'This preview has expired. Read the link again.')

  const upstream = await fetchStream(stream, request.headers.range)

  if (!upstream.ok || !upstream.body) {
    throw new HttpError(502, `The preview could not be loaded (HTTP ${upstream.status}).`)
  }

  response.writeHead(upstream.status, forwardedHeaders(upstream))

  const body = Readable.fromWeb(upstream.body as unknown as WebReadableStream)

  await pipeline(body, response).catch(() => {})
}
