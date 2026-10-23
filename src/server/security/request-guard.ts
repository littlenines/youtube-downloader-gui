import type { IncomingMessage } from 'node:http'

const LOOPBACK_HOST_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])
const SAFE_METHODS = new Set(['GET', 'HEAD'])

export interface RequestGuardOptions {
  loopbackOnly: boolean
}

export const isLoopbackHost = (host: string): boolean => LOOPBACK_HOST_NAMES.has(host) || host === '::1'

const readHostName = (hostHeader: string | undefined): string | null => {
  try {
    return hostHeader ? new URL(`http://${hostHeader}`).hostname : null
  } catch {
    return null
  }
}

const isSameHost = (originHeader: string, hostHeader: string | undefined): boolean => {
  try {
    return new URL(originHeader).host === hostHeader
  } catch {
    return false
  }
}

export const isForbiddenRequest = (
  request: Pick<IncomingMessage, 'headers' | 'method'>,
  { loopbackOnly }: RequestGuardOptions,
): boolean => {
  const hostHeader = request.headers.host
  const hostName = readHostName(hostHeader)

  if (!hostName || (loopbackOnly && !LOOPBACK_HOST_NAMES.has(hostName))) return true

  const originHeader = request.headers.origin

  if (!originHeader || SAFE_METHODS.has(request.method ?? '')) return false

  return !isSameHost(originHeader, hostHeader)
}
