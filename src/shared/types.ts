export type MediaKind = 'audio' | 'video'
export type AudioFormat = 'mp3' | 'm4a' | 'opus' | 'original' | 'flac' | 'wav'
export type Container = 'mp4' | 'mkv' | 'webm'
export type JobStatus = 'queued' | 'downloading' | 'done' | 'error' | 'cancelled'

export interface VideoQuality {
  resolution: number
  framesPerSecond: number
  label: string
  tag: string
  hdr: boolean
  codecs: string[]
  hasH264: boolean
  estimatedBytes: number | null
}

export interface AudioSource {
  codec: string
  bitrateKbps: number
  sizeBytes: number | null
}

export interface AudioTags {
  artist: string
  title: string
  album: string
}

export interface PreviewSource {
  token: string
  kind: 'video' | 'audio'
}

export interface VideoInfo {
  kind: 'video'
  id: string
  title: string
  uploader: string | null
  url: string
  thumbnailUrl: string | null
  durationSeconds: number | null
  viewCount: number | null
  isLive: boolean
  artist: string | null
  track: string | null
  album: string | null
  playlistId: string | null
  preview: PreviewSource | null
  audio: AudioSource | null
  qualities: VideoQuality[]
  subtitleLanguages: string[]
}

export interface PlaylistEntry {
  position: number
  title: string
  durationSeconds: number | null
  url: string
}

export interface PlaylistInfo {
  kind: 'playlist'
  title: string
  uploader: string | null
  url: string
  videoCount: number
  thumbnailUrl: string | null
  durationSeconds: number | null
  entries: PlaylistEntry[]
}

export type MediaInfo = VideoInfo | PlaylistInfo

export interface SearchResult {
  title: string
  url: string
  channel: string | null
  durationSeconds: number | null
  viewCount: number | null
  thumbnailUrl: string | null
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
  title?: string
  thumbnailUrl?: string | null
  videoCount?: number
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
  stage: string | null
  bytesPerSecond: number | null
  secondsLeft: number | null
  files: string[]
  sizeBytes: number | null
  error: string | null
  warning: string | null
  playlistPosition: PlaylistPosition | null
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

export interface Settings {
  downloadFolder: string
  simultaneousDownloads: number
  lowLatencyRendering: boolean
}

export interface SetupStatus {
  state: 'missing' | 'running' | 'ready' | 'error'
  installed: boolean
  message: string | null
  progress: number | null
  downloadSizeMegabytes: number
}

export interface AppUpdate {
  version: string
  releaseUrl: string
}

export interface AppUpdateResponse {
  currentVersion: string
  update: AppUpdate | null
}

export interface StatusResponse extends Settings {
  appVersion: string
  ytdlpVersion: string | null
  platform: string
  setup: SetupStatus
}

export interface DesktopBridge {
  pickFolder(currentFolder: string): Promise<string | null>
}
