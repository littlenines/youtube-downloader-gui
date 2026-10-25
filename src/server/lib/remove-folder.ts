import { rm } from 'node:fs/promises'

const RETRY_COUNT = 10
const RETRY_DELAY_MILLISECONDS = 400

export const removeFolderWithRetries = (folder: string): Promise<void> =>
  rm(folder, { recursive: true, force: true, maxRetries: RETRY_COUNT, retryDelay: RETRY_DELAY_MILLISECONDS })
