export type MediaKind = 'audio' | 'video'

export type AudioFormat = 'mp3' | 'm4a' | 'opus' | 'original' | 'flac' | 'wav'

export type Container = 'mp4' | 'mkv' | 'webm'

export type JobActivity = 'preparing' | 'downloading' | 'processing'

export type JobStatus = 'scheduled' | 'queued' | 'downloading' | 'paused' | 'done' | 'error' | 'cancelled'

export interface AudioTags {
  artist: string
  title: string
  album: string
}

export interface ClipRange {
  startSeconds: number
  endSeconds: number
}

export interface DownloadRequest {
  url: string
  kind: MediaKind
  format?: AudioFormat
  resolution?: number | null
  container?: Container
  playlist?: boolean
  playlistItems?: number[] | null
  clip?: ClipRange | null
  coverArt?: boolean
  squareCoverArt?: boolean
  removeNonMusic?: boolean
  subtitles?: boolean
  tags?: AudioTags | null
  folder?: string | null
  playlistNumber?: number | null
  playlistTitle?: string | null
  title?: string
  thumbnailUrl?: string | null
  videoCount?: number
  later?: boolean
}

export interface CoverRequest {
  url: string
  square?: boolean
  title?: string
  thumbnailUrl?: string | null
}

export interface DownloadOptions {
  url: string
  kind: MediaKind
  format: AudioFormat
  resolution: number | null
  container: Container
  playlist: boolean
  playlistItems: number[] | null
  clip: ClipRange | null
  coverArt: boolean
  squareCoverArt: boolean
  removeNonMusic: boolean
  subtitles: boolean
  tags: AudioTags | null
  folder: string | null
  playlistNumber: number | null
  playlistTitle: string | null
}

export interface JobGroup {
  id: string
  title: string
  size: number
  url: string
}

export interface PlaylistPosition {
  index: number | null
  count: number | null
  title: string
}

export interface Job {
  id: string
  status: JobStatus
  options: DownloadOptions
  title: string
  thumbnailUrl: string | null
  label: string
  createdAt: string
  finishedAt: string | null
  progress: number
  activity: JobActivity | null
  downloadedBytes: number | null
  totalBytes: number | null
  runStartedAt: string | null
  activeSeconds: number
  downloadLater: boolean
  startsAt: string | null
  stage: string | null
  bytesPerSecond: number | null
  secondsLeft: number | null
  files: string[]
  sizeBytes: number | null
  error: string | null
  warning: string | null
  playlistPosition: PlaylistPosition | null
  group: JobGroup | null
}

export interface HistoryEntry {
  id: string
  title: string
  thumbnailUrl: string | null
  label: string
  files: string[]
  sizeBytes: number | null
  finishedAt: string
  url: string
}

export interface DownloadsResponse {
  jobs: Job[]
  history: HistoryEntry[]
}
