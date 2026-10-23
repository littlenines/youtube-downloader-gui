import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { DownloadQueue } from '@server/services/downloads/download-queue.js'
import {
  createFakeEngine,
  createQueueTestSetup,
  createRecordingQueue,
  noSavedQueue,
  waitFor,
  waitUntil,
} from './support/queue-fakes.js'

describe('DownloadQueue: pause and resume', async () => {
  const { downloadFolder, settings, history, options } = await createQueueTestSetup('queue-pause-test-')

  after(() => rm(downloadFolder, { recursive: true, force: true }))

  it('pauses a download, keeps its partial files, and resumes it in the same folder', async () => {
    const { engine, runs } = createFakeEngine()
    const { savedQueue, lastSavedJobs } = createRecordingQueue()
    const queue = new DownloadQueue({ settings, history, savedQueue, engine })
    const job = queue.add(options, {})

    await waitUntil(() => runs.length === 1)
    await writeFile(join(runs[0]?.partialFolder ?? '', 'video.mp4.part'), 'half')

    queue.pause(job.id)
    assert.equal(job.status, 'paused')
    assert.equal(runs[0]?.cancelled, true)
    assert.deepEqual(
      lastSavedJobs()?.map((savedJob) => savedJob.paused),
      [true],
    )

    runs[0]?.fail('killed')
    await waitUntil(() => queue.find(job.id)?.status === 'paused' && runs.length === 1)
    await waitFor(30)
    assert.equal(existsSync(join(runs[0]?.partialFolder ?? '', 'video.mp4.part')), true, 'pausing keeps the files')
    assert.equal(job.finishedAt, null)

    queue.resume(job.id)
    await waitUntil(() => runs.length === 2)
    assert.equal(runs[1]?.partialFolder, runs[0]?.partialFolder)
    assert.equal(existsSync(join(runs[1]?.partialFolder ?? '', 'video.mp4.part')), true)

    runs[1]?.finish()
    await waitUntil(() => job.finishedAt !== null)
    assert.equal(job.status, 'done')
    assert.equal(existsSync(runs[1]?.partialFolder ?? ''), false)
  })

  it('deletes the partial files of a paused download that is cancelled', async () => {
    const { engine, runs } = createFakeEngine()
    const queue = new DownloadQueue({ settings, history, savedQueue: noSavedQueue, engine })
    const job = queue.add(options, {})

    await waitUntil(() => runs.length === 1)
    queue.pause(job.id)
    runs[0]?.fail('killed')
    await waitFor(30)
    assert.equal(existsSync(runs[0]?.partialFolder ?? ''), true)

    queue.cancel(job.id)
    await waitUntil(() => !existsSync(runs[0]?.partialFolder ?? ''))
    assert.equal(job.status, 'cancelled')
  })

  it('counts a download that finished just as Pause was clicked as done', async () => {
    const { engine, runs } = createFakeEngine()
    const { savedQueue, lastSavedIds } = createRecordingQueue()
    const queue = new DownloadQueue({ settings, history, savedQueue, engine })
    const job = queue.add(options, {})

    await waitUntil(() => runs.length === 1)
    queue.pause(job.id)
    runs[0]?.finish()
    await waitUntil(() => job.finishedAt !== null)
    assert.equal(job.status, 'done')
    assert.deepEqual(lastSavedIds(), [])
  })
})
