import { dialog, type BrowserWindow } from 'electron'
import { countText } from '@shared/count-text.js'
import { isActiveJob } from '@shared/jobs.js'
import type { Services } from '@server/server.js'
import { APP_NAME } from './app-identity.js'
import { saveWindowState } from './window-state.js'

interface QuitQuestion {
  keepButton: string
  message: string
  detail: string
}

const KEEP_BUTTON = 0

const askToQuit = (window: BrowserWindow, { keepButton, message, detail }: QuitQuestion): boolean =>
  dialog.showMessageBoxSync(window, {
    type: 'question',
    title: APP_NAME,
    buttons: [keepButton, 'Quit'],
    defaultId: KEEP_BUTTON,
    cancelId: KEEP_BUTTON,
    noLink: true,
    message,
    detail,
  }) !== KEEP_BUTTON

const alsoWaitingText = (waitingCount: number): string => {
  if (!waitingCount) return ''

  return waitingCount === 1
    ? ' The download waiting for its “Later” time also waits until you open the app again.'
    : ` The ${countText(waitingCount, 'download')} waiting for their “Later” time also wait until you open the app again.`
}

const runningQuestion = (activeCount: number, waitingCount: number): QuitQuestion => {
  const isSingle = activeCount === 1

  return {
    keepButton: 'Keep downloading',
    message: isSingle ? 'A download is still running.' : `${countText(activeCount, 'download')} are still running.`,
    detail: `Quitting pauses ${isSingle ? 'it' : 'them'}. ${isSingle ? 'It continues' : 'They continue'} where ${isSingle ? 'it' : 'they'} stopped the next time you open the app.${alsoWaitingText(waitingCount)}`,
  }
}

const waitingQuestion = (waitingCount: number): QuitQuestion => {
  const isSingle = waitingCount === 1

  return {
    keepButton: 'Keep the app open',
    message: isSingle
      ? 'A download is waiting for its “Later” time.'
      : `${countText(waitingCount, 'download')} are waiting for their “Later” time.`,
    detail: `${isSingle ? 'It only starts' : 'They only start'} while the app is open. If you quit, ${isSingle ? 'it waits' : 'they wait'} until you open the app again.`,
  }
}

export const confirmCloseWhileDownloading = (window: BrowserWindow, { queue }: Services): void => {
  let quitConfirmed = false

  window.on('close', (event) => {
    saveWindowState(window)

    const activeCount = queue.list().filter(isActiveJob).length
    const waitingCount = queue.waitingCount()

    if ((!activeCount && !waitingCount) || quitConfirmed) return

    const question = activeCount ? runningQuestion(activeCount, waitingCount) : waitingQuestion(waitingCount)

    if (askToQuit(window, question)) quitConfirmed = true
    else event.preventDefault()
  })
}
