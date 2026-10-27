import { countText } from '@shared/count-text.js'
import {
  averageProgress,
  byPlaylistNumber,
  countJobs,
  groupDownloads,
  isDoneJob,
  isFailedJob,
  isPausedJob,
  type JobsOfOneDownload,
} from '@shared/jobs.js'
import type { Job, JobGroup } from '@shared/types/downloads.js'
import { joinNonEmpty } from '@client/utils/format.js'

export type ListedDownload = { kind: 'job'; job: Job } | { kind: 'group'; group: JobGroup; jobs: Job[] }

export interface PlaylistView {
  isFolded(group: JobGroup): boolean
  shownVideoCount(group: JobGroup): number
}

export interface ShownVideos {
  shownJobs: Job[]
  hiddenCount: number
}

export const VIDEOS_SHOWN_AT_ONCE = 100

const isDownloading = (job: Job): boolean => job.status === 'downloading'

export const shownVideos = (jobs: Job[], shownCount: number): ShownVideos => {
  const shownJobs = [...jobs.slice(0, shownCount), ...jobs.slice(shownCount).filter(isDownloading)]

  return { shownJobs, hiddenCount: jobs.length - shownJobs.length }
}

const listedDownload = (jobs: JobsOfOneDownload): ListedDownload => {
  const [firstJob] = jobs

  return firstJob.group
    ? { kind: 'group', group: firstJob.group, jobs: jobs.toSorted(byPlaylistNumber) }
    : { kind: 'job', job: firstJob }
}

export const listedDownloads = (jobs: Job[]): ListedDownload[] => groupDownloads(jobs).map(listedDownload)

const statusPart = (count: number, text: string): string => (count ? `${count} ${text}` : '')

const isCancelled = (job: Job): boolean => job.status === 'cancelled'
const isWaiting = (job: Job): boolean => job.status === 'queued' || job.status === 'scheduled'

export const groupStatusText = (group: JobGroup, jobs: Job[]): string =>
  joinNonEmpty([
    `${countJobs(jobs, isDoneJob)} of ${countText(group.size, 'video')} done`,
    statusPart(countJobs(jobs, isFailedJob), 'failed'),
    statusPart(countJobs(jobs, isCancelled), 'cancelled'),
    statusPart(countJobs(jobs, isDownloading), 'downloading'),
    statusPart(countJobs(jobs, isPausedJob), 'paused'),
    statusPart(countJobs(jobs, isWaiting), 'waiting'),
  ])

export const groupProgress = averageProgress
