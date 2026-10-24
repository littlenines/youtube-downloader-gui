export const OUTPUT_MARKERS = { progress: 'VPROG ', item: 'VITEM ', file: 'VFILE ' } as const

export type StreamKind = 'picture' | 'sound' | 'combined' | 'other'

export interface ProgressEvent {
  type: 'progress'
  stream: StreamKind
  downloadedBytes: number | null
  totalBytes: number | null
  bytesPerSecond: number | null
  secondsLeft: number | null
  isFinished: boolean
}

export interface PlaylistItemEvent {
  type: 'item'
  index: number | null
  count: number | null
  title: string
}

export interface SavedFileEvent {
  type: 'file'
  file: string
}

export type DownloadEvent = ProgressEvent | PlaylistItemEvent | SavedFileEvent

const MISSING_VALUES = new Set(['NA', 'None', ''])

const isCodec = (value: string | undefined) => Boolean(value) && value !== 'none' && value !== 'NA'

const parseNumber = (value: string | undefined): number | null =>
  value === undefined || MISSING_VALUES.has(value) ? null : Number(value)

export const streamKind = (videoCodec: string | undefined, audioCodec: string | undefined): StreamKind => {
  const hasPicture = isCodec(videoCodec)
  const hasSound = isCodec(audioCodec)

  if (hasPicture && hasSound) return 'combined'
  if (hasPicture) return 'picture'

  return hasSound ? 'sound' : 'other'
}

const parseProgressLine = (fields: string): ProgressEvent => {
  const [videoCodec, audioCodec, ...values] = fields.split('|')
  const [downloadedBytes = null, totalBytes = null, bytesPerSecond = null, secondsLeft = null] = values
    .slice(0, 4)
    .map(parseNumber)

  return {
    type: 'progress',
    stream: streamKind(videoCodec, audioCodec),
    downloadedBytes,
    totalBytes,
    bytesPerSecond,
    secondsLeft,
    isFinished: values[4] === 'finished',
  }
}

const parsePlaylistItemLine = (fields: string): PlaylistItemEvent => {
  const [index, count, ...titleParts] = fields.split('|')

  return { type: 'item', index: parseNumber(index), count: parseNumber(count), title: titleParts.join('|') }
}

export const parseOutputLine = (line: string): DownloadEvent | null => {
  if (line.startsWith(OUTPUT_MARKERS.progress)) return parseProgressLine(line.slice(OUTPUT_MARKERS.progress.length))
  if (line.startsWith(OUTPUT_MARKERS.item)) return parsePlaylistItemLine(line.slice(OUTPUT_MARKERS.item.length))
  if (line.startsWith(OUTPUT_MARKERS.file)) return { type: 'file', file: line.slice(OUTPUT_MARKERS.file.length) }

  return null
}
