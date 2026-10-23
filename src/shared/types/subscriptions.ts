import type { DownloadOptions, DownloadRequest } from './downloads.js'

export type SubscriptionSource = 'channel' | 'playlist'

export interface Subscription {
  id: string
  source: SubscriptionSource
  url: string
  channelId: string | null
  title: string
  thumbnailUrl: string | null
  options: DownloadOptions
  label: string
  skipShorts: boolean
  onlyShorts: boolean
  createdAt: string
  lastCheckedAt: string | null
  lastError: string | null
  downloadedCount: number
}

export interface SubscriptionRequest extends DownloadRequest {
  skipShorts?: boolean
}

export interface SubscriptionsResponse {
  subscriptions: Subscription[]
  isChecking: boolean
  checkIntervalHours: number
}
