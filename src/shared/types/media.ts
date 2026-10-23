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
  isChannel: boolean
  title: string
  uploader: string | null
  url: string
  videoCount: number
  thumbnailUrl: string | null
  durationSeconds: number | null
  entries: PlaylistEntry[]
}

export type MediaInfo = VideoInfo | PlaylistInfo

export type SearchKind = 'video' | 'playlist'

export interface SearchResult {
  kind: SearchKind
  title: string
  url: string
  channel: string | null
  durationSeconds: number | null
  viewCount: number | null
  thumbnailUrl: string | null
  isVerified: boolean
}
