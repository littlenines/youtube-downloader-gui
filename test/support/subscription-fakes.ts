import type { DownloadOptions } from '@shared/types/downloads.js'
import type { JobDisplayDetails } from '@server/services/downloads/jobs.js'
import type { StoredSubscription } from '@server/services/stores/subscription-store.js'
import type { ListedVideo } from '@server/services/subscriptions/listed-videos.js'
import { SubscriptionService, type SubscriptionSources } from '@server/services/subscriptions/subscription-service.js'
import type { SubscriptionTarget } from '@server/services/subscriptions/subscription-target.js'
import type { VideoAvailability } from '@server/services/subscriptions/video-availability.js'
import { ToolsMissingError } from '@server/services/tools/tool-setup.js'

export const CHANNEL_TARGET: SubscriptionTarget = {
  source: 'channel',
  url: 'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA',
  channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA',
  title: 'Some: Channel',
  thumbnailUrl: null,
  onlyShorts: false,
}

export const PLAYLIST_TARGET: SubscriptionTarget = {
  source: 'playlist',
  url: 'https://www.youtube.com/playlist?list=PL123',
  channelId: null,
  title: 'Mix',
  thumbnailUrl: null,
  onlyShorts: false,
}

export const video = (id: string, overrides: Partial<ListedVideo> = {}): ListedVideo => ({
  id,
  url: `https://www.youtube.com/watch?v=${id}`,
  title: `Video ${id}`,
  thumbnailUrl: null,
  publishedAt: new Date(Date.now() + 60_000).toISOString(),
  isShort: false,
  ...overrides,
})

interface TestSetup {
  target?: SubscriptionTarget
  listed?: ListedVideo[]
  availability?: (url: string) => VideoAvailability
}

export const createSetup = ({ target = CHANNEL_TARGET, listed = [], availability = () => 'ready' }: TestSetup = {}) => {
  const downloads: { options: DownloadOptions; details: JobDisplayDetails }[] = []
  const saved: StoredSubscription[][] = []
  const listing = {
    target,
    videos: listed,
    error: null as Error | null,
    toolsMissing: false,
    saveFails: false,
    beforeListing: async () => {},
    checkIntervalHours: 1,
    toolChecks: 0,
  }
  const sources: SubscriptionSources = {
    requireTools: async () => {
      listing.toolChecks++

      if (listing.toolsMissing) throw new ToolsMissingError()
    },
    resolveTarget: async () => listing.target,
    listVideos: async () => {
      await listing.beforeListing()

      if (listing.error) throw listing.error

      return listing.videos
    },
    checkAvailability: async (url) => availability(url),
  }
  const storage = {
    load: async () => [],
    save: async (subscriptions: StoredSubscription[]) => {
      if (listing.saveFails) throw new Error('EPERM: operation not permitted, rename')

      saved.push(subscriptions)
    },
  }
  const service = new SubscriptionService({
    storage,
    addDownload: (options, details) => downloads.push({ options, details }),
    checkIntervalHours: () => listing.checkIntervalHours,
    sources,
  })

  return { service, downloads, listing, lastSaved: () => saved.at(-1) ?? [] }
}

export const flushPromises = async (): Promise<void> => {
  for (let round = 0; round < 20; round++) await new Promise((resolve) => setImmediate(resolve))
}
