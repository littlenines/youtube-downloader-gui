import type { AppUpdate, AppUpdateInstallation } from '@shared/types/app.js'
import { errorText } from '@server/lib/http/http-error.js'
import { ignoreFailure } from '@server/lib/ignore-failure.js'

export interface AppUpdaterDependencies {
  isSupported: boolean
  findUpdate(): Promise<AppUpdate | null>
  downloadUpdate(update: AppUpdate, onProgress: (fraction: number) => void): Promise<string>
  installUpdate(newAppFolder: string): Promise<void>
  removeLeftovers(): Promise<void>
}

export interface UpdateHost {
  installsAutomatically(): boolean
  restart(): Promise<void>
}

type InstallationProgress = Omit<AppUpdateInstallation, 'canInstall' | 'installsOnQuit'>

export class AppUpdater {
  private progress: InstallationProgress = { state: 'idle', progress: null, message: null }
  private host: UpdateHost | null = null
  private leftoversRemoved: Promise<void> = Promise.resolve()
  private preparedUpdate: Promise<string> | null = null
  private runningInstallation: Promise<void> | null = null

  constructor(private readonly dependencies: AppUpdaterDependencies) {}

  status(): AppUpdateInstallation {
    return { canInstall: this.host !== null, installsOnQuit: this.willInstallOnQuit(), ...this.progress }
  }

  enable(host: UpdateHost): void {
    if (!this.dependencies.isSupported) return

    this.host = host
    this.leftoversRemoved = this.dependencies.removeLeftovers().catch(ignoreFailure)
    this.prepareIfAutomatic()
  }

  prepareIfAutomatic(): void {
    if (!this.host?.installsAutomatically()) return

    this.dependencies
      .findUpdate()
      .then((update) => (update ? this.prepare() : null))
      .catch(ignoreFailure)
  }

  installNow(): Promise<void> {
    this.runningInstallation ??= this.prepareAndInstall().finally(() => (this.runningInstallation = null))

    return this.runningInstallation
  }

  async installOnQuit(): Promise<void> {
    if (!this.willInstallOnQuit() || !this.preparedUpdate) return

    try {
      await this.dependencies.installUpdate(await this.preparedUpdate)
    } catch (error) {
      console.warn(`Installing the new app version failed: ${errorText(error)}`)
    }
  }

  private willInstallOnQuit(): boolean {
    return this.progress.state === 'ready' && this.host?.installsAutomatically() === true
  }

  private async prepareAndInstall(): Promise<void> {
    const host = this.host

    if (!host) throw new Error("This copy of the app can't install updates.")

    const newAppFolder = await this.prepare()

    this.setProgress({ state: 'installing', progress: null, message: null })

    try {
      await this.dependencies.installUpdate(newAppFolder)
    } catch (error) {
      this.preparedUpdate = null
      this.fail(error)
      throw error
    }

    await host.restart()
  }

  private prepare(): Promise<string> {
    this.preparedUpdate ??= this.download().then(
      (newAppFolder) => {
        this.setProgress({ state: 'ready', progress: null, message: null })

        return newAppFolder
      },
      (error: unknown) => {
        this.preparedUpdate = null
        this.fail(error)
        throw error
      },
    )

    return this.preparedUpdate
  }

  private async download(): Promise<string> {
    this.setProgress({ state: 'downloading', progress: 0, message: null })
    await this.leftoversRemoved

    const update = await this.dependencies.findUpdate()

    if (!update) throw new Error('You already have the newest version.')

    return this.dependencies.downloadUpdate(update, (fraction) => {
      if (this.progress.state === 'downloading') this.progress.progress = fraction
    })
  }

  private setProgress(progress: InstallationProgress): void {
    this.progress = progress
  }

  private fail(error: unknown): void {
    this.setProgress({ state: 'error', progress: null, message: errorText(error) })
  }
}
