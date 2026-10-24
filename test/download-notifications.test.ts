import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DownloadRequest, Job } from '@shared/types/downloads.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { createQueuedJob } from '@server/services/downloads/jobs.js'
import { newlyFinishedJobs } from '@desktop/download-watcher.js'
import { createNotificationBatch } from '@desktop/notification-batch.js'
import { finishedNotificationText } from '@desktop/notification-text.js'

const jobFor = (request: Partial<DownloadRequest>, changes: Partial<Job>): Job => ({
  ...createQueuedJob('job', normalizeDownloadRequest({ url: 'https://example.com/video', ...request }), {}),
  title: 'Get Lucky',
  ...changes,
})

describe('finishedNotificationText', () => {
  it('names a finished download and its format', () => {
    assert.deepEqual(finishedNotificationText([jobFor({ format: 'mp3' }, { status: 'done' })]), {
      title: 'Get Lucky',
      body: 'Downloaded · MP3 · 320 kbps',
    })
  })

  it('says why a download failed', () => {
    assert.deepEqual(finishedNotificationText([jobFor({}, { status: 'error', error: 'This video is private.' })]), {
      title: 'Get Lucky',
      body: 'Download failed: This video is private.',
    })
  })

  it('counts the videos of a playlist once, including skipped ones', () => {
    const playlist = jobFor(
      { playlist: true },
      {
        status: 'done',
        title: 'Discovery',
        files: Array.from({ length: 12 }, (_, index) => `/music/${index}.mp3`),
        playlistPosition: { index: 14, count: 14, title: 'Too Long' },
      },
    )

    assert.deepEqual(finishedNotificationText([playlist]), { title: 'Discovery', body: '12 of 14 videos downloaded' })
  })

  it('sums up several downloads that finished together', () => {
    const done = jobFor({}, { status: 'done' })
    const failed = jobFor({}, { status: 'error', error: 'Gone.' })

    assert.deepEqual(finishedNotificationText([done, done, failed]), {
      title: '3 downloads finished',
      body: '2 downloaded, 1 failed',
    })
    assert.deepEqual(finishedNotificationText([done, done]), {
      title: '2 downloads finished',
      body: 'All 2 downloaded',
    })
    assert.deepEqual(finishedNotificationText([failed, failed]), { title: '2 downloads failed', body: 'Gone.' })
  })

  it('never counts more saved videos than the playlist download had', () => {
    const playlist = jobFor(
      { playlist: true },
      {
        status: 'done',
        files: ['/music/1.mp3', '/music/1.mp3.part-renamed', '/music/2.mp3'],
        playlistPosition: { index: 2, count: 2, title: 'Two' },
      },
    )

    assert.equal(finishedNotificationText([playlist]).body, '2 of 2 videos downloaded')
  })
})

describe('createNotificationBatch', () => {
  it('waits for a quiet moment, then shows everything that finished as one notification', (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] })

    const shown: string[][] = []
    const collect = createNotificationBatch((jobs) => shown.push(jobs.map((job) => job.id)), 10_000)

    collect([jobFor({}, { id: 'first', status: 'done' })])
    context.mock.timers.tick(6_000)
    collect([jobFor({}, { id: 'second', status: 'done' })])
    context.mock.timers.tick(9_999)
    assert.deepEqual(shown, [], 'every new finish restarts the wait')

    context.mock.timers.tick(1)
    assert.deepEqual(shown, [['first', 'second']])

    collect([jobFor({}, { id: 'later', status: 'error' })])
    context.mock.timers.tick(10_000)
    assert.deepEqual(shown, [['first', 'second'], ['later']], 'a later finish starts a new notification')
  })

  it('ignores a check with nothing finished', (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] })

    const shown: unknown[] = []
    const collect = createNotificationBatch((jobs) => shown.push(jobs), 10_000)

    collect([])
    context.mock.timers.tick(20_000)
    assert.deepEqual(shown, [])
  })
})

describe('newlyFinishedJobs', () => {
  it('reports each download that finished or failed once, but not cancelled ones', () => {
    const finishedAt = '2026-10-24T12:00:01.000Z'
    const jobs = [
      jobFor({}, { id: 'done', status: 'done', finishedAt }),
      jobFor({}, { id: 'failed', status: 'error', finishedAt }),
      jobFor({}, { id: 'cancelled', status: 'cancelled', finishedAt }),
      jobFor({}, { id: 'running', status: 'downloading' }),
    ]
    const reported = new Map<string, string>()

    assert.deepEqual(
      newlyFinishedJobs(jobs, reported).map((job) => job.id),
      ['done', 'failed'],
    )
    assert.deepEqual(newlyFinishedJobs(jobs, reported), [], 'not again on the next check, whatever the clock says')
  })

  it('reports a retried download again when it finishes again', () => {
    const job = jobFor({}, { id: 'retried', status: 'error', finishedAt: '2026-10-24T12:00:01.000Z' })
    const reported = new Map<string, string>()

    newlyFinishedJobs([job], reported)
    Object.assign(job, { status: 'done', finishedAt: '2026-10-24T11:00:00.000Z' })

    assert.deepEqual(
      newlyFinishedJobs([job], reported).map((finished) => finished.id),
      ['retried'],
    )
  })
})
