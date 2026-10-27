import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isFinishedJob } from '@shared/jobs.js'
import type { Job } from '@shared/types/downloads.js'
import { totalFileSize } from '@server/lib/file-size.js'
import { errorText } from '@server/lib/http/http-error.js'
import { ignoreFailure } from '@server/lib/ignore-failure.js'
import type { HistoryStore } from '@server/services/stores/history-store.js'
import type { DownloadResult } from '@server/services/ytdlp/download-process.js'
import type { ActiveRun } from './active-runs.js'
import type { DownloadEngine } from './download-engine.js'
import type { JobFolders } from './job-folders.js'
import { applyDownloadEvent } from './job-progress.js'
import { historyEntryFromJob, skippedItemsWarning } from './jobs.js'
import { createPartialFolder, partialFolderFor } from './partial-folders.js'

export interface JobRunnerDependencies {
  engine: DownloadEngine
  history: HistoryStore
  jobFolders: JobFolders
}

const finishJob = async (job: Job, { skippedItems }: DownloadResult, history: HistoryStore): Promise<void> => {
  job.status = 'done'
  job.warning = skippedItemsWarning(skippedItems)
  job.progress = 1
  job.stage = null
  job.activity = null
  job.sizeBytes = await totalFileSize(job.files)

  if (!job.group) await history.add(historyEntryFromJob(job)).catch(ignoreFailure)
}

const VIDEO_INFO_FILE_NAME = 'video-info.json'

const writeRecentVideoInfo = async (
  engine: DownloadEngine,
  job: Job,
  partialFolder: string,
): Promise<string | null> => {
  const info = job.options.playlist ? null : engine.recentVideoInfo(job.options.url)

  if (!info) return null

  const infoFile = join(partialFolder, VIDEO_INFO_FILE_NAME)

  try {
    await writeFile(infoFile, JSON.stringify(info))

    return infoFile
  } catch {
    return null
  }
}

export const runDownloadJob = async (
  job: Job,
  run: ActiveRun,
  { engine, history, jobFolders }: JobRunnerDependencies,
): Promise<void> => {
  const downloadFolder = jobFolders.folderFor(job.id)
  const partialFolder = partialFolderFor(downloadFolder, job.id)

  try {
    await engine.requireTools()
    await createPartialFolder(partialFolder)

    if (run.stopReason) return

    job.stage = job.options.clip ? 'Downloading the clip' : 'Getting the video info'
    job.activity = job.options.clip ? 'processing' : 'preparing'

    let hasStartedDownloading = false

    const runYtdlp = (infoFile: string | null): Promise<DownloadResult> => {
      if (run.stopReason) return Promise.reject(new Error('Stopped.'))

      const download = engine.startDownload(job.options, { downloadFolder, partialFolder, infoFile }, (event) => {
        if (event.type !== 'item') hasStartedDownloading = true

        applyDownloadEvent(job, event)
      })

      run.stopProcess = download.cancel

      return download.finished
    }

    const infoFile = await writeRecentVideoInfo(engine, job, partialFolder)
    const result = await runYtdlp(infoFile).catch((error: unknown) => {
      if (!infoFile || run.stopReason || hasStartedDownloading) throw error

      engine.forgetVideoInfo(job.options.url)
      Object.assign(job, { stage: 'Getting the video info', activity: 'preparing', progress: 0 } satisfies Partial<Job>)

      return runYtdlp(null)
    })

    if (run.stopReason === 'cancel') return

    await finishJob(job, result, history)
  } catch (error) {
    if (run.stopReason) return

    job.status = 'error'
    job.error = errorText(error)
    job.activity = null
  } finally {
    if (run.stopReason === 'cancel' || isFinishedJob(job)) await jobFolders.discardPartialFiles(job.id)
  }
}
