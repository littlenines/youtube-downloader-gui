import { isActiveJob } from '@shared/jobs.js'
import type { DownloadOptions, Job } from '@shared/types.js'
import { totalFileSize } from '@server/lib/file-size.js'
import { errorText } from '@server/lib/http/http-error.js'
import type { HistoryStore } from '@server/services/stores/history-store.js'
import type { SettingsStore } from '@server/services/stores/settings-store.js'
import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import { startDownload, type DownloadResult } from '@server/services/ytdlp/download-process.js'
import { applyDownloadEvent } from './job-progress.js'
import {
  createQueuedJob,
  historyEntryFromJob,
  resetJobForRetry,
  skippedItemsWarning,
  type JobDisplayDetails,
} from './jobs.js'
import { createPartialFolder, partialFolderFor, removePartialFolder } from './partial-folders.js'

export interface DownloadEngine {
  requireTools(): Promise<void>
  startDownload: typeof startDownload
  whenIdle(): void
}

const appDownloadEngine: DownloadEngine = {
  requireTools: () => toolSetup.requireInstalled(),
  startDownload,
  whenIdle: () => toolSetup.checkForUpdate(),
}

interface ActiveRun {
  cancelled: boolean
  cancel: (() => void) | null
}

const ignoreFailure = () => {}

export class DownloadQueue {
  private readonly jobs = new Map<string, Job>()
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly runningPromises = new Set<Promise<void>>()
  private jobSequenceNumber = 0

  constructor(
    private readonly settings: SettingsStore,
    private readonly history: HistoryStore,
    private readonly engine: DownloadEngine = appDownloadEngine,
  ) {}

  list(): Job[] {
    return [...this.jobs.values()].reverse()
  }

  find(id: string): Job | undefined {
    return this.jobs.get(id)
  }

  add(options: DownloadOptions, details: JobDisplayDetails): Job {
    const id = `${Date.now().toString(36)}-${++this.jobSequenceNumber}`
    const job = createQueuedJob(id, options, details)

    this.jobs.set(id, job)
    this.startQueuedJobs()

    return job
  }

  cancel(id: string): Job | undefined {
    const job = this.jobs.get(id)

    if (!job) return undefined

    if (isActiveJob(job)) {
      job.status = 'cancelled'
      job.stage = null
      this.cancelRun(id)
    }

    this.startQueuedJobs()

    return job
  }

  retry(id: string): Job | undefined {
    const job = this.jobs.get(id)

    if (!job || isActiveJob(job)) return job

    resetJobForRetry(job)
    this.startQueuedJobs()

    return job
  }

  remove(id: string): void {
    const job = this.jobs.get(id)

    if (job && !isActiveJob(job)) this.jobs.delete(id)
  }

  clearFinished(): void {
    for (const [id, job] of this.jobs) if (!isActiveJob(job)) this.jobs.delete(id)
  }

  startQueuedJobs(): void {
    let freeSlots = this.settings.get().simultaneousDownloads - this.activeRuns.size

    for (const job of this.jobs.values()) {
      if (freeSlots <= 0) return
      if (job.status !== 'queued' || this.activeRuns.has(job.id)) continue

      freeSlots--

      const runningPromise = this.runJob(job).finally(() => this.runningPromises.delete(runningPromise))

      this.runningPromises.add(runningPromise)
    }
  }

  async stopAll(): Promise<void> {
    for (const job of this.jobs.values()) if (isActiveJob(job)) this.cancel(job.id)

    await Promise.allSettled(this.runningPromises)
  }

  private cancelRun(id: string): void {
    const run = this.activeRuns.get(id)

    if (!run) return

    run.cancelled = true
    run.cancel?.()
  }

  private async runJob(job: Job): Promise<void> {
    const run: ActiveRun = { cancelled: false, cancel: null }
    const downloadFolder = this.settings.get().downloadFolder
    const partialFolder = partialFolderFor(downloadFolder, job.id)

    this.activeRuns.set(job.id, run)
    job.status = 'downloading'
    job.stage = 'Waiting for the download tools'

    try {
      await this.engine.requireTools()
      await createPartialFolder(partialFolder)

      if (run.cancelled) return

      job.stage = 'Starting'

      const download = this.engine.startDownload(job.options, { downloadFolder, partialFolder }, (event) =>
        applyDownloadEvent(job, event),
      )

      run.cancel = download.cancel

      const result = await download.finished

      if (run.cancelled) return

      await this.finishJob(job, result)
    } catch (error) {
      if (run.cancelled) return

      job.status = 'error'
      job.error = errorText(error)
    } finally {
      await removePartialFolder(partialFolder)
      this.afterRun(job)
    }
  }

  private afterRun(job: Job): void {
    this.activeRuns.delete(job.id)

    if (!isActiveJob(job)) job.finishedAt = new Date().toISOString()

    job.bytesPerSecond = null
    job.secondsLeft = null
    this.startQueuedJobs()

    if (!this.activeRuns.size) this.engine.whenIdle()
  }

  private async finishJob(job: Job, { skippedItems }: DownloadResult): Promise<void> {
    job.status = 'done'
    job.warning = skippedItemsWarning(skippedItems)
    job.progress = 1
    job.stage = null
    job.sizeBytes = await totalFileSize(job.files)
    await this.history.add(historyEntryFromJob(job)).catch(ignoreFailure)
  }
}
