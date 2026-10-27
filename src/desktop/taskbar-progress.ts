import type { BrowserWindow } from 'electron'
import { averageProgress, groupDownloads, isActiveJob } from '@shared/jobs.js'
import type { Job } from '@shared/types/downloads.js'
import type { DownloadListener } from './download-watcher.js'

const HIDDEN_PROGRESS = -1
const MINIMUM_VISIBLE_PROGRESS = 0.01

export const taskbarProgress = (jobs: Job[]): number => {
  const activeDownloads = groupDownloads(jobs).filter((download) => download.some(isActiveJob))

  if (!activeDownloads.length) return HIDDEN_PROGRESS

  const progress =
    activeDownloads.reduce((sum, download) => sum + averageProgress(download), 0) / activeDownloads.length

  return Math.max(MINIMUM_VISIBLE_PROGRESS, Math.round(progress * 100) / 100)
}

export const showProgressOnTaskbar = (
  mainWindow: BrowserWindow,
  shownWindows: () => BrowserWindow[],
): DownloadListener => {
  const shownProgress = new WeakMap<BrowserWindow, number>()
  let previousWindows: BrowserWindow[] = []

  mainWindow.on('focus', () => mainWindow.flashFrame(false))

  return ({ jobs, finishedJobs }) => {
    const progress = taskbarProgress(jobs)
    const windows = shownWindows().filter((window) => !window.isDestroyed())

    for (const window of windows) {
      if (!previousWindows.includes(window)) shownProgress.delete(window)
      if (shownProgress.get(window) !== progress) window.setProgressBar(progress)

      shownProgress.set(window, progress)
    }

    previousWindows = windows

    const hasNewDownload = finishedJobs.some((job) => job.status === 'done')

    if (hasNewDownload && windows.includes(mainWindow) && !mainWindow.isFocused()) mainWindow.flashFrame(true)
  }
}
