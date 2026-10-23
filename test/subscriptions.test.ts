import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DownloadOptions } from '@shared/types/downloads.js'
import type { JobDisplayDetails } from '@server/services/downloads/jobs.js'
import type { StoredSubscription } from '@server/services/stores/subscription-store.js'
import type { ListedVideo } from '@server/services/subscriptions/listed-videos.js'
import { MAXIMUM_AVAILABILITY_ATTEMPTS } from '@server/services/subscriptions/new-videos.js'
import { SubscriptionService, type SubscriptionSources } from '@server/services/subscriptions/subscription-service.js'
import type { SubscriptionTarget } from '@server/services/subscriptions/subscription-target.js'
import type { VideoAvailability } from '@server/services/subscriptions/video-availability.js'
import { ToolsMissingError } from '@server/services/tools/tool-setup.js'

const CHANNEL_TARGET: SubscriptionTarget = {
  source: 'channel',
  url: 'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA',
  channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA',
  title: 'Some: Channel',
  thumbnailUrl: null,
  onlyShorts: false,
}

const PLAYLIST_TARGET: SubscriptionTarget = {
  source: 'playlist',
  url: 'https://www.youtube.com/playlist?list=PL123',
  channelId: null,
  title: 'Mix',
  thumbnailUrl: null,
  onlyShorts: false,
}

const video = (id: string, overrides: Partial<ListedVideo> = {}): ListedVideo => ({
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

const createSetup = ({ target = CHANNEL_TARGET, listed = [], availability = () => 'ready' }: TestSetup = {}) => {
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

describe('subscribing', () => {
  it('skips everything already on the channel and saves into a folder named after it', async () => {
    const { service, downloads, lastSaved } = createSetup({ listed: [video('old1'), video('old2')] })
    const subscription = await service.subscribe({
      url: 'https://www.youtube.com/@channel',
      kind: 'audio',
      format: 'mp3',
    })

    await service.checkAll()

    assert.equal(downloads.length, 0)
    assert.equal(subscription.options.folder, 'Some Channel')
    assert.equal(subscription.options.playlist, false)
    assert.equal(subscription.label, 'MP3 · 320 kbps · no Shorts')
    assert.deepEqual(lastSaved()[0]?.seenVideoIds, ['old1', 'old2'])
  })

  it('refuses the same channel twice', async () => {
    const { service } = createSetup()

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    await assert.rejects(service.subscribe({ url: 'https://www.youtube.com/@channel/videos' }), /already subscribed/)
  })

  it('refuses the same channel when two requests arrive at once', async () => {
    const { service, listing } = createSetup()
    let releaseListing = () => {}

    listing.beforeListing = () => new Promise<void>((resolve) => (releaseListing = resolve))

    const first = service.subscribe({ url: 'https://www.youtube.com/@channel' })

    await new Promise((resolve) => setImmediate(resolve))
    listing.beforeListing = async () => {}

    const second = service.subscribe({ url: 'https://www.youtube.com/@channel' })

    await second
    releaseListing()
    await assert.rejects(first, /already subscribed/)
    assert.equal(service.list().subscriptions.length, 1)
  })

  it('follows only Shorts when subscribing from the Shorts tab', async () => {
    const { service, downloads, listing } = createSetup({ target: { ...CHANNEL_TARGET, onlyShorts: true } })
    const subscription = await service.subscribe({ url: 'https://www.youtube.com/@channel/shorts', skipShorts: true })

    listing.videos = [video('regular'), video('short', { isShort: true })]
    await service.checkAll()

    assert.equal(subscription.skipShorts, false)
    assert.equal(subscription.label, 'MP3 · 320 kbps · only Shorts')
    assert.deepEqual(
      downloads.map(({ options }) => options.url),
      ['https://www.youtube.com/watch?v=short'],
    )

    listing.target = CHANNEL_TARGET
    await service.subscribe({ url: 'https://www.youtube.com/@channel' })

    assert.equal(service.list().subscriptions.length, 2)
  })

  it('never skips Shorts for playlists', async () => {
    const { service } = createSetup({ target: PLAYLIST_TARGET })
    const subscription = await service.subscribe({ url: PLAYLIST_TARGET.url, skipShorts: true })

    assert.equal(subscription.skipShorts, false)
  })
})

describe('checking for new videos', () => {
  it('downloads new uploads with the subscription settings, oldest first', async () => {
    const { service, downloads, listing } = createSetup({ listed: [video('old')] })

    await service.subscribe({ url: 'https://www.youtube.com/@channel', kind: 'video', resolution: 1080 })
    listing.videos = [
      video('newer', { publishedAt: new Date(Date.now() + 120_000).toISOString() }),
      video('new'),
      video('old'),
    ]
    await service.checkAll()

    assert.deepEqual(
      downloads.map(({ options }) => options.url),
      ['https://www.youtube.com/watch?v=new', 'https://www.youtube.com/watch?v=newer'],
    )
    assert.equal(downloads[0]?.options.resolution, 1080)
    assert.equal(downloads[0]?.options.folder, 'Some Channel')
    assert.equal(downloads[0]?.details.title, 'Video new')
    assert.equal(service.list().subscriptions[0]?.downloadedCount, 2)

    await service.checkAll()

    assert.equal(downloads.length, 2)
  })

  it('skips Shorts and videos that can never be downloaded, without asking again', async () => {
    const checkedUrls: string[] = []
    const { service, downloads, listing } = createSetup({
      availability: (url) => {
        checkedUrls.push(url)

        return 'never'
      },
    })

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    listing.videos = [video('short', { isShort: true }), video('members')]
    await service.checkAll()
    await service.checkAll()

    assert.equal(downloads.length, 0)
    assert.deepEqual(checkedUrls, ['https://www.youtube.com/watch?v=members'])
  })

  it('waits for premieres and live streams, then downloads them', async () => {
    let availability: VideoAvailability = 'not-yet'
    const { service, downloads, listing } = createSetup({ availability: () => availability })

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    listing.videos = [video('premiere')]

    for (let check = 0; check < MAXIMUM_AVAILABILITY_ATTEMPTS + 2; check++) await service.checkAll()

    assert.equal(downloads.length, 0)

    availability = 'ready'
    await service.checkAll()

    assert.equal(downloads.length, 1)
  })

  it('stops waiting for a stream that is still live after two weeks', async (context) => {
    let calls = 0
    const { service, downloads, listing } = createSetup({
      availability: () => {
        calls++

        return 'not-yet'
      },
    })

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    context.mock.timers.enable({ apis: ['Date'], now: Date.now() })
    listing.videos = [video('radio')]
    await service.checkAll()
    context.mock.timers.tick(15 * 24 * 60 * 60_000)
    await service.checkAll()
    await service.checkAll()

    assert.equal(calls, 2)
    assert.equal(downloads.length, 0)
  })

  it('gives up on a video after repeated unexplained failures', async () => {
    let calls = 0
    const { service, listing } = createSetup({
      availability: () => {
        calls++

        return 'unknown'
      },
    })

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    listing.videos = [video('flaky')]

    for (let check = 0; check < MAXIMUM_AVAILABILITY_ATTEMPTS + 3; check++) await service.checkAll()

    assert.equal(calls, MAXIMUM_AVAILABILITY_ATTEMPTS)
  })

  it('ignores channel videos older than the newest one at subscribing, even if forgotten', async () => {
    const { service, downloads, listing } = createSetup({
      listed: [video('known', { publishedAt: '2026-01-01T00:00:00+00:00' })],
    })

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    listing.videos = [video('ancient', { publishedAt: '2010-01-01T00:00:00+00:00' })]
    await service.checkAll()

    assert.equal(downloads.length, 0)
  })

  it("goes by YouTube's dates, not the computer's clock", async () => {
    const { service, downloads, listing } = createSetup({
      listed: [video('known', { publishedAt: '2026-01-01T00:00:00+00:00' })],
    })

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    listing.videos = [video('newer', { publishedAt: '2026-01-02T00:00:00+00:00' })]
    await service.checkAll()

    assert.equal(downloads.length, 1)
  })

  it('does not download playlist videos again after a listing that missed them', async () => {
    const { service, downloads, listing, lastSaved } = createSetup({
      target: PLAYLIST_TARGET,
      listed: [video('a'), video('b')],
    })

    await service.subscribe({ url: PLAYLIST_TARGET.url })
    listing.videos = []
    await service.checkAll()
    listing.videos = [video('b'), video('c')]
    await service.checkAll()
    listing.videos = [video('a'), video('b'), video('c')]
    await service.checkAll()

    assert.deepEqual(
      downloads.map(({ options }) => options.url),
      ['https://www.youtube.com/watch?v=c'],
    )
    assert.deepEqual(lastSaved()[0]?.seenVideoIds, ['a', 'b', 'c'])
  })

  it('shows a listing error on the subscription and clears it after the next good check', async () => {
    const { service, listing } = createSetup()

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    listing.error = new Error('Downloading failed (HTTP 500).')
    await service.checkAll()

    assert.match(service.list().subscriptions[0]?.lastError ?? '', /HTTP 500/)

    listing.error = null
    await service.checkAll()

    assert.equal(service.list().subscriptions[0]?.lastError, null)
  })

  it('keeps checking the other subscriptions when saving fails, and saves later', async () => {
    const { service, downloads, listing, lastSaved } = createSetup()

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    listing.target = PLAYLIST_TARGET
    await service.subscribe({ url: PLAYLIST_TARGET.url })
    listing.videos = [video('new')]
    listing.saveFails = true
    await service.checkAll()

    assert.equal(downloads.length, 2)

    listing.saveFails = false
    await service.checkAll()

    assert.equal(downloads.length, 2)
    assert.ok(lastSaved().every((subscription) => subscription.seenVideoIds.includes('new')))
  })

  it('does nothing at all without subscriptions', async () => {
    const { service, listing } = createSetup()

    await service.checkAll()

    assert.equal(listing.toolChecks, 0)
  })

  it('does nothing while the tools are missing', async () => {
    const { service, downloads, listing } = createSetup()

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    listing.toolsMissing = true
    listing.videos = [video('new')]
    await service.checkAll()

    assert.equal(downloads.length, 0)
  })

  it('runs one check at a time and reports it while running', async () => {
    const { service } = createSetup()

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })

    const firstCheck = service.checkAll()

    assert.equal(service.checkAll(), firstCheck)
    assert.equal(service.list().isChecking, true)

    await firstCheck

    assert.equal(service.list().isChecking, false)
  })

  it('stops downloading for a subscription removed during a check', async () => {
    const { service, downloads, listing } = createSetup({
      availability: () => {
        void service.unsubscribe(service.list().subscriptions[0]?.id ?? '')

        return 'ready'
      },
    })

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    listing.videos = [video('new')]
    await service.checkAll()

    assert.equal(downloads.length, 0)
    assert.equal(service.list().subscriptions.length, 0)
  })
})

describe('the check schedule', () => {
  const flushPromises = async () => {
    for (let round = 0; round < 20; round++) await new Promise((resolve) => setImmediate(resolve))
  }

  it('checks right after start-up, then at the chosen interval, and moves when the interval changes', async (context) => {
    const { service, listing } = createSetup()

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
    listing.toolChecks = 0
    service.startSchedule()

    context.mock.timers.tick(5000)
    await flushPromises()
    assert.equal(listing.toolChecks, 1)
    assert.equal(service.list().checkIntervalHours, 1)

    context.mock.timers.tick(59 * 60_000)
    await flushPromises()
    assert.equal(listing.toolChecks, 1)

    context.mock.timers.tick(60_000)
    await flushPromises()
    assert.equal(listing.toolChecks, 2)

    listing.checkIntervalHours = 6
    service.restartSchedule()
    context.mock.timers.tick(5 * 60 * 60_000)
    await flushPromises()
    assert.equal(listing.toolChecks, 2)

    context.mock.timers.tick(60 * 60_000)
    await flushPromises()
    assert.equal(listing.toolChecks, 3)

    listing.checkIntervalHours = 1
    context.mock.timers.tick(30 * 60_000)
    service.restartSchedule()
    context.mock.timers.tick(0)
    await flushPromises()
    assert.equal(listing.toolChecks, 3)

    context.mock.timers.tick(30 * 60_000)
    await flushPromises()
    assert.equal(listing.toolChecks, 4)
    service.stopSchedule()
  })

  it('tries once more ten minutes after a failed check, even when checking only at start-up', async (context) => {
    const { service, listing } = createSetup()

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
    listing.toolChecks = 0
    listing.checkIntervalHours = 0
    listing.error = new Error('Downloading failed (HTTP 500).')
    service.startSchedule()

    context.mock.timers.tick(5000)
    await flushPromises()
    context.mock.timers.tick(10 * 60_000)
    await flushPromises()
    assert.equal(listing.toolChecks, 2)

    context.mock.timers.tick(48 * 60 * 60_000)
    await flushPromises()
    assert.equal(listing.toolChecks, 2)
    service.stopSchedule()
  })

  it('applies a new interval chosen while a check is running', async (context) => {
    const { service, listing } = createSetup()
    let releaseListing = () => {}

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
    listing.toolChecks = 0
    listing.checkIntervalHours = 24
    listing.beforeListing = () => new Promise<void>((resolve) => (releaseListing = resolve))

    const runningCheck = service.checkAll()

    await flushPromises()
    listing.checkIntervalHours = 1
    service.restartSchedule()
    releaseListing()
    await runningCheck
    listing.beforeListing = async () => {}

    context.mock.timers.tick(60 * 60_000)
    await flushPromises()
    assert.equal(listing.toolChecks, 2)
    service.stopSchedule()
  })

  it('checks only at start-up by default, and stops repeating when switched back to that', async (context) => {
    const { service, listing } = createSetup()

    await service.subscribe({ url: 'https://www.youtube.com/@channel' })
    context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
    listing.toolChecks = 0
    listing.checkIntervalHours = 0
    service.startSchedule()

    context.mock.timers.tick(5000)
    await flushPromises()
    context.mock.timers.tick(48 * 60 * 60_000)
    await flushPromises()
    assert.equal(listing.toolChecks, 1)

    listing.checkIntervalHours = 1
    service.restartSchedule()
    context.mock.timers.tick(0)
    await flushPromises()
    assert.equal(listing.toolChecks, 2)

    listing.checkIntervalHours = 0
    service.restartSchedule()
    context.mock.timers.tick(48 * 60 * 60_000)
    await flushPromises()
    assert.equal(listing.toolChecks, 2)
    service.stopSchedule()
  })
})
