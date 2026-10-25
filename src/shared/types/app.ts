export interface Settings {
  downloadFolder: string
  simultaneousDownloads: number
  lowLatencyRendering: boolean
  notifyWhenFinished: boolean
  installUpdatesAutomatically: boolean
  subscriptionCheckHours: number
  laterStartTime: string | null
  laterStopTime: string | null
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
  tag: string
  releaseUrl: string
}

export interface AppUpdateInstallation {
  canInstall: boolean
  state: 'idle' | 'downloading' | 'ready' | 'installing' | 'error'
  progress: number | null
  message: string | null
  installsOnQuit: boolean
}

export interface AppUpdateResponse {
  currentVersion: string
  update: AppUpdate | null
  installation: AppUpdateInstallation
}

export interface StatusResponse extends Settings {
  appVersion: string
  ytdlpVersion: string | null
  platform: string
  canInstallUpdates: boolean
  setup: SetupStatus
}

export interface DesktopBridge {
  pickFolder(currentFolder: string): Promise<string | null>
  systemLocale: string | null
}
