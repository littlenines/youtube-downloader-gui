import type { SetupStatus } from '@shared/types/app.js'
import { errorText } from '@server/lib/http/http-error.js'
import type { InstallStep } from './install-steps.js'

const ONE_DAY_MILLISECONDS = 24 * 3600 * 1000
const ONE_WEEK_MILLISECONDS = 7 * ONE_DAY_MILLISECONDS

export class ToolsMissingError extends Error {
  constructor() {
    super('The download tools are not installed yet. Click "Download tools" to set them up.')
  }
}

export interface ToolSetupDependencies {
  steps: InstallStep[]
  prepareFolders(): Promise<void>
  updateYtdlp(): Promise<boolean>
  readYtdlpVersion(): Promise<string | null>
  lastSuccessfulUpdateCheck(): number
  recordSuccessfulUpdateCheck(): Promise<void>
  now(): number
}

type SetupProgress = Omit<SetupStatus, 'installed' | 'downloadSizeMegabytes'>

const ignoreFailure = () => {}

export class ToolSetup {
  private readonly progress: SetupProgress = { state: 'missing', message: null, progress: null }
  private runningSetup: Promise<void> | null = null
  private hasSucceeded = false
  private lastUpdateAttempt = Number.NEGATIVE_INFINITY
  private installedYtdlpVersion: string | null = null

  constructor(private readonly dependencies: ToolSetupDependencies) {}

  get ytdlpVersion(): string | null {
    return this.installedYtdlpVersion
  }

  isInstalled(): boolean {
    return this.missingSteps().length === 0
  }

  status(): SetupStatus {
    const missingSteps = this.missingSteps()
    const installed = missingSteps.length === 0

    return {
      ...this.progress,
      state: this.progress.state === 'ready' && !installed ? 'missing' : this.progress.state,
      installed,
      downloadSizeMegabytes: missingSteps.reduce((sum, step) => sum + step.downloadSizeMegabytes, 0),
    }
  }

  ensureInstalled(): Promise<void> {
    if (this.hasSucceeded && !this.isInstalled()) this.runningSetup = null

    this.runningSetup ??= this.runSetup().then(
      () => this.markSucceeded(),
      (error: unknown) => {
        this.markFailed(error)
        throw error
      },
    )

    return this.runningSetup
  }

  initialize(): void {
    if (this.isInstalled()) this.ensureInstalled().catch(ignoreFailure)
  }

  requireInstalled(): Promise<void> {
    if (this.progress.state === 'running' || this.isInstalled()) return this.ensureInstalled()

    return Promise.reject(new ToolsMissingError())
  }

  checkForUpdate(): void {
    if (!this.hasSucceeded || !this.isInstalled() || !this.isUpdateDue()) return

    this.runningSetup = null
    this.ensureInstalled().catch(ignoreFailure)
  }

  private markSucceeded(): void {
    this.hasSucceeded = true
    Object.assign(this.progress, { state: 'ready', message: null, progress: null })
  }

  private markFailed(error: unknown): void {
    this.runningSetup = null
    this.hasSucceeded = false
    Object.assign(this.progress, { state: 'error', message: errorText(error), progress: null })
  }

  private missingSteps(): InstallStep[] {
    return this.dependencies.steps.filter((step) => !step.isInstalled())
  }

  private async runSetup(): Promise<void> {
    this.progress.state = 'running'
    await this.dependencies.prepareFolders()

    const missingSteps = this.missingSteps()

    for (const [stepIndex, step] of missingSteps.entries()) {
      const reportProgress = (fraction: number) => {
        this.progress.message = `Downloading ${step.name} (${stepIndex + 1} of ${missingSteps.length})…`
        this.progress.progress = (stepIndex + Math.min(1, fraction)) / missingSteps.length
      }

      reportProgress(0)
      await step.install(reportProgress)
    }

    await this.updateYtdlpIfDue()
    this.installedYtdlpVersion = await this.dependencies.readYtdlpVersion()
  }

  private isUpdateDue(): boolean {
    const now = this.dependencies.now()

    return (
      now - this.dependencies.lastSuccessfulUpdateCheck() >= ONE_WEEK_MILLISECONDS &&
      now - this.lastUpdateAttempt >= ONE_DAY_MILLISECONDS
    )
  }

  private async updateYtdlpIfDue(): Promise<void> {
    if (!this.isUpdateDue()) return

    this.lastUpdateAttempt = this.dependencies.now()
    Object.assign(this.progress, { message: 'Checking for a yt-dlp update…', progress: null })

    if (await this.dependencies.updateYtdlp()) await this.dependencies.recordSuccessfulUpdateCheck()
  }
}
