import type { AudioTags, Container, DownloadOptions, DownloadRequest } from '@shared/types.js'
import { AUDIO_PRESETS, isAudioFormat } from '@server/services/ytdlp/audio-presets.js'

const CONTAINERS: Container[] = ['mp4', 'mkv', 'webm']
const MAXIMUM_TAG_LENGTH = 200

const isContainer = (value: unknown): value is Container => CONTAINERS.includes(value as Container)

const cleanTagValue = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAXIMUM_TAG_LENGTH) : ''

const normalizeTags = (tags: unknown): AudioTags | null => {
  if (!tags || typeof tags !== 'object') return null

  const storedTags = tags as Record<string, unknown>
  const normalizedTags = {
    artist: cleanTagValue(storedTags.artist),
    title: cleanTagValue(storedTags.title),
    album: cleanTagValue(storedTags.album),
  }

  return normalizedTags.artist || normalizedTags.title || normalizedTags.album ? normalizedTags : null
}

const normalizeResolution = (value: unknown): number | null => {
  const resolution = Number(value)

  return Number.isFinite(resolution) && resolution > 0 ? Math.round(resolution) : null
}

export const normalizeDownloadRequest = (request: Partial<DownloadRequest>): DownloadOptions => ({
  url: String(request.url ?? '').trim(),
  kind: request.kind === 'video' ? 'video' : 'audio',
  format: isAudioFormat(request.format) ? request.format : 'mp3',
  resolution: normalizeResolution(request.resolution),
  container: isContainer(request.container) ? request.container : 'mp4',
  playlist: Boolean(request.playlist),
  coverArt: request.coverArt !== false,
  squareCoverArt: request.squareCoverArt !== false,
  removeNonMusic: Boolean(request.removeNonMusic),
  subtitles: Boolean(request.subtitles),
  tags: request.kind !== 'video' && !request.playlist ? normalizeTags(request.tags) : null,
})

export const describeDownloadOptions = (options: DownloadOptions): string => {
  if (options.kind === 'audio') return AUDIO_PRESETS[options.format].label

  const quality = options.resolution ? `${options.resolution}p` : 'Best quality'

  return `${quality} · ${options.container.toUpperCase()}`
}
