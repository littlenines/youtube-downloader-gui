import { join } from 'node:path'
import { isWebLink } from '@shared/links.js'
import type { Subscription } from '@shared/types/subscriptions.js'
import { DATA_DIRECTORY } from '@server/config.js'
import { JsonFile } from '@server/lib/json-file.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import {
  asRecord,
  numberOrNull,
  stringArray,
  stringOrDefault,
  stringOrNull,
  type StoredRecord,
} from './stored-values.js'

export interface StoredSubscription extends Subscription {
  publishedAfter: string | null
  seenVideoIds: string[]
  retryCounts: Record<string, number>
  waitingSince: Record<string, string>
}

const SUBSCRIPTION_ID_PATTERN = /^[\w-]{1,64}$/
const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/

const parseRetryCounts = (value: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(asRecord(value)).filter(
      (entry): entry is [string, number] => Number.isSafeInteger(entry[1]) && (entry[1] as number) > 0,
    ),
  )

const parseWaitingSince = (value: unknown): Record<string, string> =>
  Object.fromEntries(
    Object.entries(asRecord(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && !Number.isNaN(Date.parse(entry[1])),
    ),
  )

const parseSubscription = (stored: StoredRecord): StoredSubscription | null => {
  const id = stringOrDefault(stored.id, '')
  const url = stringOrDefault(stored.url, '')
  const source = stored.source === 'channel' ? 'channel' : 'playlist'
  const channelId = stringOrNull(stored.channelId)
  const createdAt = stringOrDefault(stored.createdAt, new Date().toISOString())

  if (!SUBSCRIPTION_ID_PATTERN.test(id) || !isWebLink(url)) return null
  if (source === 'channel' && !(channelId && CHANNEL_ID_PATTERN.test(channelId))) return null

  return {
    id,
    source,
    url,
    channelId: source === 'channel' ? channelId : null,
    title: stringOrDefault(stored.title, url),
    thumbnailUrl: stringOrNull(stored.thumbnailUrl),
    options: normalizeDownloadRequest({ ...asRecord(stored.options), url, playlist: false }),
    label: stringOrDefault(stored.label, ''),
    skipShorts: stored.skipShorts === true,
    onlyShorts: source === 'channel' && stored.onlyShorts === true,
    createdAt,
    lastCheckedAt: stringOrNull(stored.lastCheckedAt),
    lastError: stringOrNull(stored.lastError),
    downloadedCount: numberOrNull(stored.downloadedCount) ?? 0,
    publishedAfter: stringOrNull(stored.publishedAfter) ?? createdAt,
    seenVideoIds: stringArray(stored.seenVideoIds),
    retryCounts: parseRetryCounts(stored.retryCounts),
    waitingSince: parseWaitingSince(stored.waitingSince),
  }
}

export const parseSubscriptions = (content: unknown): StoredSubscription[] =>
  Array.isArray(content)
    ? content.map(asRecord).flatMap((stored) => {
        const subscription = parseSubscription(stored)

        return subscription ? [subscription] : []
      })
    : []

export interface SubscriptionStorage {
  load(): Promise<StoredSubscription[]>
  save(subscriptions: StoredSubscription[]): Promise<void>
}

export const subscriptionsFile = (): SubscriptionStorage =>
  new JsonFile(join(DATA_DIRECTORY, 'subscriptions.json'), parseSubscriptions)
