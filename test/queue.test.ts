import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { DownloadQueue } from '@server/services/downloads/download-queue.js'
import { PARTIAL_FOLDER_NAME } from '@server/services/downloads/partial-folders.js'
import { createFakeEngine, createQueueTestSetup, noSavedQueue, waitFor, waitUntil } from './support/queue-fakes.js'
import { removeFolder } from './support/temporary-folder.js'

describe('DownloadQueue', async () => {
  const { downloadFolder, settings, history, options } = await createQueueTestSetup('queue-test-')

  after(() => removeFolder(downloadFolder))

  it('waits for a cancelled run to exit before retrying, and keeps the new run cancellable', async () => {
    const { engine, runs } = createFakeEngine()
    const queue = new DownloadQueue({ settings, history, savedQueue: noSavedQueue, engine })
    const job = queue.add(options, {})

    await waitUntil(() => runs.length === 1)

    queue.cancel(job.id)
    assert.equal(runs[0]?.cancelled, true)
    queue.retry(job.id)
    assert.equal(job.status, 'queued')
    await waitFor(30)
    assert.equal(runs.length, 1, 'the retry must not start while the first process is still running')

    runs[0]?.fail('killed')
    await waitUntil(() => runs.length === 2)
    assert.equal(job.status, 'downloading', 'the first run ending must not mark the retried job as failed')

    queue.cancel(job.id)
    assert.equal(runs[1]?.cancelled, true, 'the retried run must still be cancellable')
    runs[1]?.fail('killed')
    await queue.pauseForShutdown()
    assert.equal(job.status, 'cancelled')
  })

  it('marks real failures as errors and removes the partial folder', async () => {
    const { engine, runs } = createFakeEngine()
    const queue = new DownloadQueue({ settings, history, savedQueue: noSavedQueue, engine })
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
    const queue = new DownloadQueue({ settings, history, savedQueue: noSavedQueue, engine })
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
    const queue = new DownloadQueue({ settings, history, savedQueue: noSavedQueue, engine })
    const job = queue.add(normalizeDownloadRequest({ url: 'https://example.com/playlist', playlist: true }), {
      videoCount: 10,
    })

    await waitUntil(() => runs.length === 1)
    runs[0]?.finish(['This video is private.', 'This video is unavailable.'])
    await waitUntil(() => job.finishedAt !== null)
    assert.equal(job.status, 'done')
    assert.equal(job.warning, '2 videos could not be downloaded. This video is private.')
  })

  it('starts a retry fresh when the cancelled run exits after Retry was clicked', async () => {
    const { engine, runs } = createFakeEngine()
    const queue = new DownloadQueue({ settings, history, savedQueue: noSavedQueue, engine })
    const job = queue.add(options, {})

    await waitUntil(() => runs.length === 1)

    const partialFile = join(runs[0]?.partialFolder ?? '', 'video.mp4.part')

    await writeFile(partialFile, 'broken')
    queue.cancel(job.id)
    queue.retry(job.id)
    runs[0]?.fail('killed')
    await waitUntil(() => runs.length === 2)
    assert.equal(existsSync(partialFile), false)

    runs[1]?.finish()
    await waitUntil(() => job.finishedAt !== null)
  })
})
