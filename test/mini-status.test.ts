import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Job, JobGroup } from '@shared/types/downloads.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { createQueuedJob } from '@server/services/downloads/jobs.js'
import { miniStatus } from '@client/components/mini/mini-status.js'

const album: JobGroup = {
  id: 'album',
  title: 'Example Album',
  size: 2,
  url: 'https://www.youtube.com/playlist?list=PL1',
}

const job = (title: string, changes: Partial<Job> = {}, group?: JobGroup): Job => ({
  ...createQueuedJob(title, normalizeDownloadRequest({ url: 'https://x' }), { title, ...(group ? { group } : {}) }),
  ...changes,
})

const downloading = (title: string, progress: number, changes: Partial<Job> = {}, group?: JobGroup) =>
  job(title, { status: 'downloading', progress, ...changes }, group)

describe('miniStatus', () => {
  it('shows a single download with its progress, speed and time left', () => {
    assert.deepEqual(miniStatus([downloading('Summer Song', 0.4, { bytesPerSecond: 2_500_000, secondsLeft: 83 })]), {
      titles: ['Summer Song'],
      progress: 0.4,
      isIndeterminate: false,
      details: '2.4 MB/s · 1m 23s left',
    })
  })

  it('shows a moving bar and the step while converting, instead of a full bar that looks finished', () => {
    const converting = downloading('Cyberpunk Edgerunners OST', 1, {
      activity: 'processing',
      stage: 'Converting to MP3',
    })

    assert.deepEqual(miniStatus([converting, job('Morning Light')]), {
      titles: ['Cyberpunk Edgerunners OST'],
      progress: 1,
      isIndeterminate: true,
      details: 'Converting to MP3… · 1 waiting',
    })
  })

  it('keeps the real bar while one song of a playlist converts and another downloads', () => {
    const status = miniStatus([
      downloading('First Track', 1, { activity: 'processing', stage: 'Converting to MP3' }, album),
      downloading('Second Track', 0.5, { activity: 'downloading' }, album),
    ])

    assert.deepEqual([status.isIndeterminate, status.details], [false, ''])
  })

  it('rotates between several downloads, with their total speed, the longest time left and what waits', () => {
    const status = miniStatus([
      downloading('Summer Song', 0.2, { bytesPerSecond: 1_000_000, secondsLeft: 30 }),
      downloading('Night Drive', 0.6, { bytesPerSecond: 1_000_000, secondsLeft: 90 }),
      job('Morning Light'),
      job('Lose Yourself to Dance', { status: 'scheduled' }),
    ])

    assert.deepEqual(status.titles, ['Summer Song', 'Night Drive'])
    assert.equal(status.details, '2 downloading · 1.9 MB/s · 1m 30s left · 2 waiting')
  })

  it('names a playlist once, counting its finished songs as full', () => {
    const status = miniStatus([
      job('First Track', { status: 'done', progress: 1 }, album),
      downloading('Second Track', 0, {}, album),
    ])

    assert.deepEqual([status.titles, status.progress], [['Example Album'], 0.5])
  })

  it('fills the bar with the progress of what it names, not of the downloads still waiting', () => {
    const waiting = ['Morning Light', 'Last Track', 'Slow River', 'Late Train'].map((title) => job(title))

    assert.equal(miniStatus([downloading('Summer Song', 0.9), ...waiting]).progress, 0.9)
    assert.equal(miniStatus(waiting).progress, null)
  })

  it('says what is left when nothing downloads', () => {
    assert.deepEqual(miniStatus([job('Morning Light')]).titles, ['1 download waiting'])
    assert.deepEqual(miniStatus([job('Morning Light', { status: 'paused' })]).titles, ['1 download paused'])
    assert.deepEqual(miniStatus([]).titles, ['Nothing is downloading'])
  })

  it('says when all downloads are finished, and how they went', () => {
    assert.deepEqual(miniStatus([job('Summer Song', { status: 'done' }), job('Last Track', { status: 'error' })]), {
      titles: ['All downloads finished'],
      progress: null,
      isIndeterminate: false,
      details: '1 done · 1 failed',
    })
  })
})
