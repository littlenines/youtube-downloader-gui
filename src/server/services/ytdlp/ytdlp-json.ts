export interface YtdlpFormat {
  format_id?: string
  url?: string
  protocol?: string
  http_headers?: Record<string, string>
  vcodec?: string
  acodec?: string
  audio_channels?: number
  width?: number
  height?: number
  fps?: number
  abr?: number
  tbr?: number
  ext?: string
  format_note?: string
  filesize?: number
  filesize_approx?: number
  dynamic_range?: string
}

export interface YtdlpThumbnail {
  url?: string
}

export interface YtdlpEntry {
  id?: string
  title?: string
  duration?: number
  url?: string
  webpage_url?: string
  channel?: string
  uploader?: string
  view_count?: number
  thumbnails?: YtdlpThumbnail[]
}

export interface YtdlpInfo {
  _type?: string
  id?: string
  title?: string
  uploader?: string
  channel?: string
  webpage_url?: string
  thumbnail?: string
  thumbnails?: YtdlpThumbnail[]
  duration?: number
  view_count?: number
  is_live?: boolean
  artist?: string
  creator?: string
  track?: string
  album?: string
  formats?: YtdlpFormat[]
  subtitles?: Record<string, unknown>
  entries?: (YtdlpEntry | null)[]
}

export const hasVideo = (format: YtdlpFormat): boolean => Boolean(format.vcodec) && format.vcodec !== 'none'
export const hasAudio = (format: YtdlpFormat): boolean => Boolean(format.acodec) && format.acodec !== 'none'
