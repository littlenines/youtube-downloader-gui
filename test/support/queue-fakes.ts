import type { Settings } from '@shared/types/app.js'
import type { DownloadEngine } from '@server/services/downloads/download-engine.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import type { HistoryStore } from '@server/services/stores/history-store.js'
import type { SavedJob, SavedQueue } from '@server/services/stores/queue-store.js'
import type { SettingsStore } from '@server/services/stores/settings-store.js'
import type { DownloadEvent } from '@server/services/ytdlp/download-events.js'
import type { DownloadResult } from '@server/services/ytdlp/download-process.js'
import { createTemporaryFolder } from './temporary-folder.js'

export interface FakeRun {
  finish(skippedItems?: string[]): void
  fail(message: string): void
  cancelled: boolean
  partialFolder: string
  infoFile: string | null
  emit(event: DownloadEvent): void
}

export const createFakeEngine = ({ recentVideoInfo = (): unknown => null } = {}) => {
  const runs: FakeRun[] = []
  const forgottenUrls: string[] = []
  const engine: DownloadEngine = {
    requireTools: async () => {},
    recentVideoInfo,
    forgetVideoInfo: (url) => forgottenUrls.push(url),
    startDownload: (_options, { partialFolder, infoFile }, onEvent) => {
      let finish!: (result: DownloadResult) => void
      let fail!: (error: Error) => void
      const finished = new Promise<DownloadResult>((resolve, reject) => {
        finish = resolve
        fail = reject
      })
      const run: FakeRun = {
        finish: (skippedItems = []) => finish({ skippedItems }),
        fail: (message) => fail(new Error(message)),
        cancelled: false,
        partialFolder,
        infoFile,
        emit: onEvent,
      }

      runs.push(run)

      return { finished, cancel: () => (run.cancelled = true) }
    },
    whenIdle: () => {},
  }

  return { engine, runs, forgottenUrls }
}

export const waitUntil = async (condition: () => boolean): Promise<void> => {
  for (let waited = 0; waited < 2000; waited += 5) {
    if (condition()) return

    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  throw new Error('Timed out waiting for the condition.')
}

export const waitFor = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export const noSavedQueue: SavedQueue = { save: async () => {} }

export const createRecordingQueue = () => {
  const savedJobsHistory: SavedJob[][] = []
  const savedQueue: SavedQueue = {
    save: async (savedJobs) => {
      savedJobsHistory.push(savedJobs)
    },
  }

  return {
    savedQueue,
    lastSavedIds: () => savedJobsHistory.at(-1)?.map((savedJob) => savedJob.id),
    lastSavedJobs: () => savedJobsHistory.at(-1),
  }
}

export const createQueueTestSetup = async (folderPrefix: string) => {
  const downloadFolder = await createTemporaryFolder(folderPrefix)
  const settings = {
    get: (): Settings => ({
      downloadFolder,
      simultaneousDownloads: 2,
      lowLatencyRendering: true,
      notifyWhenFinished: true,
      installUpdatesAutomatically: false,
      subscriptionCheckHours: 1,
      laterStartTime: null,
      laterStopTime: null,
    }),
  } as unknown as SettingsStore
  const history = { add: async () => {} } as unknown as HistoryStore
  const options = normalizeDownloadRequest({ url: 'https://example.com/video' })

  return { downloadFolder, settings, history, options }
}

export const savedJobFor = (overrides: Partial<SavedJob> & Pick<SavedJob, 'id' | 'options'>): SavedJob => ({
  title: 'Saved song',
  thumbnailUrl: null,
  label: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  paused: false,
  progress: 0,
  activeSeconds: 0,
  later: false,
  startsAt: null,
  downloadFolder: null,
  ...overrides,
})
