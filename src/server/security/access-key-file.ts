import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DATA_DIRECTORY } from '@server/config.js'

const ACCESS_KEY_FILE = join(DATA_DIRECTORY, 'access-key')
const ACCESS_KEY_BYTES = 32
const MINIMUM_STORED_KEY_LENGTH = 32

const readStoredAccessKey = async (): Promise<string | null> => {
  try {
    const storedKey = (await readFile(ACCESS_KEY_FILE, 'utf8')).trim()

    return storedKey.length >= MINIMUM_STORED_KEY_LENGTH ? storedKey : null
  } catch {
    return null
  }
}

export const loadOrCreateAccessKey = async (): Promise<string> => {
  const storedKey = await readStoredAccessKey()

  if (storedKey) return storedKey

  const accessKey = randomBytes(ACCESS_KEY_BYTES).toString('base64url')

  await mkdir(DATA_DIRECTORY, { recursive: true })
  await writeFile(ACCESS_KEY_FILE, accessKey, { mode: 0o600 })

  return accessKey
}
