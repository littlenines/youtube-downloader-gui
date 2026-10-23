import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import { startDownload } from '@server/services/ytdlp/download-process.js'

export interface DownloadEngine {
  requireTools(): Promise<void>
  startDownload: typeof startDownload
  whenIdle(): void
}

export const appDownloadEngine: DownloadEngine = {
  requireTools: () => toolSetup.requireInstalled(),
  startDownload,
  whenIdle: () => toolSetup.checkForUpdate(),
}
