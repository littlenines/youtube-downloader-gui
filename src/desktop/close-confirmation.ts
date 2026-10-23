import { dialog, type BrowserWindow } from 'electron'
import { isActiveJob } from '@shared/jobs.js'
import type { Services } from '@server/server.js'
import { APP_NAME } from './app-identity.js'
import { saveWindowState } from './window-state.js'

const KEEP_DOWNLOADING_BUTTON = 0

const askToQuitWhileDownloading = (window: BrowserWindow, activeCount: number): boolean => {
  const isSingle = activeCount === 1
  const choice = dialog.showMessageBoxSync(window, {
    type: 'question',
    title: APP_NAME,
    buttons: ['Keep downloading', 'Quit'],
    defaultId: KEEP_DOWNLOADING_BUTTON,
    cancelId: KEEP_DOWNLOADING_BUTTON,
    noLink: true,
    message: isSingle ? 'A download is still running.' : `${activeCount} downloads are still running.`,
    detail: `Quitting stops ${isSingle ? 'it' : 'them'} and removes the unfinished ${isSingle ? 'file' : 'files'}.`,
  })

  return choice !== KEEP_DOWNLOADING_BUTTON
}

export const confirmCloseWhileDownloading = (window: BrowserWindow, { queue }: Services): void => {
  let quitConfirmed = false

  window.on('close', (event) => {
    saveWindowState(window)

    const activeCount = queue.list().filter(isActiveJob).length

    if (!activeCount || quitConfirmed) return

    if (askToQuitWhileDownloading(window, activeCount)) quitConfirmed = true
    else event.preventDefault()
  })
}
