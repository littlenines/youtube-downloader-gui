import type { HistoryEntry, Job } from './types/downloads.js'

const PLAYABLE_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'aac',
  'opus',
  'ogg',
  'oga',
  'flac',
  'wav',
  'aif',
  'aiff',
  'wma',
  'mka',
  'mp4',
  'm4v',
  'mkv',
  'webm',
  'mov',
  'avi',
  'flv',
  '3gp',
  'ts',
])

const extensionOf = (file: string): string => {
  const name = file.split(/[\\/]/).at(-1) ?? ''
  const dotPosition = name.lastIndexOf('.')

  return dotPosition > 0 ? name.slice(dotPosition + 1).toLowerCase() : ''
}

export const playableFile = (files: string[]): string | null => {
  const mediaFiles = files.filter((file) => PLAYABLE_EXTENSIONS.has(extensionOf(file)))

  return mediaFiles.length === 1 ? (mediaFiles[0] ?? null) : null
}

export const playableJobFile = (job: Job): string | null =>
  job.status === 'done' && !job.options.playlist ? playableFile(job.files) : null

export const playableEntryFile = (entry: HistoryEntry): string | null =>
  entry.isPlaylist ? null : playableFile(entry.files)
