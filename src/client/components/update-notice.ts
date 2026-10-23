import type { AppUpdate } from '@shared/types/app.js'
import { isNewerVersion, parseVersion } from '@shared/versions.js'
import { api } from '@client/api.js'
import { findElement } from '@client/utils/dom.js'

const DISMISSED_VERSION_KEY = 'yt-downloader.dismissedUpdate'

const updateBanner = () => findElement('#updateBanner')

const readDismissedVersion = (): string | null => {
  try {
    return localStorage.getItem(DISMISSED_VERSION_KEY)
  } catch {
    return null
  }
}

const rememberDismissedVersion = (version: string): void => {
  try {
    localStorage.setItem(DISMISSED_VERSION_KEY, version)
  } catch {}
}

const wasDismissed = (update: AppUpdate): boolean => {
  const dismissedVersion = readDismissedVersion()

  if (!dismissedVersion || !parseVersion(dismissedVersion)) return false

  return !isNewerVersion(update.version, dismissedVersion)
}

const showUpdate = (update: AppUpdate, currentVersion: string): void => {
  if (wasDismissed(update)) return

  findElement('#updateBannerText').textContent = `Version ${update.version} is available (you have ${currentVersion}).`
  findElement<HTMLAnchorElement>('#updateDownloadLink').href = update.releaseUrl
  updateBanner().dataset.version = update.version
  updateBanner().hidden = false
}

const showUpdateIfAvailable = async (): Promise<void> => {
  const { update, currentVersion } = await api.appUpdate()

  if (update) showUpdate(update, currentVersion)
}

export const initializeUpdateNotice = (): void => {
  findElement('#updateDismissButton').addEventListener('click', () => {
    const version = updateBanner().dataset.version

    if (version) rememberDismissedVersion(version)

    updateBanner().hidden = true
  })

  showUpdateIfAvailable().catch(() => {})
}
