import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createUpdaterFakes, settle } from './support/updater-fakes.js'

describe('AppUpdater: Update now', () => {
  it('downloads, installs and restarts', async () => {
    const { calls, updater, host } = createUpdaterFakes()

    updater.enable(host)
    assert.equal(updater.status().canInstall, true)

    await updater.installNow()

    assert.deepEqual(calls, [
      'remove leftovers',
      'download 1.3.0',
      'install /app/.update/download/unpacked/yt-downloader-win-x64',
      'restart',
    ])
    assert.equal(updater.status().state, 'installing')
  })

  it('shows the download progress', async () => {
    let finishDownload = () => {}

    const { updater, host } = createUpdaterFakes({
      downloadUpdate: (_update, onProgress) => {
        onProgress(0.42)

        return new Promise((resolve) => (finishDownload = () => resolve('/new')))
      },
    })

    updater.enable(host)

    const installation = updater.installNow()

    await settle()
    assert.deepEqual([updater.status().state, updater.status().progress], ['downloading', 0.42])

    finishDownload()
    await installation
  })

  it('installs once when clicked twice', async () => {
    const { calls, updater, host } = createUpdaterFakes()

    updater.enable(host)
    await Promise.all([updater.installNow(), updater.installNow()])

    assert.equal(calls.filter((call) => call.startsWith('install')).length, 1)
    assert.equal(calls.filter((call) => call === 'restart').length, 1)
  })

  it('cannot install when the desktop app has not enabled it, or the app is not a release', async () => {
    const fromSource = createUpdaterFakes({ isSupported: false })

    fromSource.updater.enable(fromSource.host)

    assert.equal(fromSource.updater.status().canInstall, false)
    assert.equal(createUpdaterFakes().updater.status().canInstall, false)
    await assert.rejects(createUpdaterFakes().updater.installNow(), /can't install updates/)
  })
})

describe('AppUpdater: failures', () => {
  it('says why the download failed, keeps running and can try again', async () => {
    let attempt = 0
    const { calls, updater, host } = createUpdaterFakes({
      downloadUpdate: async () => {
        attempt++

        if (attempt === 1) throw new Error('The downloaded version 1.3.0 did not match its published checksum.')

        return '/new'
      },
    })

    updater.enable(host)
    await assert.rejects(updater.installNow(), /checksum/)

    assert.deepEqual(updater.status(), {
      canInstall: true,
      installsOnQuit: false,
      state: 'error',
      progress: null,
      message: 'The downloaded version 1.3.0 did not match its published checksum.',
    })
    assert.equal(calls.includes('restart'), false)

    await updater.installNow()
    assert.deepEqual(calls.slice(-2), ['install /new', 'restart'])
  })

  it('does not restart when the files could not be replaced, and downloads again on the next try', async () => {
    let downloads = 0
    let installs = 0
    const { calls, updater, host } = createUpdaterFakes({
      downloadUpdate: async () => `/new-${++downloads}`,
      installUpdate: async () => {
        if (++installs === 1) throw new Error("Couldn't replace ffmpeg.dll (EBUSY), so the current version was kept.")
      },
    })

    updater.enable(host)
    await assert.rejects(updater.installNow(), /current version was kept/)
    assert.equal(updater.status().state, 'error')
    assert.equal(calls.includes('restart'), false)

    await updater.installNow()
    assert.equal(downloads, 2)
    assert.equal(calls.at(-1), 'restart')
  })

  it('says so when there is nothing newer', async () => {
    const { updater, host } = createUpdaterFakes({ findUpdate: async () => null })

    updater.enable(host)
    await assert.rejects(updater.installNow(), /already have the newest version/)
  })

  it('removes the files of an earlier update before downloading again', async () => {
    let finishRemoving = () => {}

    const { calls, updater, host } = createUpdaterFakes({
      removeLeftovers: () => new Promise((resolve) => (finishRemoving = () => resolve())),
    })

    updater.enable(host)

    const installation = updater.installNow()

    await settle()
    assert.deepEqual(calls, [])

    finishRemoving()
    await installation
    assert.equal(calls[0], 'download 1.3.0')
  })
})
