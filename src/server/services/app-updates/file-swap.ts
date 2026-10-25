import { existsSync } from 'node:fs'
import { mkdir, readdir, rename } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { countText } from '@shared/count-text.js'
import { errorText } from '@server/lib/http/http-error.js'

export interface AppFileSwap {
  newFolder: string
  appFolder: string
  previousFolder: string
  keptNames: ReadonlySet<string>
}

interface SwappedFile {
  relativePath: string
  isMovedAside: boolean
  isPlaced: boolean
}

const listFiles = async (folder: string, relativeFolder = ''): Promise<string[]> => {
  const files: string[] = []

  for (const entry of await readdir(join(folder, relativeFolder), { withFileTypes: true })) {
    const relativePath = join(relativeFolder, entry.name)

    if (entry.isDirectory()) files.push(...(await listFiles(folder, relativePath)))
    else files.push(relativePath)
  }

  return files
}

const moveFile = async (from: string, to: string): Promise<void> => {
  await mkdir(dirname(to), { recursive: true })
  await rename(from, to)
}

const undoSwap = async (
  swappedFiles: SwappedFile[],
  { newFolder, appFolder, previousFolder }: AppFileSwap,
): Promise<number> => {
  let failedMoves = 0
  const moveBack = (from: string, to: string) => moveFile(from, to).catch(() => void failedMoves++)

  for (const { relativePath, isMovedAside, isPlaced } of swappedFiles.toReversed()) {
    if (isPlaced) await moveBack(join(appFolder, relativePath), join(newFolder, relativePath))
    if (isMovedAside) await moveBack(join(previousFolder, relativePath), join(appFolder, relativePath))
  }

  return failedMoves
}

const failureCode = (error: unknown): string => (error as NodeJS.ErrnoException).code ?? errorText(error)

const undoOutcome = (failedMoves: number): string =>
  failedMoves
    ? `and ${countText(failedMoves, 'file')} couldn't be put back. Download the app again from the release page.`
    : 'so the current version was kept.'

export const swapAppFiles = async (swap: AppFileSwap): Promise<void> => {
  const relativePaths = (await listFiles(swap.newFolder))
    .toSorted()
    .filter((relativePath) => !swap.keptNames.has(relativePath.split(sep)[0] ?? ''))
  const swappedFiles: SwappedFile[] = []

  for (const relativePath of relativePaths) {
    const swappedFile: SwappedFile = { relativePath, isMovedAside: false, isPlaced: false }
    const target = join(swap.appFolder, relativePath)

    swappedFiles.push(swappedFile)

    try {
      if (existsSync(target)) {
        await moveFile(target, join(swap.previousFolder, relativePath))
        swappedFile.isMovedAside = true
      }

      await moveFile(join(swap.newFolder, relativePath), target)
      swappedFile.isPlaced = true
    } catch (error) {
      const failedMoves = await undoSwap(swappedFiles, swap)

      throw new Error(`Couldn't replace ${relativePath} (${failureCode(error)}), ${undoOutcome(failedMoves)}`)
    }
  }
}
