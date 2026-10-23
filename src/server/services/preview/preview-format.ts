import type { PreviewSource } from '@shared/types.js'
import { hasAudio, hasVideo, type YtdlpFormat } from '@server/services/ytdlp/ytdlp-json.js'

const PREVIEW_MAXIMUM_HEIGHT = 720

const isDirectStream = (format: YtdlpFormat) => Boolean(format.url) && /^https?$/.test(format.protocol ?? '')
const isStereoOrMono = (format: YtdlpFormat) => (format.audio_channels ?? 2) <= 2
const isDynamicRangeCompressed = (format: YtdlpFormat) => format.format_id?.includes('drc') ?? false
const isM4a = (format: YtdlpFormat) => Number(format.ext === 'm4a')

const isSmallCombinedStream = (format: YtdlpFormat) =>
  hasVideo(format) && hasAudio(format) && (format.height ?? 0) <= PREVIEW_MAXIMUM_HEIGHT

const isPlainAudioStream = (format: YtdlpFormat) =>
  hasAudio(format) && !hasVideo(format) && isStereoOrMono(format) && !isDynamicRangeCompressed(format)

export interface PreviewFormatChoice {
  format: YtdlpFormat
  kind: PreviewSource['kind']
}

export const choosePreviewFormat = (formats: YtdlpFormat[]): PreviewFormatChoice | null => {
  const directFormats = formats.filter(isDirectStream)
  const [bestCombined] = directFormats
    .filter(isSmallCombinedStream)
    .sort((first, second) => (second.height ?? 0) - (first.height ?? 0))

  if (bestCombined) return { format: bestCombined, kind: 'video' }

  const [bestAudio] = directFormats
    .filter(isPlainAudioStream)
    .sort((first, second) => isM4a(second) - isM4a(first) || (second.abr ?? 0) - (first.abr ?? 0))

  return bestAudio ? { format: bestAudio, kind: 'audio' } : null
}
