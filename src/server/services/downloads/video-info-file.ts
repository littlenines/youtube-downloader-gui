import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Job } from '@shared/types/downloads.js'
import type { YtdlpInfo } from '@server/services/ytdlp/ytdlp-json.js'
import type { ActiveRun } from './active-runs.js'
import type { DownloadEngine } from './download-engine.js'
import { needsSubtitleTrack } from './subtitle-track-choice.js'

const VIDEO_INFO_FILE_NAME = 'video-info.json'

const readVideoInfo = async (engine: DownloadEngine, job: Job, run: ActiveRun): Promise<unknown> => {
  const reading = new AbortController()

  run.stopProcess = () => reading.abort()

  try {
    const info = await engine.readVideoInfo(job.options.url, reading.signal)

    return (info as YtdlpInfo | null)?.is_live ? null : info
  } catch (error) {
    if (reading.signal.aborted) return null

    throw error
  } finally {
    run.stopProcess = null
  }
}

export const videoInfoFor = async (engine: DownloadEngine, job: Job, run: ActiveRun): Promise<unknown> => {
  if (job.options.playlist) return null

  const recentInfo = engine.recentVideoInfo(job.options.url)

  return recentInfo || !needsSubtitleTrack(job.options) ? recentInfo : readVideoInfo(engine, job, run)
}

export const writeVideoInfo = async (info: unknown, partialFolder: string): Promise<string | null> => {
  if (!info) return null

  const infoFile = join(partialFolder, VIDEO_INFO_FILE_NAME)

  try {
    await writeFile(infoFile, JSON.stringify(info))

    return infoFile
  } catch {
    return null
  }
}
