import { execFile } from 'node:child_process'
import { mkdir, readdir, rm, rmdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { IS_WINDOWS } from '@server/config.js'

export const PARTIAL_FOLDER_NAME = '.yt-downloader-partial'

const STALE_PARTIAL_FOLDER_MILLISECONDS = 6 * 3600 * 1000
const REMOVE_RETRY_COUNT = 5
const REMOVE_RETRY_DELAY_MILLISECONDS = 400

const ignoreFailure = () => {}

export const partialFolderFor = (downloadFolder: string, jobId: string): string =>
  join(downloadFolder, PARTIAL_FOLDER_NAME, jobId)

export const createPartialFolder = async (folder: string): Promise<void> => {
  const firstCreatedFolder = await mkdir(folder, { recursive: true })
  const sharedParent = dirname(folder)
  const createdSharedParent = firstCreatedFolder !== undefined && firstCreatedFolder.length <= sharedParent.length

  if (IS_WINDOWS && createdSharedParent) execFile('attrib', ['+h', sharedParent], { windowsHide: true }, ignoreFailure)
}

export const removePartialFolder = async (folder: string): Promise<void> => {
  await rm(folder, {
    recursive: true,
    force: true,
    maxRetries: REMOVE_RETRY_COUNT,
    retryDelay: REMOVE_RETRY_DELAY_MILLISECONDS,
  }).catch(ignoreFailure)
  await rmdir(dirname(folder)).catch(ignoreFailure)
}

const newestChangeTime = async (path: string): Promise<number> => {
  const pathStats = await stat(path)

  if (!pathStats.isDirectory()) return pathStats.mtimeMs

  const entries = await readdir(path)
  const entryTimes = await Promise.all(entries.map((entry) => newestChangeTime(join(path, entry)).catch(() => 0)))

  return Math.max(pathStats.mtimeMs, ...entryTimes)
}

export const removeStalePartialFolders = async (
  downloadFolder: string,
  keptJobIds: ReadonlySet<string> = new Set(),
): Promise<void> => {
  const sharedParent = join(downloadFolder, PARTIAL_FOLDER_NAME)
  const jobFolderNames = await readdir(sharedParent).catch(() => [] as string[])
  const staleBefore = Date.now() - STALE_PARTIAL_FOLDER_MILLISECONDS

  for (const name of jobFolderNames) {
    if (keptJobIds.has(name)) continue

    const jobFolder = join(sharedParent, name)

    if ((await newestChangeTime(jobFolder).catch(() => 0)) < staleBefore) await removePartialFolder(jobFolder)
  }

  await rmdir(sharedParent).catch(ignoreFailure)
}
