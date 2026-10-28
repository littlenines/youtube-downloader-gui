import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { DownloadQueue } from '@server/services/downloads/download-queue.js'
import {
  isSubtitlesFailure,
  SubtitlesFailedError,
  subtitlesFailureReason,
} from '@server/services/ytdlp/error-messages.js'
import { createFakeEngine, createQueueTestSetup, noSavedQueue, waitUntil } from './support/queue-fakes.js'
import { removeFolder } from './support/temporary-folder.js'

const VIDEO_URL = 'https://www.youtube.com/watch?v=abc'
const REFUSED = "ERROR: Unable to download video subtitles for 'en': HTTP Error 429: Too Many Requests"
const REFUSED_REASON = 'YouTube refused them for now. Download it again later to add them.'

describe('isSubtitlesFailure', () => {
  it('recognises failed subtitles only when they are what failed last', () => {
    assert.equal(isSubtitlesFailure(`[info] Downloading subtitles: en\n${REFUSED}\n`), true)
    assert.equal(isSubtitlesFailure(`${REFUSED}\nERROR: [youtube] abc: Video unavailable\n`), false)
  })

  it('says why in words made for subtitles, so a saved video never reads as a failed one', () => {
    assert.equal(subtitlesFailureReason(REFUSED), REFUSED_REASON)
    assert.equal(
      subtitlesFailureReason("ERROR: Unable to download video subtitles for 'en': HTTP Error 404: Not Found"),
      'HTTP Error 404: Not Found',
    )
  })

  it('names its error, so a log tells it apart from a failed video', () => {
    assert.equal(new SubtitlesFailedError(REFUSED_REASON).name, 'SubtitlesFailedError')
  })
})

describe('DownloadQueue: subtitles that fail', async () => {
  const { downloadFolder, settings, history } = await createQueueTestSetup('refused-subtitles-test-')
  const videoWithSubtitles = normalizeDownloadRequest({
    url: VIDEO_URL,
    kind: 'video',
    subtitleLanguage: 'sr',
    subtitleMatch: 'exact',
  })

  after(() => removeFolder(downloadFolder))

  const startQueue = (recentVideoInfo: () => unknown = () => null) => {
    const { engine, runs, forgottenUrls } = createFakeEngine({ recentVideoInfo })
    const queue = new DownloadQueue({ settings, history, savedQueue: noSavedQueue, engine })

    return { queue, runs, forgottenUrls }
  }

  it('downloads the video again without subtitles, naming the language and why, instead of failing', async () => {
    const { queue, runs } = startQueue()
    const job = queue.add(videoWithSubtitles, {})

    await waitUntil(() => runs.length === 1)
    runs[0]?.failWith(new SubtitlesFailedError(REFUSED_REASON))
    await waitUntil(() => runs.length === 2)
    runs[1]?.finish()
    await waitUntil(() => job.status === 'done')

    assert.deepEqual(
      [runs[0]?.options.subtitleLanguage, runs[1]?.options.subtitleLanguage, job.options.subtitleLanguage, job.warning],
      ['sr', null, null, `Saved without Serbian subtitles: ${REFUSED_REASON}`],
    )
  })

  it('reuses the saved read without subtitles, asking YouTube for nothing more while it refuses', async () => {
    const { queue, runs, forgottenUrls } = startQueue(() => ({ id: 'abc', formats: [] }))
    const job = queue.add(videoWithSubtitles, {})

    await waitUntil(() => runs.length === 1)
    runs[0]?.failWith(new SubtitlesFailedError(REFUSED_REASON))
    await waitUntil(() => runs.length === 2)
    runs[1]?.finish()
    await waitUntil(() => job.status === 'done')

    assert.deepEqual(
      [runs.length, runs[1]?.infoFile, runs[1]?.options.subtitleLanguage, forgottenUrls],
      [2, runs[0]?.infoFile, null, []],
    )
    assert.ok(runs[1]?.infoFile)
  })

  it('still fails for any other error', async () => {
    const { queue, runs } = startQueue()
    const job = queue.add(videoWithSubtitles, {})

    await waitUntil(() => runs.length === 1)
    runs[0]?.fail('This video is unavailable.')
    await waitUntil(() => job.status === 'error')

    assert.deepEqual([runs.length, job.error], [1, 'This video is unavailable.'])
  })
})
