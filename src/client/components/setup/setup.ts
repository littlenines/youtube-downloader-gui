import type { SetupStatus } from '@shared/types.js'
import { api } from '@client/api.js'
import { errorMessage, findElement, showToast } from '@client/utils/dom.js'
import { renderSetupBanner, renderSetupDialog, setupDialog } from './setup-view.js'

const RUNNING_POLL_MILLISECONDS = 500
const OFFLINE_RETRY_MILLISECONDS = 3000
const LONG_TOAST_MILLISECONDS = 6000

let latestStatus: SetupStatus | null = null
let installStartedHere = false
let runAfterReady: (() => void) | null = null
let pollTimer: ReturnType<typeof setTimeout> | undefined

export const toolsAvailable = (): boolean => !latestStatus || latestStatus.installed || latestStatus.state === 'running'

const renderSetup = (): void => {
  if (!latestStatus) return

  renderSetupDialog(latestStatus, installStartedHere)
  renderSetupBanner(latestStatus)
}

const continueAfterReady = (): void => {
  const continuation = runAfterReady

  runAfterReady = null
  continuation?.()
}

const refreshSetupStatus = async (): Promise<void> => {
  clearTimeout(pollTimer)

  const previousState = latestStatus?.state

  try {
    latestStatus = (await api.status()).setup
  } catch {
    pollTimer = setTimeout(() => void refreshSetupStatus(), OFFLINE_RETRY_MILLISECONDS)

    return
  }

  renderSetup()

  const finishedWhileDialogClosed =
    previousState === 'running' && latestStatus.state === 'ready' && installStartedHere && !setupDialog().open

  if (latestStatus.state === 'running') {
    pollTimer = setTimeout(() => void refreshSetupStatus(), RUNNING_POLL_MILLISECONDS)
  } else if (finishedWhileDialogClosed) {
    showToast('The tools are installed. You can use the app now.', LONG_TOAST_MILLISECONDS)
    continueAfterReady()
  }
}

export const requestSetup = (onReady?: () => void): void => {
  runAfterReady = onReady ?? null

  if (!setupDialog().open) setupDialog().showModal()

  renderSetup()
  void refreshSetupStatus()
}

const confirmSetupDialog = async (): Promise<void> => {
  if (latestStatus?.state === 'ready' && latestStatus.installed) {
    setupDialog().close()
    continueAfterReady()

    return
  }

  try {
    installStartedHere = true
    latestStatus = await api.startSetup()
    renderSetup()
    void refreshSetupStatus()
  } catch (error) {
    showToast(errorMessage(error), LONG_TOAST_MILLISECONDS)
  }
}

export const initializeSetup = (): void => {
  findElement('#setupConfirmButton').addEventListener('click', confirmSetupDialog)
  findElement('#setupLaterButton').addEventListener('click', () => setupDialog().close())
  findElement('#setupBannerButton').addEventListener('click', () => requestSetup())
  setupDialog().addEventListener('close', renderSetup)
  void refreshSetupStatus().then(() => {
    if (latestStatus && !toolsAvailable()) requestSetup()
  })
}
