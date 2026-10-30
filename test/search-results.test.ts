import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseSearchResults, searchArguments } from '@server/services/ytdlp/search.js'

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

  it('drops a length or view count that is not a number, since the page shows them as they are', () => {
    const [result] = parseSearchResults({
      entries: [{ id: 'abc', title: 'Song', duration: '3:20', view_count: '<b>many</b>' }],
    })

    assert.deepEqual([result?.durationSeconds, result?.viewCount], [null, null])
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
    assert.deepEqual(searchArguments('the examples', 'video'), [
      '-J',
      '--flat-playlist',
      '--',
      'ytsearch30:the examples',
    ])
    assert.deepEqual(searchArguments('the examples & co', 'playlist'), [
      '-J',
      '--flat-playlist',
      '--playlist-items',
      '1:30',
      '--',
      'https://www.youtube.com/results?search_query=the+examples+%26+co&sp=EgIQAw%3D%3D',
    ])
  })
})
