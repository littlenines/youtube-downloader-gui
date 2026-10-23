import { resolutionTag } from '@shared/resolution.js'
import type { AudioSource, VideoQuality } from '@shared/types/media.js'
import { hasAudio, hasVideo, type YtdlpFormat } from './ytdlp-json.js'

const HIGH_FRAME_RATE_THRESHOLD = 30

interface ResolutionSummary {
  framesPerSecond: number
  codecs: Set<string>
  largestBytes: number
  hdr: boolean
}

export const codecName = (codec = ''): string => {
  if (/^(avc1|h264)/.test(codec)) return 'H.264'
  if (/^vp0?9/.test(codec)) return 'VP9'
  if (codec.startsWith('av01')) return 'AV1'
  if (/^(hev|hvc|h265)/.test(codec)) return 'H.265'
  if (codec.startsWith('opus')) return 'Opus'
  if (codec.startsWith('mp4a')) return 'AAC'

  return codec.split('.')[0]?.toUpperCase() ?? codec
}

const shortSide = (format: YtdlpFormat): number | null =>
  format.width && format.height ? Math.min(format.width, format.height) : (format.height ?? null)

const formatSizeBytes = (format: YtdlpFormat): number | null => format.filesize ?? format.filesize_approx ?? null

export const isUsableFormat = (format: YtdlpFormat): boolean =>
  format.ext !== 'mhtml' && !/storyboard|premium/i.test(format.format_note ?? '')

export const bestAudioSource = (formats: YtdlpFormat[]): AudioSource | null => {
  const bestAudio = formats
    .filter((format) => hasAudio(format) && !hasVideo(format))
    .sort((first, second) => (second.abr ?? 0) - (first.abr ?? 0))[0]

  if (!bestAudio) return null

  return {
    codec: codecName(bestAudio.acodec),
    bitrateKbps: Math.round(bestAudio.abr ?? bestAudio.tbr ?? 0),
    sizeBytes: formatSizeBytes(bestAudio),
  }
}

const summarizeByResolution = (formats: YtdlpFormat[]): Map<number, ResolutionSummary> => {
  const summaries = new Map<number, ResolutionSummary>()

  for (const format of formats) {
    const resolution = hasVideo(format) ? shortSide(format) : null

    if (!resolution) continue

    const summary = summaries.get(resolution) ?? {
      framesPerSecond: 0,
      codecs: new Set<string>(),
      largestBytes: 0,
      hdr: false,
    }

    summary.framesPerSecond = Math.max(summary.framesPerSecond, Math.round(format.fps ?? 0))
    summary.codecs.add(codecName(format.vcodec))
    summary.largestBytes = Math.max(summary.largestBytes, formatSizeBytes(format) ?? 0)

    if (/hdr/i.test(format.dynamic_range ?? '')) summary.hdr = true

    summaries.set(resolution, summary)
  }

  return summaries
}

const qualityLabel = (resolution: number, framesPerSecond: number): string =>
  `${resolution}p${framesPerSecond > HIGH_FRAME_RATE_THRESHOLD ? framesPerSecond : ''}`

export const videoQualities = (formats: YtdlpFormat[], audioBytes: number): VideoQuality[] =>
  [...summarizeByResolution(formats).entries()]
    .sort(([firstResolution], [secondResolution]) => secondResolution - firstResolution)
    .map(([resolution, summary]) => ({
      resolution,
      framesPerSecond: summary.framesPerSecond,
      label: qualityLabel(resolution, summary.framesPerSecond),
      tag: resolutionTag(resolution),
      hdr: summary.hdr,
      codecs: [...summary.codecs],
      hasH264: summary.codecs.has('H.264'),
      estimatedBytes: summary.largestBytes ? summary.largestBytes + audioBytes : null,
    }))
