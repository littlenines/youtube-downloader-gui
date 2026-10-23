import type { AudioFormat, Container } from '@shared/types/downloads.js'

export interface AudioFormatCard {
  format: AudioFormat
  title: string
  description: string
  fileExtension: string
  badge?: string
}

export interface ContainerOption {
  container: Container
  label: string
  note: string
}

export const AUDIO_FORMAT_CARDS: AudioFormatCard[] = [
  {
    format: 'mp3',
    title: 'MP3 · 320 kbps',
    description: 'Plays on everything: phones, cars, DJ apps.',
    fileExtension: 'mp3',
    badge: 'Most compatible',
  },
  {
    format: 'opus',
    title: 'Opus · original',
    description: "YouTube's own audio, saved without re-encoding. No quality loss at all.",
    fileExtension: 'opus',
    badge: 'Best quality',
  },
  {
    format: 'm4a',
    title: 'M4A · AAC',
    description: 'Apple/iTunes friendly. Kept as-is when YouTube has an AAC stream.',
    fileExtension: 'm4a',
  },
  {
    format: 'flac',
    title: 'FLAC',
    description: 'Lossless container for DJ and music software. Same quality as the source, bigger file.',
    fileExtension: 'flac',
  },
  {
    format: 'wav',
    title: 'WAV',
    description: 'Uncompressed, for editing in a DAW or video editor. No cover art.',
    fileExtension: 'wav',
  },
  {
    format: 'original',
    title: 'Original file',
    description: 'Whatever YouTube serves (usually Opus or AAC), untouched.',
    fileExtension: 'opus or .m4a',
  },
]

export const CONTAINER_OPTIONS: ContainerOption[] = [
  {
    container: 'mp4',
    label: 'MP4',
    note: 'Plays everywhere. Uses H.264 when available (up to 1080p on YouTube). Higher resolutions use VP9/AV1, which modern players and phones handle.',
  },
  {
    container: 'mkv',
    label: 'MKV',
    note: 'Best quality with any codec, plus chapters and subtitles. Great in VLC, Plex and editors.',
  },
  { container: 'webm', label: 'WebM', note: "YouTube's native VP9 + Opus, no conversion. Ideal for the web." },
]

export const GENERAL_RESOLUTIONS = [null, 2160, 1440, 1080, 720, 480, 360]

export const CHECKBOX_CHOICES = ['coverArt', 'removeNonMusic', 'subtitles', 'skipShorts'] as const

export type CheckboxChoice = (typeof CHECKBOX_CHOICES)[number]

export const audioFormatCard = (format: AudioFormat): AudioFormatCard =>
  AUDIO_FORMAT_CARDS.find((card) => card.format === format) ?? AUDIO_FORMAT_CARDS[0]!

export const selectedContainerOption = (container: Container): ContainerOption =>
  CONTAINER_OPTIONS.find((option) => option.container === container) ?? CONTAINER_OPTIONS[0]!
