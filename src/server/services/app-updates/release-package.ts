import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { extractTarGz } from '@server/lib/archive/tar.js'
import { extractZip } from '@server/lib/archive/zip.js'

export interface ReleasePackage {
  fileName: string
  executableName: string
  extract(archive: Buffer, directory: string): Promise<unknown>
}

export const releasePackageFor = (platform: NodeJS.Platform, architecture: string): ReleasePackage | null => {
  if (platform === 'win32' && architecture === 'x64') {
    return { fileName: 'yt-downloader-win-x64.zip', executableName: 'yt-downloader.exe', extract: extractZip }
  }

  if (platform === 'linux' && (architecture === 'x64' || architecture === 'arm64')) {
    return {
      fileName: `yt-downloader-linux-${architecture}.tar.gz`,
      executableName: 'yt-downloader.bin',
      extract: extractTarGz,
    }
  }

  return null
}

export const findAppFolder = async (unpackedFolder: string, executableName: string): Promise<string> => {
  if (existsSync(join(unpackedFolder, executableName))) return unpackedFolder

  const entries = await readdir(unpackedFolder, { withFileTypes: true })
  const [onlyFolder] = entries.filter((entry) => entry.isDirectory())

  if (entries.length === 1 && onlyFolder && existsSync(join(unpackedFolder, onlyFolder.name, executableName))) {
    return join(unpackedFolder, onlyFolder.name)
  }

  throw new Error(`The downloaded update doesn't contain ${executableName}.`)
}
