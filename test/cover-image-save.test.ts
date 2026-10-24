import assert from 'node:assert/strict'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { saveCoverImage, type CoverTools } from '@server/services/ytdlp/cover-image.js'
import { withTemporaryFolder } from './support/temporary-folder.js'

const VIDEO_URL = 'https://www.youtube.com/watch?v=abc'

const fakeCoverTools = (overrides: Partial<CoverTools> = {}): CoverTools & { croppedFiles: string[] } => {
  const croppedFiles: string[] = []

  return {
    croppedFiles,
    requireTools: async () => {},
    saveThumbnail: async (_url, folder) => {
      const file = join(folder, 'Song.jpg')

      await writeFile(file, 'wide')

      return `[youtube] abc: Downloading webpage\n[cover-file]${file}\n`
    },
    cropToSquare: async (source, target) => {
      croppedFiles.push(source)
      await writeFile(target, 'square')
    },
    ...overrides,
  }
}

describe('saveCoverImage', () => {
  it('moves the cover into the download folder and removes the work folder', () =>
    withTemporaryFolder('cover-save-', async (folder) => {
      const tools = fakeCoverTools()
      const saved = await saveCoverImage({ url: VIDEO_URL, square: false, downloadFolder: folder }, tools)

      assert.equal(saved, join(folder, 'Song.jpg'))
      assert.equal(await readFile(saved, 'utf8'), 'wide')
      assert.deepEqual(tools.croppedFiles, [])
      assert.deepEqual(await readdir(folder), ['Song.jpg'])
    }))

  it('crops the square cover itself, whatever format the thumbnail came in', () =>
    withTemporaryFolder('cover-save-', async (folder) => {
      const tools = fakeCoverTools()
      const saved = await saveCoverImage({ url: VIDEO_URL, square: true, downloadFolder: folder }, tools)

      assert.equal(saved, join(folder, 'Song (square).jpg'))
      assert.equal(await readFile(saved, 'utf8'), 'square')
      assert.equal(tools.croppedFiles.length, 1)
      assert.deepEqual(await readdir(folder), ['Song (square).jpg'])
    }))

  it('leaves nothing behind when saving, cropping or finding the thumbnail fails', () =>
    withTemporaryFolder('cover-save-', async (folder) => {
      const failures: [Partial<CoverTools>, RegExp][] = [
        [{ saveThumbnail: () => Promise.reject(new Error('Video unavailable')) }, /Video unavailable/],
        [{ saveThumbnail: async () => '[cover-file]\n' }, /no cover image/],
        [{ cropToSquare: () => Promise.reject(new Error('Cancelled.')) }, /Cancelled/],
      ]

      for (const [overrides, message] of failures) {
        await assert.rejects(
          saveCoverImage({ url: VIDEO_URL, square: true, downloadFolder: folder }, fakeCoverTools(overrides)),
          message,
        )
      }

      assert.deepEqual(await readdir(folder), [])
    }))

  it('stops before touching the folder when the tools are missing', () =>
    withTemporaryFolder('cover-save-', async (folder) => {
      const tools = fakeCoverTools({ requireTools: () => Promise.reject(new Error('Tools missing')) })

      await assert.rejects(saveCoverImage({ url: VIDEO_URL, square: false, downloadFolder: folder }, tools))
      assert.deepEqual(await readdir(folder), [])
    }))
})
