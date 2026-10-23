import type { AudioFormat } from '@shared/types.js'

interface AudioPreset {
  label: string
  ytdlpArguments: string[]
  supportsCoverArt: boolean
}

export const AUDIO_PRESETS: Record<AudioFormat, AudioPreset> = {
  mp3: {
    label: 'MP3 · 320 kbps',
    ytdlpArguments: ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '320K'],
    supportsCoverArt: true,
  },
  m4a: {
    label: 'M4A (AAC)',
    ytdlpArguments: ['-f', 'bestaudio[ext=m4a]/bestaudio/best', '-x', '--audio-format', 'm4a', '--audio-quality', '0'],
    supportsCoverArt: true,
  },
  opus: {
    label: 'Opus · original',
    ytdlpArguments: ['-f', 'bestaudio[acodec=opus]/bestaudio/best', '-x', '--audio-format', 'opus'],
    supportsCoverArt: true,
  },
  original: {
    label: 'Original audio (no conversion)',
    ytdlpArguments: ['-f', 'bestaudio/best', '-x'],
    supportsCoverArt: true,
  },
  flac: {
    label: 'FLAC',
    ytdlpArguments: ['-f', 'bestaudio/best', '-x', '--audio-format', 'flac'],
    supportsCoverArt: true,
  },
  wav: {
    label: 'WAV',
    ytdlpArguments: ['-f', 'bestaudio/best', '-x', '--audio-format', 'wav'],
    supportsCoverArt: false,
  },
}

export const isAudioFormat = (value: unknown): value is AudioFormat =>
  typeof value === 'string' && Object.hasOwn(AUDIO_PRESETS, value)
