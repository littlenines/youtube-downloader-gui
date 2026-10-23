import { stat } from 'node:fs/promises'

const sizeOrZero = (file: string): Promise<number> =>
  stat(file).then(
    (fileStats) => fileStats.size,
    () => 0,
  )

export const totalFileSize = async (files: string[]): Promise<number> => {
  const sizes = await Promise.all(files.map(sizeOrZero))

  return sizes.reduce((sum, size) => sum + size, 0)
}
