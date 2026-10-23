import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { describeDownloadOptions, normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { buildDownloadArguments, playlistItemsArgument } from '@server/services/ytdlp/download-arguments.js'

const valueAfter = (commandArguments: string[], flag: string) => commandArguments[commandArguments.indexOf(flag) + 1]
const PARTIAL_FOLDER = '/downloads/.yt-downloader-partial/job-1'
const argumentsFor = (request: Parameters<typeof normalizeDownloadRequest>[0]) =>
  buildDownloadArguments(normalizeDownloadRequest(request), {
    downloadFolder: '/downloads',
    partialFolder: PARTIAL_FOLDER,
  })

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

describe('buildDownloadArguments: audio', () => {
  it('MP3 is a constant 320 kbps encode with square cover art and artist names', () => {
    const commandArguments = argumentsFor({ url: 'https://x', kind: 'audio', format: 'mp3' })

    assert.equal(valueAfter(commandArguments, '--audio-format'), 'mp3')
    assert.equal(valueAfter(commandArguments, '--audio-quality'), '320K')
    assert.ok(commandArguments.includes('--embed-thumbnail'))
    assert.match(valueAfter(commandArguments, '--ppa') ?? '', /crop=ih:ih/)
    assert.match(valueAfter(commandArguments, '-o') ?? '', /%\(artist&\{\} - \|\)s%\(track,title\)s/)
  })

  it('Opus keeps the original stream', () => {
    const commandArguments = argumentsFor({ url: 'https://x', format: 'opus' })

    assert.equal(valueAfter(commandArguments, '-f'), 'bestaudio[acodec=opus]/bestaudio/best')
    assert.ok(!commandArguments.includes('--audio-quality'))
  })

  it('WAV has no cover art', () => {
    assert.ok(!argumentsFor({ url: 'https://x', format: 'wav' }).includes('--embed-thumbnail'))
  })

  it('removes non-music parts only when asked', () => {
    assert.ok(!argumentsFor({ url: 'https://x' }).includes('--sponsorblock-remove'))
    assert.equal(
      valueAfter(argumentsFor({ url: 'https://x', removeNonMusic: true }), '--sponsorblock-remove'),
      'music_offtopic',
    )
  })
})

describe('buildDownloadArguments: video', () => {
  it('MP4 prefers H.264 and AAC at the picked resolution and labels the file', () => {
    const commandArguments = argumentsFor({ url: 'https://x', kind: 'video', resolution: 1080, container: 'mp4' })

    assert.equal(valueAfter(commandArguments, '-S'), 'res:1080,fps,vcodec:h264,acodec:m4a')
    assert.equal(valueAfter(commandArguments, '--merge-output-format'), 'mp4')
    assert.match(valueAfter(commandArguments, '-o') ?? '', / \[1080p\]\.%\(ext\)s$/)
  })

  it('WebM uses VP9 and Opus and skips thumbnail and subtitle embedding', () => {
    const commandArguments = argumentsFor({
      url: 'https://x',
      kind: 'video',
      resolution: 720,
      container: 'webm',
      subtitles: true,
    })

    assert.equal(valueAfter(commandArguments, '-S'), 'res:720,fps,vcodec:vp9,acodec:opus')
    assert.ok(!commandArguments.includes('--embed-thumbnail'))
    assert.ok(!commandArguments.includes('--embed-subs'))
  })

  it('"best quality" has no resolution limit or label', () => {
    const commandArguments = argumentsFor({ url: 'https://x', kind: 'video', container: 'mkv' })

    assert.equal(valueAfter(commandArguments, '-S'), 'res:100000,fps,vcodec,acodec')
    assert.doesNotMatch(valueAfter(commandArguments, '-o') ?? '', /\[\d+p\]/)
  })
})

describe('buildDownloadArguments: files and progress', () => {
  it('keeps unfinished files in the job’s own partial folder', () => {
    const commandArguments = argumentsFor({ url: 'https://x' })
    const paths = commandArguments.filter((_, index) => commandArguments[index - 1] === '-P')

    assert.deepEqual(paths, ['/downloads', `temp:${PARTIAL_FOLDER}`])
  })

  it('reports each stream’s codecs, so picture and sound can be told apart', () => {
    assert.match(
      valueAfter(argumentsFor({ url: 'https://x' }), '--progress-template') ?? '',
      /%\(info\.vcodec\)s\|%\(info\.acodec\)s\|/,
    )
  })

  it('asks only for English subtitles, not machine translations into English', () => {
    const commandArguments = argumentsFor({ url: 'https://x', kind: 'video', container: 'mkv', subtitles: true })

    assert.equal(valueAfter(commandArguments, '--sub-langs'), 'en')
  })
})

describe('buildDownloadArguments: safety and playlists', () => {
  it('puts the link after "--" so it can never be read as an option', () => {
    const commandArguments = argumentsFor({ url: '--exec=calc' })

    assert.deepEqual(commandArguments.slice(-2), ['--', '--exec=calc'])
  })

  it('saves playlists into a numbered folder', () => {
    const commandArguments = argumentsFor({ url: 'https://x', playlist: true })

    assert.ok(commandArguments.includes('--yes-playlist'))
    assert.match(valueAfter(commandArguments, '-o') ?? '', /^%\(playlist_title\)s\/%\(playlist_index\)03d - /)
    assert.ok(!commandArguments.includes('--playlist-items'))
  })

  it('downloads only the picked videos of a playlist', () => {
    const commandArguments = argumentsFor({ url: 'https://x', playlist: true, playlistItems: [9, 1, 2, 3, 7, 10] })

    assert.equal(valueAfter(commandArguments, '--playlist-items'), '1-3,7,9-10')
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
