import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseSubscriptions } from '@server/services/stores/subscription-store.js'
import { parsePlaylistVideos, parseYoutubeFeed } from '@server/services/subscriptions/listed-videos.js'

const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>Channel</title>
 <entry>
  <yt:videoId>abc123DEF45</yt:videoId>
  <title>Rock &amp; Roll &#39;Live&#39; &#x2764;</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=abc123DEF45"/>
  <published>2026-10-17T16:00:18+00:00</published>
  <media:group><media:thumbnail url="https://i1.ytimg.com/vi/abc123DEF45/hqdefault.jpg" width="480" height="360"/></media:group>
 </entry>
 <entry>
  <yt:videoId>short000001</yt:videoId>
  <title>A short</title>
  <link rel="alternate" href="https://www.youtube.com/shorts/short000001"/>
  <published>2026-10-16T16:00:02+00:00</published>
 </entry>
</feed>`

const CHANNEL_ID = 'UCX6OQ3DkcsbYNE6H8uQQuVA'

describe('reading a YouTube channel feed', () => {
  it('reads each upload with its title, picture and date, and marks Shorts', () => {
    const [upload, short] = parseYoutubeFeed(FEED_XML)

    assert.deepEqual(upload, {
      id: 'abc123DEF45',
      url: 'https://www.youtube.com/watch?v=abc123DEF45',
      title: "Rock & Roll 'Live' ❤",
      thumbnailUrl: 'https://i1.ytimg.com/vi/abc123DEF45/hqdefault.jpg',
      publishedAt: '2026-10-17T16:00:18+00:00',
      isShort: false,
    })
    assert.equal(short?.isShort, true)
    assert.equal(short?.url, 'https://www.youtube.com/watch?v=short000001')
  })

  it('reads an empty or unexpected page as no uploads', () => {
    assert.deepEqual(parseYoutubeFeed(''), [])
    assert.deepEqual(parseYoutubeFeed('<html>Error</html>'), [])
  })
})

describe('reading a playlist', () => {
  it('keeps videos and skips missing entries and channel tabs', () => {
    const videos = parsePlaylistVideos({
      entries: [
        { id: 'a', url: 'https://www.youtube.com/watch?v=a', title: 'A' },
        null,
        { _type: 'playlist', id: CHANNEL_ID, title: 'Channel - Shorts' },
        { url: 'https://soundcloud.com/artist/track' },
      ],
    })

    assert.deepEqual(
      videos.map(({ id, title }) => [id, title]),
      [
        ['a', 'A'],
        ['https://soundcloud.com/artist/track', 'https://soundcloud.com/artist/track'],
      ],
    )
  })
})

describe('reading saved subscriptions', () => {
  it('keeps valid entries and drops broken ones', () => {
    const subscriptions = parseSubscriptions([
      {
        id: 'sub-1',
        source: 'channel',
        url: `https://www.youtube.com/channel/${CHANNEL_ID}`,
        channelId: CHANNEL_ID,
        title: 'Channel',
        options: { kind: 'video', resolution: 720, playlist: true, folder: 'a/b' },
        seenVideoIds: ['x', 5],
        retryCounts: { kept: 2, negative: -1, text: 'no' },
        waitingSince: { live: '2026-10-01T00:00:00.000Z', broken: 'not a date' },
        createdAt: '2026-09-01T00:00:00.000Z',
      },
      { id: 'sub-2', source: 'channel', url: 'https://www.youtube.com/channel/bad', channelId: 'bad' },
      { id: 'bad id!', source: 'playlist', url: 'https://www.youtube.com/playlist?list=PL1' },
      'nonsense',
    ])

    assert.equal(subscriptions.length, 1)
    assert.equal(subscriptions[0]?.options.resolution, 720)
    assert.equal(subscriptions[0]?.options.playlist, false)
    assert.equal(subscriptions[0]?.options.folder, 'a b')
    assert.deepEqual(subscriptions[0]?.seenVideoIds, ['x'])
    assert.deepEqual(subscriptions[0]?.retryCounts, { kept: 2 })
    assert.deepEqual(subscriptions[0]?.waitingSince, { live: '2026-10-01T00:00:00.000Z' })
    assert.equal(subscriptions[0]?.publishedAfter, '2026-09-01T00:00:00.000Z')
    assert.deepEqual(parseSubscriptions(undefined), [])
  })
})
