import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { DownloadQueue } from '@server/services/downloads/download-queue.js'
import type { SavedQueue } from '@server/services/stores/queue-store.js'
import {
  createFakeEngine,
  createQueueTestSetup,
  createRecordingQueue,
  noSavedQueue,
  savedJobFor,
  waitFor,
  waitUntil,
} from './support/queue-fakes.js'
import { removeFolder } from './support/temporary-folder.js'

describe('DownloadQueue: saving across restarts', async () => {
  const { downloadFolder, settings, history, options } = await createQueueTestSetup('queue-saving-test-')

  after(() => removeFolder(downloadFolder))

  it('saves unfinished downloads and forgets them once they finish', async () => {
    const { engine, runs } = createFakeEngine()
    const { savedQueue, lastSavedIds } = createRecordingQueue()
    const queue = new DownloadQueue({ settings, history, savedQueue, engine })
    const job = queue.add(options, {})

    assert.deepEqual(lastSavedIds(), [job.id])

    await waitUntil(() => runs.length === 1)
    runs[0]?.finish()
    await waitUntil(() => job.finishedAt !== null)
    assert.deepEqual(lastSavedIds(), [])
  })

  it('pauses on shutdown, keeping running downloads saved for the next start', async () => {
    const { engine, runs } = createFakeEngine()
    const { savedQueue, lastSavedIds } = createRecordingQueue()
    const queue = new DownloadQueue({ settings, history, savedQueue, engine })
    const job = queue.add(options, {})

    await waitUntil(() => runs.length === 1)

    const shutdown = queue.pauseForShutdown()

    assert.equal(runs[0]?.cancelled, true)
    runs[0]?.fail('killed')
    await shutdown
    assert.notEqual(job.status, 'cancelled')
    assert.notEqual(job.status, 'error')
    assert.deepEqual(lastSavedIds(), [job.id])
  })

  it('restarts downloads saved by the last run', async () => {
    const { engine, runs } = createFakeEngine()
    const queue = new DownloadQueue({ settings, history, savedQueue: noSavedQueue, engine })

    queue.restoreJobs([savedJobFor({ id: 'saved-1', options, label: 'MP3 · 320 kbps' })])

    await waitUntil(() => runs.length === 1)

    const [job] = queue.list()

    assert.equal(job?.id, 'saved-1')
    assert.equal(job?.title, 'Saved song')
    assert.equal(job?.createdAt, '2026-01-01T00:00:00.000Z')
    assert.equal(job?.status, 'downloading')
    runs[0]?.finish()
    await waitUntil(() => job?.finishedAt !== null)
  })

  it('keeps downloads the user paused paused after a restart', async () => {
    const { engine, runs } = createFakeEngine()
    const queue = new DownloadQueue({ settings, history, savedQueue: noSavedQueue, engine })

    queue.restoreJobs([savedJobFor({ id: 'paused-1', options, paused: true })])
    await waitFor(30)
    assert.equal(queue.find('paused-1')?.status, 'paused')
    assert.equal(runs.length, 0)
  })

  it('saves restored downloads right away, and the folder a download starts in', async () => {
    const { engine, runs } = createFakeEngine()
    const { savedQueue, lastSavedJobs } = createRecordingQueue()
    const queue = new DownloadQueue({ settings, history, savedQueue, engine })

    queue.restoreJobs([savedJobFor({ id: 'saved-2', options })])
    await waitUntil(() => runs.length === 1)
    assert.deepEqual(
      lastSavedJobs()?.map((savedJob) => [savedJob.id, savedJob.downloadFolder]),
      [['saved-2', downloadFolder]],
    )

    runs[0]?.finish()
    await waitUntil(() => queue.find('saved-2')?.finishedAt !== null)
  })

  it('forgets a download that finishes during shutdown, and waits for the last save', async () => {
    const { engine, runs } = createFakeEngine()
    let lastSave: string[] = []
    let isSaving = false
    const slowSavedQueue: SavedQueue = {
      save: async (savedJobs) => {
        isSaving = true
        await new Promise((resolve) => setTimeout(resolve, 20))
        lastSave = savedJobs.map((savedJob) => savedJob.id)
        isSaving = false
      },
    }
    const queue = new DownloadQueue({ settings, history, savedQueue: slowSavedQueue, engine })

    queue.add(options, {})
    await waitUntil(() => runs.length === 1)

    const shutdown = queue.pauseForShutdown()

    runs[0]?.finish()
    await shutdown
    assert.equal(isSaving, false)
    assert.deepEqual(lastSave, [])
  })
})
