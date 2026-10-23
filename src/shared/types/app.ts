export interface Settings {
  downloadFolder: string
  simultaneousDownloads: number
  lowLatencyRendering: boolean
}

export interface SetupStatus {
  state: 'missing' | 'running' | 'ready' | 'error'
  installed: boolean
  message: string | null
  progress: number | null
  downloadSizeMegabytes: number
}

export interface AppUpdate {
  version: string
  releaseUrl: string
}

export interface AppUpdateResponse {
  currentVersion: string
  update: AppUpdate | null
}

export interface StatusResponse extends Settings {
  appVersion: string
  ytdlpVersion: string | null
  platform: string
  setup: SetupStatus
}

export interface DesktopBridge {
  pickFolder(currentFolder: string): Promise<string | null>
  systemLocale: string | null
}
