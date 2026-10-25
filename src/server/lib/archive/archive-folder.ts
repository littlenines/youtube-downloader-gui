import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

export interface ArchiveFolder {
  pathFor(name: string): string
  isInside(path: string): boolean
}

export const archiveFolder = (directory: string, archiveKind: 'zip' | 'tar'): ArchiveFolder => {
  const rootDirectory = resolve(directory)
  const isInside = (path: string) => path === rootDirectory || path.startsWith(rootDirectory + sep)

  return {
    pathFor: (name) => {
      const targetPath = resolve(rootDirectory, name)

      if (!isInside(targetPath)) throw new Error(`Unsafe path in ${archiveKind}: ${name}`)

      return targetPath
    },
    isInside,
  }
}

export const writeArchiveFile = async (targetPath: string, data: Buffer, permissions: number): Promise<void> => {
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, data)

  if (process.platform !== 'win32' && permissions) await chmod(targetPath, permissions)
}
