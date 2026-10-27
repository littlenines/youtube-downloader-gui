import { isFinishedJob, isPausedJob } from '@shared/jobs.js'
import type { Job } from '@shared/types/downloads.js'
import type { SavedFinish, SavedJob } from '@server/services/stores/queue-store.js'
import { createQueuedJob } from './jobs.js'

const savedFinishFromJob = (job: Job): SavedFinish | null =>
  isFinishedJob(job)
    ? {
        status: job.status as SavedFinish['status'],
        files: job.files,
        sizeBytes: job.sizeBytes,
        error: job.error,
        finishedAt: job.finishedAt,
      }
    : null

export const savedJobFromJob = (job: Job, downloadFolder: string | null): SavedJob => ({
  id: job.id,
  options: job.options,
  title: job.title,
  thumbnailUrl: job.thumbnailUrl,
  label: job.label,
  createdAt: job.createdAt,
  paused: isPausedJob(job),
  progress: job.progress,
  activeSeconds: job.activeSeconds,
  later: job.downloadLater,
  startsAt: job.status === 'scheduled' ? job.startsAt : null,
  downloadFolder,
  group: job.group,
  finished: savedFinishFromJob(job),
})

const savedJobStatus = (savedJob: SavedJob): Job['status'] => {
  if (savedJob.paused) return 'paused'

  return savedJob.later && savedJob.startsAt ? 'scheduled' : 'queued'
}

const finishedJobFields = ({ finished }: SavedJob): Partial<Job> =>
  finished
    ? {
        status: finished.status,
        files: finished.files,
        sizeBytes: finished.sizeBytes,
        error: finished.error,
        finishedAt: finished.finishedAt,
        progress: finished.status === 'done' ? 1 : 0,
        downloadLater: false,
        startsAt: null,
      }
    : {}

export const jobFromSavedJob = (savedJob: SavedJob): Job => {
  const job = createQueuedJob(savedJob.id, savedJob.options, savedJob)

  return {
    ...job,
    status: savedJobStatus(savedJob),
    progress: savedJob.progress,
    activeSeconds: savedJob.activeSeconds,
    downloadLater: savedJob.later,
    startsAt: savedJob.later ? savedJob.startsAt : null,
    label: savedJob.label || job.label,
    createdAt: savedJob.createdAt,
    ...finishedJobFields(savedJob),
  }
}
