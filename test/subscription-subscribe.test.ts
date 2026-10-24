import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CHANNEL_TARGET, PLAYLIST_TARGET, createSetup, video } from './support/subscription-fakes.js'

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
