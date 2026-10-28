import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import { startDownload } from '@server/services/ytdlp/download-process.js'
import { readVideoInfo } from '@server/services/ytdlp/media-info.js'
import { videoInfoCache } from '@server/services/ytdlp/video-info-cache.js'

export interface DownloadEngine {
  requireTools(): Promise<void>
  startDownload: typeof startDownload
  recentVideoInfo(url: string): unknown
  readVideoInfo(url: string, signal: AbortSignal): Promise<unknown>
  forgetVideoInfo(url: string): void
  whenIdle(): void
}

export const appDownloadEngine: DownloadEngine = {
  requireTools: () => toolSetup.requireInstalled(),
  startDownload,
  recentVideoInfo: (url) => videoInfoCache.get(url),
  readVideoInfo,
  forgetVideoInfo: (url) => videoInfoCache.delete(url),
  whenIdle: () => toolSetup.checkForUpdate(),
}
