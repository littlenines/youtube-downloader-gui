import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PLAYLIST_TARGET, createSetup, video } from './support/subscription-fakes.js'

describe('running checks', () => {
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
