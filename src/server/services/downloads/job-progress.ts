import type { Job } from '@shared/types.js'
import type { DownloadEvent, PlaylistItemEvent, ProgressEvent } from '@server/services/ytdlp/download-events.js'

const PICTURE_STREAM_PROGRESS_SHARE = 0.85

const streamFraction = (event: ProgressEvent): number | null =>
  event.totalBytes ? Math.min(1, (event.downloadedBytes ?? 0) / event.totalBytes) : null

const isSeparateVideoStream = (job: Job, event: ProgressEvent): boolean =>
  job.options.kind === 'video' && event.stream !== 'combined'

const overallProgress = (job: Job, event: ProgressEvent, fraction: number): number => {
  if (!isSeparateVideoStream(job, event)) return fraction
  if (event.stream === 'picture') return fraction * PICTURE_STREAM_PROGRESS_SHARE

  return PICTURE_STREAM_PROGRESS_SHARE + fraction * (1 - PICTURE_STREAM_PROGRESS_SHARE)
}

const stageText = (job: Job, event: ProgressEvent, streamFinished: boolean): string => {
  if (job.options.kind === 'audio') return streamFinished ? 'Converting' : 'Downloading'
  if (!isSeparateVideoStream(job, event)) return streamFinished ? 'Finishing' : 'Downloading video'
  if (event.stream === 'picture') return streamFinished ? 'Getting the sound' : 'Downloading video'

  return streamFinished ? 'Merging picture and sound' : 'Downloading audio'
}

const applyProgressEvent = (job: Job, event: ProgressEvent): void => {
  if (event.stream === 'other') {
    job.stage = 'Downloading subtitles'

    return
  }

  const fraction = streamFraction(event)

  if (fraction !== null) job.progress = overallProgress(job, event, fraction)

  job.bytesPerSecond = event.bytesPerSecond
  job.secondsLeft = event.secondsLeft
  job.stage = stageText(job, event, fraction !== null && fraction >= 1)
}

const applyPlaylistItemEvent = (job: Job, event: PlaylistItemEvent): void => {
  const { playlist, tags } = job.options

  job.playlistPosition = event.count ? { index: event.index, count: event.count, title: event.title } : null

  if (!playlist && !tags && event.title) job.title = event.title

  job.progress = playlist && event.count && event.index ? (event.index - 1) / event.count : 0
}

export const applyDownloadEvent = (job: Job, event: DownloadEvent): void => {
  if (event.type === 'progress') applyProgressEvent(job, event)
  else if (event.type === 'item') applyPlaylistItemEvent(job, event)
  else {
    job.files.push(event.file)
    job.stage = 'Saved'
  }
}
