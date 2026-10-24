import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createSetup, flushPromises } from './support/subscription-fakes.js'

describe('the check schedule', () => {
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
