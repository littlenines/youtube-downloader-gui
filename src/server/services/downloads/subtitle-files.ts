import { rename } from 'node:fs/promises'
import { extname } from 'node:path'
import type { DownloadOptions } from '@shared/types/downloads.js'
import { isExistingFile } from '@server/lib/existing-file.js'
import { ignoreFailure } from '@server/lib/ignore-failure.js'
import { SPOKEN_LANGUAGE_SUFFIX } from '@server/services/ytdlp/subtitle-tracks.js'

const SUBTITLE_FILE_EXTENSION = 'srt'

const renameSpokenSubtitleFile = async (videoFile: string, language: string): Promise<void> => {
  const name = videoFile.slice(0, -extname(videoFile).length)
  const wantedFile = `${name}.${language}.${SUBTITLE_FILE_EXTENSION}`

  if (isExistingFile(wantedFile)) return

  await rename(`${name}.${language}${SPOKEN_LANGUAGE_SUFFIX}.${SUBTITLE_FILE_EXTENSION}`, wantedFile).catch(
    ignoreFailure,
  )
}

export const nameSpokenSubtitleFiles = async (
  { subtitleLanguage, subtitleMatch, subtitleFormat }: DownloadOptions,
  files: string[],
): Promise<void> => {
  if (!subtitleLanguage || subtitleMatch !== 'spoken' || subtitleFormat !== 'srt') return

  await Promise.all(files.map((file) => renameSpokenSubtitleFile(file, subtitleLanguage)))
}
