import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { choosePreviewFormat } from '@server/services/preview/preview-format.js'
import { parseOutputLine } from '@server/services/ytdlp/download-events.js'
import { friendlyErrorMessage } from '@server/services/ytdlp/error-messages.js'
import { parseSearchResults, searchArguments } from '@server/services/ytdlp/search.js'

describe('friendlyErrorMessage', () => {
  it('turns yt-dlp errors into plain sentences', () => {
    assert.match(friendlyErrorMessage('ERROR: [youtube] abc: Sign in to confirm your age'), /age-restricted/)
    assert.match(friendlyErrorMessage('ERROR: [youtube] abc: Private video. Sign in'), /private/)
    assert.equal(
      friendlyErrorMessage('WARNING: something\nERROR: [generic] Unsupported URL: https://x'),
      'That link is not a video yt-dlp supports.',
    )
  })

  it('falls back to the last line when there is no error line', () => {
    assert.equal(friendlyErrorMessage('first\nsomething broke\n'), 'something broke')
  })
})

describe('parseSearchResults', () => {
  it('turns flat search entries into results', () => {
    const [result] = parseSearchResults({
      entries: [
        {
          id: 'abc',
          title: 'Song',
          channel: 'Band',
          duration: 200,
          view_count: 5,
          thumbnails: [{ url: 'small.jpg' }, { url: 'large.jpg' }],
        },
        null,
      ],
    })

    assert.deepEqual(result, {
      kind: 'video',
      title: 'Song',
      url: 'https://www.youtube.com/watch?v=abc',
      channel: 'Band',
      durationSeconds: 200,
      viewCount: 5,
      thumbnailUrl: 'large.jpg',
      isVerified: false,
    })
  })

  it('marks verified and Topic channels as verified, and tells playlists apart', () => {
    const results = parseSearchResults({
      entries: [
        { id: 'verified', channel: 'Band', channel_is_verified: true },
        { id: 'topic', channel: 'Band - Topic' },
        { id: 'fan', channel: 'Band Topic Fans' },
        { id: 'PLalbum', ie_key: 'YoutubeTab', url: 'https://www.youtube.com/playlist?list=PLalbum' },
        { id: 'mix', url: 'https://www.youtube.com/watch?v=abc&list=RDabc' },
        { id: 'PLnoLink', ie_key: 'YoutubeTab' },
      ],
    })

    assert.deepEqual(
      results.map(({ kind, isVerified }) => [kind, isVerified]),
      [
        ['video', true],
        ['video', true],
        ['video', false],
        ['playlist', false],
        ['playlist', false],
        ['playlist', false],
      ],
    )
    assert.equal(results[3]?.url, 'https://www.youtube.com/playlist?list=PLalbum')
    assert.equal(results[5]?.url, 'https://www.youtube.com/playlist?list=PLnoLink')
  })
})

describe('searchArguments', () => {
  it("searches videos with ytsearch, and playlists with YouTube's playlist filter", () => {
    assert.deepEqual(searchArguments('daft punk', 'video'), ['-J', '--flat-playlist', '--', 'ytsearch30:daft punk'])
    assert.deepEqual(searchArguments('daft punk & co', 'playlist'), [
      '-J',
      '--flat-playlist',
      '--playlist-items',
      '1:30',
      '--',
      'https://www.youtube.com/results?search_query=daft+punk+%26+co&sp=EgIQAw%3D%3D',
    ])
  })
})

describe('choosePreviewFormat', () => {
  it('prefers a stream with picture and sound, up to 720p', () => {
    const choice = choosePreviewFormat([
      { format_id: '18', url: 'u18', protocol: 'https', vcodec: 'avc1', acodec: 'mp4a', height: 360 },
      { format_id: '137', url: 'u137', protocol: 'https', vcodec: 'avc1', acodec: 'none', height: 1080 },
      { format_id: 'hls', url: 'uhls', protocol: 'm3u8_native', vcodec: 'avc1', acodec: 'mp4a', height: 720 },
    ])

    assert.deepEqual([choice?.kind, choice?.format.format_id], ['video', '18'])
  })

  it('otherwise picks plain stereo M4A audio', () => {
    const choice = choosePreviewFormat([
      { format_id: '140-drc', url: 'a', protocol: 'https', vcodec: 'none', acodec: 'mp4a', ext: 'm4a', abr: 129 },
      {
        format_id: '258',
        url: 'b',
        protocol: 'https',
        vcodec: 'none',
        acodec: 'mp4a',
        ext: 'm4a',
        abr: 388,
        audio_channels: 6,
      },
      { format_id: '251', url: 'c', protocol: 'https', vcodec: 'none', acodec: 'opus', ext: 'webm', abr: 140 },
      { format_id: '140', url: 'd', protocol: 'https', vcodec: 'none', acodec: 'mp4a', ext: 'm4a', abr: 129 },
    ])

    assert.deepEqual([choice?.kind, choice?.format.format_id], ['audio', '140'])
  })

  it('returns nothing when no stream can be played directly', () => {
    assert.equal(choosePreviewFormat([{ url: 'x', protocol: 'm3u8_native', vcodec: 'avc1', acodec: 'mp4a' }]), null)
  })
})

describe('parseOutputLine', () => {
  it('tells picture, sound, combined and other streams apart by their codecs', () => {
    const streamOf = (line: string) => {
      const event = parseOutputLine(line)

      return event?.type === 'progress' ? event.stream : null
    }

    assert.equal(streamOf('VPROG av01.0.01M.08|none|1000|5000|200|20'), 'picture')
    assert.equal(streamOf('VPROG none|mp4a.40.2|1000|5000|200|20'), 'sound')
    assert.equal(streamOf('VPROG avc1|mp4a.40.2|1000|5000|200|20'), 'combined')
    assert.equal(streamOf('VPROG NA|NA|440|NA|NA|NA'), 'other')
  })

  it('reads the numbers, treating NA as unknown', () => {
    assert.deepEqual(parseOutputLine('VPROG none|opus|1000|NA|250.5|NA'), {
      type: 'progress',
      stream: 'sound',
      downloadedBytes: 1000,
      totalBytes: null,
      bytesPerSecond: 250.5,
      secondsLeft: null,
    })
  })

  it('reads items, keeping a "|" inside the title, and finished files', () => {
    assert.deepEqual(parseOutputLine('VITEM 2|10|Song | Live'), {
      type: 'item',
      index: 2,
      count: 10,
      title: 'Song | Live',
    })
    assert.deepEqual(parseOutputLine('VFILE /music/Song.mp3'), { type: 'file', file: '/music/Song.mp3' })
    assert.equal(parseOutputLine('[download] something else'), null)
  })
})
