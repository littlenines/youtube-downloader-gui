import { isFinishedJob } from '@shared/jobs.js'
import type { Job } from '@shared/types/downloads.js'
import { totalFileSize } from '@server/lib/file-size.js'
import { errorText } from '@server/lib/http/http-error.js'
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

const ignoreFailure = () => {}

const finishJob = async (job: Job, { skippedItems }: DownloadResult, history: HistoryStore): Promise<void> => {
  job.status = 'done'
  job.warning = skippedItemsWarning(skippedItems)
  job.progress = 1
  job.stage = null
  job.sizeBytes = await totalFileSize(job.files)
  await history.add(historyEntryFromJob(job)).catch(ignoreFailure)
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

    job.stage = job.options.clip ? 'Downloading the clip' : 'Starting'

    const download = engine.startDownload(job.options, { downloadFolder, partialFolder }, (event) =>
      applyDownloadEvent(job, event),
    )

    run.stopProcess = download.cancel

    const result = await download.finished

    if (run.stopReason === 'cancel') return

    await finishJob(job, result, history)
  } catch (error) {
    if (run.stopReason) return

    job.status = 'error'
    job.error = errorText(error)
  } finally {
    if (run.stopReason === 'cancel' || isFinishedJob(job)) await jobFolders.discardPartialFiles(job.id)
  }
}
