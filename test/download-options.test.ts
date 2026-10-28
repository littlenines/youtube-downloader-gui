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

  it('accepts a subtitle language only as a plain code, never as a pattern or "all"', () => {
    const subtitleLanguageFor = (subtitleLanguage: string, subtitles?: boolean) =>
      normalizeDownloadRequest({
        url: 'https://x',
        kind: 'video',
        subtitleLanguage,
        ...(subtitles ? { subtitles } : {}),
      }).subtitleLanguage

    assert.deepEqual(
      ['zh-Hans', 'en.*', 'all', 'ALL', '-en', 'en,de', ''].map((language) => subtitleLanguageFor(language)),
      ['zh-Hans', null, null, null, null, null, null],
    )
    assert.equal(subtitleLanguageFor('en.*', true), null)
  })

  it('keeps a subtitle language only for a whole video that can hold it, and only a known way to match it', () => {
    const subtitlesFor = (request: Parameters<typeof normalizeDownloadRequest>[0]) => {
      const { subtitleLanguage, subtitleMatch } = normalizeDownloadRequest({ url: 'https://x', ...request })

      return [subtitleLanguage, subtitleMatch]
    }

    assert.deepEqual(
      [
        subtitlesFor({ kind: 'video', subtitleLanguage: 'de', subtitleMatch: 'spoken' }),
        subtitlesFor({ kind: 'audio', subtitleLanguage: 'de' }),
        subtitlesFor({ kind: 'video', container: 'webm', subtitleLanguage: 'de' }),
        subtitlesFor({ kind: 'video', subtitleLanguage: 'de', subtitleMatch: 'any' as never }),
        subtitlesFor({ kind: 'video', subtitleLanguage: 'de', clip: { startSeconds: 60, endSeconds: 70 } }),
        subtitlesFor({
          kind: 'video',
          subtitleLanguage: 'de',
          playlist: true,
          clip: { startSeconds: 60, endSeconds: 70 },
        }),
      ],
      [
        ['de', 'spoken'],
        [null, 'language'],
        [null, 'language'],
        ['de', 'language'],
        [null, 'language'],
        ['de', 'language'],
      ],
    )
  })

  it('embeds subtitles unless a .srt file was asked for, which WebM can have too', () => {
    const formatFor = (request: Parameters<typeof normalizeDownloadRequest>[0]) => {
      const { subtitleLanguage, subtitleFormat } = normalizeDownloadRequest({
        url: 'https://x',
        kind: 'video',
        subtitleLanguage: 'de',
        ...request,
      })

      return [subtitleLanguage, subtitleFormat]
    }

    assert.deepEqual(
      [
        formatFor({}),
        formatFor({ subtitleFormat: 'srt' }),
        formatFor({ subtitleFormat: 'vtt' as never }),
        formatFor({ container: 'webm', subtitleFormat: 'srt' }),
        formatFor({ container: 'webm' }),
      ],
      [
        ['de', 'embedded'],
        ['de', 'srt'],
        ['de', 'embedded'],
        ['de', 'srt'],
        [null, 'embedded'],
      ],
    )
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
