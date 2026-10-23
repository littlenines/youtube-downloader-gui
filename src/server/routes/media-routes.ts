import { HttpError } from '@server/lib/http/http-error.js'
import { readJsonBody } from '@server/lib/http/json.js'
import type { Router } from '@server/lib/http/router.js'
import { streamPreview } from '@server/services/preview/preview-streams.js'
import { fetchMediaInfo } from '@server/services/ytdlp/media-info.js'
import { searchVideos } from '@server/services/ytdlp/search.js'
import { abortWhenClientLeaves, isLinkValue, toHttpError } from './route-helpers.js'

const MAXIMUM_QUERY_LENGTH = 200

const cleanSearchQuery = (query: unknown): string =>
  typeof query === 'string' ? query.trim().slice(0, MAXIMUM_QUERY_LENGTH) : ''

export const registerMediaRoutes = (router: Router): void => {
  router.post('/api/info', async ({ request, response }) => {
    const body = await readJsonBody<{ url: string; playlist: boolean }>(request)

    if (!isLinkValue(body.url)) throw new HttpError(400, 'Paste a full link that starts with https://')

    try {
      return await fetchMediaInfo(body.url.trim(), {
        playlist: Boolean(body.playlist),
        signal: abortWhenClientLeaves(response),
      })
    } catch (error) {
      throw toHttpError(error)
    }
  })

  router.post('/api/search', async ({ request, response }) => {
    const { query } = await readJsonBody<{ query: string }>(request)
    const cleanQuery = cleanSearchQuery(query)

    if (!cleanQuery) throw new HttpError(400, 'Type something to search for.')

    try {
      return await searchVideos(cleanQuery, abortWhenClientLeaves(response))
    } catch (error) {
      throw toHttpError(error)
    }
  })

  router.get('/api/preview/:token', ({ request, response, parameters: [token = ''] }) =>
    streamPreview(token, request, response),
  )
}
