import { Notification, type BrowserWindow } from 'electron'
import type { Job } from '@shared/types/downloads.js'
import type { Services } from '@server/server.js'
import { APP_ICON_PATH } from './app-identity.js'
import type { DownloadListener } from './download-watcher.js'
import { createNotificationBatch } from './notification-batch.js'
import { finishedNotificationText } from './notification-text.js'

const MAXIMUM_KEPT_NOTIFICATIONS = 20

export const notifyWhenDownloadsFinish = (
  window: BrowserWindow,
  { settings }: Services,
  focusWindow: () => void,
): DownloadListener => {
  const keptNotifications: Notification[] = []
  const canNotify = (): boolean =>
    !window.isDestroyed() && !window.isFocused() && settings.get().notifyWhenFinished && Notification.isSupported()

  const showNotification = (jobs: Job[]): void => {
    if (!canNotify()) return

    const notification = new Notification({ ...finishedNotificationText(jobs), icon: APP_ICON_PATH })

    notification.on('click', focusWindow)
    keptNotifications.push(notification)
    keptNotifications.splice(0, keptNotifications.length - MAXIMUM_KEPT_NOTIFICATIONS)
    notification.show()
  }

  const collectFinishedJobs = createNotificationBatch(showNotification)

  return ({ finishedJobs }) => {
    if (finishedJobs.length && canNotify()) collectFinishedJobs(finishedJobs)
  }
}
