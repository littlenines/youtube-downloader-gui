import { countText } from '@shared/count-text.js'
import type { Job } from '@shared/types/downloads.js'

export interface NotificationText {
  title: string
  body: string
}

const playlistText = (job: Job): string => {
  const videoCount = job.playlistPosition?.count ?? null

  if (!videoCount) return `${countText(job.files.length, 'video')} downloaded`

  return `${Math.min(job.files.length, videoCount)} of ${countText(videoCount, 'video')} downloaded`
}

const jobText = (job: Job): NotificationText => {
  if (job.status === 'error') return { title: job.title, body: `Download failed: ${job.error ?? 'unknown reason'}` }

  return { title: job.title, body: job.options.playlist ? playlistText(job) : `Downloaded · ${job.label}` }
}

const severalJobsText = (jobs: Job[]): NotificationText => {
  const failedJobs = jobs.filter((job) => job.status === 'error')
  const failedCount = failedJobs.length
  const doneCount = jobs.length - failedCount

  if (failedCount === jobs.length) {
    return { title: `${countText(jobs.length, 'download')} failed`, body: failedJobs[0]?.error ?? 'Unknown reason.' }
  }

  return {
    title: `${countText(jobs.length, 'download')} finished`,
    body: failedCount ? `${doneCount} downloaded, ${failedCount} failed` : `All ${jobs.length} downloaded`,
  }
}

export const finishedNotificationText = (jobs: Job[]): NotificationText => {
  const [onlyJob] = jobs

  return jobs.length === 1 && onlyJob ? jobText(onlyJob) : severalJobsText(jobs)
}
