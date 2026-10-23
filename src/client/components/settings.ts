import type { StatusResponse } from '@shared/types.js'
import { api } from '@client/api.js'
import { desktopBridge } from '@client/desktop.js'
import { errorMessage, findElement, showToast } from '@client/utils/dom.js'

const ERROR_TOAST_MILLISECONDS = 6000

const settingsDialog = () => findElement<HTMLDialogElement>('#settingsDialog')
const downloadFolderInput = () => findElement<HTMLInputElement>('#downloadFolderInput')
const simultaneousDownloadsSelect = () => findElement<HTMLSelectElement>('#simultaneousDownloadsSelect')
const lowLatencyRenderingCheckbox = () => findElement<HTMLInputElement>('#lowLatencyRenderingCheckbox')

const fillSettingsDialog = (status: StatusResponse): void => {
  const isWindows = status.platform.startsWith('win32')

  downloadFolderInput().value = status.downloadFolder
  simultaneousDownloadsSelect().value = String(status.simultaneousDownloads)
  lowLatencyRenderingCheckbox().checked = status.lowLatencyRendering
  findElement('#renderingSetting').hidden = !desktopBridge || !isWindows
  findElement('#folderExample').textContent = isWindows ? 'D:\\Music\\YouTube' : '/home/you/Music/YouTube'
  findElement('#versionInfo').textContent =
    `App ${status.appVersion} · yt-dlp ${status.ytdlpVersion ?? '(not installed yet)'} · ${status.platform}`
}

const openSettingsDialog = (): void => {
  settingsDialog().showModal()
  api.status().then(fillSettingsDialog, (error: unknown) => showToast(errorMessage(error)))
}

const saveDownloadFolder = async (folder: string): Promise<void> => {
  try {
    downloadFolderInput().value = (await api.saveSettings({ downloadFolder: folder })).downloadFolder
    showToast('Saved. New downloads go to that folder.')
  } catch (error) {
    showToast(errorMessage(error), ERROR_TOAST_MILLISECONDS)
  }
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

  simultaneousDownloadsSelect().addEventListener('change', async () => {
    await api.saveSettings({ simultaneousDownloads: Number(simultaneousDownloadsSelect().value) }).catch(() => {})
    showToast('Saved.')
  })

  lowLatencyRenderingCheckbox().addEventListener('change', async () => {
    await api.saveSettings({ lowLatencyRendering: lowLatencyRenderingCheckbox().checked }).catch(() => {})
    showToast('Saved. Restart the app to apply it.')
  })

  findElement('#openFolderButton').addEventListener('click', () => {
    api.openDownloadFolder().catch((error: unknown) => showToast(errorMessage(error)))
  })
}
