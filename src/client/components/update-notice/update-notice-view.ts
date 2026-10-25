import type { AppUpdate, AppUpdateInstallation, AppUpdateResponse } from '@shared/types/app.js'
import { findElement } from '@client/utils/dom.js'

export type UpdateNotice = AppUpdateResponse & { update: AppUpdate }

const INSTALL_BUTTON_LABELS: Partial<Record<AppUpdateInstallation['state'], string>> = {
  idle: 'Update now',
  ready: 'Restart now',
  error: 'Try again',
}

export const updateBanner = () => findElement('#updateBanner')
export const installButton = () => findElement<HTMLButtonElement>('#updateInstallButton')

const percentText = (fraction: number | null): string => (fraction === null ? '' : ` ${Math.round(fraction * 100)}%`)

const readyText = (version: string, installsOnQuit: boolean): string =>
  installsOnQuit
    ? `Version ${version} is ready. It's installed when you close the app.`
    : `Version ${version} is downloaded and ready to install.`

const bannerText = ({ update, currentVersion, installation }: UpdateNotice): string => {
  switch (installation.state) {
    case 'downloading':
      return `Downloading version ${update.version}…${percentText(installation.progress)}`
    case 'ready':
      return readyText(update.version, installation.installsOnQuit)
    case 'installing':
      return `Installing version ${update.version}. The app restarts in a moment…`
    case 'error':
      return `Version ${update.version} couldn't be installed: ${installation.message ?? 'unknown error'}`
    default:
      return `Version ${update.version} is available (you have ${currentVersion}).`
  }
}

export const renderUpdateNotice = (notice: UpdateNotice): void => {
  const { installation } = notice
  const installLabel = installation.canInstall ? INSTALL_BUTTON_LABELS[installation.state] : undefined
  const releaseLink = findElement<HTMLAnchorElement>('#updateDownloadLink')

  findElement('#updateBannerText').textContent = bannerText(notice)
  installButton().hidden = !installLabel
  installButton().textContent = installLabel ?? ''
  releaseLink.href = notice.update.releaseUrl
  releaseLink.textContent = installation.canInstall ? 'What’s new' : 'Download'
  releaseLink.classList.toggle('primary', !installation.canInstall)
  releaseLink.classList.toggle('ghost', installation.canInstall)
  findElement('#updateDismissButton').hidden = installation.state === 'installing'
  updateBanner().dataset.version = notice.update.version
  updateBanner().hidden = false
}
