import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { describeDownloadOptions, normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { buildDownloadArguments } from '@server/services/ytdlp/download-arguments.js'
import { argumentsFor, PARTIAL_FOLDER, valueAfter } from './support/download-arguments.js'

describe('buildDownloadArguments: edited tags', () => {
  const tagged = (tags: { artist: string; title: string; album: string }, kind: 'audio' | 'video' = 'audio') =>
    normalizeDownloadRequest({ url: 'https://x', kind, format: 'mp3', tags })

  it('sets each filled-in tag and names the file after them', () => {
    const commandArguments = buildDownloadArguments(tagged({ artist: 'Daft Punk', title: 'Get Lucky', album: '' }), {
      downloadFolder: '/downloads',
      partialFolder: PARTIAL_FOLDER,
    })
    const metadata = commandArguments.filter((_, index) => commandArguments[index - 1] === '--parse-metadata')

    assert.deepEqual(metadata, [
      '%(id&|)sDaft Punk%(id&|)s:(?P<meta_artist>[\\s\\S]+)',
      '%(id&|)sGet Lucky%(id&|)s:(?P<meta_title>[\\s\\S]+)',
    ])
    assert.equal(valueAfter(commandArguments, '-o'), '%(meta_artist,artist&{} - |)s%(meta_title,track,title)s.%(ext)s')
  })

  it('escapes colons and percent signs', () => {
    const commandArguments = buildDownloadArguments(tagged({ artist: '', title: 'Track 1: 100% Live', album: '' }), {
      downloadFolder: '/downloads',
      partialFolder: PARTIAL_FOLDER,
    })

    assert.equal(
      valueAfter(commandArguments, '--parse-metadata'),
      '%(id&|)sTrack 1\\: 100%% Live%(id&|)s:(?P<meta_title>[\\s\\S]+)',
    )
  })

  it('keeps a trailing backslash away from the separator', () => {
    const commandArguments = buildDownloadArguments(tagged({ artist: 'Foo\\', title: '', album: '' }), {
      downloadFolder: '/downloads',
      partialFolder: PARTIAL_FOLDER,
    })

    assert.equal(valueAfter(commandArguments, '--parse-metadata'), '%(id&|)sFoo\\%(id&|)s:(?P<meta_artist>[\\s\\S]+)')
  })

  it('ignores tags for videos and playlists, and empty tags', () => {
    assert.equal(tagged({ artist: 'A', title: 'B', album: '' }, 'video').tags, null)
    assert.equal(
      normalizeDownloadRequest({ url: 'https://x', playlist: true, tags: { artist: 'A', title: 'B', album: '' } }).tags,
      null,
    )
    assert.equal(tagged({ artist: ' ', title: '', album: '' }).tags, null)
  })
})

describe('buildDownloadArguments: clips', () => {
  const clip = { startSeconds: 83, endSeconds: 296.5 }

  it('downloads only the section and names the file after it', () => {
    const commandArguments = argumentsFor({ url: 'https://x', clip })

    assert.equal(valueAfter(commandArguments, '--download-sections'), '*83-296.5')
    assert.ok(!commandArguments.includes('--force-keyframes-at-cuts'))
    assert.match(valueAfter(commandArguments, '-o') ?? '', / \(1m23s-4m57s\)\.%\(ext\)s$/)
  })

  it('cuts video at exact frames', () => {
    const commandArguments = argumentsFor({ url: 'https://x', kind: 'video', clip })

    assert.ok(commandArguments.includes('--force-keyframes-at-cuts'))
    assert.match(valueAfter(commandArguments, '-o') ?? '', /\(1m23s-4m57s\)\.%\(ext\)s$/)
  })

  it('adds the clip to the job label, and ignores clips for playlists', () => {
    assert.equal(
      describeDownloadOptions(normalizeDownloadRequest({ url: 'x', clip })),
      'MP3 · 320 kbps · clip 1:23–4:56.5',
    )
    assert.equal(normalizeDownloadRequest({ url: 'x', playlist: true, clip }).clip, null)
    assert.ok(!argumentsFor({ url: 'https://x' }).includes('--download-sections'))
  })
})
