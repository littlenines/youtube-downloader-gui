import { mkdir, readFile, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { AppUpdate } from '@shared/types/app.js'
import { APP_DIRECTORY, DATA_DIRECTORY, DEFAULT_DOWNLOAD_FOLDER, TOOLS_DIRECTORY } from '@server/config.js'
import { parseSha256 } from '@server/lib/checksums.js'
import { releaseDownloadUrl } from '@server/lib/github-releases.js'
import { downloadText } from '@server/lib/http/download-text.js'
import { removeFolderWithRetries } from '@server/lib/remove-folder.js'
import { downloadVerifiedFile } from '@server/lib/verified-download.js'
import { APP_REPOSITORY } from './app-update-check.js'
import { swapAppFiles } from './file-swap.js'
import { findAppFolder, type ReleasePackage } from './release-package.js'

const UPDATE_DIRECTORY = join(APP_DIRECTORY, '.update')
const DOWNLOAD_DIRECTORY = join(UPDATE_DIRECTORY, 'download')
const PREVIOUS_VERSION_DIRECTORY = join(UPDATE_DIRECTORY, 'previous')
const KEPT_NAMES = new Set(
  [DATA_DIRECTORY, TOOLS_DIRECTORY, DEFAULT_DOWNLOAD_FOLDER, UPDATE_DIRECTORY].map((folder) => basename(folder)),
)
const DOWNLOAD_SHARE_OF_PROGRESS = 0.9

export const downloadAppUpdate = async (
  update: AppUpdate,
  releasePackage: ReleasePackage,
  onProgress: (fraction: number) => void,
): Promise<string> => {
  const releaseUrl = releaseDownloadUrl(APP_REPOSITORY, update.tag)
  const expectedSha256 = parseSha256(await downloadText(`${releaseUrl}/SHA256SUMS.txt`), releasePackage.fileName)

  if (!expectedSha256) {
    throw new Error(
      `Version ${update.version} lists no checksum for ${releasePackage.fileName}, so it wasn't installed.`,
    )
  }

  const archive = join(DOWNLOAD_DIRECTORY, releasePackage.fileName)
  const unpackedFolder = join(DOWNLOAD_DIRECTORY, 'unpacked')

  await rm(DOWNLOAD_DIRECTORY, { recursive: true, force: true })
  await mkdir(DOWNLOAD_DIRECTORY, { recursive: true })
  await downloadVerifiedFile(`${releaseUrl}/${releasePackage.fileName}`, archive, {
    label: `version ${update.version}`,
    expectedSha256,
    onProgress: (fraction) => onProgress(fraction * DOWNLOAD_SHARE_OF_PROGRESS),
  })
  await releasePackage.extract(await readFile(archive), unpackedFolder)
  await rm(archive, { force: true })

  return findAppFolder(unpackedFolder, releasePackage.executableName)
}

export const installAppUpdate = (newAppFolder: string): Promise<void> =>
  swapAppFiles({
    newFolder: newAppFolder,
    appFolder: APP_DIRECTORY,
    previousFolder: PREVIOUS_VERSION_DIRECTORY,
    keptNames: KEPT_NAMES,
  })

export const removeLeftoverUpdate = (): Promise<void> => removeFolderWithRetries(UPDATE_DIRECTORY)
