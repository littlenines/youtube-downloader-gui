import { randomUUID } from 'node:crypto'
import type { CoverRequest, DownloadRequest, DownloadsResponse } from '@shared/types/downloads.js'
import { HttpError } from '@server/lib/http/http-error.js'
import { readJsonBody } from '@server/lib/http/json.js'
import type { Router } from '@server/lib/http/router.js'
import { totalFileSize } from '@server/lib/file-size.js'
import { ignoreFailure } from '@server/lib/ignore-failure.js'
import {
  normalizeCoverRequest,
  normalizeDownloadRequest,
  safePlaylistTitle,
} from '@server/services/downloads/download-options.js'
import { historyEntryFromCover } from '@server/services/downloads/jobs.js'
import { playlistDownloads } from '@server/services/downloads/playlist-jobs.js'
import { saveCoverImage } from '@server/services/ytdlp/cover-image.js'
import { listPlaylistVideos } from '@server/services/ytdlp/playlist-videos.js'
import type { RouteDependencies } from './index.js'
import { abortWhenClientLeaves, isLinkValue, showInFileManager, toHttpError } from './route-helpers.js'

const HISTORY_ENTRIES_SHOWN = 30

const throwNoSuchDownload = (): never => {
  throw new HttpError(404, 'No such download.')
}

export const registerDownloadRoutes = (router: Router, { settings, history, queue }: RouteDependencies): void => {
  router.post('/api/downloads', async ({ request, response }) => {
    const body = await readJsonBody<DownloadRequest>(request)

    if (!isLinkValue(body.url)) throw new HttpError(400, 'No link to download.')

    if (body.playlist && Array.isArray(body.playlistItems) && !body.playlistItems.length) {
      throw new HttpError(400, 'Pick at least one video from the playlist.')
    }

    const later = body.later === true

    if (later && !settings.get().laterStartTime) {
      throw new HttpError(400, 'Choose when “Later” downloads start in ⚙ Settings first.')
    }

    const options = normalizeDownloadRequest(body)
    const details = { title: body.title, thumbnailUrl: body.thumbnailUrl, videoCount: body.videoCount }

    if (!options.playlist) return queue.add(options, details, { later })

    const listing = await listPlaylistVideos(options.url, abortWhenClientLeaves(response)).catch((error: unknown) => {
      throw toHttpError(error)
    })
    const downloads = playlistDownloads(options, listing, randomUUID())

    if (downloads) return queue.addAll(downloads, { later })[0]

    return queue.add({ ...options, playlistTitle: safePlaylistTitle(listing.title) }, details, { later })
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

  router.post('/api/download-groups/:id/pause', ({ parameters: [id = ''] }) => queue.pauseAll(id))
  router.post('/api/download-groups/:id/resume', ({ parameters: [id = ''] }) => queue.resumeAll(id))
  router.post('/api/download-groups/:id/cancel', ({ parameters: [id = ''] }) => queue.cancelGroup(id))
  router.delete('/api/download-groups/:id', async ({ parameters: [id = ''] }) => {
    queue.removeFinishedInGroup(id)
    await history.remove(id)
  })
  router.post('/api/downloads/pause-all', () => queue.pauseAll())
  router.post('/api/downloads/resume-all', () => queue.resumeAll())
  router.post('/api/downloads/:id/cancel', ({ parameters: [id = ''] }) => queue.cancel(id) ?? throwNoSuchDownload())
  router.post('/api/downloads/:id/retry', ({ parameters: [id = ''] }) => queue.retry(id) ?? throwNoSuchDownload())
  router.post('/api/downloads/:id/pause', ({ parameters: [id = ''] }) => queue.pause(id) ?? throwNoSuchDownload())
  router.post(
    '/api/downloads/:id/start-now',
    ({ parameters: [id = ''] }) => queue.startNow(id) ?? throwNoSuchDownload(),
  )
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
