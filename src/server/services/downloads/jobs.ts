import type { DownloadOptions, HistoryEntry, Job } from '@shared/types/downloads.js'
import { describeDownloadOptions } from './download-options.js'

export interface JobDisplayDetails {
  title?: string | undefined
  thumbnailUrl?: string | null | undefined
  videoCount?: number | undefined
}

const nowAsText = () => new Date().toISOString()

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
    stage: null,
    bytesPerSecond: null,
    secondsLeft: null,
    files: [],
    sizeBytes: null,
    error: null,
    warning: null,
    playlistPosition: null,
  }
}

export const resetJobForRetry = (job: Job): void => {
  Object.assign(job, {
    status: 'queued',
    error: null,
    warning: null,
    progress: 0,
    files: [],
    stage: null,
    finishedAt: null,
    sizeBytes: null,
  } satisfies Partial<Job>)
}

export const skippedItemsWarning = (skippedItems: string[]): string | null => {
  const count = skippedItems.length

  if (!count) return null

  return `${count} ${count === 1 ? 'video' : 'videos'} could not be downloaded. ${skippedItems[0]}`
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
