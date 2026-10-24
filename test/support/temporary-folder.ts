import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const createTemporaryFolder = (prefix: string): Promise<string> => mkdtemp(join(tmpdir(), prefix))

export const removeFolder = (folder: string): Promise<void> => rm(folder, { recursive: true, force: true })

export const withTemporaryFolder = async (prefix: string, test: (folder: string) => Promise<void>): Promise<void> => {
  const folder = await createTemporaryFolder(prefix)

  try {
    await test(folder)
  } finally {
    await removeFolder(folder)
  }
}
