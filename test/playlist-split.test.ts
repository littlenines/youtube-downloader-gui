import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Job } from '@shared/types/downloads.js'
import { normalizeDownloadRequest, safePlaylistTitle } from '@server/services/downloads/download-options.js'
import { createQueuedJob } from '@server/services/downloads/jobs.js'
import { playlistDownloads } from '@server/services/downloads/playlist-jobs.js'
import { jobFromSavedJob, savedJobFromJob } from '@server/services/downloads/saved-jobs.js'
import { parseSavedQueue } from '@server/services/stores/queue-store.js'
import { playlistListingFromInfo } from '@server/services/ytdlp/playlist-videos.js'
import { argumentsFor, valueAfter } from './support/download-arguments.js'

const PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PL1'

const listing = playlistListingFromInfo({
  _type: 'playlist',
  title: 'Example Album: Live?',
  entries: [
    { title: 'First Track', url: 'https://www.youtube.com/watch?v=a', thumbnails: [{ url: 'a.jpg' }] },
    null,
    { title: 'Digital Love', url: 'https://cdn.example/media.m4a', webpage_url: 'https://www.youtube.com/watch?v=c' },
    { title: 'Only an id', url: 'c4' },
    { _type: 'playlist', title: 'Bonus disc', url: 'https://www.youtube.com/playlist?list=PL2' },
  ],
})

const playlistOptions = normalizeDownloadRequest({ url: PLAYLIST_URL, playlist: true })

describe('playlistListingFromInfo', () => {
  it('numbers the videos as the playlist does, and takes the page link over a media link', () => {
    assert.deepEqual(
      listing.videos.map((video) => [video.position, video.url]),
      [
        [1, 'https://www.youtube.com/watch?v=a'],
        [3, 'https://www.youtube.com/watch?v=c'],
        [4, null],
        [5, null],
      ],
    )
  })
})

describe('playlistDownloads', () => {
  it('makes one download per picked video, keeping the playlist name for its folder', () => {
    const downloads = playlistDownloads({ ...playlistOptions, playlistItems: [1, 3] }, listing, 'group-1') ?? []

    assert.deepEqual(
      downloads.map(({ options }) => [options.url, options.playlist, options.folder, options.playlistTitle]),
      [
        ['https://www.youtube.com/watch?v=a', false, null, 'Example Album: Live?'],
        ['https://www.youtube.com/watch?v=c', false, null, 'Example Album: Live?'],
      ],
    )
    assert.deepEqual(downloads[0]?.details, {
      title: 'First Track',
      thumbnailUrl: 'a.jpg',
      group: { id: 'group-1', title: 'Example Album: Live?', size: 2, url: PLAYLIST_URL },
    })
  })

  it('leaves the playlist to yt-dlp when a picked entry is not a video link', () => {
    assert.equal(playlistDownloads({ ...playlistOptions, playlistItems: [1, 4] }, listing, 'group-2'), null)
    assert.equal(playlistDownloads(playlistOptions, listing, 'group-3'), null, 'the whole playlist includes them')
  })
})

describe('file names of playlist songs', () => {
  it('saves a song by its name only, in a folder yt-dlp names after the playlist', () => {
    const commandArguments = argumentsFor({
      url: 'https://x',
      playlistNumber: 3,
      playlistTitle: 'Example Album: Live?',
    })

    assert.equal(valueAfter(commandArguments, '-o'), '%(playlist_folder)s/%(artist&{} - |)s%(track,title)s.%(ext)s')
    assert.ok(commandArguments.includes('%(id&|)sExample Album\\: Live?%(id&|)s:(?P<playlist_folder>[\\s\\S]+)'))
  })

  it('keeps the playlist folder inside a chosen folder, as before', () => {
    const commandArguments = argumentsFor({ url: 'https://x', folder: 'Mixes', playlistTitle: 'Example Album' })

    assert.match(valueAfter(commandArguments, '-o') ?? '', /^Mixes\/%\(playlist_folder\)s\//)
  })

  it('accepts a playlist number only for a single video', () => {
    const fromPlaylist = normalizeDownloadRequest({ url: 'https://x', playlist: true, playlistNumber: 2 })

    assert.equal(fromPlaylist.playlistNumber, null)
    assert.equal(normalizeDownloadRequest({ url: 'https://x', playlistNumber: 2.5 }).playlistNumber, null)
  })

  it('names a whole playlist downloaded as one job by its title too, when known', () => {
    const commandArguments = argumentsFor({ url: 'https://x', playlist: true, playlistTitle: 'Example Album' })

    assert.match(valueAfter(commandArguments, '-o') ?? '', /^%\(playlist_folder\)s\//)
  })

  it('never lets a playlist name lead out of the download folder, or be a Windows device name', () => {
    assert.deepEqual(['..', '.', ' . ', '/../', '  ', 'CON', 'Example Album: Live?'].map(safePlaylistTitle), [
      null,
      null,
      null,
      null,
      null,
      'CON_',
      'Example Album: Live?',
    ])
  })
})

describe('a playlist song after closing the app', () => {
  const [download] = playlistDownloads({ ...playlistOptions, playlistItems: [1] }, listing, 'group-4') ?? []
  const restored = (job: Job): Job | undefined => {
    const [savedJob] = parseSavedQueue(JSON.parse(JSON.stringify([savedJobFromJob(job, '/downloads')])))

    return savedJob && jobFromSavedJob(savedJob)
  }

  it('keeps its playlist and name', () => {
    const job = restored(createQueuedJob('job-1', download?.options ?? playlistOptions, download?.details ?? {}))

    assert.deepEqual(job?.group, { id: 'group-4', title: 'Example Album: Live?', size: 1, url: PLAYLIST_URL })
    assert.deepEqual([job?.status, job?.options.playlistTitle], ['queued', 'Example Album: Live?'])
  })

  it('keeps being done, with its file, so the playlist still counts it', () => {
    const job = createQueuedJob('job-2', download?.options ?? playlistOptions, download?.details ?? {})

    Object.assign(job, {
      status: 'done',
      files: ['/music/Song.mp3'],
      sizeBytes: 3,
      finishedAt: '2026-10-27T10:00:00.000Z',
    })

    assert.deepEqual(
      [restored(job)?.status, restored(job)?.files, restored(job)?.progress, restored(job)?.finishedAt],
      ['done', ['/music/Song.mp3'], 1, '2026-10-27T10:00:00.000Z'],
    )
  })

  it('drops a damaged saved playlist, but keeps the song', () => {
    const [savedJob] = parseSavedQueue([
      { id: 'job-3', options: { url: 'https://x' }, group: { id: '../x', size: 'many' }, finished: { status: 'gone' } },
    ])

    assert.deepEqual([savedJob?.group, savedJob?.finished], [null, null])
  })
})
