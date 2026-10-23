import type { CoverRequest, DownloadRequest, DownloadsResponse } from '@shared/types/downloads.js'
import { HttpError } from '@server/lib/http/http-error.js'
import { readJsonBody } from '@server/lib/http/json.js'
import type { Router } from '@server/lib/http/router.js'
import { totalFileSize } from '@server/lib/file-size.js'
import { normalizeCoverRequest, normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { historyEntryFromCover } from '@server/services/downloads/jobs.js'
import { saveCoverImage } from '@server/services/ytdlp/cover-image.js'
import type { RouteDependencies } from './index.js'
import { abortWhenClientLeaves, isLinkValue, showInFileManager, toHttpError } from './route-helpers.js'

const HISTORY_ENTRIES_SHOWN = 30

const ignoreFailure = () => {}

const throwNoSuchDownload = (): never => {
  throw new HttpError(404, 'No such download.')
}

export const registerDownloadRoutes = (router: Router, { settings, history, queue }: RouteDependencies): void => {
  router.post('/api/downloads', async ({ request }) => {
    const body = await readJsonBody<DownloadRequest>(request)

    if (!isLinkValue(body.url)) throw new HttpError(400, 'No link to download.')

    if (body.playlist && Array.isArray(body.playlistItems) && !body.playlistItems.length) {
      throw new HttpError(400, 'Pick at least one video from the playlist.')
    }

    return queue.add(normalizeDownloadRequest(body), {
      title: body.title,
      thumbnailUrl: body.thumbnailUrl,
      videoCount: body.videoCount,
    })
  })

  router.get('/api/downloads', (): DownloadsResponse => ({
    jobs: queue.list(),
    history: history.list(HISTORY_ENTRIES_SHOWN),
  }))

  router.post('/api/covers', async ({ request, response }) => {
    const body = await readJsonBody<CoverRequest>(request)

    if (!isLinkValue(body.url)) throw new HttpError(400, 'No link to save the cover from.')

    const cover = normalizeCoverRequest({ ...body, url: body.url })
    const file = await saveCoverImage({
      url: cover.url,
      square: cover.square,
      downloadFolder: settings.get().downloadFolder,
      signal: abortWhenClientLeaves(response),
    }).catch((error: unknown) => {
      throw toHttpError(error)
    })
    const entry = historyEntryFromCover(cover, file, await totalFileSize([file]))

    await history.add(entry).catch(ignoreFailure)

    return entry
  })

  router.post('/api/downloads/:id/cancel', ({ parameters: [id = ''] }) => queue.cancel(id) ?? throwNoSuchDownload())
  router.post('/api/downloads/:id/retry', ({ parameters: [id = ''] }) => queue.retry(id) ?? throwNoSuchDownload())
  router.post('/api/downloads/:id/pause', ({ parameters: [id = ''] }) => queue.pause(id) ?? throwNoSuchDownload())
  router.post('/api/downloads/:id/resume', ({ parameters: [id = ''] }) => queue.resume(id) ?? throwNoSuchDownload())

  router.post('/api/downloads/:id/reveal', async ({ parameters: [id = ''] }) => {
    const lastFile = queue.find(id)?.files.at(-1) ?? history.find(id)?.files.at(-1)

    await showInFileManager(lastFile, settings.get().downloadFolder)
  })

  router.delete('/api/downloads/:id', async ({ parameters: [id = ''] }) => {
    queue.remove(id)
    await history.remove(id)
  })

  router.delete('/api/downloads', async () => {
    queue.clearFinished()
    await history.clear()
  })
}
