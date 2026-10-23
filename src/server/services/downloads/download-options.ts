import { describeClip } from '@shared/clip-range.js'
import type {
  AudioTags,
  ClipRange,
  Container,
  CoverRequest,
  DownloadOptions,
  DownloadRequest,
} from '@shared/types/downloads.js'
import { AUDIO_PRESETS, isAudioFormat } from '@server/services/ytdlp/audio-presets.js'

const CONTAINERS: Container[] = ['mp4', 'mkv', 'webm']
const MAXIMUM_TAG_LENGTH = 200
const MAXIMUM_PLAYLIST_ITEMS = 10_000

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

const isPlaylistPosition = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1

export const normalizePlaylistItems = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null

  const positions = [...new Set(value.filter(isPlaylistPosition))].sort((first, second) => first - second)

  return positions.length ? positions.slice(0, MAXIMUM_PLAYLIST_ITEMS) : null
}

const MINIMUM_CLIP_SECONDS = 1

const roundToMilliseconds = (seconds: number) => Math.round(seconds * 1000) / 1000

export const normalizeClip = (value: unknown): ClipRange | null => {
  if (!value || typeof value !== 'object') return null

  const { startSeconds, endSeconds } = value as Record<string, unknown>

  if (typeof startSeconds !== 'number' || typeof endSeconds !== 'number') return null
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0) return null
  if (endSeconds - startSeconds < MINIMUM_CLIP_SECONDS) return null

  return { startSeconds: roundToMilliseconds(startSeconds), endSeconds: roundToMilliseconds(endSeconds) }
}

const MAXIMUM_FOLDER_NAME_LENGTH = 100
const UNSAFE_FOLDER_CHARACTERS = /[<>:"/\\|?*\p{Cc}]/gu
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(?=\.|$)/i

export const sanitizeFolderName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null

  const cleanName = value.replace(UNSAFE_FOLDER_CHARACTERS, ' ').replace(/\s+/g, ' ').trim()
  const folderName = Array.from(cleanName)
    .slice(0, MAXIMUM_FOLDER_NAME_LENGTH)
    .join('')
    .replace(/[. ]+$/, '')

  if (!folderName) return null

  return folderName.replace(WINDOWS_RESERVED_NAME, '$1_')
}

export const normalizeCoverRequest = (
  request: Partial<CoverRequest> & { url: string },
): CoverRequest & { square: boolean } => ({
  url: request.url.trim(),
  square: request.square === true,
  ...(typeof request.title === 'string' && request.title ? { title: request.title } : {}),
  thumbnailUrl: typeof request.thumbnailUrl === 'string' ? request.thumbnailUrl : null,
})

export const normalizeDownloadRequest = (request: Partial<DownloadRequest>): DownloadOptions => ({
  url: String(request.url ?? '').trim(),
  kind: request.kind === 'video' ? 'video' : 'audio',
  format: isAudioFormat(request.format) ? request.format : 'mp3',
  resolution: normalizeResolution(request.resolution),
  container: isContainer(request.container) ? request.container : 'mp4',
  playlist: Boolean(request.playlist),
  playlistItems: request.playlist ? normalizePlaylistItems(request.playlistItems) : null,
  clip: request.playlist ? null : normalizeClip(request.clip),
  coverArt: request.coverArt !== false,
  squareCoverArt: request.squareCoverArt !== false,
  removeNonMusic: Boolean(request.removeNonMusic),
  subtitles: Boolean(request.subtitles),
  tags: request.kind !== 'video' && !request.playlist ? normalizeTags(request.tags) : null,
  folder: sanitizeFolderName(request.folder),
})

const describeFormat = (options: DownloadOptions): string => {
  if (options.kind === 'audio') return AUDIO_PRESETS[options.format].label

  const quality = options.resolution ? `${options.resolution}p` : 'Best quality'

  return `${quality} · ${options.container.toUpperCase()}`
}

export const describeDownloadOptions = (options: DownloadOptions): string =>
  options.clip ? `${describeFormat(options)} · ${describeClip(options.clip)}` : describeFormat(options)
