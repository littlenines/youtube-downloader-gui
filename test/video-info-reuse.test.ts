import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, describe, it } from 'node:test'
import type { Job } from '@shared/types/downloads.js'
import { ExpiringMap } from '@server/lib/expiring-map.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { DownloadQueue } from '@server/services/downloads/download-queue.js'
import { buildDownloadArguments } from '@server/services/ytdlp/download-arguments.js'
import { createFakeEngine, createQueueTestSetup, noSavedQueue, waitFor, waitUntil } from './support/queue-fakes.js'
import { removeFolder } from './support/temporary-folder.js'

const VIDEO_URL = 'https://www.youtube.com/watch?v=abc'
const SAVED_INFO = { id: 'abc', formats: [] }

describe('ExpiringMap', () => {
  it('gives back a recent value, and nothing once it is too old', () => {
    let now = 0
    const values = new ExpiringMap<object>({ lifetimeMilliseconds: 1000, maximumEntries: 5, now: () => now })

    values.set(VIDEO_URL, SAVED_INFO)
    now = 1000
    assert.equal(values.get(VIDEO_URL), SAVED_INFO)

    now = 1001
    assert.equal(values.get(VIDEO_URL), null)
  })

  it('keeps only the newest values, and can forget one or all', () => {
    const values = new ExpiringMap<number>({ lifetimeMilliseconds: 60_000, maximumEntries: 2 })

    values.set('a', 1)
    values.set('b', 2)
    values.set('a', 3)
    values.set('c', 4)
    assert.deepEqual([values.get('a'), values.get('b'), values.get('c')], [3, null, 4])

    values.delete('a')
    assert.equal(values.get('a'), null)

    values.clear()
    assert.equal(values.get('c'), null)
  })
})

describe('downloading from a saved read', () => {
  it('gives yt-dlp the saved read instead of the link', () => {
    const commandArguments = buildDownloadArguments(normalizeDownloadRequest({ url: VIDEO_URL }), {
      downloadFolder: '/downloads',
      partialFolder: '/downloads/partial',
      infoFile: '/downloads/partial/video-info.json',
    })

    assert.deepEqual(commandArguments.slice(-2), ['--load-info-json', '/downloads/partial/video-info.json'])
    assert.equal(commandArguments.includes(VIDEO_URL), false)
  })
})

describe('DownloadQueue: reusing the read from the media panel', async () => {
  const { downloadFolder, settings, history } = await createQueueTestSetup('queue-info-test-')
  const options = normalizeDownloadRequest({ url: VIDEO_URL })

  after(() => removeFolder(downloadFolder))

  const createQueue = (recentVideoInfo: () => unknown = () => SAVED_INFO) => {
    const fake = createFakeEngine({ recentVideoInfo })

    return { ...fake, queue: new DownloadQueue({ settings, history, savedQueue: noSavedQueue, engine: fake.engine }) }
  }

  it('writes the saved read into the partial folder and downloads from it', async () => {
    const { queue, runs } = createQueue()
    const job = queue.add(options, {})

    await waitUntil(() => runs.length === 1)
    assert.deepEqual(JSON.parse(await readFile(runs[0]?.infoFile ?? '', 'utf8')), SAVED_INFO)

    runs[0]?.finish()
    await waitUntil(() => job.finishedAt !== null)
    assert.equal(job.status, 'done')
  })

  it('reads the link again, once and from the start, when the saved read fails before downloading', async () => {
    const { queue, runs, forgottenUrls } = createQueue()
    const job = queue.add(options, {})

    await waitUntil(() => runs.length === 1)
    runs[0]?.fail('HTTP Error 403: Forbidden')
    await waitUntil(() => runs.length === 2)

    assert.equal(runs[1]?.infoFile, null)
    assert.deepEqual(forgottenUrls, [VIDEO_URL])
    assert.deepEqual([job.stage, job.activity, job.progress], ['Getting the video info', 'preparing', 0])

    runs[1]?.fail('Video unavailable')
    await waitUntil(() => job.finishedAt !== null)
    assert.equal(job.status, 'error')
    assert.equal(runs.length, 2, 'only one extra attempt')
  })

  it('keeps showing a clip as a clip when it reads the link again', async () => {
    const { queue, runs } = createQueue()
    const job = queue.add(normalizeDownloadRequest({ url: VIDEO_URL, clip: { startSeconds: 0, endSeconds: 10 } }), {})

    await waitUntil(() => runs.length === 1)
    runs[0]?.fail('HTTP Error 403: Forbidden')
    await waitUntil(() => runs.length === 2)

    assert.deepEqual([job.stage, job.activity], ['Downloading the clip', 'processing'])
    runs[1]?.finish()
    await waitUntil(() => job.status === 'done')
  })

  it('does not download again when the failure came after the download started', async () => {
    const { queue, runs } = createQueue()
    const job = queue.add(options, {})

    await waitUntil(() => runs.length === 1)
    runs[0]?.emit({
      type: 'progress',
      stream: 'sound',
      downloadedBytes: 100,
      totalBytes: 1000,
      bytesPerSecond: 50,
      secondsLeft: 18,
      isFinished: false,
    })
    runs[0]?.fail('No space left on device')
    await waitUntil(() => job.finishedAt !== null)

    assert.equal(job.status, 'error')
    assert.equal(runs.length, 1)
  })

  it('downloads from the link when the saved read cannot be written', async () => {
    const { queue, runs } = createQueue(() => ({ size: 1n }))

    queue.add(options, {})
    await waitUntil(() => runs.length === 1)

    assert.equal(runs[0]?.infoFile, null)
    runs[0]?.finish()
  })

  it('does not start yt-dlp when paused while the saved read is being written', async () => {
    let job: Job | undefined
    const { queue, runs } = createQueue(() => {
      if (job) queue.pause(job.id)

      return SAVED_INFO
    })

    job = queue.add(options, {})
    await waitUntil(() => job?.runStartedAt === null)
    await waitFor(30)

    assert.equal(runs.length, 0)
    assert.equal(job.status, 'paused')
  })

  it('never uses a saved read for a playlist', async () => {
    const { queue, runs } = createQueue()

    queue.add(normalizeDownloadRequest({ url: VIDEO_URL, playlist: true }), {})
    await waitUntil(() => runs.length === 1)

    assert.equal(runs[0]?.infoFile, null)
    runs[0]?.finish()
  })
})
