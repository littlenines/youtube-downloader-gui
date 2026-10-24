import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sanitizeFolderName } from '@server/services/downloads/download-options.js'
import { subscriptionTargetFromInfo } from '@server/services/subscriptions/subscription-target.js'
import { isYoutubeChannelLink, youtubeChannelTab } from '@server/services/ytdlp/youtube-links.js'
import { argumentsFor, valueAfter } from './support/download-arguments.js'

const CHANNEL_ID = 'UCX6OQ3DkcsbYNE6H8uQQuVA'

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
