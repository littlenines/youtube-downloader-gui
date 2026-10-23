import type { SetupStatus } from '@shared/types/app.js'
import { findElement, setProgress } from '@client/utils/dom.js'

export const setupDialog = () => findElement<HTMLDialogElement>('#setupDialog')

const progressText = (status: SetupStatus): string => {
  const percentText = status.progress != null ? ` ${Math.round(status.progress * 100)}%` : ''

  return `${status.message ?? 'Preparing…'}${percentText}`
}

export const renderSetupDialog = (status: SetupStatus, installStartedHere: boolean): void => {
  const title = findElement('#setupTitle')
  const errorText = findElement('#setupError')
  const doneMessage = findElement('#setupDone')
  const confirmButton = findElement<HTMLButtonElement>('#setupConfirmButton')
  const laterButton = findElement<HTMLButtonElement>('#setupLaterButton')
  const isRunning = status.state === 'running'
  const isFinished = status.state === 'ready' && installStartedHere

  findElement('#setupIntroduction').hidden = isRunning || isFinished
  findElement('#setupProgress').hidden = !isRunning
  errorText.hidden = status.state !== 'error'
  doneMessage.hidden = !isFinished
  confirmButton.hidden = isRunning
  laterButton.textContent = isRunning ? 'Continue in the background' : 'Not now'
  laterButton.hidden = isFinished

  if (isRunning) {
    title.textContent = 'Downloading the tools…'
    setProgress(findElement('#setupProgressFill'), status.progress ?? 0)
    findElement('#setupProgressText').textContent = progressText(status)
  } else if (isFinished) {
    title.textContent = "You're all set"
    confirmButton.textContent = 'Start using the app'
  } else if (status.state === 'error') {
    title.textContent = "The download didn't work"
    errorText.textContent = `${status.message ?? 'Unknown error.'} Check the internet connection, then try again.`
    confirmButton.textContent = 'Try again'
  } else {
    title.textContent = 'One-time setup'
    findElement('#setupSize').textContent = `about ${status.downloadSizeMegabytes} MB`
    confirmButton.textContent = 'Download'
  }
}

const bannerText = (status: SetupStatus): string => {
  if (status.state === 'running') return progressText(status)
  if (status.state === 'error') return `Setup failed: ${status.message ?? ''}`

  return "The tools needed for downloading aren't installed yet."
}

export const renderSetupBanner = (status: SetupStatus): void => {
  const banner = findElement('#setupBanner')
  const bannerButton = findElement('#setupBannerButton')
  const isRunning = status.state === 'running'

  banner.hidden = setupDialog().open || status.state === 'ready' || (status.installed && !isRunning)
  banner.classList.toggle('error', status.state === 'error')
  findElement('#setupBannerSpinner').hidden = !isRunning
  bannerButton.hidden = status.installed || isRunning
  bannerButton.textContent = status.state === 'error' ? 'Try again' : 'Download tools'
  findElement('#setupBannerText').textContent = bannerText(status)
}
