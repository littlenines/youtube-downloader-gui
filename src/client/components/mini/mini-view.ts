import { isActiveJob } from '@shared/jobs.js'
import { api } from '@client/api.js'
import { desktopBridge } from '@client/desktop.js'
import { EXPAND_ICON_HTML } from '@client/icons/expand-icon.js'
import { findElement, setProgress, showIndeterminate } from '@client/utils/dom.js'
import { miniStatus, type MiniStatus } from './mini-status.js'

const BUSY_POLL_MILLISECONDS = 1000
const IDLE_POLL_MILLISECONDS = 4000
const TITLE_ROTATION_MILLISECONDS = 4000

let shownStatus: MiniStatus = { titles: [''], progress: null, isIndeterminate: false, details: '' }
let titleIndex = 0

const renderTitle = (): void => {
  findElement('#miniTitle').textContent = shownStatus.titles[titleIndex % shownStatus.titles.length] ?? ''
}

const renderStatus = (status: MiniStatus): void => {
  shownStatus = status
  renderTitle()
  findElement('#miniDetails').textContent = status.details
  findElement('#miniProgressTrack').classList.toggle('is-empty', status.progress === null)
  showIndeterminate(findElement('#miniProgressFill'), status.isIndeterminate)
  setProgress(findElement('#miniProgressFill'), status.progress ?? 0)
}

const refreshStatus = async (): Promise<void> => {
  let isBusy = false

  try {
    const { jobs } = await api.downloads()

    renderStatus(miniStatus(jobs))
    isBusy = jobs.some(isActiveJob)
  } catch {}

  setTimeout(() => void refreshStatus(), isBusy ? BUSY_POLL_MILLISECONDS : IDLE_POLL_MILLISECONDS)
}

const rotateTitles = (): void => {
  setInterval(() => {
    if (shownStatus.titles.length < 2) return

    titleIndex = (titleIndex + 1) % shownStatus.titles.length
    renderTitle()
  }, TITLE_ROTATION_MILLISECONDS)
}

const refuseDrops = (): void => {
  const refuse = (event: DragEvent) => {
    event.preventDefault()

    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
  }

  window.addEventListener('dragover', refuse)
  window.addEventListener('drop', refuse)
}

export const initializeMiniView = (): void => {
  const leaveMiniMode = () => void desktopBridge?.leaveMiniMode().catch(() => undefined)

  findElement('#miniLeaveButton').innerHTML = EXPAND_ICON_HTML
  findElement('.mini-content').addEventListener('dblclick', leaveMiniMode)
  findElement('#miniLeaveButton').addEventListener('click', leaveMiniMode)
  refuseDrops()
  rotateTitles()
  void refreshStatus()
}
