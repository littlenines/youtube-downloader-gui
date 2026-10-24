import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { deflateRawSync } from 'node:zlib'
import { createTarGz, extractTarGzEntry } from '@server/lib/archive/tar.js'
import { extractZip, extractZipEntry } from '@server/lib/archive/zip.js'
import { createTemporaryFolder, removeFolder } from './support/temporary-folder.js'

interface ZipFixtureEntry {
  name: string
  data: Buffer
  compress: boolean
  unixMode?: number
}

const createZip = (entries: ZipFixtureEntry[]): Buffer => {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const body = entry.compress ? deflateRawSync(entry.data) : entry.data
    const name = Buffer.from(entry.name)
    const localHeader = Buffer.alloc(30)

    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(entry.compress ? 8 : 0, 8)
    localHeader.writeUInt32LE(body.length, 18)
    localHeader.writeUInt32LE(entry.data.length, 22)
    localHeader.writeUInt16LE(name.length, 26)
    localParts.push(localHeader, name, body)

    const centralHeader = Buffer.alloc(46)

    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(entry.compress ? 8 : 0, 10)
    centralHeader.writeUInt32LE(body.length, 20)
    centralHeader.writeUInt32LE(entry.data.length, 24)
    centralHeader.writeUInt16LE(name.length, 28)
    centralHeader.writeUInt32LE(((entry.unixMode ?? 0) << 16) >>> 0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    centralParts.push(centralHeader, name)
    offset += 30 + name.length + body.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)

  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, centralDirectory, end])
}

const largeContent = Buffer.from('program bytes '.repeat(5000))
const sampleZip = createZip([
  { name: 'README.md', data: Buffer.from('hello'), compress: false },
  { name: 'program.exe', data: largeContent, compress: true },
])

describe('extractZipEntry', () => {
  it('extracts a compressed entry by name', async () =>
    assert.deepEqual(await extractZipEntry(sampleZip, (name) => name === 'program.exe'), largeContent))
  it('extracts a stored entry', async () =>
    assert.equal((await extractZipEntry(sampleZip, (name) => name === 'README.md')).toString(), 'hello'))
  it('throws when the file is missing', () =>
    assert.rejects(
      extractZipEntry(sampleZip, (name) => name === 'missing'),
      /not found/,
    ))
  it('rejects data that is not a zip', () =>
    assert.rejects(
      extractZipEntry(Buffer.from('definitely not a zip file'), () => true),
      /Not a zip/,
    ))
})

describe('extractZip', () => {
  const directories: string[] = []
  const temporaryDirectory = async () => {
    const directory = await createTemporaryFolder('archive-test-')

    directories.push(directory)
    return directory
  }

  after(() => Promise.all(directories.map((directory) => removeFolder(directory))))

  it('extracts folders and files', async () => {
    const directory = await temporaryDirectory()
    const zip = createZip([
      { name: 'tool/', data: Buffer.alloc(0), compress: false },
      { name: 'tool/_internal/library.txt', data: Buffer.from('library'), compress: true },
      { name: 'tool/program', data: largeContent, compress: true, unixMode: 0o100755 },
    ])
    const names = await extractZip(zip, directory)

    assert.deepEqual(names, ['tool/', 'tool/_internal/library.txt', 'tool/program'])
    assert.equal(await readFile(join(directory, 'tool/_internal/library.txt'), 'utf8'), 'library')
    assert.deepEqual(await readFile(join(directory, 'tool/program')), largeContent)

    if (process.platform !== 'win32') assert.equal((await stat(join(directory, 'tool/program'))).mode & 0o777, 0o755)
  })

  it('refuses entries that would be written outside the folder', async () => {
    const directory = await temporaryDirectory()
    const zip = createZip([{ name: '../escaped.txt', data: Buffer.from('x'), compress: false }])

    await assert.rejects(extractZip(zip, directory), /Unsafe path/)
  })

  it('refuses symbolic links that point outside the folder', async () => {
    const directory = await temporaryDirectory()
    const zip = createZip([
      { name: 'escape', data: Buffer.from(tmpdir()), compress: false, unixMode: 0o120777 },
      { name: 'escape/planted.txt', data: Buffer.from('x'), compress: false },
    ])

    await assert.rejects(extractZip(zip, directory), /Unsafe link/)
  })

  it(
    'keeps symbolic links that stay inside the folder',
    { skip: process.platform === 'win32' && 'Windows skips symbolic links' },
    async () => {
      const directory = await temporaryDirectory()
      const zip = createZip([
        { name: 'library.so.1', data: Buffer.from('library'), compress: false },
        { name: 'library.so', data: Buffer.from('library.so.1'), compress: false, unixMode: 0o120777 },
      ])

      await extractZip(zip, directory)
      assert.equal(await readFile(join(directory, 'library.so'), 'utf8'), 'library')
    },
  )
})

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
