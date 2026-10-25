export interface YtdlpFormat {
  format_id?: string
  url?: string
  protocol?: string
  http_headers?: Record<string, string>
  vcodec?: string
  acodec?: string
  audio_channels?: unknown
  width?: unknown
  height?: unknown
  fps?: unknown
  abr?: unknown
  tbr?: unknown
  ext?: string
  format_note?: string
  filesize?: unknown
  filesize_approx?: unknown
  dynamic_range?: string
}

export interface YtdlpThumbnail {
  id?: string
  url?: string
}

export interface YtdlpEntry {
  _type?: string
  ie_key?: string
  id?: string
  title?: string
  duration?: unknown
  url?: string
  webpage_url?: string
  channel?: string
  channel_is_verified?: boolean
  uploader?: string
  view_count?: unknown
  thumbnails?: YtdlpThumbnail[]
}

export interface YtdlpInfo {
  _type?: string
  id?: string
  title?: string
  uploader?: string
  channel?: string
  channel_id?: string
  extractor_key?: string
  live_status?: string
  availability?: string
  webpage_url?: string
  thumbnail?: string
  thumbnails?: YtdlpThumbnail[]
  duration?: unknown
  view_count?: unknown
  is_live?: boolean
  artist?: string
  creator?: string
  track?: string
  album?: string
  formats?: YtdlpFormat[]
  subtitles?: Record<string, unknown>
  entries?: (YtdlpEntry | null)[]
}

export const finiteNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export const hasVideo = (format: YtdlpFormat): boolean => Boolean(format.vcodec) && format.vcodec !== 'none'
export const hasAudio = (format: YtdlpFormat): boolean => Boolean(format.acodec) && format.acodec !== 'none'
