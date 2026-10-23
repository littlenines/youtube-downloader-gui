import type { AudioFormat, AudioTags, ClipRange, Container, MediaInfo, MediaKind } from '@shared/types.js'

export interface Choices {
  kind: MediaKind
  format: AudioFormat
  resolution: number | null
  container: Container
  coverArt: boolean
  removeNonMusic: boolean
  subtitles: boolean
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
  subtitles: false,
}

const loadChoices = (): Choices => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Choices>

    return { ...DEFAULT_CHOICES, ...saved, resolution: null }
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
