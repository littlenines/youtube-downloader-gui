import type { Job } from './types/downloads.js'

export const isActiveJob = (job: Job): boolean => job.status === 'queued' || job.status === 'downloading'

export const isPausedJob = (job: Job): boolean => job.status === 'paused'

export const isUnfinishedJob = (job: Job): boolean => isActiveJob(job) || isPausedJob(job) || job.status === 'scheduled'

export const isFinishedJob = (job: Job): boolean => !isUnfinishedJob(job)
