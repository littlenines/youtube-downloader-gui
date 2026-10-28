import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, describe, it } from 'node:test'
import type { DownloadRequest } from '@shared/types/downloads.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { DownloadQueue } from '@server/services/downloads/download-queue.js'
import { createFakeEngine, createQueueTestSetup, noSavedQueue, waitUntil } from './support/queue-fakes.js'
import { removeFolder } from './support/temporary-folder.js'

const VIDEO_URL = 'https://www.youtube.com/watch?v=abc'

const videoRead = (subtitles: string[], automaticCaptions: string[] = [], extra: object = {}) => ({
  id: 'abc',
  formats: [],
  subtitles: Object.fromEntries(subtitles.map((language) => [language, []])),
  automatic_captions: Object.fromEntries(automaticCaptions.map((language) => [language, []])),
  ...extra,
})

describe('DownloadQueue: subtitles for a download without a panel', async () => {
  const { downloadFolder, settings, history } = await createQueueTestSetup('subtitle-track-choice-test-')

  after(() => removeFolder(downloadFolder))

  const startDownload = (
    request: Partial<DownloadRequest>,
    readVideoInfo: (url: string, signal: AbortSignal) => Promise<unknown>,
  ) => {
    const { engine, runs, readUrls } = createFakeEngine({ readVideoInfo })
    const queue = new DownloadQueue({ settings, history, savedQueue: noSavedQueue, engine })
    const job = queue.add(
      normalizeDownloadRequest({ url: VIDEO_URL, kind: 'video', container: 'mkv', subtitleLanguage: 'en', ...request }),
      {},
    )

    return { queue, job, runs, readUrls }
  }

  const subtitlesOfFirstRun = async (subtitles: string[], automaticCaptions: string[] = []) => {
    const { runs } = startDownload({}, async () => videoRead(subtitles, automaticCaptions))

    await waitUntil(() => runs.length === 1)

    return [runs[0]?.options.subtitleLanguage, runs[0]?.options.subtitleMatch]
  }

  it('reads the video, picks one track the way the panel does, and downloads from that read', async () => {
    const { runs, readUrls } = startDownload({}, async () => videoRead(['de', 'en-GB', 'en-US'], ['en-orig']))

    await waitUntil(() => runs.length === 1)

    assert.deepEqual(
      [readUrls, runs[0]?.options.subtitleLanguage, runs[0]?.options.subtitleMatch],
      [[VIDEO_URL], 'en-GB', 'exact'],
    )
    assert.equal(JSON.parse(await readFile(runs[0]?.infoFile ?? '', 'utf8')).id, 'abc')
  })

  it('takes the spoken language when nothing was uploaded in it, and no subtitles when neither is there', async () => {
    assert.deepEqual(await subtitlesOfFirstRun(['de'], ['en-orig', 'en', 'fr']), ['en', 'spoken'])
    assert.deepEqual(await subtitlesOfFirstRun(['de'], ['ja-orig', 'en']), [null, 'language'])
  })

  it('fails with the read’s error, without asking YouTube a second time', async () => {
    const { job, runs } = startDownload({}, async () => {
      throw new Error('This video is unavailable.')
    })

    await waitUntil(() => job.status === 'error')

    assert.deepEqual([runs.length, job.error], [0, 'This video is unavailable.'])
  })

  it('asks for the uploaded track with that code only, from the link, for a live stream', async () => {
    const { runs } = startDownload({}, async () => videoRead(['en'], [], { is_live: true }))

    await waitUntil(() => runs.length === 1)

    assert.deepEqual(
      [runs[0]?.infoFile, runs[0]?.options.subtitleLanguage, runs[0]?.options.subtitleMatch],
      [null, 'en', 'language'],
    )
  })

  it('reads nothing for a track picked in the panel, a playlist, a clip or no subtitles', async () => {
    const downloads = [
      startDownload({ subtitleMatch: 'exact' }, async () => videoRead([])),
      startDownload({ playlist: true }, async () => videoRead([])),
      startDownload({ clip: { startSeconds: 0, endSeconds: 10 } }, async () => videoRead([])),
      startDownload({ subtitleLanguage: null }, async () => videoRead([])),
    ]

    await waitUntil(() => downloads.every(({ runs }) => runs.length === 1))

    assert.deepEqual(
      downloads.map(({ readUrls }) => readUrls.length),
      [0, 0, 0, 0],
    )
  })

  it('stops reading on Pause without starting yt-dlp, and reads again on Resume', async () => {
    let reads = 0
    const { queue, job, runs, readUrls } = startDownload({}, (_url, signal) => {
      reads++

      return reads === 1
        ? new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Cancelled.'))))
        : Promise.resolve(videoRead(['en']))
    })

    await waitUntil(() => readUrls.length === 1)
    queue.pause(job.id)
    await waitUntil(() => !queue.list().some(({ status }) => status === 'downloading'))
    assert.equal(runs.length, 0)

    queue.resume(job.id)
    await waitUntil(() => runs.length === 1)
    assert.deepEqual([readUrls.length, runs[0]?.options.subtitleMatch], [2, 'exact'])
  })
})
