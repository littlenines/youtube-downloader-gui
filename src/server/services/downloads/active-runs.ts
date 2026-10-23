export type StopReason = 'cancel' | 'pause'

export interface ActiveRun {
  stopReason: StopReason | null
  stopProcess: (() => void) | null
}

export class ActiveRuns {
  private readonly runsByJobId = new Map<string, ActiveRun>()

  get count(): number {
    return this.runsByJobId.size
  }

  has(jobId: string): boolean {
    return this.runsByJobId.has(jobId)
  }

  start(jobId: string): ActiveRun {
    const run: ActiveRun = { stopReason: null, stopProcess: null }

    this.runsByJobId.set(jobId, run)

    return run
  }

  finish(jobId: string): void {
    this.runsByJobId.delete(jobId)
  }

  stop(jobId: string, reason: StopReason): void {
    const run = this.runsByJobId.get(jobId)

    if (!run) return

    run.stopReason = reason
    run.stopProcess?.()
  }

  stopAll(reason: StopReason): void {
    for (const jobId of this.runsByJobId.keys()) this.stop(jobId, reason)
  }
}
