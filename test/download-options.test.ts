import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { describeDownloadOptions, normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { playlistItemsArgument } from '@server/services/ytdlp/download-arguments.js'

describe('normalizeDownloadRequest', () => {
  it('fills safe defaults', () => {
    const options = normalizeDownloadRequest({ url: ' https://youtu.be/example ' })

    assert.equal(options.url, 'https://youtu.be/example')
    assert.equal(options.kind, 'audio')
    assert.equal(options.format, 'mp3')
    assert.equal(options.container, 'mp4')
    assert.equal(options.resolution, null)
    assert.equal(options.coverArt, true)
  })

  it('rejects unknown formats, containers and resolutions', () => {
    const options = normalizeDownloadRequest({
      url: 'https://x',
      kind: 'video',
      format: 'exe' as never,
      container: 'avi' as never,
      resolution: -5,
    })

    assert.equal(options.format, 'mp3')
    assert.equal(options.container, 'mp4')
    assert.equal(options.resolution, null)
  })
})

describe('playlist selection', () => {
  it('writes runs of positions as ranges', () => {
    assert.equal(playlistItemsArgument([1]), '1')
    assert.equal(playlistItemsArgument([1, 2, 3, 5, 8, 9]), '1-3,5,8-9')
  })

  it('keeps valid positions, sorted and without duplicates', () => {
    const options = normalizeDownloadRequest({ url: 'x', playlist: true, playlistItems: [4, 2, 4, 0, -1, 2.5, 3] })

    assert.deepEqual(options.playlistItems, [2, 3, 4])
  })

  it('downloads the whole playlist when nothing valid was picked, and ignores picks for single videos', () => {
    assert.equal(normalizeDownloadRequest({ url: 'x', playlist: true, playlistItems: [0] }).playlistItems, null)
    assert.equal(normalizeDownloadRequest({ url: 'x', playlist: true }).playlistItems, null)
    assert.equal(normalizeDownloadRequest({ url: 'x', playlistItems: [1, 2] }).playlistItems, null)
  })
})

describe('describeDownloadOptions', () => {
  it('labels jobs', () => {
    assert.equal(describeDownloadOptions(normalizeDownloadRequest({ url: 'x', format: 'flac' })), 'FLAC')
    assert.equal(
      describeDownloadOptions(
        normalizeDownloadRequest({ url: 'x', kind: 'video', resolution: 2160, container: 'mkv' }),
      ),
      '2160p · MKV',
    )
  })
})
