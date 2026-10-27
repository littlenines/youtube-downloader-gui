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

export const showProgressOnTaskbar = (window: BrowserWindow): DownloadListener => {
  let shownProgress: number | null = null

  window.on('focus', () => window.flashFrame(false))

  return ({ jobs, finishedJobs }) => {
    const progress = taskbarProgress(jobs)

    if (progress !== shownProgress) window.setProgressBar(progress)

    shownProgress = progress

    if (finishedJobs.some((job) => job.status === 'done') && !window.isFocused()) window.flashFrame(true)
  }
}
