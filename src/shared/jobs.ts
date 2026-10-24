import type { Job } from './types/downloads.js'

export const isActiveJob = (job: Job): boolean => job.status === 'queued' || job.status === 'downloading'

export const isUnfinishedJob = (job: Job): boolean =>
  isActiveJob(job) || job.status === 'paused' || job.status === 'scheduled'

export const isFinishedJob = (job: Job): boolean => !isUnfinishedJob(job)
