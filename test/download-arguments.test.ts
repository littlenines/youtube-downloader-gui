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
