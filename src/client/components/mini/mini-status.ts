import { countText } from '@shared/count-text.js'
import {
  averageProgress,
  groupDownloads,
  isDoneJob,
  isFailedJob,
  isFinishedJob,
  isPausedJob,
  isWorkingWithoutProgress,
  type JobsOfOneDownload,
} from '@shared/jobs.js'
import type { Job } from '@shared/types/downloads.js'
import { formatSpeed, formatTimeLeft, joinNonEmpty } from '@client/utils/format.js'

export interface MiniStatus {
  titles: string[]
  progress: number | null
  isIndeterminate: boolean
  details: string
}

const isDownloading = (job: Job): boolean => job.status === 'downloading'

const isWaiting = (job: Job): boolean => job.status === 'queued' || job.status === 'scheduled'

const downloadTitle = ([firstJob]: JobsOfOneDownload): string => firstJob.group?.title ?? firstJob.title

const totalSpeed = (jobs: Job[]): number => jobs.reduce((sum, job) => sum + (job.bytesPerSecond ?? 0), 0)

const longestTimeLeft = (jobs: Job[]): number | null => {
  const timesLeft = jobs.flatMap((job) => (job.secondsLeft === null ? [] : [job.secondsLeft]))

  return timesLeft.length ? Math.max(...timesLeft) : null
}

const stageText = (downloadingJobs: Job[]): string => {
  const [onlyJob] = downloadingJobs

  return downloadingJobs.length === 1 && onlyJob && isWorkingWithoutProgress(onlyJob)
    ? `${onlyJob.stage ?? 'Working'}…`
    : ''
}

const finishedDetails = (finishedDownloads: JobsOfOneDownload[]): string => {
  const failedCount = finishedDownloads.filter((download) => download.some(isFailedJob)).length
  const doneCount = finishedDownloads.filter(
    (download) => download.some(isDoneJob) && !download.some(isFailedJob),
  ).length

  return joinNonEmpty([doneCount ? `${doneCount} done` : '', failedCount ? `${failedCount} failed` : ''])
}

const idleStatus = (title: string, details = ''): MiniStatus => ({
  titles: [title],
  progress: null,
  isIndeterminate: false,
  details,
})

const statusWhenNothingDownloads = (downloads: JobsOfOneDownload[]): MiniStatus => {
  const waitingCount = downloads.filter((download) => download.some(isWaiting)).length
  const pausedCount = downloads.filter((download) => download.some(isPausedJob)).length
  const finishedDownloads = downloads.filter((download) => download.every(isFinishedJob))

  if (waitingCount) return idleStatus(`${countText(waitingCount, 'download')} waiting`)
  if (pausedCount) return idleStatus(`${countText(pausedCount, 'download')} paused`)
  if (finishedDownloads.some((download) => download.some(isDoneJob) || download.some(isFailedJob))) {
    return idleStatus('All downloads finished', finishedDetails(finishedDownloads))
  }

  return idleStatus('Nothing is downloading')
}

export const miniStatus = (jobs: Job[]): MiniStatus => {
  const downloads = groupDownloads(jobs)
  const runningDownloads = downloads.filter((download) => download.some(isDownloading))

  if (!runningDownloads.length) return statusWhenNothingDownloads(downloads)

  const downloadingJobs = jobs.filter(isDownloading)
  const waitingCount = downloads.filter((download) => !download.some(isDownloading) && download.some(isWaiting)).length

  return {
    titles: runningDownloads.map(downloadTitle),
    isIndeterminate: downloadingJobs.every(isWorkingWithoutProgress),
    progress: runningDownloads.reduce((sum, download) => sum + averageProgress(download), 0) / runningDownloads.length,
    details: joinNonEmpty([
      runningDownloads.length > 1 ? `${runningDownloads.length} downloading` : '',
      stageText(downloadingJobs),
      formatSpeed(totalSpeed(downloadingJobs)),
      formatTimeLeft(longestTimeLeft(downloadingJobs)),
      waitingCount ? `${waitingCount} waiting` : '',
    ]),
  }
}
