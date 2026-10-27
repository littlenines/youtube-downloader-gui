import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Job } from '@shared/types/downloads.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { createQueuedJob } from '@server/services/downloads/jobs.js'
import {
  groupProgress,
  groupStatusText,
  listedDownloads,
  shownVideos,
  VIDEOS_SHOWN_AT_ONCE,
} from '@client/components/downloads/download-groups.js'

const group = { id: 'album', title: 'Discovery', size: 3, url: 'https://www.youtube.com/playlist?list=PL1' }

const videoJob = (id: string, playlistNumber: number, changes: Partial<Job> = {}): Job => ({
  ...createQueuedJob(id, normalizeDownloadRequest({ url: 'https://x', playlistNumber }), {
    title: `Song ${id}`,
    group,
  }),
  ...changes,
})

describe('listedDownloads', () => {
  it('lists a playlist once, with its videos in playlist order, between the other downloads', () => {
    const single = createQueuedJob('single', normalizeDownloadRequest({ url: 'https://y' }), { title: 'Single' })
    const newestFirst = [videoJob('c', 3), videoJob('a', 1), single, videoJob('b', 2)]

    assert.deepEqual(
      listedDownloads(newestFirst).map((download) =>
        download.kind === 'group' ? download.jobs.map((job) => job.id) : download.job.id,
      ),
      [['a', 'b', 'c'], 'single'],
    )
  })
})

describe('a playlist header', () => {
  const jobs = [
    videoJob('a', 1, { status: 'done' }),
    videoJob('b', 2, { status: 'downloading', progress: 0.5 }),
    videoJob('c', 3, { status: 'paused' }),
  ]

  it('says how far the playlist is, leaving out what is zero', () => {
    assert.equal(groupStatusText(group, jobs), '1 of 3 videos done · 1 downloading · 1 paused')
  })

  it('fills its bar with the average of the videos, finished ones counting as full', () => {
    assert.equal(groupProgress(jobs), 0.5)
  })
})

describe('shownVideos', () => {
  const jobs = Array.from({ length: 250 }, (_, index) => videoJob(`video-${index + 1}`, index + 1))

  it('shows the first 100 videos of a long playlist and counts the rest', () => {
    const { shownJobs, hiddenCount } = shownVideos(jobs, VIDEOS_SHOWN_AT_ONCE)

    assert.deepEqual(
      [shownJobs.length, shownJobs[0]?.id, shownJobs.at(-1)?.id, hiddenCount],
      [100, 'video-1', 'video-100', 150],
    )
  })

  it('always shows the songs that are downloading, even past the first 100', () => {
    const downloadingLater = jobs.map((job) =>
      job.options.playlistNumber === 151 || job.options.playlistNumber === 152
        ? { ...job, status: 'downloading' as const }
        : job,
    )
    const { shownJobs, hiddenCount } = shownVideos(downloadingLater, VIDEOS_SHOWN_AT_ONCE)

    assert.deepEqual(
      shownJobs.slice(-3).map((job) => job.id),
      ['video-100', 'video-151', 'video-152'],
    )
    assert.equal(hiddenCount, 148)
  })

  it('shows them all after Show all, and hides nothing in a short playlist', () => {
    assert.equal(shownVideos(jobs, Number.POSITIVE_INFINITY).hiddenCount, 0)
    assert.deepEqual(shownVideos(jobs.slice(0, 3), VIDEOS_SHOWN_AT_ONCE).hiddenCount, 0)
  })
})
