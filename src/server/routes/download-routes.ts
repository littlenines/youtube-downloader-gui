import type { DownloadRequest, DownloadsResponse } from '@shared/types.js'
import { HttpError } from '@server/lib/http/http-error.js'
import { readJsonBody } from '@server/lib/http/json.js'
import type { Router } from '@server/lib/http/router.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import type { RouteDependencies } from './index.js'
import { isLinkValue, showInFileManager } from './route-helpers.js'

const HISTORY_ENTRIES_SHOWN = 30

const throwNoSuchDownload = (): never => {
  throw new HttpError(404, 'No such download.')
}

export const registerDownloadRoutes = (router: Router, { settings, history, queue }: RouteDependencies): void => {
  router.post('/api/downloads', async ({ request }) => {
    const body = await readJsonBody<DownloadRequest>(request)

    if (!isLinkValue(body.url)) throw new HttpError(400, 'No link to download.')

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

  router.post('/api/downloads/:id/cancel', ({ parameters: [id = ''] }) => queue.cancel(id) ?? throwNoSuchDownload())
  router.post('/api/downloads/:id/retry', ({ parameters: [id = ''] }) => queue.retry(id) ?? throwNoSuchDownload())

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
