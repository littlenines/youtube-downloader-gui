import { isActiveJob, isFinishedJob, isUnfinishedJob } from '@shared/jobs.js'
import type { DownloadOptions, Job } from '@shared/types/downloads.js'
import type { HistoryStore } from '@server/services/stores/history-store.js'
import type { SavedJob, SavedQueue } from '@server/services/stores/queue-store.js'
import type { SettingsStore } from '@server/services/stores/settings-store.js'
import { ActiveRuns } from './active-runs.js'
import { appDownloadEngine, type DownloadEngine } from './download-engine.js'
import { JobFolders } from './job-folders.js'
import { runDownloadJob } from './job-runner.js'
import { createQueuedJob, resetJobForRetry, type JobDisplayDetails } from './jobs.js'
import { jobFromSavedJob, savedJobFromJob } from './saved-jobs.js'

export interface DownloadQueueDependencies {
  settings: SettingsStore
  history: HistoryStore
  savedQueue: SavedQueue
  engine?: DownloadEngine
}

const ignoreFailure = () => {}

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

  add(options: DownloadOptions, details: JobDisplayDetails): Job {
    const id = `${Date.now().toString(36)}-${++this.jobSequenceNumber}`
    const job = createQueuedJob(id, options, details)

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
    this.queueChanged()

    return job
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

  startQueuedJobs(): void {
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
    this.activeRuns.stopAll('pause')
    await Promise.allSettled(this.runningPromises)
    await this.saveUnfinishedJobs()
  }

  private queueChanged(): void {
    void this.saveUnfinishedJobs()
    this.startQueuedJobs()
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
