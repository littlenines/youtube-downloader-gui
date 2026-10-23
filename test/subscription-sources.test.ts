import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sanitizeFolderName } from '@server/services/downloads/download-options.js'
import { parseSubscriptions } from '@server/services/stores/subscription-store.js'
import { parsePlaylistVideos, parseYoutubeFeed } from '@server/services/subscriptions/listed-videos.js'
import { subscriptionTargetFromInfo } from '@server/services/subscriptions/subscription-target.js'
import { availabilityFromError, availabilityFromInfo } from '@server/services/subscriptions/video-availability.js'
import { friendlyErrorMessage } from '@server/services/ytdlp/error-messages.js'
import { isYoutubeChannelLink, youtubeChannelTab } from '@server/services/ytdlp/youtube-links.js'
import { argumentsFor, valueAfter } from './support/download-arguments.js'

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

describe('what a link subscribes to', () => {
  it('turns any form of channel link into the channel', () => {
    const target = subscriptionTargetFromInfo(
      {
        _type: 'playlist',
        extractor_key: 'YoutubeTab',
        channel_id: CHANNEL_ID,
        channel: 'MrBeast',
        title: 'MrBeast - Videos',
        thumbnails: [
          { id: 'banner_uncropped', url: 'banner' },
          { id: 'avatar_uncropped', url: 'avatar' },
          { url: 'x' },
        ],
      },
      'https://www.youtube.com/@MrBeast/videos',
    )

    assert.deepEqual(target, {
      source: 'channel',
      url: `https://www.youtube.com/channel/${CHANNEL_ID}`,
      channelId: CHANNEL_ID,
      title: 'MrBeast',
      thumbnailUrl: 'avatar',
      onlyShorts: false,
    })
  })

  it('treats a link with a playlist as the playlist, even from a channel owner', () => {
    const target = subscriptionTargetFromInfo(
      {
        _type: 'playlist',
        extractor_key: 'YoutubeTab',
        channel_id: CHANNEL_ID,
        title: 'Best of',
        webpage_url: 'https://www.youtube.com/playlist?list=PL1',
      },
      'https://www.youtube.com/watch?v=x&list=PL1',
    )

    assert.equal(target.source, 'playlist')
    assert.equal(target.url, 'https://www.youtube.com/playlist?list=PL1')
    assert.equal(target.channelId, null)
  })

  it('treats an album or other playlist page without list= as a playlist, not its artist channel', () => {
    const target = subscriptionTargetFromInfo(
      { _type: 'playlist', extractor_key: 'YoutubeTab', id: 'MPREb_album', channel_id: CHANNEL_ID, title: 'Album' },
      'https://music.youtube.com/browse/MPREb_album',
    )

    assert.equal(target.source, 'playlist')
  })

  it('follows only Shorts from the Shorts tab', () => {
    const info = { _type: 'playlist', extractor_key: 'YoutubeTab', channel_id: CHANNEL_ID, channel: 'Channel' }

    assert.equal(subscriptionTargetFromInfo(info, 'https://www.youtube.com/@channel/shorts').onlyShorts, true)
    assert.equal(subscriptionTargetFromInfo(info, 'https://www.youtube.com/@channel/videos').onlyShorts, false)
  })

  it('refuses a single video', () => {
    assert.throws(
      () => subscriptionTargetFromInfo({ id: 'x', title: 'One video' }, 'https://youtu.be/x'),
      /channel or playlist link/,
    )
  })
})

describe('recognizing channel links', () => {
  it('knows every form of channel link, with or without a tab', () => {
    for (const url of [
      'https://www.youtube.com/@MrBeast',
      'https://youtube.com/@MrBeast/videos',
      'https://m.youtube.com/@MrBeast/shorts?view=0',
      `https://www.youtube.com/channel/${CHANNEL_ID}`,
      `https://music.youtube.com/channel/${CHANNEL_ID}`,
      'https://www.youtube.com/c/SomeName',
      'https://www.youtube.com/user/SomeName/',
      'https://www.youtube.com/@MrBeast/live',
      `https://www.youtube.com/channel/${CHANNEL_ID}/search?query=cars`,
    ]) {
      assert.equal(isYoutubeChannelLink(url), true, url)
    }
  })

  it('does not mistake videos and playlists for channels', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=abc',
      'https://www.youtube.com/playlist?list=PL1',
      'https://www.youtube.com/@MrBeast/videos?list=PL1',
      'https://youtu.be/abc',
      'https://www.youtube.com/@MrBeast/community/extra',
      'https://music.youtube.com/browse/MPREb_album',
    ]) {
      assert.equal(isYoutubeChannelLink(url), false, url)
    }
  })

  it('reads the tab of a channel link', () => {
    assert.equal(youtubeChannelTab('https://www.youtube.com/@MrBeast/Shorts'), 'shorts')
    assert.equal(youtubeChannelTab(`https://www.youtube.com/channel/${CHANNEL_ID}/videos`), 'videos')
    assert.equal(youtubeChannelTab('https://www.youtube.com/@MrBeast'), null)
    assert.equal(youtubeChannelTab('https://www.youtube.com/watch?v=abc'), null)
  })
})

describe('whether a new video can be downloaded yet', () => {
  it('waits for premieres and live streams, and skips restricted videos', () => {
    assert.equal(availabilityFromInfo({ live_status: 'is_upcoming' }), 'not-yet')
    assert.equal(availabilityFromInfo({ live_status: 'post_live' }), 'not-yet')
    assert.equal(availabilityFromInfo({ availability: 'subscriber_only' }), 'never')
    assert.equal(availabilityFromInfo({ live_status: 'not_live', availability: 'public' }), 'ready')
  })

  it('reads yt-dlp errors', () => {
    assert.equal(availabilityFromError('Premieres in 3 hours'), 'not-yet')
    assert.equal(availabilityFromError('This live stream has not started yet.'), 'not-yet')
    assert.equal(availabilityFromError('This video is for channel members only.'), 'never')
    assert.equal(availabilityFromError('This video is private.'), 'never')
    assert.equal(availabilityFromError('YouTube is rate-limiting this connection.'), 'unknown')
    assert.equal(availabilityFromError('Join this channel to get access to members-only content'), 'never')
    assert.equal(availabilityFromError('Sign in to confirm your age'), 'never')
  })

  it("treats YouTube's temporary refusal as worth retrying, not as a removed video", () => {
    const refusal = friendlyErrorMessage(
      "ERROR: [youtube] abc: Video unavailable. This content isn't available, try again later.",
    )

    assert.doesNotMatch(refusal, /removed/)
    assert.equal(availabilityFromError(refusal), 'unknown')
    assert.equal(availabilityFromError(friendlyErrorMessage('ERROR: [youtube] abc: Video unavailable')), 'never')
  })
})

describe('folders for subscriptions', () => {
  it('turns a title into one safe folder name', () => {
    assert.equal(sanitizeFolderName('AC/DC: "Live" <2026>?'), 'AC DC Live 2026')
    assert.equal(sanitizeFolderName('../..'), null)
    assert.equal(sanitizeFolderName('Name... '), 'Name')
    assert.equal(sanitizeFolderName('CON'), 'CON_')
    assert.equal(sanitizeFolderName('Con.Air'), 'Con_.Air')
    assert.equal(sanitizeFolderName('Console'), 'Console')
    assert.equal(sanitizeFolderName('   '), null)
    assert.equal(sanitizeFolderName(42), null)
    assert.equal(sanitizeFolderName(`${'a'.repeat(99)}😀😀`), `${'a'.repeat(99)}😀`)
  })

  it('puts downloads in the folder and escapes it for yt-dlp', () => {
    const audioArguments = argumentsFor({ url: 'https://x', kind: 'audio', folder: '100% Hits' })
    const videoArguments = argumentsFor({ url: 'https://x', kind: 'video', folder: 'Channel' })

    assert.match(valueAfter(audioArguments, '-o') ?? '', /^100%% Hits\/%\(artist/)
    assert.match(valueAfter(videoArguments, '-o') ?? '', /^Channel\/%\(title\)s/)
    assert.match(valueAfter(argumentsFor({ url: 'https://x' }), '-o') ?? '', /^%\(artist/)
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
