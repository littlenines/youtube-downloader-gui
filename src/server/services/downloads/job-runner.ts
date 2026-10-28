import { isFinishedJob } from '@shared/jobs.js'
import type { Job } from '@shared/types/downloads.js'
import { totalFileSize } from '@server/lib/file-size.js'
import { errorText } from '@server/lib/http/http-error.js'
import { ignoreFailure } from '@server/lib/ignore-failure.js'
import type { HistoryStore } from '@server/services/stores/history-store.js'
import type { DownloadResult } from '@server/services/ytdlp/download-process.js'
import { SubtitlesFailedError } from '@server/services/ytdlp/error-messages.js'
import type { ActiveRun } from './active-runs.js'
import type { DownloadEngine } from './download-engine.js'
import type { JobFolders } from './job-folders.js'
import { applyDownloadEvent } from './job-progress.js'
import { historyEntryFromJob, skippedItemsWarning, withoutSubtitlesWarning } from './jobs.js'
import { createPartialFolder, partialFolderFor } from './partial-folders.js'
import { nameSpokenSubtitleFiles } from './subtitle-files.js'
import { needsSubtitleTrack, withSubtitleTrack } from './subtitle-track-choice.js'
import { videoInfoFor, writeVideoInfo } from './video-info-file.js'

export interface JobRunnerDependencies {
  engine: DownloadEngine
  history: HistoryStore
  jobFolders: JobFolders
}

const startingStage = ({ options }: Job): Pick<Job, 'stage' | 'activity'> =>
  options.clip
    ? { stage: 'Downloading the clip', activity: 'processing' }
    : { stage: 'Getting the video info', activity: 'preparing' }

const finishJob = async (job: Job, { skippedItems }: DownloadResult, history: HistoryStore): Promise<void> => {
  await nameSpokenSubtitleFiles(job.options, job.files)

  job.status = 'done'
  job.warning = skippedItemsWarning(skippedItems) ?? job.warning
  job.progress = 1
  job.stage = null
  job.activity = null
  job.sizeBytes = await totalFileSize(job.files)

  if (!job.group) await history.add(historyEntryFromJob(job)).catch(ignoreFailure)
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

    Object.assign(job, startingStage(job))

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

    const startAgain = (infoFile: string | null): Promise<DownloadResult> => {
      Object.assign(job, { ...startingStage(job), progress: 0 } satisfies Partial<Job>)

      return runYtdlp(infoFile)
    }

    const videoInfo = await videoInfoFor(engine, job, run)

    if (run.stopReason) return
    if (videoInfo && needsSubtitleTrack(job.options)) job.options = withSubtitleTrack(job.options, videoInfo)

    let currentRead = await writeVideoInfo(videoInfo, partialFolder)

    const result = await runYtdlp(currentRead)
      .catch((error: unknown) => {
        if (!currentRead || run.stopReason || hasStartedDownloading || error instanceof SubtitlesFailedError) {
          throw error
        }

        engine.forgetVideoInfo(job.options.url)
        currentRead = null

        return startAgain(null)
      })
      .catch((error: unknown) => {
        if (!(error instanceof SubtitlesFailedError) || run.stopReason) throw error

        Object.assign(job, {
          options: { ...job.options, subtitleLanguage: null },
          warning: withoutSubtitlesWarning(job.options, error.message),
        } satisfies Partial<Job>)

        return startAgain(currentRead)
      })

    if (run.stopReason === 'cancel') return

    await finishJob(job, result, history)
  } catch (error) {
    if (run.stopReason) return

    job.status = 'error'
    job.error = errorText(error)
    job.activity = null
  } finally {
    if (run.stopReason === 'cancel' || isFinishedJob(job)) {
      const discarding = jobFolders.discardPartialFiles(job.id)

      if (job.status === 'done') void discarding.catch(ignoreFailure)
      else await discarding
    }
  }
}
