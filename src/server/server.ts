import type { Server } from 'node:http'
import { DownloadQueue } from './services/downloads/download-queue.js'
import { removeStalePartialFolders } from './services/downloads/partial-folders.js'
import { HistoryStore } from './services/stores/history-store.js'
import { QueueStore } from './services/stores/queue-store.js'
import { SettingsStore } from './services/stores/settings-store.js'
import { subscriptionsFile } from './services/stores/subscription-store.js'
import { SubscriptionService } from './services/subscriptions/subscription-service.js'

export interface Services {
  settings: SettingsStore
  history: HistoryStore
  queue: DownloadQueue
  subscriptions: SubscriptionService
}

export const createServices = async (): Promise<Services> => {
  const settings = await new SettingsStore().load()
  const history = await new HistoryStore().load()
  const savedQueue = new QueueStore()
  const savedJobs = await savedQueue.loadSavedJobs()
  const savedJobIds = new Set(savedJobs.map((savedJob) => savedJob.id))
  const queue = new DownloadQueue({ settings, history, savedQueue })

  const subscriptions = await new SubscriptionService({
    storage: subscriptionsFile(),
    addDownload: (options, details) => queue.add(options, details),
    checkIntervalHours: () => settings.get().subscriptionCheckHours,
  }).load()

  queue.restoreJobs(savedJobs)
  removeStalePartialFolders(settings.get().downloadFolder, savedJobIds).catch(() => {})
  subscriptions.startSchedule()

  return { settings, history, queue, subscriptions }
}

export const listen = (server: Server, port: number, host: string): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)

      const address = server.address()

      resolve(typeof address === 'object' && address ? address.port : port)
    })
  })
