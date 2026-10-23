import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants, existsSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  createPartialFolder,
  partialFolderFor,
  removePartialFolder,
} from '@server/services/downloads/partial-folders.js'
import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import { toolPaths } from '@server/services/tools/tool-paths.js'
import { runYtdlpForText } from './run-ytdlp.js'
import { BEST_JPG_CONVERSION_ARGUMENT, BEST_JPG_OUTPUT, SQUARE_CROP_FILTER } from './thumbnail-arguments.js'

const COVER_FILE_MARKER = '[cover-file]'
const COVER_TIMEOUT_MESSAGE = 'Saving the cover took too long. Check the internet connection and try again.'
const MAXIMUM_NAME_ATTEMPTS = 100
const CROP_TIMEOUT_MILLISECONDS = 30_000
const runFile = promisify(execFile)

export const coverImageArguments = (url: string, thumbnailFolder: string): string[] => [
  '--skip-download',
  '--no-playlist',
  '--write-thumbnail',
  '--convert-thumbnails',
  'jpg',
  '--ppa',
  BEST_JPG_CONVERSION_ARGUMENT,
  '--windows-filenames',
  '-P',
  thumbnailFolder,
  '-o',
  '%(title)s.%(ext)s',
  '--print',
  `after_video:${COVER_FILE_MARKER}%(thumbnails.-1.filepath|)s`,
  '--',
  url,
]

export const coverFileFromOutput = (output: string): string | null =>
  output
    .split(/\r?\n/)
    .find((line) => line.startsWith(COVER_FILE_MARKER))
    ?.slice(COVER_FILE_MARKER.length)
    .trim() || null

export const coverFileNames = (savedFile: string, square: boolean): string[] => {
  const title = basename(savedFile, extname(savedFile))
  const name = square ? `${title} (square)` : title

  return Array.from({ length: MAXIMUM_NAME_ATTEMPTS }, (_, index) =>
    index === 0 ? `${name}.jpg` : `${name} (${index + 1}).jpg`,
  )
}

const isAlreadyExistsError = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'EEXIST'

export const copyToFreeName = async (source: string, folder: string, fileNames: string[]): Promise<string> => {
  for (const fileName of fileNames) {
    const target = join(folder, fileName)

    try {
      await copyFile(source, target, constants.COPYFILE_EXCL)

      return target
    } catch (error) {
      if (!isAlreadyExistsError(error)) throw error
    }
  }

  throw new Error('The download folder already has too many covers with this name.')
}

const cropErrorMessage = (error: unknown, signal?: AbortSignal): string => {
  if (signal?.aborted) return 'Cancelled.'
  if ((error as { killed?: boolean }).killed) return 'Cropping the cover took too long. Try again.'
  return 'The cover could not be cropped square.'
}

const cropToSquare = async (source: string, target: string, signal?: AbortSignal): Promise<void> => {
  try {
    await runFile(
      toolPaths.ffmpeg,
      ['-v', 'error', '-i', source, '-vf', SQUARE_CROP_FILTER, ...BEST_JPG_OUTPUT, '-y', target],
      { windowsHide: true, signal, timeout: CROP_TIMEOUT_MILLISECONDS },
    )
  } catch (error) {
    throw new Error(cropErrorMessage(error, signal))
  }
}

export interface CoverTools {
  requireTools(): Promise<void>
  saveThumbnail(url: string, folder: string, signal?: AbortSignal): Promise<string>
  cropToSquare(source: string, target: string, signal?: AbortSignal): Promise<void>
}

export const appCoverTools: CoverTools = {
  requireTools: () => toolSetup.requireInstalled(),
  saveThumbnail: (url, folder, signal) =>
    runYtdlpForText(coverImageArguments(url, folder), signal, COVER_TIMEOUT_MESSAGE),
  cropToSquare,
}

export interface CoverSave {
  url: string
  square: boolean
  downloadFolder: string
  signal?: AbortSignal | undefined
}

export const saveCoverImage = async (
  { url, square, downloadFolder, signal }: CoverSave,
  tools: CoverTools = appCoverTools,
): Promise<string> => {
  await tools.requireTools()

  const workFolder = partialFolderFor(downloadFolder, `cover-${randomUUID()}`)
  const thumbnailFolder = join(workFolder, 'thumbnail')

  await createPartialFolder(workFolder)

  try {
    await mkdir(thumbnailFolder)

    const savedFile = coverFileFromOutput(await tools.saveThumbnail(url, thumbnailFolder, signal))

    if (!savedFile || !existsSync(savedFile)) throw new Error('This video has no cover image to save.')

    const coverFile = square ? join(workFolder, 'square.jpg') : savedFile

    if (square) await tools.cropToSquare(savedFile, coverFile, signal)

    return await copyToFreeName(coverFile, downloadFolder, coverFileNames(savedFile, square))
  } finally {
    await removePartialFolder(workFolder)
  }
}
