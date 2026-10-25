import type { Settings, StatusResponse } from '@shared/types/app.js'
import { api } from '@client/api.js'
import { desktopBridge } from '@client/desktop.js'
import { announceSubscriptionsChanged } from '@client/events.js'
import { refreshUpdateNotice } from '@client/components/update-notice/update-notice.js'
import { errorMessage, findElement, LONG_TOAST_MILLISECONDS, showToast } from '@client/utils/dom.js'
import { fillLaterTimes, focusLaterStartTime, initializeLaterTimes } from './later-times.js'
import { saveSetting } from './save-setting.js'

const settingsDialog = () => findElement<HTMLDialogElement>('#settingsDialog')
const downloadFolderInput = () => findElement<HTMLInputElement>('#downloadFolderInput')
const simultaneousDownloadsSelect = () => findElement<HTMLSelectElement>('#simultaneousDownloadsSelect')
const lowLatencyRenderingCheckbox = () => findElement<HTMLInputElement>('#lowLatencyRenderingCheckbox')
const notifyWhenFinishedCheckbox = () => findElement<HTMLInputElement>('#notifyWhenFinishedCheckbox')
const installUpdatesAutomaticallyCheckbox = () => findElement<HTMLInputElement>('#installUpdatesAutomaticallyCheckbox')
const subscriptionCheckSelect = () => findElement<HTMLSelectElement>('#subscriptionCheckSelect')

const fillSettingsDialog = (status: StatusResponse): void => {
  const isWindows = status.platform.startsWith('win32')

  downloadFolderInput().value = status.downloadFolder
  simultaneousDownloadsSelect().value = String(status.simultaneousDownloads)
  lowLatencyRenderingCheckbox().checked = status.lowLatencyRendering
  notifyWhenFinishedCheckbox().checked = status.notifyWhenFinished
  installUpdatesAutomaticallyCheckbox().checked = status.installUpdatesAutomatically
  subscriptionCheckSelect().value = String(status.subscriptionCheckHours)
  fillLaterTimes(status)
  findElement('#renderingSetting').hidden = !desktopBridge || !isWindows
  findElement('#notificationSetting').hidden = !desktopBridge
  findElement('#autoUpdateSetting').hidden = !status.canInstallUpdates
  findElement('#folderExample').textContent = isWindows ? 'D:\\Music\\YouTube' : '/home/you/Music/YouTube'
  findElement('#versionInfo').textContent =
    `App ${status.appVersion} · yt-dlp ${status.ytdlpVersion ?? '(not installed yet)'} · ${status.platform}`
}

const openSettingsDialog = (): void => {
  settingsDialog().showModal()
  api.status().then(fillSettingsDialog, (error: unknown) => showToast(errorMessage(error)))
}

export const isLaterTimeChosen = async (): Promise<boolean> => {
  const status = await api.status().catch((error: unknown) => {
    showToast(errorMessage(error), LONG_TOAST_MILLISECONDS)

    return null
  })

  if (!status) return false
  if (status.laterStartTime) return true

  openSettingsDialog()
  focusLaterStartTime()
  showToast('Choose when “Later” downloads start, then click the Later button again.', LONG_TOAST_MILLISECONDS)

  return false
}

const saveDownloadFolder = async (folder: string): Promise<void> => {
  const settings = await saveSetting({ downloadFolder: folder }, 'Saved. New downloads go to that folder.')

  if (settings) downloadFolderInput().value = settings.downloadFolder
}

const saveCheckbox = async (
  checkbox: HTMLInputElement,
  changes: (checked: boolean) => Partial<Settings>,
  savedMessage?: string,
): Promise<void> => {
  if (!(await saveSetting(changes(checkbox.checked), savedMessage))) checkbox.checked = !checkbox.checked
}

const enableFolderPicker = (): void => {
  const bridge = desktopBridge

  if (!bridge) return

  const browseButton = findElement('#browseFolderButton')

  browseButton.hidden = false
  browseButton.addEventListener('click', async () => {
    const folder = await bridge.pickFolder(downloadFolderInput().value)

    if (folder) await saveDownloadFolder(folder)
  })
}

export const initializeSettings = (): void => {
  findElement('#openSettingsButton').addEventListener('click', openSettingsDialog)
  findElement('#saveFolderButton').addEventListener('click', () => void saveDownloadFolder(downloadFolderInput().value))
  enableFolderPicker()
  initializeLaterTimes()

  simultaneousDownloadsSelect().addEventListener('change', () => {
    void saveSetting({ simultaneousDownloads: Number(simultaneousDownloadsSelect().value) })
  })

  subscriptionCheckSelect().addEventListener('change', async () => {
    if (await saveSetting({ subscriptionCheckHours: Number(subscriptionCheckSelect().value) })) {
      announceSubscriptionsChanged()
    }
  })

  notifyWhenFinishedCheckbox().addEventListener('change', () => {
    void saveCheckbox(notifyWhenFinishedCheckbox(), (checked) => ({ notifyWhenFinished: checked }))
  })

  installUpdatesAutomaticallyCheckbox().addEventListener('change', async () => {
    await saveCheckbox(installUpdatesAutomaticallyCheckbox(), (checked) => ({ installUpdatesAutomatically: checked }))
    refreshUpdateNotice()
  })

  lowLatencyRenderingCheckbox().addEventListener('change', () => {
    void saveCheckbox(
      lowLatencyRenderingCheckbox(),
      (checked) => ({ lowLatencyRendering: checked }),
      'Saved. Restart the app to apply it.',
    )
  })

  findElement('#openFolderButton').addEventListener('click', () => {
    api.openDownloadFolder().catch((error: unknown) => showToast(errorMessage(error)))
  })
}
