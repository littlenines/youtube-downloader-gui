import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { playableEntryFile, playableFile, playableJobFile } from '@shared/playable-file.js'
import type { HistoryEntry, Job } from '@shared/types/downloads.js'
import { useDesktopShell } from '@server/lib/desktop-shell.js'
import type { HttpError } from '@server/lib/http/http-error.js'
import { playFile } from '@server/routes/route-helpers.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { createQueuedJob } from '@server/services/downloads/jobs.js'
import { createTemporaryFolder, removeFolder } from './support/temporary-folder.js'

describe('playableFile', () => {
  it('plays the one audio or video file of a download', () => {
    assert.equal(playableFile(['D:\\Music\\Get Lucky.MP3']), 'D:\\Music\\Get Lucky.MP3')
    assert.equal(
      playableFile(['/videos/Get Lucky [1080p].mkv', '/videos/Get Lucky.en.srt']),
      '/videos/Get Lucky [1080p].mkv',
    )
  })

  it('opens nothing that is not media, so Play can never start a program', () => {
    for (const files of [
      ['D:\\Music\\Get Lucky.exe'],
      ['D:\\Music\\Get Lucky.mp3.bat'],
      ['/covers/Get Lucky.jpg'],
      [],
    ]) {
      assert.equal(playableFile(files), null)
    }
  })

  it('leaves a playlist to Show in folder, rather than playing one of its songs', () => {
    assert.equal(playableFile(['/Album/One More Time.mp3', '/Album/Aerodynamic.mp3']), null)
  })
})

const song = (
  changes: Partial<Job> = {},
  request: Parameters<typeof normalizeDownloadRequest>[0] = { url: 'https://x' },
): Job => ({
  ...createQueuedJob('song', normalizeDownloadRequest(request), { title: 'Get Lucky' }),
  status: 'done',
  files: ['/music/Get Lucky.mp3'],
  ...changes,
})

const entry = (changes: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 'song',
  title: 'Get Lucky',
  thumbnailUrl: null,
  label: 'MP3 · 320 kbps',
  files: ['/music/Get Lucky.mp3'],
  sizeBytes: null,
  finishedAt: '2026-10-28T10:00:00.000Z',
  url: 'https://x',
  isPlaylist: false,
  ...changes,
})

describe('what Play opens', () => {
  it('needs a real extension, not a name that only looks like one', () => {
    assert.equal(playableFile(['/downloads/mp3']), null)
    assert.equal(playableFile(['/downloads/.webm']), null)
    assert.equal(playableFile(['/downloads/Concert.FLV']), '/downloads/Concert.FLV')
  })

  it('plays a finished download, but not one that is still running or failed, nor a playlist', () => {
    assert.equal(playableJobFile(song()), '/music/Get Lucky.mp3')
    assert.equal(playableJobFile(song({ status: 'downloading' })), null)
    assert.equal(playableJobFile(song({ status: 'error' })), null)
    assert.equal(playableJobFile(song({}, { url: 'https://x', playlist: true })), null)
  })

  it('plays a history entry, but not a playlist, even one where a single video finished', () => {
    assert.equal(playableEntryFile(entry()), '/music/Get Lucky.mp3')
    assert.equal(playableEntryFile(entry({ isPlaylist: true })), null)
  })
})

describe('playFile', async () => {
  const folder = await createTemporaryFolder('play-file-')
  const song = join(folder, 'Get Lucky.mp3')
  const opened: string[] = []
  let failsToOpen = false

  await writeFile(song, '')
  await mkdir(join(folder, 'Clip.mp4'))
  useDesktopShell({
    openUrl: () => {},
    reveal: () => {},
    openFile: async (file) => {
      if (failsToOpen) throw new Error('No application is associated with the specified file')

      opened.push(file)
    },
  })
  after(() => removeFolder(folder))

  const refusal = async (file: string | null) => (await playFile(file).catch((error: HttpError) => error)) as HttpError

  it('opens the song in the default app', async () => {
    await playFile(song)

    assert.deepEqual(opened, [song])
  })

  it('says why it can not play, for each reason', async () => {
    assert.match((await refusal(null)).message, /no song or video to play/)
    assert.match((await refusal(join(folder, 'Gone.mp3'))).message, /no longer there/)
    assert.match((await refusal(join(folder, 'Clip.mp4'))).message, /no longer there/)

    failsToOpen = true
    assert.equal(
      (await refusal(song)).message,
      'No app could open Get Lucky.mp3. Use Show in folder and open it from there.',
    )
  })
})
