import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BrowserWindow } from 'electron'
import type { Job } from '@shared/types/downloads.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { createQueuedJob } from '@server/services/downloads/jobs.js'
import { showProgressOnTaskbar, taskbarProgress } from '@desktop/taskbar-progress.js'

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

const fakeWindow = () => {
  const focusListeners: (() => void)[] = []
  const calls = { progress: [] as number[], flashes: [] as boolean[] }
  const window = {
    isDestroyed: () => false,
    isFocused: () => false,
    setProgressBar: (progress: number) => calls.progress.push(progress),
    flashFrame: (isFlashing: boolean) => calls.flashes.push(isFlashing),
    on: (_event: 'focus', listener: () => void) => focusListeners.push(listener),
  }

  return {
    window: window as unknown as BrowserWindow,
    calls,
    focusListeners,
    focus: () => focusListeners.forEach((listener) => listener()),
  }
}

const downloading = jobWith('single', { status: 'downloading', progress: 0.5 }, false)
const finished = jobWith('single', { status: 'done', progress: 1 }, false)
const whileDownloading = { jobs: [downloading], activeJobs: [downloading], finishedJobs: [] }

describe('showProgressOnTaskbar', () => {
  it('sends the progress to the shown window only when it changes', () => {
    const main = fakeWindow()
    const showProgress = showProgressOnTaskbar(main.window, () => [main.window])

    showProgress(whileDownloading)
    showProgress(whileDownloading)

    assert.deepEqual(main.calls.progress, [0.5])
  })

  it('sends it again to a window that comes back, such as the main window after mini mode, whose taskbar button is new', () => {
    const main = fakeWindow()
    const miniBar = fakeWindow()
    let shown = main.window
    const showProgress = showProgressOnTaskbar(main.window, () => [shown])

    showProgress(whileDownloading)
    shown = miniBar.window
    showProgress(whileDownloading)
    shown = main.window
    showProgress(whileDownloading)

    assert.deepEqual([main.calls.progress, miniBar.calls.progress, main.focusListeners.length], [[0.5, 0.5], [0.5], 1])
  })

  it('flashes the unfocused main window when a download finishes, also when minimized, and stops when it is focused', () => {
    const minimizedMain = fakeWindow()
    const showProgress = showProgressOnTaskbar(minimizedMain.window, () => [minimizedMain.window])

    showProgress({ jobs: [finished], activeJobs: [], finishedJobs: [finished] })
    minimizedMain.focus()

    assert.deepEqual(minimizedMain.calls.flashes, [true, false])
  })

  it('flashes nothing while the mini bar is shown, since the bar itself says the download finished', () => {
    const hiddenMain = fakeWindow()
    const miniBar = fakeWindow()
    const showProgress = showProgressOnTaskbar(hiddenMain.window, () => [miniBar.window])

    showProgress({ jobs: [finished], activeJobs: [], finishedJobs: [finished] })

    assert.deepEqual([hiddenMain.calls.flashes, miniBar.calls.flashes], [[], []])
  })
})
