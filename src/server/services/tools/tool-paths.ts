import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { IS_SINGLE_EXECUTABLE, IS_WINDOWS, TOOLS_DIRECTORY } from '@server/config.js'

export const executableName = (name: string): string => (IS_WINDOWS ? `${name}.exe` : name)

export const YTDLP_DIRECTORY = join(TOOLS_DIRECTORY, 'yt-dlp')
export const YTDLP_PLUGINS_DIRECTORY = join(TOOLS_DIRECTORY, 'yt-dlp-plugins')
export const YTDLP_UPDATE_CHECK_MARKER = join(TOOLS_DIRECTORY, '.yt-dlp-checked')

export const toolPaths = {
  ffmpegDirectory: join(TOOLS_DIRECTORY, 'ffmpeg'),
  ffmpeg: join(TOOLS_DIRECTORY, 'ffmpeg', executableName('ffmpeg')),
  ffprobe: join(TOOLS_DIRECTORY, 'ffmpeg', executableName('ffprobe')),
  deno: join(TOOLS_DIRECTORY, executableName('deno')),
}

export const NEEDS_DENO = IS_SINGLE_EXECUTABLE

let cachedYtdlpExecutable: string | null = null

const findYtdlpExecutable = (): string | null => {
  try {
    const executable = readdirSync(YTDLP_DIRECTORY, { withFileTypes: true }).find(
      (entry) => entry.isFile() && entry.name.startsWith('yt-dlp'),
    )

    return executable ? join(YTDLP_DIRECTORY, executable.name) : null
  } catch {
    return null
  }
}

export const ytdlpPath = (): string => {
  cachedYtdlpExecutable ??= findYtdlpExecutable()

  return cachedYtdlpExecutable ?? join(YTDLP_DIRECTORY, executableName('yt-dlp'))
}

export const forgetYtdlpPath = (): void => {
  cachedYtdlpExecutable = null
}
