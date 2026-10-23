import type { BrowserWindow } from 'electron'
import { isActiveJob } from '@shared/jobs.js'
import type { Job } from '@shared/types/downloads.js'
import type { Services } from '@server/server.js'

const UPDATE_INTERVAL_MILLISECONDS = 1000
const HIDDEN_PROGRESS = -1
const MINIMUM_VISIBLE_PROGRESS = 0.01

const taskbarProgress = (activeJobs: Job[]): number => {
  if (!activeJobs.length) return HIDDEN_PROGRESS

  const averageProgress = activeJobs.reduce((sum, job) => sum + job.progress, 0) / activeJobs.length

  return Math.max(MINIMUM_VISIBLE_PROGRESS, Math.round(averageProgress * 100) / 100)
}

export const showProgressOnTaskbar = (window: BrowserWindow, { queue }: Services): void => {
  let previouslyActiveIds = new Set<string>()
  let shownProgress: number | null = null
  const timer = setInterval(() => {
    if (window.isDestroyed()) return clearInterval(timer)

    const jobs = queue.list()
    const activeJobs = jobs.filter(isActiveJob)
    const progress = taskbarProgress(activeJobs)

    if (progress !== shownProgress) window.setProgressBar(progress)

    shownProgress = progress

    const somethingFinished = jobs.some((job) => previouslyActiveIds.has(job.id) && job.status === 'done')

    if (somethingFinished && !window.isFocused()) window.flashFrame(true)

    previouslyActiveIds = new Set(activeJobs.map((job) => job.id))
  }, UPDATE_INTERVAL_MILLISECONDS)

  window.on('focus', () => window.flashFrame(false))
}
