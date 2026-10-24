import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Job } from '@shared/types/downloads.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import {
  isInsideWindow,
  isTimeToStart,
  nextStartTime,
  type DownloadWindow,
} from '@server/services/downloads/download-window.js'
import { createQueuedJob } from '@server/services/downloads/jobs.js'
import { applyWindowToJobs, moveWaitingJobs, waitForWindow } from '@server/services/downloads/later-jobs.js'
import { parseSettings } from '@server/services/stores/settings-store.js'

const at = (hours: number, minutes = 0, day = 24): Date => new Date(2026, 9, day, hours, minutes)

const NIGHT: DownloadWindow = { startTime: '02:00', stopTime: '07:00' }
const OVERNIGHT: DownloadWindow = { startTime: '22:00', stopTime: '06:00' }
const NO_STOP: DownloadWindow = { startTime: '02:00', stopTime: null }

const laterJob = (id: string, status: Job['status'], window: DownloadWindow, now: Date): Job => {
  const job = createQueuedJob(id, normalizeDownloadRequest({ url: 'https://example.com/video' }), {})

  waitForWindow(job, window, now)
  job.status = status

  return job
}

describe('download window', () => {
  it('knows when it is open, also across midnight and without a stop time', () => {
    assert.equal(isInsideWindow(NIGHT, at(3)), true)
    assert.equal(isInsideWindow(NIGHT, at(7)), false)
    assert.equal(isInsideWindow(NIGHT, at(1, 59)), false)
    assert.equal(isInsideWindow(OVERNIGHT, at(23)), true)
    assert.equal(isInsideWindow(OVERNIGHT, at(5, 59)), true)
    assert.equal(isInsideWindow(OVERNIGHT, at(12)), false)
    assert.equal(isInsideWindow(NO_STOP, at(15)), true)
  })

  it('starts at the next start time, or right away while the window is open', () => {
    assert.deepEqual(nextStartTime(NIGHT, at(1)), at(2))
    assert.deepEqual(nextStartTime(NIGHT, at(12)), at(2, 0, 25))
    assert.deepEqual(nextStartTime(NIGHT, at(3)), at(3))
    assert.deepEqual(nextStartTime(NO_STOP, at(3)), at(2, 0, 25))
  })

  it('starts a waiting download once its time has come and the window is open', () => {
    assert.equal(isTimeToStart(at(2).toISOString(), NIGHT, at(1)), false)
    assert.equal(isTimeToStart(at(2).toISOString(), NIGHT, at(2)), true)
    assert.equal(isTimeToStart(at(2).toISOString(), NIGHT, at(9)), false, 'the app was closed all night')
    assert.equal(isTimeToStart(at(2).toISOString(), NO_STOP, at(9)), true, 'no stop time: starts when the app opens')
  })
})

describe('later times in settings', () => {
  it('keeps only valid clock times', () => {
    const settings = parseSettings({ laterStartTime: '02:00', laterStopTime: '25:00' })

    assert.equal(settings.laterStartTime, '02:00')
    assert.equal(settings.laterStopTime, null)
    assert.equal(parseSettings({}).laterStartTime, null)
  })
})

describe('applying the window to jobs', () => {
  it('starts waiting jobs that are due, and stops running ones once the window closes', () => {
    const due = laterJob('due', 'scheduled', NIGHT, at(1))
    const running = laterJob('running', 'downloading', NIGHT, at(3))
    const now = createQueuedJob('now', normalizeDownloadRequest({ url: 'https://example.com/video' }), {})

    now.status = 'downloading'

    assert.deepEqual(applyWindowToJobs([due, now], NIGHT, at(2)), { changed: true, jobIdsToStop: [] })
    assert.equal(due.status, 'queued')

    assert.deepEqual(applyWindowToJobs([running, now], NIGHT, at(7)), { changed: true, jobIdsToStop: ['running'] })
    assert.equal(running.status, 'scheduled')
    assert.equal(running.startsAt, at(2, 0, 25).toISOString())
    assert.equal(now.status, 'downloading', 'a download started with Download is never stopped')
  })

  it('moves a missed start time to the next one, so the list shows the right day', () => {
    const missed = laterJob('missed', 'scheduled', NIGHT, at(1))

    assert.deepEqual(applyWindowToJobs([missed], NIGHT, at(9)), { changed: true, jobIdsToStop: [] })
    assert.equal(missed.startsAt, at(2, 0, 25).toISOString())
  })

  it('moves waiting jobs to a new start time', () => {
    const waiting = laterJob('waiting', 'scheduled', NIGHT, at(1))

    moveWaitingJobs([waiting], { startTime: '04:00', stopTime: null }, at(1))
    assert.equal(waiting.startsAt, at(4).toISOString())
  })
})
