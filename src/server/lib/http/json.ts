import type { IncomingMessage, ServerResponse } from 'node:http'
import { HttpError } from './http-error.js'

const DEFAULT_BODY_LIMIT_BYTES = 1_000_000

export const sendJson = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}

export const readJsonBody = async <RequestBody>(
  request: IncomingMessage,
  limitBytes = DEFAULT_BODY_LIMIT_BYTES,
): Promise<Partial<RequestBody>> => {
  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of request as AsyncIterable<Buffer>) {
    totalBytes += chunk.length

    if (totalBytes > limitBytes) throw new HttpError(413, 'Request too large.')

    chunks.push(chunk)
  }

  if (!chunks.length) return {}

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Partial<RequestBody>
  } catch {
    throw new HttpError(400, 'Invalid JSON.')
  }
}
