import { timingSafeEqual } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { sendJson } from '@server/lib/http/json.js'

const ACCESS_COOKIE_MAXIMUM_AGE_SECONDS = 365 * 24 * 3600

export const ACCESS_COOKIE_NAME = 'yt-downloader-access'

export const ACCESS_LINK_PARAMETER = 'access'

export const readCookie = (cookieHeader: string | undefined, name: string): string | null => {
  for (const cookie of (cookieHeader ?? '').split(';')) {
    const separatorIndex = cookie.indexOf('=')

    if (separatorIndex > 0 && cookie.slice(0, separatorIndex).trim() === name) {
      return cookie.slice(separatorIndex + 1).trim()
    }
  }

  return null
}

export const isMatchingAccessKey = (offeredKey: string | null, accessKey: string): boolean => {
  if (!offeredKey) return false

  const offeredBytes = Buffer.from(offeredKey)
  const accessKeyBytes = Buffer.from(accessKey)

  return offeredBytes.length === accessKeyBytes.length && timingSafeEqual(offeredBytes, accessKeyBytes)
}

export const accessCookieHeader = (accessKey: string): string =>
  `${ACCESS_COOKIE_NAME}=${accessKey}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ACCESS_COOKIE_MAXIMUM_AGE_SECONDS}`

export const hasAccessCookie = (cookieHeader: string | undefined, accessKey: string): boolean =>
  isMatchingAccessKey(readCookie(cookieHeader, ACCESS_COOKIE_NAME), accessKey)

export const handleAccessLink = (url: URL, accessKey: string, response: ServerResponse): boolean => {
  const offeredKey = url.searchParams.get(ACCESS_LINK_PARAMETER)

  if (offeredKey === null) return false

  url.searchParams.delete(ACCESS_LINK_PARAMETER)

  if (!isMatchingAccessKey(offeredKey, accessKey)) {
    sendJson(response, 401, { error: 'That access link is not valid. Use the link shown when the app started.' })

    return true
  }

  response.writeHead(303, {
    location: url.pathname + url.search,
    'set-cookie': accessCookieHeader(accessKey),
    'cache-control': 'no-store',
  })
  response.end()

  return true
}
