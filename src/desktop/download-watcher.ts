import type { BrowserWindow } from 'electron'
import { isActiveJob } from '@shared/jobs.js'
import type { Job } from '@shared/types/downloads.js'
import type { Services } from '@server/server.js'

export interface DownloadChanges {
  activeJobs: Job[]
  finishedJobs: Job[]
}

export type DownloadListener = (changes: DownloadChanges) => void

const UPDATE_INTERVAL_MILLISECONDS = 1000

const isDoneOrFailed = (job: Job): boolean => job.status === 'done' || job.status === 'error'

export const newlyFinishedJobs = (jobs: Job[], reportedFinishes: Map<string, string>): Job[] => {
  const finishedJobs = jobs.filter(
    (job) => isDoneOrFailed(job) && job.finishedAt !== null && reportedFinishes.get(job.id) !== job.finishedAt,
  )

  for (const job of finishedJobs) reportedFinishes.set(job.id, job.finishedAt ?? '')

  return finishedJobs
}

const runListener = (listener: DownloadListener, changes: DownloadChanges): void => {
  try {
    listener(changes)
  } catch (error) {
    console.error('A download listener failed:', error)
  }
}

export const watchDownloads = (window: BrowserWindow, { queue }: Services, listeners: DownloadListener[]): void => {
  const reportedFinishes = new Map<string, string>()

  newlyFinishedJobs(queue.list(), reportedFinishes)

  const timer = setInterval(() => {
    if (window.isDestroyed()) return clearInterval(timer)

    const jobs = queue.list()
    const changes = { activeJobs: jobs.filter(isActiveJob), finishedJobs: newlyFinishedJobs(jobs, reportedFinishes) }

    for (const listener of listeners) runListener(listener, changes)
  }, UPDATE_INTERVAL_MILLISECONDS)
}
