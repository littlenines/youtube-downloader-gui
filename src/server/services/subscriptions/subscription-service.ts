import { randomUUID } from 'node:crypto'
import type { DownloadOptions } from '@shared/types/downloads.js'
import type { Subscription, SubscriptionRequest, SubscriptionsResponse } from '@shared/types/subscriptions.js'
import { errorText } from '@server/lib/http/http-error.js'
import { describeDownloadOptions, normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import type { JobDisplayDetails } from '@server/services/downloads/jobs.js'
import type { StoredSubscription, SubscriptionStorage } from '@server/services/stores/subscription-store.js'
import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import { ToolsMissingError } from '@server/services/tools/tool-setup.js'
import { listVideos, type ListedVideo, type VideoSource } from './listed-videos.js'
import {
  hasWaitedTooLong,
  MAXIMUM_AVAILABILITY_ATTEMPTS,
  newestPublishedAt,
  newVideos,
  pendingEntries,
  rememberedVideoIds,
} from './new-videos.js'
import { resolveSubscriptionTarget, type SubscriptionTarget } from './subscription-target.js'
import { checkVideoAvailability, type VideoAvailability } from './video-availability.js'

export interface SubscriptionSources {
  requireTools(): Promise<void>
  resolveTarget(url: string): Promise<SubscriptionTarget>
  listVideos(source: VideoSource): Promise<ListedVideo[]>
  checkAvailability(url: string): Promise<VideoAvailability>
}

export const appSubscriptionSources: SubscriptionSources = {
  requireTools: () => toolSetup.requireInstalled(),
  resolveTarget: resolveSubscriptionTarget,
  listVideos,
  checkAvailability: checkVideoAvailability,
}

export type AddDownload = (options: DownloadOptions, details: JobDisplayDetails) => unknown

export interface SubscriptionServiceDependencies {
  storage: SubscriptionStorage
  addDownload: AddDownload
  checkIntervalHours: () => number
  sources?: SubscriptionSources
}

type NewVideoOutcome = 'downloaded' | 'skipped' | 'waiting'

const START_UP_CHECK_DELAY_MILLISECONDS = 5000
const FAILED_CHECK_RETRY_DELAY_MILLISECONDS = 10 * 60_000
const HOUR_MILLISECONDS = 60 * 60_000

const shortsLabel = (skipShorts: boolean, onlyShorts: boolean): string => {
  if (onlyShorts) return ' · only Shorts'

  return skipShorts ? ' · no Shorts' : ''
}

const isSameTarget = (subscription: StoredSubscription, target: SubscriptionTarget): boolean =>
  subscription.url === target.url && subscription.onlyShorts === target.onlyShorts

const publicSubscription = (stored: StoredSubscription): Subscription => ({
  id: stored.id,
  source: stored.source,
  url: stored.url,
  channelId: stored.channelId,
  title: stored.title,
  thumbnailUrl: stored.thumbnailUrl,
  options: stored.options,
  label: stored.label,
  skipShorts: stored.skipShorts,
  onlyShorts: stored.onlyShorts,
  createdAt: stored.createdAt,
  lastCheckedAt: stored.lastCheckedAt,
  lastError: stored.lastError,
  downloadedCount: stored.downloadedCount,
})

export class SubscriptionService {
  private subscriptions: StoredSubscription[] = []
  private runningCheck: Promise<void> | null = null
  private scheduleTimer: ReturnType<typeof setTimeout> | undefined
  private lastCheckStartedAt: number | null = null
  private hasRetriedFailedCheck = false
  private readonly storage: SubscriptionStorage
  private readonly addDownload: AddDownload
  private readonly checkIntervalHours: () => number
  private readonly sources: SubscriptionSources

  constructor({
    storage,
    addDownload,
    checkIntervalHours,
    sources = appSubscriptionSources,
  }: SubscriptionServiceDependencies) {
    this.storage = storage
    this.addDownload = addDownload
    this.checkIntervalHours = checkIntervalHours
    this.sources = sources
  }

  async load(): Promise<this> {
    this.subscriptions = await this.storage.load()

    return this
  }

  list(): SubscriptionsResponse {
    return {
      subscriptions: this.subscriptions.map(publicSubscription),
      isChecking: this.runningCheck !== null,
      checkIntervalHours: this.checkIntervalHours(),
    }
  }

  async subscribe(request: Partial<SubscriptionRequest> & { url: string }): Promise<Subscription> {
    await this.sources.requireTools()

    const target = await this.sources.resolveTarget(request.url)

    this.refuseDuplicate(target)

    const listedVideos = await this.sources.listVideos(target)

    this.refuseDuplicate(target)

    const options = normalizeDownloadRequest({
      ...request,
      url: target.url,
      playlist: false,
      clip: null,
      tags: null,
      folder: target.title,
    })
    const skipShorts = target.source === 'channel' && !target.onlyShorts && request.skipShorts !== false
    const now = new Date().toISOString()
    const subscription: StoredSubscription = {
      id: randomUUID(),
      ...target,
      options,
      label: `${describeDownloadOptions(options)}${shortsLabel(skipShorts, target.onlyShorts)}`,
      skipShorts,
      createdAt: now,
      lastCheckedAt: now,
      lastError: null,
      downloadedCount: 0,
      publishedAfter: newestPublishedAt(listedVideos),
      seenVideoIds: rememberedVideoIds(
        { source: target.source, publishedAfter: null, seenVideoIds: [] },
        listedVideos,
        listedVideos.map((video) => video.id),
      ),
      retryCounts: {},
      waitingSince: {},
    }

    this.subscriptions = [subscription, ...this.subscriptions]
    await this.save()

    return publicSubscription(subscription)
  }

  async unsubscribe(id: string): Promise<boolean> {
    const remaining = this.subscriptions.filter((subscription) => subscription.id !== id)

    if (remaining.length === this.subscriptions.length) return false

    this.subscriptions = remaining
    await this.save()

    return true
  }

  checkAll(): Promise<void> {
    if (!this.runningCheck) {
      this.lastCheckStartedAt = Date.now()
      this.runningCheck = this.runChecks().finally(() => {
        this.runningCheck = null
      })
    }

    return this.runningCheck
  }

  startSchedule(): void {
    this.scheduleNextCheck(START_UP_CHECK_DELAY_MILLISECONDS)
  }

  restartSchedule(): void {
    if (this.lastCheckStartedAt === null) return

    clearTimeout(this.scheduleTimer)

    if (this.checksOnlyAtStartUp()) return

    const nextCheckAt = this.lastCheckStartedAt + this.checkIntervalMilliseconds()

    this.scheduleNextCheck(Math.max(0, nextCheckAt - Date.now()))
  }

  stopSchedule(): void {
    clearTimeout(this.scheduleTimer)
  }

  private checksOnlyAtStartUp(): boolean {
    return this.checkIntervalHours() <= 0
  }

  private checkIntervalMilliseconds(): number {
    return this.checkIntervalHours() * HOUR_MILLISECONDS
  }

  private scheduleNextCheck(delay: number): void {
    clearTimeout(this.scheduleTimer)
    this.scheduleTimer = setTimeout(() => {
      this.checkAll()
        .catch((error: unknown) => console.warn(`Checking subscriptions failed: ${errorText(error)}`))
        .finally(() => {
          const nextDelay = this.nextCheckDelay()

          if (nextDelay !== null) this.scheduleNextCheck(nextDelay)
        })
    }, delay)
    this.scheduleTimer.unref()
  }

  private nextCheckDelay(): number | null {
    const intervalDelay = this.checksOnlyAtStartUp() ? null : this.checkIntervalMilliseconds()
    const hasFailedCheck = this.subscriptions.some((subscription) => subscription.lastError)

    if (!hasFailedCheck) {
      this.hasRetriedFailedCheck = false

      return intervalDelay
    }

    if (this.hasRetriedFailedCheck) return intervalDelay

    this.hasRetriedFailedCheck = true

    return Math.min(FAILED_CHECK_RETRY_DELAY_MILLISECONDS, intervalDelay ?? Infinity)
  }

  private refuseDuplicate(target: SubscriptionTarget): void {
    const existing = this.subscriptions.find((subscription) => isSameTarget(subscription, target))

    if (existing) throw new Error(`You're already subscribed to “${existing.title}”.`)
  }

  private find(id: string): StoredSubscription | undefined {
    return this.subscriptions.find((subscription) => subscription.id === id)
  }

  private update(id: string, changes: Partial<StoredSubscription>): void {
    this.subscriptions = this.subscriptions.map((subscription) =>
      subscription.id === id ? { ...subscription, ...changes } : subscription,
    )
  }

  private save(): Promise<void> {
    return this.storage.save(this.subscriptions)
  }

  private async saveAfterCheck(): Promise<void> {
    try {
      await this.save()
    } catch (error) {
      console.warn(`Saving subscriptions failed; trying again after the next check: ${errorText(error)}`)
    }
  }

  private async runChecks(): Promise<void> {
    if (!this.subscriptions.length) return

    try {
      await this.sources.requireTools()
    } catch (error) {
      if (error instanceof ToolsMissingError) return

      throw error
    }

    const subscriptionIds = this.subscriptions.map((subscription) => subscription.id)

    for (const id of subscriptionIds) await this.checkSubscription(id)
  }

  private async checkSubscription(id: string): Promise<void> {
    const subscription = this.find(id)

    if (!subscription) return

    const checkedAt = new Date().toISOString()

    try {
      const listedVideos = await this.sources.listVideos(subscription)
      const retryCounts = { ...subscription.retryCounts }
      const waitingSince = { ...subscription.waitingSince }
      const newlySeenVideoIds: string[] = []
      let downloadedCount = 0

      for (const video of newVideos(subscription, listedVideos)) {
        const outcome = await this.handleNewVideo(subscription, video, { retryCounts, waitingSince })

        if (outcome !== 'waiting') newlySeenVideoIds.push(video.id)

        if (outcome === 'downloaded') downloadedCount++
      }

      const seenVideoIds = rememberedVideoIds(subscription, listedVideos, newlySeenVideoIds)

      this.update(id, {
        seenVideoIds,
        retryCounts: pendingEntries(retryCounts, listedVideos, seenVideoIds),
        waitingSince: pendingEntries(waitingSince, listedVideos, seenVideoIds),
        lastCheckedAt: checkedAt,
        lastError: null,
        downloadedCount: subscription.downloadedCount + downloadedCount,
      })
    } catch (error) {
      this.update(id, { lastCheckedAt: checkedAt, lastError: errorText(error) })
    }

    await this.saveAfterCheck()
  }

  private async handleNewVideo(
    subscription: StoredSubscription,
    video: ListedVideo,
    { retryCounts, waitingSince }: Pick<StoredSubscription, 'retryCounts' | 'waitingSince'>,
  ): Promise<NewVideoOutcome> {
    if (subscription.skipShorts && video.isShort) return 'skipped'
    if (subscription.onlyShorts && !video.isShort) return 'skipped'

    const availability = await this.sources.checkAvailability(video.url)

    if (availability === 'never') return 'skipped'
    if (!this.find(subscription.id)) return 'waiting'

    if (availability === 'not-yet') {
      waitingSince[video.id] ??= new Date().toISOString()

      return hasWaitedTooLong(waitingSince[video.id] ?? '', Date.now()) ? 'skipped' : 'waiting'
    }

    if (availability === 'ready') {
      this.addDownload(
        { ...subscription.options, url: video.url },
        { title: video.title, thumbnailUrl: video.thumbnailUrl },
      )

      return 'downloaded'
    }

    const attempts = (retryCounts[video.id] ?? 0) + 1

    retryCounts[video.id] = attempts

    return attempts >= MAXIMUM_AVAILABILITY_ATTEMPTS ? 'skipped' : 'waiting'
  }
}
