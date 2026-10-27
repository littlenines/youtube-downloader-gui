import { randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'
import { countText } from '@shared/count-text.js'
import { byPlaylistNumber } from '@shared/jobs.js'
import type { CoverRequest, DownloadOptions, HistoryEntry, Job, JobGroup } from '@shared/types/downloads.js'
import { describeDownloadOptions } from './download-options.js'

export interface JobDisplayDetails {
  title?: string | undefined
  thumbnailUrl?: string | null | undefined
  videoCount?: number | undefined
  group?: JobGroup | null | undefined
}

export interface NewDownload {
  options: DownloadOptions
  details: JobDisplayDetails
}

export const nowAsText = (): string => new Date().toISOString()

export const createQueuedJob = (id: string, options: DownloadOptions, details: JobDisplayDetails): Job => {
  const playlistLabel = options.playlist ? ` · playlist (${details.videoCount ?? '?'})` : ''

  return {
    id,
    status: 'queued',
    options,
    title: details.title || options.url,
    thumbnailUrl: details.thumbnailUrl ?? null,
    label: describeDownloadOptions(options) + playlistLabel,
    createdAt: nowAsText(),
    finishedAt: null,
    progress: 0,
    activity: null,
    downloadedBytes: null,
    totalBytes: null,
    runStartedAt: null,
    activeSeconds: 0,
    downloadLater: false,
    startsAt: null,
    stage: null,
    bytesPerSecond: null,
    secondsLeft: null,
    files: [],
    sizeBytes: null,
    error: null,
    warning: null,
    playlistPosition: null,
    group: details.group ?? null,
  }
}

export const resetJobForRetry = (job: Job): void => {
  Object.assign(job, {
    status: 'queued',
    error: null,
    warning: null,
    progress: 0,
    activity: null,
    downloadedBytes: null,
    totalBytes: null,
    activeSeconds: 0,
    downloadLater: false,
    startsAt: null,
    files: [],
    stage: null,
    finishedAt: null,
    sizeBytes: null,
  } satisfies Partial<Job>)
}

export const skippedItemsWarning = (skippedItems: string[]): string | null => {
  const count = skippedItems.length

  if (!count) return null

  return `${countText(count, 'video')} could not be downloaded. ${skippedItems[0]}`
}

export const historyEntryFromCover = (cover: CoverRequest, file: string, sizeBytes: number | null): HistoryEntry => ({
  id: randomUUID(),
  title: cover.title || basename(file, extname(file)),
  thumbnailUrl: cover.thumbnailUrl ?? null,
  label: cover.square ? 'Square cover · JPG' : 'Cover · JPG',
  files: [file],
  sizeBytes,
  finishedAt: nowAsText(),
  url: cover.url,
})

export const historyEntryFromGroup = (group: JobGroup, jobs: Job[]): HistoryEntry => {
  const doneJobs = jobs.filter((job) => job.status === 'done').sort(byPlaylistNumber)
  const sizeBytes = doneJobs.reduce((sum, job) => sum + (job.sizeBytes ?? 0), 0)

  return {
    id: group.id,
    title: group.title,
    thumbnailUrl: doneJobs[0]?.thumbnailUrl ?? null,
    label: `${doneJobs[0]?.label ?? ''} · playlist (${countText(doneJobs.length, 'video')})`,
    files: doneJobs.flatMap((job) => job.files),
    sizeBytes: sizeBytes || null,
    finishedAt: nowAsText(),
    url: group.url,
  }
}

export const historyEntryFromJob = (job: Job): HistoryEntry => ({
  id: job.id,
  title: job.title,
  thumbnailUrl: job.thumbnailUrl,
  label: job.label,
  files: job.files,
  sizeBytes: job.sizeBytes,
  finishedAt: nowAsText(),
  url: job.options.url,
})
