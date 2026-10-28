import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { argumentsFor, PARTIAL_FOLDER, valueAfter } from './support/download-arguments.js'

describe('buildDownloadArguments: audio', () => {
  it('MP3 is a constant 320 kbps encode with square cover art and artist names', () => {
    const commandArguments = argumentsFor({ url: 'https://x', kind: 'audio', format: 'mp3' })

    assert.equal(valueAfter(commandArguments, '--audio-format'), 'mp3')
    assert.equal(valueAfter(commandArguments, '--audio-quality'), '320K')
    assert.ok(commandArguments.includes('--embed-thumbnail'))
    assert.match(valueAfter(commandArguments, '--ppa') ?? '', /crop=min\(iw\\,ih\):min\(iw\\,ih\)/)
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
      subtitleLanguage: 'en',
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

  const subtitleArgumentsFor = (request: Parameters<typeof argumentsFor>[0]) => {
    const commandArguments = argumentsFor({ url: 'https://x', kind: 'video', container: 'mkv', ...request })

    return [
      valueAfter(commandArguments, '--sub-langs'),
      commandArguments.includes('--write-subs'),
      commandArguments.includes('--write-auto-subs'),
    ]
  }

  it('asks for a picked uploaded track exactly, and never for automatic ones, which are machine translations', () => {
    assert.deepEqual(subtitleArgumentsFor({ subtitleLanguage: 'sr', subtitleMatch: 'exact' }), ['sr', true, false])
  })

  it('asks for the spoken language as YouTube recognised it, never a translation into it', () => {
    assert.deepEqual(subtitleArgumentsFor({ subtitleLanguage: 'ja', subtitleMatch: 'spoken' }), [
      'ja-orig',
      false,
      true,
    ])
  })

  it('asks a download whose track could not be picked for the uploaded track with that code only', () => {
    assert.deepEqual(subtitleArgumentsFor({ subtitleLanguage: 'en-US' }), ['en-US', true, false])
  })

  it('embeds subtitles by default, leaving no subtitle file behind', () => {
    const commandArguments = argumentsFor({ url: 'https://x', kind: 'video', container: 'mkv', subtitleLanguage: 'de' })

    assert.ok(commandArguments.includes('--embed-subs'))
    assert.equal(valueAfter(commandArguments, '--compat-options'), 'no-keep-subs')
    assert.ok(!commandArguments.includes('--convert-subs'))
  })

  it('saves a .srt file next to the video instead when asked, also for WebM', () => {
    for (const container of ['mkv', 'webm'] as const) {
      const commandArguments = argumentsFor({
        url: 'https://x',
        kind: 'video',
        container,
        subtitleLanguage: 'de',
        subtitleFormat: 'srt',
      })

      assert.equal(valueAfter(commandArguments, '--convert-subs'), 'srt')
      assert.ok(!commandArguments.includes('--embed-subs'))
    }
  })

  it('reads "subtitles: true" from earlier versions as English', () => {
    assert.deepEqual(subtitleArgumentsFor({ subtitles: true }), ['en', true, false])
    assert.ok(!argumentsFor({ url: 'https://x', kind: 'video', container: 'mkv' }).includes('--embed-subs'))
  })
})

describe('buildDownloadArguments: safety and playlists', () => {
  it('puts the link after "--" so it can never be read as an option', () => {
    const commandArguments = argumentsFor({ url: '--exec=calc' })

    assert.deepEqual(commandArguments.slice(-2), ['--', '--exec=calc'])
  })

  it('saves a playlist downloaded as one job into its folder, without numbers', () => {
    const commandArguments = argumentsFor({ url: 'https://x', playlist: true })

    assert.ok(commandArguments.includes('--yes-playlist'))
    assert.match(valueAfter(commandArguments, '-o') ?? '', /^%\(playlist_title\)s\/%\(artist/)
    assert.ok(!commandArguments.includes('--playlist-items'))
  })

  it('downloads only the picked videos of a playlist', () => {
    const commandArguments = argumentsFor({ url: 'https://x', playlist: true, playlistItems: [9, 1, 2, 3, 7, 10] })

    assert.equal(valueAfter(commandArguments, '--playlist-items'), '1-3,7,9-10')
  })

  it('counts progress among the picked videos', () => {
    const commandArguments = argumentsFor({ url: 'https://x', playlist: true, playlistItems: [1, 3, 12] })
    const itemLine = commandArguments.find((argument) => argument.startsWith('before_dl:'))

    assert.match(itemLine ?? '', /%\(playlist_autonumber\|\)s\|%\(n_entries\|\)s/)
  })
})
