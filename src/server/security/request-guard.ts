import type { IncomingMessage } from 'node:http'
import { isLoopbackHost } from '@shared/loopback.js'

const SAFE_METHODS = new Set(['GET', 'HEAD'])

export interface RequestGuardOptions {
  loopbackOnly: boolean
}

const readHostName = (hostHeader: string | undefined): string | null => {
  try {
    return hostHeader ? new URL(`http://${hostHeader}`).hostname : null
  } catch {
    return null
  }
}

export const isLoopbackRequest = (request: Pick<IncomingMessage, 'headers'>): boolean => {
  const hostName = readHostName(request.headers.host)

  return hostName !== null && isLoopbackHost(hostName)
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

  if (!hostName || (loopbackOnly && !isLoopbackHost(hostName))) return true

  const originHeader = request.headers.origin

  if (!originHeader || SAFE_METHODS.has(request.method ?? '')) return false

  return !isSameHost(originHeader, hostHeader)
}
