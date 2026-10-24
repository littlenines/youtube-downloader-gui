import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAXIMUM_AVAILABILITY_ATTEMPTS } from '@server/services/subscriptions/new-videos.js'
import type { VideoAvailability } from '@server/services/subscriptions/video-availability.js'
import { PLAYLIST_TARGET, createSetup, video } from './support/subscription-fakes.js'

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
})
