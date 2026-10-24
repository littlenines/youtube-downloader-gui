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
  progress: job.progress,
  later: job.downloadLater,
  startsAt: job.status === 'scheduled' ? job.startsAt : null,
  downloadFolder,
})

const savedJobStatus = (savedJob: SavedJob): Job['status'] => {
  if (savedJob.paused) return 'paused'

  return savedJob.later && savedJob.startsAt ? 'scheduled' : 'queued'
}

export const jobFromSavedJob = (savedJob: SavedJob): Job => {
  const job = createQueuedJob(savedJob.id, savedJob.options, savedJob)

  return {
    ...job,
    status: savedJobStatus(savedJob),
    progress: savedJob.progress,
    downloadLater: savedJob.later,
    startsAt: savedJob.later ? savedJob.startsAt : null,
    label: savedJob.label || job.label,
    createdAt: savedJob.createdAt,
  }
}
