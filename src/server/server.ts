import type { Server } from 'node:http'
import { DownloadQueue } from './services/downloads/download-queue.js'
import { removeStalePartialFolders } from './services/downloads/partial-folders.js'
import { HistoryStore } from './services/stores/history-store.js'
import { SettingsStore } from './services/stores/settings-store.js'

export interface Services {
  settings: SettingsStore
  history: HistoryStore
  queue: DownloadQueue
}

export const createServices = async (): Promise<Services> => {
  const settings = await new SettingsStore().load()
  const history = await new HistoryStore().load()

  removeStalePartialFolders(settings.get().downloadFolder).catch(() => {})

  return { settings, history, queue: new DownloadQueue(settings, history) }
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
