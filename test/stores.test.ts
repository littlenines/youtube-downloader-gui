import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_DOWNLOAD_FOLDER } from '@server/config.js'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { HttpError } from '@server/lib/http/http-error.js'
import { parseHistory } from '@server/services/stores/history-store.js'
import { absoluteFolder, parseSettings } from '@server/services/stores/settings-store.js'

describe('parseSettings', () => {
  it('uses defaults for a missing or invalid file', () => {
    assert.deepEqual(parseSettings(undefined), {
      downloadFolder: DEFAULT_DOWNLOAD_FOLDER,
      simultaneousDownloads: 2,
      lowLatencyRendering: true,
    })
    assert.deepEqual(parseSettings({ downloadFolder: 42, simultaneousDownloads: 9 }), {
      downloadFolder: DEFAULT_DOWNLOAD_FOLDER,
      simultaneousDownloads: 2,
      lowLatencyRendering: true,
    })
  })

  it('reads settings saved by earlier versions', () => {
    assert.deepEqual(parseSettings({ outDir: '/music', concurrent: 3 }), {
      downloadFolder: '/music',
      simultaneousDownloads: 3,
      lowLatencyRendering: true,
    })
  })
})

describe('parseHistory', () => {
  it('reads entries saved by earlier versions', () => {
    const [entry] = parseHistory([
      {
        id: 'a',
        title: 'Song',
        thumbnail: 'https://i/1.jpg',
        label: 'MP3',
        files: ['/music/Song.mp3'],
        size: 1000,
        finishedAt: '2026-10-22T00:00:00Z',
        url: 'https://x',
      },
    ])

    assert.equal(entry?.thumbnailUrl, 'https://i/1.jpg')
    assert.equal(entry?.sizeBytes, 1000)
  })

  it('ignores content that is not a list', () => {
    assert.deepEqual(parseHistory({ not: 'a list' }), [])
  })
})

describe('absoluteFolder', () => {
  it('accepts full paths and expands "~" to the home folder', () => {
    assert.equal(absoluteFolder(join(homedir(), 'Music')), join(homedir(), 'Music'))
    assert.equal(absoluteFolder(' "~/Music" '), join(homedir(), 'Music'))
  })

  it('refuses relative paths, which would depend on where the app was started from', () => {
    assert.throws(
      () => absoluteFolder('Music'),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    )
  })
})

describe('parseSettings: rendering', () => {
  it('uses low-latency rendering unless it was turned off', () => {
    assert.equal(parseSettings(undefined).lowLatencyRendering, true)
    assert.equal(parseSettings({ lowLatencyRendering: false }).lowLatencyRendering, false)
  })
})
