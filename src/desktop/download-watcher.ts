import type { BrowserWindow } from 'electron'
import { isActiveJob, isUnfinishedJob } from '@shared/jobs.js'
import type { Job } from '@shared/types/downloads.js'
import type { Services } from '@server/server.js'

export interface DownloadChanges {
  jobs: Job[]
  activeJobs: Job[]
  finishedJobs: Job[]
}

export type DownloadListener = (changes: DownloadChanges) => void

const UPDATE_INTERVAL_MILLISECONDS = 1000

const isDoneOrFailed = (job: Job): boolean => job.status === 'done' || job.status === 'error'

const groupIdsOf = (jobs: Job[]): Set<string> => new Set(jobs.flatMap((job) => (job.group ? [job.group.id] : [])))

export const newlyFinishedJobs = (jobs: Job[], reportedFinishes: Map<string, string>): Job[] => {
  const unfinishedGroupIds = groupIdsOf(jobs.filter(isUnfinishedJob))
  const finishedJobs = jobs.filter(
    (job) =>
      isDoneOrFailed(job) &&
      job.finishedAt !== null &&
      reportedFinishes.get(job.id) !== job.finishedAt &&
      !unfinishedGroupIds.has(job.group?.id ?? ''),
  )

  for (const job of finishedJobs) reportedFinishes.set(job.id, job.finishedAt ?? '')

  const finishedGroupIds = groupIdsOf(finishedJobs)
  const earlierGroupMates = jobs.filter(
    (job) => isDoneOrFailed(job) && finishedGroupIds.has(job.group?.id ?? '') && !finishedJobs.includes(job),
  )

  return [...finishedJobs, ...earlierGroupMates]
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
    const changes = {
      jobs,
      activeJobs: jobs.filter(isActiveJob),
      finishedJobs: newlyFinishedJobs(jobs, reportedFinishes),
    }

    for (const listener of listeners) runListener(listener, changes)
  }, UPDATE_INTERVAL_MILLISECONDS)
}
