import type { Job } from '@shared/types/downloads.js'
import type { SavedJob } from '@server/services/stores/queue-store.js'
import { createQueuedJob } from './jobs.js'

export const savedJobFromJob = (job: Job, downloadFolder: string | null): SavedJob => ({
  id: job.id,
  options: job.options,
  title: job.title,
  thumbnailUrl: job.thumbnailUrl,
  label: job.label,
  createdAt: job.createdAt,
  paused: job.status === 'paused',
  downloadFolder,
})

export const jobFromSavedJob = (savedJob: SavedJob): Job => {
  const job = createQueuedJob(savedJob.id, savedJob.options, savedJob)

  return {
    ...job,
    status: savedJob.paused ? 'paused' : 'queued',
    label: savedJob.label || job.label,
    createdAt: savedJob.createdAt,
  }
}
