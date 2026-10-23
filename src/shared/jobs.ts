import type { Job } from './types.js'

export const isActiveJob = (job: Job): boolean => job.status === 'queued' || job.status === 'downloading'
