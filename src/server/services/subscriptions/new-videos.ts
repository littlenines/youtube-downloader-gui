import type { SubscriptionSource } from '@shared/types/subscriptions.js'
import type { ListedVideo } from './listed-videos.js'

export const MAXIMUM_NEW_VIDEOS_PER_CHECK = 15
export const MAXIMUM_REMEMBERED_CHANNEL_VIDEOS = 200
export const MAXIMUM_REMEMBERED_PLAYLIST_VIDEOS = 5000
export const MAXIMUM_AVAILABILITY_ATTEMPTS = 6
export const MAXIMUM_WAITING_DAYS = 14

const DAY_MILLISECONDS = 24 * 60 * 60_000

export interface CheckState {
  source: SubscriptionSource
  publishedAfter: string | null
  seenVideoIds: string[]
}

const isPublishedSince = (video: ListedVideo, since: string | null): boolean =>
  !since || !video.publishedAt || Date.parse(video.publishedAt) >= Date.parse(since)

const byPublishedDate = (first: ListedVideo, second: ListedVideo): number =>
  Date.parse(first.publishedAt ?? '') - Date.parse(second.publishedAt ?? '')

export const newestPublishedAt = (listedVideos: ListedVideo[]): string | null =>
  listedVideos.reduce<string | null>(
    (newest, { publishedAt }) =>
      publishedAt && (!newest || Date.parse(publishedAt) > Date.parse(newest)) ? publishedAt : newest,
    null,
  )

export const newVideos = (state: CheckState, listedVideos: ListedVideo[]): ListedVideo[] => {
  const seenVideoIds = new Set(state.seenVideoIds)
  const unseenVideos = listedVideos.filter((video) => !seenVideoIds.has(video.id))
  const candidates =
    state.source === 'channel'
      ? unseenVideos.filter((video) => isPublishedSince(video, state.publishedAfter)).sort(byPublishedDate)
      : unseenVideos

  return candidates.slice(0, MAXIMUM_NEW_VIDEOS_PER_CHECK)
}

export const rememberedVideoIds = (
  state: CheckState,
  listedVideos: ListedVideo[],
  newlySeenVideoIds: string[],
): string[] => {
  const newlySeen = new Set(newlySeenVideoIds)
  const earlierSeen = state.seenVideoIds.filter((videoId) => !newlySeen.has(videoId))

  if (state.source === 'channel') {
    return [...newlySeenVideoIds, ...earlierSeen].slice(0, MAXIMUM_REMEMBERED_CHANNEL_VIDEOS)
  }

  const allSeen = new Set([...newlySeenVideoIds, ...earlierSeen])
  const listedSeen = listedVideos.map((video) => video.id).filter((videoId) => allSeen.has(videoId))
  const listed = new Set(listedSeen)
  const unlistedSeen = [...allSeen].filter((videoId) => !listed.has(videoId))

  return [...listedSeen, ...unlistedSeen].slice(0, MAXIMUM_REMEMBERED_PLAYLIST_VIDEOS)
}

export const pendingEntries = <Value>(
  entries: Record<string, Value>,
  listedVideos: ListedVideo[],
  seenVideoIds: string[],
): Record<string, Value> => {
  const listedVideoIds = new Set(listedVideos.map((video) => video.id))
  const seen = new Set(seenVideoIds)

  return Object.fromEntries(
    Object.entries(entries).filter(([videoId]) => listedVideoIds.has(videoId) && !seen.has(videoId)),
  )
}

export const hasWaitedTooLong = (waitingSince: string, now: number): boolean =>
  now - Date.parse(waitingSince) > MAXIMUM_WAITING_DAYS * DAY_MILLISECONDS
