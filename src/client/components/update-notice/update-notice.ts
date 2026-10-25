import type { AppUpdateInstallation } from '@shared/types/app.js'
import { api } from '@client/api.js'
import { errorMessage, findElement, LONG_TOAST_MILLISECONDS, showToast } from '@client/utils/dom.js'
import { rememberDismissedVersion, wasDismissed } from './dismissed-update.js'
import { installButton, renderUpdateNotice, updateBanner } from './update-notice-view.js'

const POLL_MILLISECONDS = 1000

let pollTimer: ReturnType<typeof setTimeout> | undefined
let isFollowingInstallation = false

const isInstalling = ({ state }: AppUpdateInstallation): boolean => state === 'downloading' || state === 'installing'

const refreshUpdate = async (): Promise<void> => {
  clearTimeout(pollTimer)

  const response = await api.appUpdate().catch(() => null)

  if (response) {
    const { update } = response
    const isShown = update !== null && !wasDismissed(update)

    if (isShown) renderUpdateNotice({ ...response, update })

    isFollowingInstallation = isShown && isInstalling(response.installation)
  }

  if (isFollowingInstallation) pollTimer = setTimeout(() => void refreshUpdate(), POLL_MILLISECONDS)
}

export const refreshUpdateNotice = (): void => void refreshUpdate()

const installUpdate = async (): Promise<void> => {
  installButton().disabled = true

  try {
    await api.installAppUpdate()
    await refreshUpdate()
  } catch (error) {
    showToast(errorMessage(error), LONG_TOAST_MILLISECONDS)
  } finally {
    installButton().disabled = false
  }
}

export const initializeUpdateNotice = (): void => {
  installButton().addEventListener('click', () => void installUpdate())
  findElement('#updateDismissButton').addEventListener('click', () => {
    const version = updateBanner().dataset.version

    if (version) rememberDismissedVersion(version)

    clearTimeout(pollTimer)
    isFollowingInstallation = false
    updateBanner().hidden = true
  })

  refreshUpdateNotice()
}
