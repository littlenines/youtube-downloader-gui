import type { AppUpdate } from '@shared/types/app.js'
import { isNewerVersion, parseVersion } from '@shared/versions.js'

const DISMISSED_VERSION_KEY = 'yt-downloader.dismissedUpdate'

const readDismissedVersion = (): string | null => {
  try {
    return localStorage.getItem(DISMISSED_VERSION_KEY)
  } catch {
    return null
  }
}

export const rememberDismissedVersion = (version: string): void => {
  try {
    localStorage.setItem(DISMISSED_VERSION_KEY, version)
  } catch {}
}

export const wasDismissed = (update: AppUpdate): boolean => {
  const dismissedVersion = readDismissedVersion()

  if (!dismissedVersion || !parseVersion(dismissedVersion)) return false

  return !isNewerVersion(update.version, dismissedVersion)
}
