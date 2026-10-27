import { countText } from '@shared/count-text.js'
import { countJobs, groupDownloads, isDoneJob, isFailedJob } from '@shared/jobs.js'
import type { Job, JobGroup } from '@shared/types/downloads.js'

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

const groupText = (group: JobGroup, jobs: Job[]): NotificationText => {
  const doneCount = countJobs(jobs, isDoneJob)
  const failedCount = countJobs(jobs, isFailedJob)
  const failedText = failedCount ? `, ${failedCount} failed` : ''

  return { title: group.title, body: `${doneCount} of ${countText(group.size, 'video')} downloaded${failedText}` }
}

const severalDownloadsText = (downloads: Job[][]): NotificationText => {
  const failedDownloads = downloads.filter((jobs) => jobs.every(isFailedJob))
  const failedCount = failedDownloads.length
  const doneCount = downloads.length - failedCount

  if (failedCount === downloads.length) {
    return {
      title: `${countText(downloads.length, 'download')} failed`,
      body: failedDownloads[0]?.[0]?.error ?? 'Unknown reason.',
    }
  }

  return {
    title: `${countText(downloads.length, 'download')} finished`,
    body: failedCount ? `${doneCount} downloaded, ${failedCount} failed` : `All ${downloads.length} downloaded`,
  }
}

export const finishedNotificationText = (jobs: Job[]): NotificationText => {
  const downloads = groupDownloads(jobs)
  const [onlyDownload] = downloads
  const [firstJob] = onlyDownload ?? []

  if (downloads.length !== 1 || !firstJob) return severalDownloadsText(downloads)

  return firstJob.group ? groupText(firstJob.group, onlyDownload ?? []) : jobText(firstJob)
}
