import { isActiveJob, isFinishedJob, isUnfinishedJob } from '@shared/jobs.js'
import type { DownloadOptions, Job } from '@shared/types/downloads.js'
import { ignoreFailure } from '@server/lib/ignore-failure.js'
import type { HistoryStore } from '@server/services/stores/history-store.js'
import type { SavedJob, SavedQueue } from '@server/services/stores/queue-store.js'
import type { SettingsStore } from '@server/services/stores/settings-store.js'
import { ActiveRuns } from './active-runs.js'
import { appDownloadEngine, type DownloadEngine } from './download-engine.js'
import { downloadWindowFromSettings, type DownloadWindow } from './download-window.js'
import { JobFolders } from './job-folders.js'
import { runDownloadJob } from './job-runner.js'
import { createQueuedJob, resetJobForRetry, type JobDisplayDetails } from './jobs.js'
import { applyWindowToJobs, moveWaitingJobs, waitForWindow } from './later-jobs.js'
import { jobFromSavedJob, savedJobFromJob } from './saved-jobs.js'

export interface DownloadQueueDependencies {
  settings: SettingsStore
  history: HistoryStore
  savedQueue: SavedQueue
  engine?: DownloadEngine
}

export interface AddOptions {
  later?: boolean
}

const WINDOW_CHECK_MILLISECONDS = 30_000

export class DownloadQueue {
  private readonly jobs = new Map<string, Job>()
  private readonly activeRuns = new ActiveRuns()
  private readonly runningPromises = new Set<Promise<void>>()
  private readonly jobFolders: JobFolders
  private readonly settings: SettingsStore
  private readonly history: HistoryStore
  private readonly savedQueue: SavedQueue
  private readonly engine: DownloadEngine
  private jobSequenceNumber = 0
  private isShuttingDown = false
  private windowTimer: ReturnType<typeof setInterval> | null = null

  constructor({ settings, history, savedQueue, engine = appDownloadEngine }: DownloadQueueDependencies) {
    this.settings = settings
    this.history = history
    this.savedQueue = savedQueue
    this.engine = engine
    this.jobFolders = new JobFolders(() => settings.get().downloadFolder)
  }

  list(): Job[] {
    return [...this.jobs.values()].reverse()
  }

  find(id: string): Job | undefined {
    return this.jobs.get(id)
  }

  add(options: DownloadOptions, details: JobDisplayDetails, { later = false }: AddOptions = {}): Job {
    const id = `${Date.now().toString(36)}-${++this.jobSequenceNumber}`
    const job = createQueuedJob(id, options, details)
    const window = later ? this.downloadWindow() : null

    if (window) waitForWindow(job, window, new Date())

    this.jobs.set(id, job)
    this.queueChanged()

    return job
  }

  restoreJobs(savedJobs: SavedJob[]): void {
    for (const savedJob of savedJobs) {
      if (this.jobs.has(savedJob.id)) continue

      this.jobs.set(savedJob.id, jobFromSavedJob(savedJob))
      this.jobFolders.remember(savedJob.id, savedJob.downloadFolder)
    }

    this.queueChanged()
  }

  pause(id: string): Job | undefined {
    const job = this.jobs.get(id)

    if (!job || !isActiveJob(job)) return job

    Object.assign(job, {
      status: 'paused',
      stage: null,
      bytesPerSecond: null,
      secondsLeft: null,
    } satisfies Partial<Job>)
    this.activeRuns.stop(id, 'pause')
    this.queueChanged()

    return job
  }

  resume(id: string): Job | undefined {
    const job = this.jobs.get(id)

    if (job?.status !== 'paused') return job

    job.status = 'queued'
    job.downloadLater = false
    this.queueChanged()

    return job
  }

  startNow(id: string): Job | undefined {
    const job = this.jobs.get(id)

    if (job?.status !== 'scheduled') return job

    Object.assign(job, { status: 'queued', downloadLater: false, startsAt: null } satisfies Partial<Job>)
    this.queueChanged()

    return job
  }

  downloadWindowChanged(): void {
    this.applyDownloadWindow()
    moveWaitingJobs(this.jobs.values(), this.downloadWindow(), new Date())
    this.queueChanged()
  }

  waitingCount(): number {
    return [...this.jobs.values()].filter((job) => job.status === 'scheduled').length
  }

  cancel(id: string): Job | undefined {
    const job = this.jobs.get(id)

    if (!job) return undefined

    if (isUnfinishedJob(job)) {
      job.status = 'cancelled'
      job.stage = null
      this.activeRuns.stop(id, 'cancel')

      if (!this.activeRuns.has(id)) void this.jobFolders.discardPartialFiles(id)
    }

    this.queueChanged()

    return job
  }

  retry(id: string): Job | undefined {
    const job = this.jobs.get(id)

    if (!job || isUnfinishedJob(job)) return job

    resetJobForRetry(job)
    this.queueChanged()

    return job
  }

  remove(id: string): void {
    const job = this.jobs.get(id)

    if (job && isFinishedJob(job)) this.jobs.delete(id)
  }

  clearFinished(): void {
    for (const [id, job] of this.jobs) if (isFinishedJob(job)) this.jobs.delete(id)
  }

  private startQueuedJobs(): void {
    if (this.isShuttingDown) return

    let freeSlots = this.settings.get().simultaneousDownloads - this.activeRuns.count

    for (const job of this.jobs.values()) {
      if (freeSlots <= 0) return
      if (job.status !== 'queued' || this.activeRuns.has(job.id)) continue

      freeSlots--

      const runningPromise = this.runJob(job).finally(() => this.runningPromises.delete(runningPromise))

      this.runningPromises.add(runningPromise)
    }
  }

  async pauseForShutdown(): Promise<void> {
    this.isShuttingDown = true
    this.stopWindowTimer()
    this.activeRuns.stopAll('pause')
    await Promise.allSettled(this.runningPromises)
    await this.saveUnfinishedJobs()
  }

  private queueChanged(): void {
    this.applyDownloadWindow()
    this.saveAndStartJobs()
  }

  private saveAndStartJobs(): void {
    void this.saveUnfinishedJobs()
    this.startQueuedJobs()
    this.updateWindowTimer()
  }

  private checkDownloadWindow(): void {
    if (this.applyDownloadWindow()) this.saveAndStartJobs()
  }

  private downloadWindow(): DownloadWindow | null {
    return downloadWindowFromSettings(this.settings.get())
  }

  private applyDownloadWindow(): boolean {
    const { changed, jobIdsToStop } = applyWindowToJobs(this.jobs.values(), this.downloadWindow(), new Date())

    for (const jobId of jobIdsToStop) this.activeRuns.stop(jobId, 'pause')

    return changed
  }

  private updateWindowTimer(): void {
    const hasLaterJobs = [...this.jobs.values()].some((job) => job.downloadLater && isUnfinishedJob(job))

    if (!hasLaterJobs || this.isShuttingDown) return this.stopWindowTimer()
    if (this.windowTimer) return

    this.windowTimer = setInterval(() => this.checkDownloadWindow(), WINDOW_CHECK_MILLISECONDS)
    this.windowTimer.unref?.()
  }

  private stopWindowTimer(): void {
    if (this.windowTimer) clearInterval(this.windowTimer)

    this.windowTimer = null
  }

  private saveUnfinishedJobs(): Promise<void> {
    const savedJobs = [...this.jobs.values()]
      .filter(isUnfinishedJob)
      .map((job) => savedJobFromJob(job, this.jobFolders.savedFolder(job.id)))

    return this.savedQueue.save(savedJobs).catch(ignoreFailure)
  }

  private async runJob(job: Job): Promise<void> {
    const run = this.activeRuns.start(job.id)

    this.jobFolders.folderFor(job.id)
    job.status = 'downloading'
    job.stage = 'Waiting for the download tools'
    void this.saveUnfinishedJobs()

    await runDownloadJob(job, run, { engine: this.engine, history: this.history, jobFolders: this.jobFolders })
    this.afterRun(job)
  }

  private afterRun(job: Job): void {
    this.activeRuns.finish(job.id)

    if (isFinishedJob(job)) job.finishedAt = new Date().toISOString()

    job.bytesPerSecond = null
    job.secondsLeft = null
    this.queueChanged()

    if (!this.activeRuns.count && !this.isShuttingDown) this.engine.whenIdle()
  }
}
