import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import { startDownload } from '@server/services/ytdlp/download-process.js'
import { videoInfoCache } from '@server/services/ytdlp/video-info-cache.js'

export interface DownloadEngine {
  requireTools(): Promise<void>
  startDownload: typeof startDownload
  recentVideoInfo(url: string): unknown
  forgetVideoInfo(url: string): void
  whenIdle(): void
}

export const appDownloadEngine: DownloadEngine = {
  requireTools: () => toolSetup.requireInstalled(),
  startDownload,
  recentVideoInfo: (url) => videoInfoCache.get(url),
  forgetVideoInfo: (url) => videoInfoCache.delete(url),
  whenIdle: () => toolSetup.checkForUpdate(),
}
