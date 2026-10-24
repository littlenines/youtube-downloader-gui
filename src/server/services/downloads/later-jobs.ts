import { isActiveJob } from '@shared/jobs.js'
import type { Job } from '@shared/types/downloads.js'
import { isInsideWindow, isTimeToStart, nextStartTime, type DownloadWindow } from './download-window.js'

export interface WindowChanges {
  changed: boolean
  jobIdsToStop: string[]
}

export const waitForWindow = (job: Job, window: DownloadWindow, now: Date): void => {
  Object.assign(job, {
    status: 'scheduled',
    downloadLater: true,
    startsAt: nextStartTime(window, now).toISOString(),
    stage: null,
    bytesPerSecond: null,
    secondsLeft: null,
  } satisfies Partial<Job>)
}

const applyWindowToJob = (job: Job, window: DownloadWindow | null, now: Date): 'unchanged' | 'changed' | 'stop' => {
  if (job.status === 'scheduled' && (!window || isTimeToStart(job.startsAt, window, now))) {
    Object.assign(job, { status: 'queued', startsAt: null } satisfies Partial<Job>)

    return 'changed'
  }

  if (job.status === 'scheduled' && window && Date.parse(job.startsAt ?? '') <= now.getTime()) {
    job.startsAt = nextStartTime(window, now).toISOString()

    return 'changed'
  }

  if (isActiveJob(job) && window && !isInsideWindow(window, now)) {
    waitForWindow(job, window, now)

    return 'stop'
  }

  return 'unchanged'
}

export const applyWindowToJobs = (jobs: Iterable<Job>, window: DownloadWindow | null, now: Date): WindowChanges => {
  const changes: WindowChanges = { changed: false, jobIdsToStop: [] }

  for (const job of jobs) {
    if (!job.downloadLater) continue

    const result = applyWindowToJob(job, window, now)

    if (result !== 'unchanged') changes.changed = true
    if (result === 'stop') changes.jobIdsToStop.push(job.id)
  }

  return changes
}

export const moveWaitingJobs = (jobs: Iterable<Job>, window: DownloadWindow | null, now: Date): void => {
  if (!window) return

  for (const job of jobs) {
    if (job.status === 'scheduled') job.startsAt = nextStartTime(window, now).toISOString()
  }
}
