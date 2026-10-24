import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DownloadRequest, Job } from '@shared/types/downloads.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { applyDownloadEvent } from '@server/services/downloads/job-progress.js'
import { createQueuedJob } from '@server/services/downloads/jobs.js'
import type { ProgressEvent, StreamKind } from '@server/services/ytdlp/download-events.js'
import { formatSeconds, formatTimeLeft } from '@client/utils/format.js'

const jobFor = (request: Partial<DownloadRequest>): Job =>
  createQueuedJob('job', normalizeDownloadRequest({ url: 'https://example.com/video', ...request }), {})

const progress = (
  stream: StreamKind,
  downloadedBytes: number,
  totalBytes: number,
  isFinished = false,
): ProgressEvent => ({
  type: 'progress',
  stream,
  downloadedBytes,
  totalBytes,
  bytesPerSecond: 5_000_000,
  secondsLeft: 3,
  isFinished,
})

const downloading = (request: Partial<DownloadRequest>): Job => {
  const job = jobFor(request)

  job.status = 'downloading'

  return job
}

describe('download progress', () => {
  it('shows sizes, speed and time left while downloading', () => {
    const job = downloading({ kind: 'audio', format: 'mp3' })

    applyDownloadEvent(job, progress('sound', 1_000_000, 4_000_000))

    assert.equal(job.activity, 'downloading')
    assert.equal(job.stage, 'Downloading')
    assert.equal(job.progress, 0.25)
    assert.deepEqual([job.downloadedBytes, job.totalBytes, job.bytesPerSecond, job.secondsLeft], [1e6, 4e6, 5e6, 3])
  })

  it('says what happens after the download, without an old speed', () => {
    const mp3 = downloading({ kind: 'audio', format: 'mp3' })
    const opus = downloading({ kind: 'audio', format: 'opus' })

    applyDownloadEvent(mp3, progress('sound', 4_000_000, 4_000_000, true))
    applyDownloadEvent(opus, progress('sound', 4_000_000, 4_000_000, true))

    assert.deepEqual(
      [mp3.activity, mp3.stage, mp3.bytesPerSecond, mp3.secondsLeft],
      ['processing', 'Converting to MP3', null, null],
    )
    assert.equal(opus.stage, 'Saving as Opus')
  })

  it('goes from the picture to the sound, then merges them', () => {
    const job = downloading({ kind: 'video' })

    applyDownloadEvent(job, progress('picture', 100, 100, true))
    assert.deepEqual([job.activity, job.stage, job.progress], ['preparing', 'Getting the sound', 0.85])

    applyDownloadEvent(job, progress('sound', 50, 100))
    assert.deepEqual([job.activity, job.stage], ['downloading', 'Downloading audio'])

    applyDownloadEvent(job, progress('sound', 100, 100, true))
    assert.deepEqual([job.activity, job.stage, job.progress], ['processing', 'Merging picture and sound', 1])
  })

  it('starts each playlist video afresh, and stops working once the file is saved', () => {
    const job = downloading({ kind: 'audio', playlist: true })

    applyDownloadEvent(job, progress('sound', 100, 100, true))
    applyDownloadEvent(job, { type: 'item', index: 2, count: 4, title: 'Next song' })
    assert.deepEqual([job.activity, job.stage, job.progress], ['preparing', 'Starting the download', 0.25])

    applyDownloadEvent(job, { type: 'file', file: '/music/Next song.mp3' })
    assert.deepEqual([job.activity, job.stage], [null, 'Saved'])
  })
})

describe('progress edge cases', () => {
  it('keeps downloading when more arrives than estimated, until yt-dlp says it is finished', () => {
    const job = downloading({ kind: 'audio', format: 'mp3' })

    applyDownloadEvent(job, progress('sound', 4_100_000, 4_000_000))
    assert.deepEqual([job.activity, job.stage, job.bytesPerSecond], ['downloading', 'Downloading', 5_000_000])
  })

  it('keeps "Downloading the clip", since a clip reports progress only at the end', () => {
    const job = downloading({ kind: 'audio', clip: { startSeconds: 10, endSeconds: 40 } })

    Object.assign(job, { stage: 'Downloading the clip', activity: 'processing' })
    applyDownloadEvent(job, { type: 'item', index: null, count: null, title: 'Song' })

    assert.deepEqual([job.stage, job.activity, job.title], ['Downloading the clip', 'processing', 'Song'])
  })

  it('ignores progress that arrives after pausing, while the process is still exiting', () => {
    const job = downloading({ kind: 'audio' })

    job.status = 'paused'
    applyDownloadEvent(job, progress('sound', 1_000_000, 4_000_000))

    assert.deepEqual([job.activity, job.bytesPerSecond], [null, null])
  })

  it('does not mix the previous stream into the subtitle step', () => {
    const job = downloading({ kind: 'video', subtitles: true })

    applyDownloadEvent(job, progress('picture', 50, 100))
    applyDownloadEvent(job, { ...progress('other', 10, 20), stream: 'other' })

    assert.deepEqual(
      [job.stage, job.activity, job.downloadedBytes, job.bytesPerSecond],
      ['Downloading subtitles', 'preparing', null, null],
    )
  })
})

describe('formatting durations', () => {
  it('writes seconds, minutes and hours the short way', () => {
    assert.equal(formatSeconds(13.4), '13s')
    assert.equal(formatSeconds(65), '1m 5s')
    assert.equal(formatSeconds(3725), '1h 2m')
    assert.equal(formatSeconds(null), '')
    assert.equal(formatTimeLeft(65), '1m 5s left')
    assert.equal(formatTimeLeft(-1), '')
  })
})
