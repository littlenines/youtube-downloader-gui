import type { BrowserWindow } from 'electron'
import type { Job } from '@shared/types/downloads.js'
import type { DownloadListener } from './download-watcher.js'

const HIDDEN_PROGRESS = -1
const MINIMUM_VISIBLE_PROGRESS = 0.01

const taskbarProgress = (activeJobs: Job[]): number => {
  if (!activeJobs.length) return HIDDEN_PROGRESS

  const averageProgress = activeJobs.reduce((sum, job) => sum + job.progress, 0) / activeJobs.length

  return Math.max(MINIMUM_VISIBLE_PROGRESS, Math.round(averageProgress * 100) / 100)
}

export const showProgressOnTaskbar = (window: BrowserWindow): DownloadListener => {
  let shownProgress: number | null = null

  window.on('focus', () => window.flashFrame(false))

  return ({ activeJobs, finishedJobs }) => {
    const progress = taskbarProgress(activeJobs)

    if (progress !== shownProgress) window.setProgressBar(progress)

    shownProgress = progress

    if (finishedJobs.some((job) => job.status === 'done') && !window.isFocused()) window.flashFrame(true)
  }
}
