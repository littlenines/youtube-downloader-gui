import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createUpdaterFakes, settle } from './support/updater-fakes.js'

describe('AppUpdater: install automatically', () => {
  it('downloads in the background and installs when the app closes, without restarting', async () => {
    const { calls, updater, host, turnOnAutomaticUpdates } = createUpdaterFakes()

    turnOnAutomaticUpdates()
    updater.enable(host)
    await settle()

    assert.deepEqual([updater.status().state, updater.status().installsOnQuit], ['ready', true])

    await updater.installOnQuit()
    assert.deepEqual(calls.slice(-1), ['install /app/.update/download/unpacked/yt-downloader-win-x64'])
    assert.equal(calls.includes('restart'), false)
  })

  it('downloads nothing until it is turned on', async () => {
    const { calls, updater, host, turnOnAutomaticUpdates } = createUpdaterFakes()

    updater.enable(host)
    await settle()
    await updater.installOnQuit()
    assert.deepEqual(calls, ['remove leftovers'])

    turnOnAutomaticUpdates()
    updater.prepareIfAutomatic()
    await settle()
    assert.equal(updater.status().state, 'ready')
  })

  it('stays idle when there is no new version', async () => {
    const { calls, updater, host, turnOnAutomaticUpdates } = createUpdaterFakes({ findUpdate: async () => null })

    turnOnAutomaticUpdates()
    updater.enable(host)
    await settle()

    assert.deepEqual([updater.status().state, updater.status().message], ['idle', null])
    assert.deepEqual(calls, ['remove leftovers'])
  })

  it('does not install on closing once it was turned off again', async () => {
    const { calls, updater, host, turnOnAutomaticUpdates, turnOffAutomaticUpdates } = createUpdaterFakes()

    turnOnAutomaticUpdates()
    updater.enable(host)
    await settle()
    turnOffAutomaticUpdates()

    assert.equal(updater.status().installsOnQuit, false)

    await updater.installOnQuit()
    assert.equal(
      calls.some((call) => call.startsWith('install')),
      false,
    )
  })

  it('installs a ready update right away with Restart now', async () => {
    const { calls, updater, host, turnOnAutomaticUpdates } = createUpdaterFakes()

    turnOnAutomaticUpdates()
    updater.enable(host)
    await settle()
    await updater.installNow()

    assert.equal(calls.filter((call) => call.startsWith('download')).length, 1)
    assert.equal(calls.at(-1), 'restart')
  })
})
