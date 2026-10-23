import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import type { Settings } from '@shared/types.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { DownloadQueue, type DownloadEngine } from '@server/services/downloads/download-queue.js'
import { PARTIAL_FOLDER_NAME, removeStalePartialFolders } from '@server/services/downloads/partial-folders.js'
import type { HistoryStore } from '@server/services/stores/history-store.js'
import type { SettingsStore } from '@server/services/stores/settings-store.js'
import type { DownloadResult } from '@server/services/ytdlp/download-process.js'

interface FakeRun {
  finish(skippedItems?: string[]): void
  fail(message: string): void
  cancelled: boolean
}

const createFakeEngine = () => {
  const runs: FakeRun[] = []
  const engine: DownloadEngine = {
    requireTools: async () => {},
    startDownload: () => {
      let finish!: (result: DownloadResult) => void
      let fail!: (error: Error) => void
      const finished = new Promise<DownloadResult>((resolve, reject) => {
        finish = resolve
        fail = reject
      })
      const run: FakeRun = {
        finish: (skippedItems = []) => finish({ skippedItems }),
        fail: (message) => fail(new Error(message)),
        cancelled: false,
      }

      runs.push(run)
      return { finished, cancel: () => (run.cancelled = true) }
    },
    whenIdle: () => {},
  }

  return { engine, runs }
}

const waitUntil = async (condition: () => boolean): Promise<void> => {
  for (let waited = 0; waited < 2000; waited += 5) {
    if (condition()) return

    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  throw new Error('Timed out waiting for the condition.')
}

describe('DownloadQueue', async () => {
  const downloadFolder = await mkdtemp(join(tmpdir(), 'queue-test-'))

  after(() => rm(downloadFolder, { recursive: true, force: true }))

  const settings = {
    get: (): Settings => ({ downloadFolder, simultaneousDownloads: 2, lowLatencyRendering: true }),
  } as unknown as SettingsStore
  const history = { add: async () => {} } as unknown as HistoryStore
  const options = normalizeDownloadRequest({ url: 'https://example.com/video' })

  it('waits for a cancelled run to exit before retrying, and keeps the new run cancellable', async () => {
    const { engine, runs } = createFakeEngine()
    const queue = new DownloadQueue(settings, history, engine)
    const job = queue.add(options, {})

    await waitUntil(() => runs.length === 1)

    queue.cancel(job.id)
    assert.equal(runs[0]?.cancelled, true)
    queue.retry(job.id)
    assert.equal(job.status, 'queued')
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(runs.length, 1, 'the retry must not start while the first process is still running')

    runs[0]?.fail('killed')
    await waitUntil(() => runs.length === 2)
    assert.equal(job.status, 'downloading', 'the first run ending must not mark the retried job as failed')

    queue.cancel(job.id)
    assert.equal(runs[1]?.cancelled, true, 'the retried run must still be cancellable')
    runs[1]?.fail('killed')
    await queue.stopAll()
    assert.equal(job.status, 'cancelled')
  })

  it('marks real failures as errors and removes the partial folder', async () => {
    const { engine, runs } = createFakeEngine()
    const queue = new DownloadQueue(settings, history, engine)
    const job = queue.add(options, {})

    await waitUntil(() => runs.length === 1)
    assert.equal(existsSync(join(downloadFolder, PARTIAL_FOLDER_NAME, job.id)), true)

    runs[0]?.fail('This video is private.')
    await waitUntil(() => job.finishedAt !== null)
    assert.equal(job.status, 'error')
    assert.equal(job.error, 'This video is private.')
    assert.equal(existsSync(join(downloadFolder, PARTIAL_FOLDER_NAME)), false)
  })

  it('finishes a successful download', async () => {
    const { engine, runs } = createFakeEngine()
    const queue = new DownloadQueue(settings, history, engine)
    const job = queue.add(options, {})

    await waitUntil(() => runs.length === 1)
    runs[0]?.finish()
    await waitUntil(() => job.finishedAt !== null)
    assert.equal(job.status, 'done')
    assert.equal(job.progress, 1)
    assert.equal(job.warning, null)
  })

  it('finishes a playlist that had to skip videos, with a warning instead of an error', async () => {
    const { engine, runs } = createFakeEngine()
    const queue = new DownloadQueue(settings, history, engine)
    const job = queue.add(normalizeDownloadRequest({ url: 'https://example.com/playlist', playlist: true }), {
      videoCount: 10,
    })

    await waitUntil(() => runs.length === 1)
    runs[0]?.finish(['This video is private.', 'This video is unavailable.'])
    await waitUntil(() => job.finishedAt !== null)
    assert.equal(job.status, 'done')
    assert.equal(job.warning, '2 videos could not be downloaded. This video is private.')
  })
})

describe('removeStalePartialFolders', async () => {
  const downloadFolder = await mkdtemp(join(tmpdir(), 'stale-test-'))

  after(() => rm(downloadFolder, { recursive: true, force: true }))

  it('removes folders a crashed app left hours ago and keeps ones still in use', async () => {
    const staleFolder = join(downloadFolder, PARTIAL_FOLDER_NAME, 'crashed-job')
    const activeFolder = join(downloadFolder, PARTIAL_FOLDER_NAME, 'running-job')

    await mkdir(staleFolder, { recursive: true })
    await mkdir(activeFolder, { recursive: true })
    await writeFile(join(staleFolder, 'song.webm.part'), 'old')
    await writeFile(join(activeFolder, 'video.mp4.part'), 'new')

    const yesterday = new Date(Date.now() - 24 * 3600 * 1000)

    await utimes(join(staleFolder, 'song.webm.part'), yesterday, yesterday)
    await utimes(staleFolder, yesterday, yesterday)

    await removeStalePartialFolders(downloadFolder)
    assert.equal(existsSync(staleFolder), false)
    assert.equal(existsSync(join(activeFolder, 'video.mp4.part')), true)
  })
})
