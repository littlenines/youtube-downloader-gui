import type {
  AudioFormat,
  AudioTags,
  ClipRange,
  Container,
  MediaKind,
  SubtitleFormat,
} from '@shared/types/downloads.js'
import type { MediaInfo } from '@shared/types/media.js'
import { DEFAULT_SUBTITLE_FORMAT, savedSubtitleLanguage, subtitleFormatOrDefault } from '@shared/subtitle-languages.js'

export interface Choices {
  kind: MediaKind
  format: AudioFormat
  resolution: number | null
  container: Container
  coverArt: boolean
  removeNonMusic: boolean
  subtitleLanguage: string | null
  subtitleFormat: SubtitleFormat
  skipShorts: boolean
}

export interface AppState {
  url: string
  info: MediaInfo | null
  tags: AudioTags | null
  selectedPlaylistPositions: Set<number>
  clip: ClipRange | null
  openedFromSearch: boolean
  choices: Choices
}

const STORAGE_KEY = 'yt-downloader.choices'
const DEFAULT_CHOICES: Choices = {
  kind: 'audio',
  format: 'mp3',
  resolution: null,
  container: 'mp4',
  coverArt: true,
  removeNonMusic: false,
  subtitleLanguage: null,
  subtitleFormat: DEFAULT_SUBTITLE_FORMAT,
  skipShorts: true,
}

type SavedChoices = Partial<Choices> & { subtitles?: boolean }

const loadChoices = (): Choices => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as SavedChoices
    const { subtitles: _subtitles, ...savedChoices } = saved

    return {
      ...DEFAULT_CHOICES,
      ...savedChoices,
      resolution: null,
      subtitleLanguage: savedSubtitleLanguage(saved),
      subtitleFormat: subtitleFormatOrDefault(saved.subtitleFormat),
    }
  } catch {
    return { ...DEFAULT_CHOICES }
  }
}

export const state: AppState = {
  url: '',
  info: null,
  tags: null,
  selectedPlaylistPositions: new Set(),
  clip: null,
  openedFromSearch: false,
  choices: loadChoices(),
}

export const saveChoices = (): void => {
  try {
    const { resolution: _resolution, ...remembered } = state.choices

    localStorage.setItem(STORAGE_KEY, JSON.stringify(remembered))
  } catch {}
}
