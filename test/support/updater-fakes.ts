import type { AppUpdate } from '@shared/types/app.js'
import { AppUpdater, type AppUpdaterDependencies, type UpdateHost } from '@server/services/app-updates/updater.js'

export const NEW_VERSION: AppUpdate = {
  version: '1.3.0',
  tag: 'v1.3.0',
  releaseUrl: 'https://github.com/littlenines/youtube-downloader-gui/releases/tag/v1.3.0',
}

export const createUpdaterFakes = (changes: Partial<AppUpdaterDependencies> = {}) => {
  const calls: string[] = []
  let installsAutomatically = false
  const dependencies: AppUpdaterDependencies = {
    isSupported: true,
    findUpdate: async () => NEW_VERSION,
    downloadUpdate: async (update, onProgress) => {
      calls.push(`download ${update.version}`)
      onProgress(0.5)

      return '/app/.update/download/unpacked/yt-downloader-win-x64'
    },
    installUpdate: async (folder) => void calls.push(`install ${folder}`),
    removeLeftovers: async () => void calls.push('remove leftovers'),
    ...changes,
  }
  const host: UpdateHost = {
    installsAutomatically: () => installsAutomatically,
    restart: async () => void calls.push('restart'),
  }

  return {
    calls,
    updater: new AppUpdater(dependencies),
    host,
    turnOnAutomaticUpdates: () => (installsAutomatically = true),
    turnOffAutomaticUpdates: () => (installsAutomatically = false),
  }
}

export const settle = () => new Promise((resolve) => setImmediate(resolve))
