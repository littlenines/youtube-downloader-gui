import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseMediaInfo } from '@server/services/ytdlp/media-info.js'

const videoOutput = {
  id: 'abc',
  title: 'Test video',
  uploader: 'Someone',
  webpage_url: 'https://www.youtube.com/watch?v=abc',
  thumbnail: 'https://i.ytimg.com/vi/abc/maxresdefault.jpg',
  duration: 200,
  view_count: 1234,
  subtitles: { en: [], live_chat: [] },
  formats: [
    { format_note: 'storyboard', ext: 'mhtml', vcodec: 'none', acodec: 'none' },
    { ext: 'm4a', acodec: 'mp4a.40.2', vcodec: 'none', abr: 129, filesize: 3_000_000 },
    { ext: 'webm', acodec: 'opus', vcodec: 'none', abr: 140, filesize: 3_200_000 },
    { ext: 'mp4', vcodec: 'avc1.640028', acodec: 'none', width: 1920, height: 1080, fps: 60, filesize: 50_000_000 },
    {
      ext: 'webm',
      vcodec: 'vp09.00.51.08',
      acodec: 'none',
      width: 3840,
      height: 2160,
      fps: 60,
      filesize: 400_000_000,
      dynamic_range: 'HDR10',
    },
    { ext: 'mp4', vcodec: 'av01.0.08M.08', acodec: 'none', width: 1920, height: 1080, fps: 60, filesize: 40_000_000 },
    {
      ext: 'mp4',
      vcodec: 'avc1.4d401f',
      acodec: 'none',
      width: 1280,
      height: 720,
      fps: 30,
      filesize_approx: 20_000_000,
    },
    { ext: 'mp4', vcodec: 'avc1', acodec: 'none', width: 1920, height: 1080, fps: 30, format_note: '1080p Premium' },
  ],
}

describe('parseMediaInfo: video', () => {
  const info = parseMediaInfo(videoOutput, 'https://www.youtube.com/watch?v=abc&list=PL123')

  if (info.kind !== 'video') throw new Error('Expected a video.')

  const [ultraHd, fullHd] = info.qualities

  it('lists one row per resolution, best first, with frame rate and codecs', () => {
    assert.deepEqual(
      info.qualities.map((quality) => quality.label),
      ['2160p60', '1080p60', '720p'],
    )
    assert.deepEqual(fullHd?.codecs.sort(), ['AV1', 'H.264'])
    assert.equal(fullHd?.hasH264, true)
    assert.equal(ultraHd?.tag, '4K')
    assert.equal(ultraHd?.hdr, true)
  })

  it('adds the best audio to each size estimate', () => {
    assert.equal(fullHd?.estimatedBytes, 50_000_000 + 3_200_000)
  })

  it('picks the highest-bitrate audio and skips storyboards and Premium formats', () => {
    assert.deepEqual(info.audio, { codec: 'Opus', bitrateKbps: 140, sizeBytes: 3_200_000 })
  })

  it('notices a playlist in the link and ignores live chat as a subtitle', () => {
    assert.equal(info.playlistId, 'PL123')
    assert.deepEqual(info.subtitleLanguages, ['en'])
  })

  it('treats vertical video by its short side (1080x1920 is 1080p)', () => {
    const vertical = parseMediaInfo({ formats: [{ vcodec: 'avc1', width: 1080, height: 1920, fps: 30 }] }, 'https://x')

    assert.equal(vertical.kind === 'video' && vertical.qualities[0]?.label, '1080p')
  })
})

describe('parseMediaInfo: playlist', () => {
  it('summarises the entries and skips unavailable ones', () => {
    const playlist = parseMediaInfo(
      {
        _type: 'playlist',
        title: 'Mix',
        entries: [{ title: 'a', duration: 60, url: 'u1' }, null, { title: 'b', duration: 30, url: 'u2' }],
      },
      'https://x',
    )

    assert.equal(playlist.kind, 'playlist')

    if (playlist.kind !== 'playlist') return

    assert.equal(playlist.videoCount, 2)
    assert.equal(playlist.durationSeconds, 90)
  })

  it('keeps each video at its position in the playlist, counting unavailable ones', () => {
    const playlist = parseMediaInfo(
      { _type: 'playlist', entries: [{ title: 'a', url: 'u1' }, null, { title: 'b', url: 'u2' }] },
      'https://x',
    )

    if (playlist.kind !== 'playlist') return assert.fail('expected a playlist')

    assert.deepEqual(
      playlist.entries.map((entry) => [entry.position, entry.title]),
      [
        [1, 'a'],
        [3, 'b'],
      ],
    )
  })
})
