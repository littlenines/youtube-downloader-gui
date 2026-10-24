import type { Job } from '@shared/types/downloads.js'
import { AUDIO_PRESETS } from '@server/services/ytdlp/audio-presets.js'
import type { DownloadEvent, PlaylistItemEvent, ProgressEvent } from '@server/services/ytdlp/download-events.js'

const PICTURE_STREAM_PROGRESS_SHARE = 0.85

const streamFraction = (event: ProgressEvent): number | null =>
  event.totalBytes ? Math.min(1, (event.downloadedBytes ?? 0) / event.totalBytes) : null

const isSeparateVideoStream = (job: Job, event: ProgressEvent): boolean =>
  job.options.kind === 'video' && event.stream !== 'combined'

const isLastStream = (job: Job, event: ProgressEvent): boolean =>
  !isSeparateVideoStream(job, event) || event.stream === 'sound'

const overallProgress = (job: Job, event: ProgressEvent, fraction: number): number => {
  if (!isSeparateVideoStream(job, event)) return fraction
  if (event.stream === 'picture') return fraction * PICTURE_STREAM_PROGRESS_SHARE

  return PICTURE_STREAM_PROGRESS_SHARE + fraction * (1 - PICTURE_STREAM_PROGRESS_SHARE)
}

const downloadingText = (job: Job, event: ProgressEvent): string => {
  if (job.options.kind === 'audio') return 'Downloading'
  if (!isSeparateVideoStream(job, event)) return 'Downloading video'

  return event.stream === 'picture' ? 'Downloading video' : 'Downloading audio'
}

const processingText = (job: Job, event: ProgressEvent): string => {
  if (job.options.kind === 'audio') return AUDIO_PRESETS[job.options.format].processingText
  if (!isSeparateVideoStream(job, event)) return 'Finishing'

  return event.stream === 'picture' ? 'Getting the sound' : 'Merging picture and sound'
}

const applyProgressEvent = (job: Job, event: ProgressEvent): void => {
  if (event.stream === 'other') {
    Object.assign(job, {
      stage: 'Downloading subtitles',
      activity: 'preparing',
      downloadedBytes: null,
      totalBytes: null,
      bytesPerSecond: null,
      secondsLeft: null,
    } satisfies Partial<Job>)

    return
  }

  const fraction = event.isFinished ? 1 : streamFraction(event)
  const isStreamFinished = event.isFinished

  if (fraction !== null) job.progress = overallProgress(job, event, fraction)

  if (isStreamFinished) {
    Object.assign(job, {
      stage: processingText(job, event),
      activity: isLastStream(job, event) ? 'processing' : 'preparing',
      bytesPerSecond: null,
      secondsLeft: null,
    } satisfies Partial<Job>)

    return
  }

  Object.assign(job, {
    stage: downloadingText(job, event),
    activity: 'downloading',
    downloadedBytes: event.downloadedBytes,
    totalBytes: event.totalBytes,
    bytesPerSecond: event.bytesPerSecond,
    secondsLeft: event.secondsLeft,
  } satisfies Partial<Job>)
}

const applyPlaylistItemEvent = (job: Job, event: PlaylistItemEvent): void => {
  const { playlist, tags } = job.options

  job.playlistPosition = event.count ? { index: event.index, count: event.count, title: event.title } : null

  if (!playlist && !tags && event.title) job.title = event.title

  job.progress = playlist && event.count && event.index ? (event.index - 1) / event.count : 0

  if (!job.options.clip) {
    Object.assign(job, { stage: 'Starting the download', activity: 'preparing' } satisfies Partial<Job>)
  }
}

export const applyDownloadEvent = (job: Job, event: DownloadEvent): void => {
  if (event.type === 'progress' && job.status !== 'downloading') return
  if (event.type === 'progress') applyProgressEvent(job, event)
  else if (event.type === 'item') applyPlaylistItemEvent(job, event)
  else {
    if (!job.files.includes(event.file)) job.files.push(event.file)

    job.stage = 'Saved'
    job.activity = null
  }
}
