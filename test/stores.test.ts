import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_DOWNLOAD_FOLDER } from '@server/config.js'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { HttpError } from '@server/lib/http/http-error.js'
import { parseHistory } from '@server/services/stores/history-store.js'
import { parseSavedQueue } from '@server/services/stores/queue-store.js'
import { absoluteFolder, parseSettings } from '@server/services/stores/settings-store.js'

describe('parseSettings', () => {
  it('uses defaults for a missing or invalid file', () => {
    assert.deepEqual(parseSettings(undefined), {
      downloadFolder: DEFAULT_DOWNLOAD_FOLDER,
      simultaneousDownloads: 2,
      lowLatencyRendering: true,
      subscriptionCheckHours: 0,
      laterStartTime: null,
      laterStopTime: null,
    })
    assert.deepEqual(parseSettings({ downloadFolder: 42, simultaneousDownloads: 9 }), {
      downloadFolder: DEFAULT_DOWNLOAD_FOLDER,
      simultaneousDownloads: 2,
      lowLatencyRendering: true,
      subscriptionCheckHours: 0,
      laterStartTime: null,
      laterStopTime: null,
    })
  })

  it('reads settings saved by earlier versions', () => {
    assert.deepEqual(parseSettings({ outDir: '/music', concurrent: 3 }), {
      downloadFolder: '/music',
      simultaneousDownloads: 3,
      lowLatencyRendering: true,
      subscriptionCheckHours: 0,
      laterStartTime: null,
      laterStopTime: null,
    })
  })

  it('accepts only the offered subscription check intervals', () => {
    assert.equal(parseSettings({ subscriptionCheckHours: 6 }).subscriptionCheckHours, 6)
    assert.equal(parseSettings({ subscriptionCheckHours: 0 }).subscriptionCheckHours, 0)
    assert.equal(parseSettings({ subscriptionCheckHours: 5 }).subscriptionCheckHours, 0)
    assert.equal(parseSettings({ subscriptionCheckHours: '24' }).subscriptionCheckHours, 24)
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

describe('parseSavedQueue', () => {
  it('keeps saved downloads with a valid link and validates their options', () => {
    const savedJobs = parseSavedQueue([
      { id: 'a', options: { url: 'https://youtu.be/x', kind: 'video', container: 'mkv' }, title: 'Song', label: 'L' },
      { id: 'b', options: { url: 'not a link' } },
      { options: { url: 'https://youtu.be/y' } },
      'garbage',
    ])

    assert.equal(savedJobs.length, 1)
    assert.equal(savedJobs[0]?.id, 'a')
    assert.equal(savedJobs[0]?.options.container, 'mkv')
    assert.equal(savedJobs[0]?.options.format, 'mp3')
  })

  it('refuses ids that are not a plain name, and folders that are not absolute', () => {
    const savedJobs = parseSavedQueue([
      { id: '..', options: { url: 'https://youtu.be/x' } },
      { id: 'a/../..', options: { url: 'https://youtu.be/x' } },
      { id: 'ok-1', options: { url: 'https://youtu.be/x' }, downloadFolder: 'relative/folder' },
    ])

    assert.deepEqual(
      savedJobs.map((savedJob) => [savedJob.id, savedJob.downloadFolder]),
      [['ok-1', null]],
    )
  })

  it('reads waiting downloads, and ignores a start time that is not a date', () => {
    const savedJobs = parseSavedQueue([
      {
        id: 'later',
        options: { url: 'https://youtu.be/x' },
        later: true,
        startsAt: '2026-10-25T00:00:00.000Z',
        progress: 0.6,
      },
      { id: 'broken', options: { url: 'https://youtu.be/x' }, later: 'yes', startsAt: 'tonight', progress: 7 },
    ])

    assert.deepEqual(
      savedJobs.map(({ id, later, startsAt, progress }) => [id, later, startsAt, progress]),
      [
        ['later', true, '2026-10-25T00:00:00.000Z', 0.6],
        ['broken', false, null, 1],
      ],
    )
  })

  it('reads a missing or damaged file as an empty queue', () => {
    assert.deepEqual(parseSavedQueue(undefined), [])
    assert.deepEqual(parseSavedQueue({}), [])
  })
})
