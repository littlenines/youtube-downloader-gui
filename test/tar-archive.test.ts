import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { createTarGz, extractTarGz, extractTarGzEntry } from '@server/lib/archive/tar.js'
import { createTemporaryFolder, removeFolder } from './support/temporary-folder.js'

describe('createTarGz and extractTarGzEntry', () => {
  it('round-trips files', () => {
    const binary = Buffer.alloc(70_000, 7)
    const archive = createTarGz([
      { name: 'yt-downloader/README.txt', data: Buffer.from('read me') },
      { name: 'yt-downloader/yt-downloader', data: binary, mode: 0o755 },
    ])

    assert.deepEqual(
      extractTarGzEntry(archive, (name) => name.endsWith('/yt-downloader')),
      binary,
    )
    assert.equal(extractTarGzEntry(archive, (name) => name.endsWith('README.txt')).toString(), 'read me')
  })
})

describe('extractTarGz', () => {
  it('unpacks every file with its permissions', async () => {
    const directory = await createTemporaryFolder('archive-test-')
    const binary = Buffer.alloc(70_000, 7)

    try {
      const names = await extractTarGz(
        createTarGz([
          { name: 'yt-downloader/README.txt', data: Buffer.from('read me') },
          { name: 'yt-downloader/resources/app/desktop.cjs', data: Buffer.from('app') },
          { name: 'yt-downloader/yt-downloader.bin', data: binary, mode: 0o755 },
        ]),
        directory,
      )

      assert.equal(names.length, 3)
      assert.equal(await readFile(join(directory, 'yt-downloader/resources/app/desktop.cjs'), 'utf8'), 'app')
      assert.deepEqual(await readFile(join(directory, 'yt-downloader/yt-downloader.bin')), binary)

      if (process.platform !== 'win32') {
        assert.equal((await stat(join(directory, 'yt-downloader/yt-downloader.bin'))).mode & 0o777, 0o755)
        assert.equal((await stat(join(directory, 'yt-downloader/README.txt'))).mode & 0o777, 0o644)
      }
    } finally {
      await removeFolder(directory)
    }
  })

  it('refuses entries that would be written outside the folder', async () => {
    const directory = await createTemporaryFolder('archive-test-')

    try {
      await assert.rejects(
        extractTarGz(createTarGz([{ name: '../escaped.txt', data: Buffer.from('x') }]), directory),
        /Unsafe path in tar/,
      )
    } finally {
      await removeFolder(directory)
    }
  })
})
