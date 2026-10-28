import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { normalizeCoverRequest } from '@server/services/downloads/download-options.js'
import { historyEntryFromCover } from '@server/services/downloads/jobs.js'
import {
  copyToFreeName,
  coverFileFromOutput,
  coverFileNames,
  coverImageArguments,
} from '@server/services/ytdlp/cover-image.js'
import { SQUARE_JPG_CONVERSION_ARGUMENT } from '@server/services/ytdlp/thumbnail-arguments.js'
import { createTemporaryFolder, removeFolder } from './support/temporary-folder.js'

const VIDEO_URL = 'https://www.youtube.com/watch?v=abc'

const valueAfter = (commandArguments: string[], flag: string): string | undefined =>
  commandArguments[commandArguments.indexOf(flag) + 1]

describe('coverImageArguments', () => {
  it('saves only the thumbnail of one video, as a JPG named after the video, into the work folder', () => {
    const commandArguments = coverImageArguments(VIDEO_URL, 'D:\\Music\\work')

    assert.ok(commandArguments.includes('--skip-download'))
    assert.ok(commandArguments.includes('--no-playlist'))
    assert.ok(commandArguments.includes('--write-thumbnail'))
    assert.equal(valueAfter(commandArguments, '--convert-thumbnails'), 'jpg')
    assert.equal(valueAfter(commandArguments, '-P'), 'D:\\Music\\work')
    assert.equal(valueAfter(commandArguments, '-o'), '%(title)s.%(ext)s')
    assert.deepEqual(commandArguments.slice(-2), ['--', VIDEO_URL])
  })

  it('crops square to the shorter side, so tall pictures work too', () => {
    assert.match(SQUARE_JPG_CONVERSION_ARGUMENT, /crop=min\(iw\\,ih\):min\(iw\\,ih\)/)
  })
})

describe('coverFileFromOutput', () => {
  it('finds the saved file among the output lines', () => {
    assert.equal(
      coverFileFromOutput('[youtube] abc: Downloading webpage\r\n[cover-file]D:\\Music\\Song.jpg\r\n'),
      'D:\\Music\\Song.jpg',
    )
  })

  it('returns nothing when the video had no thumbnail', () => {
    assert.equal(coverFileFromOutput('[cover-file]\n'), null)
    assert.equal(coverFileFromOutput(''), null)
  })
})

describe('cover file names', () => {
  it('names the cover after the video, with (square) for the square one and a number when taken', () => {
    assert.deepEqual(coverFileNames('/work/Song.jpg', false).slice(0, 3), ['Song.jpg', 'Song (2).jpg', 'Song (3).jpg'])
    assert.deepEqual(coverFileNames('/work/Song.jpg', true).slice(0, 2), ['Song (square).jpg', 'Song (square) (2).jpg'])
  })

  it('never overwrites a file that is already there', async () => {
    const folder = await createTemporaryFolder('cover-test-')

    try {
      const source = join(folder, 'source.jpg')

      await writeFile(source, 'new')
      await writeFile(join(folder, 'Song.jpg'), 'old')

      const saved = await copyToFreeName(source, folder, coverFileNames(source.replace('source', 'Song'), false))

      assert.equal(saved, join(folder, 'Song (2).jpg'))
      assert.equal(await readFile(join(folder, 'Song.jpg'), 'utf8'), 'old')
      assert.equal(await readFile(saved, 'utf8'), 'new')
    } finally {
      await removeFolder(folder)
    }
  })
})

describe('cover requests and history', () => {
  it('keeps only text for the title and picture address', () => {
    assert.deepEqual(
      normalizeCoverRequest({ url: ` ${VIDEO_URL} `, title: 123 as unknown as string, thumbnailUrl: {} as string }),
      { url: VIDEO_URL, square: false, thumbnailUrl: null },
    )
  })

  it('shows a saved cover in the downloads list like a finished download', () => {
    const entry = historyEntryFromCover(
      { url: VIDEO_URL, square: true, title: 'Song', thumbnailUrl: 'thumb.jpg' },
      'D:\\Music\\Song (square).jpg',
      1234,
    )

    assert.deepEqual(
      { ...entry, id: typeof entry.id, finishedAt: typeof entry.finishedAt },
      {
        id: 'string',
        title: 'Song',
        thumbnailUrl: 'thumb.jpg',
        label: 'Square cover · JPG',
        files: ['D:\\Music\\Song (square).jpg'],
        sizeBytes: 1234,
        finishedAt: 'string',
        url: VIDEO_URL,
        isPlaylist: false,
      },
    )
  })

  it('falls back to the file name when there is no title', () => {
    assert.equal(historyEntryFromCover({ url: VIDEO_URL }, '/music/Song.jpg', null).title, 'Song')
  })
})
