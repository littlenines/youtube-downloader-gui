import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Job } from '@shared/types/downloads.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { createQueuedJob } from '@server/services/downloads/jobs.js'
import { taskbarProgress } from '@desktop/taskbar-progress.js'

const group = { id: 'album', title: 'Discovery', size: 4, url: 'https://www.youtube.com/playlist?list=PL1' }

const jobWith = (id: string, changes: Partial<Job>, isInPlaylist = true): Job => ({
  ...createQueuedJob(id, normalizeDownloadRequest({ url: 'https://x' }), isInPlaylist ? { group } : {}),
  ...changes,
})

describe('taskbarProgress', () => {
  it('counts a playlist as one download, with its finished songs as full', () => {
    const playlist = [
      jobWith('1', { status: 'done', progress: 1 }),
      jobWith('2', { status: 'downloading', progress: 0.5 }),
      jobWith('3', { status: 'queued' }),
      jobWith('4', { status: 'queued' }),
    ]
    const single = jobWith('single', { status: 'downloading', progress: 0.5 }, false)

    assert.equal(taskbarProgress(playlist), 0.38)
    assert.equal(taskbarProgress([...playlist, single]), 0.44)
  })

  it('hides the bar when nothing is downloading', () => {
    assert.equal(taskbarProgress([jobWith('1', { status: 'done', progress: 1 })]), -1)
  })
})
