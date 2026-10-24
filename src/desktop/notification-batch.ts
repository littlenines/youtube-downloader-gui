import type { Job } from '@shared/types/downloads.js'

export const NOTIFICATION_QUIET_MILLISECONDS = 10_000

export const createNotificationBatch = (
  showFinishedJobs: (jobs: Job[]) => void,
  quietMilliseconds = NOTIFICATION_QUIET_MILLISECONDS,
): ((jobs: Job[]) => void) => {
  let pendingJobs: Job[] = []
  let timer: ReturnType<typeof setTimeout> | undefined

  const showPendingJobs = (): void => {
    const jobs = pendingJobs

    pendingJobs = []
    showFinishedJobs(jobs)
  }

  return (jobs) => {
    if (!jobs.length) return

    pendingJobs.push(...jobs)
    clearTimeout(timer)
    timer = setTimeout(showPendingJobs, quietMilliseconds)
  }
}
