import type { Job } from './types/downloads.js'

export const isActiveJob = (job: Job): boolean => job.status === 'queued' || job.status === 'downloading'

export const isPausedJob = (job: Job): boolean => job.status === 'paused'

export const isDoneJob = (job: Job): boolean => job.status === 'done'

export const isFailedJob = (job: Job): boolean => job.status === 'error'

export const byPlaylistNumber = (first: Job, second: Job): number =>
  (first.options.playlistNumber ?? 0) - (second.options.playlistNumber ?? 0)

export const countJobs = (jobs: Job[], matches: (job: Job) => boolean): number => jobs.filter(matches).length

export const isUnfinishedJob = (job: Job): boolean => isActiveJob(job) || isPausedJob(job) || job.status === 'scheduled'

export const isFinishedJob = (job: Job): boolean => !isUnfinishedJob(job)

export const averageProgress = (jobs: Job[]): number =>
  jobs.reduce((sum, job) => sum + (isFinishedJob(job) ? 1 : job.progress), 0) / Math.max(jobs.length, 1)

export type JobsOfOneDownload = [Job, ...Job[]]

export const groupDownloads = (jobs: Job[]): JobsOfOneDownload[] => {
  const jobsByGroupId = new Map<string, JobsOfOneDownload>()
  const downloads: JobsOfOneDownload[] = []

  for (const job of jobs) {
    const groupJobs = job.group ? jobsByGroupId.get(job.group.id) : undefined

    if (groupJobs) {
      groupJobs.push(job)
      continue
    }

    const download: JobsOfOneDownload = [job]

    if (job.group) jobsByGroupId.set(job.group.id, download)

    downloads.push(download)
  }

  return downloads
}
