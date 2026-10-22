import { mkdir, rm, rmdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DownloadOptions, Job } from '../../shared/types.js';
import { describeOptions } from './formats.js';
import type { HistoryStore, SettingsStore } from './stores.js';
import { checkForToolUpdate, requireTools } from './tools.js';
import { startDownload, type DownloadEvent } from './ytdlp.js';

export interface JobDisplayDetails {
  title?: string | undefined;
  thumbnailUrl?: string | null | undefined;
  videoCount?: number | undefined;
}

/** What the queue needs from the rest of the app; tests pass a fake one. */
export interface DownloadEngine {
  requireTools(): Promise<void>;
  startDownload: typeof startDownload;
  /** Called whenever no download is running, which is a safe time to update yt-dlp. */
  whenIdle(): void;
}

const defaultEngine: DownloadEngine = { requireTools, startDownload, whenIdle: checkForToolUpdate };

/** Share of the progress bar for the picture stream of a video; the sound stream gets the rest. */
const PICTURE_SHARE = 0.85;
/** yt-dlp keeps every unfinished file here (one folder per job) and moves only finished files to the download folder. */
export const PARTIAL_FOLDER_NAME = '.yt-downloader-partial';

interface ActiveRun {
  cancelled: boolean;
  cancel: (() => void) | null;
}

const isActive = (job: Job) => job.status === 'queued' || job.status === 'downloading';

export class DownloadQueue {
  private readonly jobs = new Map<string, Job>();
  /** One entry per yt-dlp run, kept until its process has exited, even after the job was cancelled. */
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly runPromises = new Set<Promise<void>>();
  private sequenceNumber = 0;

  constructor(
    private readonly settings: SettingsStore,
    private readonly history: HistoryStore,
    private readonly engine: DownloadEngine = defaultEngine,
  ) {}

  list(): Job[] {
    return [...this.jobs.values()].reverse();
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  add(options: DownloadOptions, details: JobDisplayDetails): Job {
    const id = `${Date.now().toString(36)}-${++this.sequenceNumber}`;
    const playlistLabel = options.playlist ? ` · playlist (${details.videoCount ?? '?'})` : '';
    const job: Job = {
      id,
      status: 'queued',
      options,
      title: details.title || options.url,
      thumbnailUrl: details.thumbnailUrl ?? null,
      label: describeOptions(options) + playlistLabel,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      progress: 0,
      stage: null,
      bytesPerSecond: null,
      secondsLeft: null,
      files: [],
      sizeBytes: null,
      error: null,
      playlistPosition: null,
    };
    this.jobs.set(id, job);
    this.startQueuedJobs();
    return job;
  }

  cancel(id: string): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (isActive(job)) {
      job.status = 'cancelled';
      job.stage = null;
      const run = this.activeRuns.get(id);
      if (run) {
        run.cancelled = true;
        run.cancel?.();
      }
    }
    this.startQueuedJobs();
    return job;
  }

  /** A retried job waits until its previous run's process has exited (see startQueuedJobs). */
  retry(id: string): Job | undefined {
    const job = this.jobs.get(id);
    if (!job || isActive(job)) return job;
    Object.assign(job, { status: 'queued', error: null, progress: 0, files: [], stage: null, finishedAt: null, sizeBytes: null });
    this.startQueuedJobs();
    return job;
  }

  remove(id: string): void {
    const job = this.jobs.get(id);
    if (job && !isActive(job)) this.jobs.delete(id);
  }

  clearFinished(): void {
    for (const [id, job] of this.jobs) if (!isActive(job)) this.jobs.delete(id);
  }

  startQueuedJobs(): void {
    let freeSlots = this.settings.get().simultaneousDownloads - this.activeRuns.size;
    for (const job of this.jobs.values()) {
      if (freeSlots <= 0) return;
      if (job.status !== 'queued' || this.activeRuns.has(job.id)) continue;
      freeSlots--;
      const run = this.runJob(job).finally(() => this.runPromises.delete(run));
      this.runPromises.add(run);
    }
  }

  /** Cancels everything and waits until the processes have exited and partial files are removed. */
  async stopAll(): Promise<void> {
    for (const job of this.jobs.values()) if (isActive(job)) this.cancel(job.id);
    await Promise.allSettled(this.runPromises);
  }

  private async runJob(job: Job): Promise<void> {
    const run: ActiveRun = { cancelled: false, cancel: null };
    this.activeRuns.set(job.id, run);
    const downloadFolder = this.settings.get().downloadFolder;
    const partialFolder = join(downloadFolder, PARTIAL_FOLDER_NAME, job.id);
    job.status = 'downloading';
    job.stage = 'Waiting for the download tools';
    try {
      await this.engine.requireTools();
      await mkdir(partialFolder, { recursive: true });
      if (run.cancelled) return;
      job.stage = 'Starting';
      const download = this.engine.startDownload(job.options, downloadFolder, partialFolder, (event) => this.handleEvent(job, event));
      run.cancel = download.cancel;
      await download.finished;
      if (run.cancelled) return;
      await this.finishJob(job);
    } catch (error) {
      if (run.cancelled) return;
      job.status = 'error';
      job.error = error instanceof Error ? error.message : String(error);
    } finally {
      await removePartialFolder(partialFolder);
      this.activeRuns.delete(job.id);
      if (!isActive(job)) job.finishedAt = new Date().toISOString();
      job.bytesPerSecond = null;
      job.secondsLeft = null;
      this.startQueuedJobs();
      if (!this.activeRuns.size) this.engine.whenIdle();
    }
  }

  private async finishJob(job: Job): Promise<void> {
    job.status = 'done';
    job.progress = 1;
    job.stage = null;
    job.sizeBytes = await totalFileSize(job.files);
    await this.history
      .add({
        id: job.id,
        title: job.title,
        thumbnailUrl: job.thumbnailUrl,
        label: job.label,
        files: job.files,
        sizeBytes: job.sizeBytes,
        finishedAt: new Date().toISOString(),
        url: job.options.url,
      })
      .catch(() => {});
  }

  private handleEvent(job: Job, event: DownloadEvent): void {
    if (event.type === 'progress') this.handleProgress(job, event);
    else if (event.type === 'item') {
      job.playlistPosition = event.count ? { index: event.index, count: event.count, title: event.title } : null;
      if (!job.options.playlist && !job.options.tags && event.title) job.title = event.title;
      job.progress = job.options.playlist && event.count && event.index ? (event.index - 1) / event.count : 0;
    } else {
      job.files.push(event.file);
      job.stage = 'Saved';
    }
  }

  private handleProgress(job: Job, event: Extract<DownloadEvent, { type: 'progress' }>): void {
    if (event.stream === 'other') {
      job.stage = 'Downloading subtitles';
      return;
    }
    const fraction = event.totalBytes ? Math.min(1, (event.downloadedBytes ?? 0) / event.totalBytes) : null;
    const isSeparateStream = job.options.kind === 'video' && event.stream !== 'combined';
    if (fraction !== null) {
      if (!isSeparateStream) job.progress = fraction;
      else if (event.stream === 'picture') job.progress = fraction * PICTURE_SHARE;
      else job.progress = PICTURE_SHARE + fraction * (1 - PICTURE_SHARE);
    }
    job.bytesPerSecond = event.bytesPerSecond;
    job.secondsLeft = event.secondsLeft;
    const streamFinished = fraction !== null && fraction >= 1;
    if (job.options.kind === 'audio') job.stage = streamFinished ? 'Converting' : 'Downloading';
    else if (!isSeparateStream) job.stage = streamFinished ? 'Finishing' : 'Downloading video';
    else if (event.stream === 'picture') job.stage = streamFinished ? 'Getting the sound' : 'Downloading video';
    else job.stage = streamFinished ? 'Merging picture and sound' : 'Downloading audio';
  }
}

/** Retries cover Windows keeping a stopped process's files locked for a moment. */
async function removePartialFolder(folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }).catch(() => {});
  await rmdir(dirname(folder)).catch(() => {
    // Other downloads are still using it.
  });
}

async function totalFileSize(files: string[]): Promise<number> {
  const sizes = await Promise.all(
    files.map((file) =>
      stat(file).then(
        (information) => information.size,
        () => 0,
      ),
    ),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}
