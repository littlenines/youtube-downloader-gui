import { mkdir } from 'node:fs/promises'
import { promisify } from 'node:util'
import { gunzip, gunzipSync, gzipSync } from 'node:zlib'
import { archiveFolder, writeArchiveFile } from './archive-folder.js'

const gunzipAsync = promisify(gunzip)

const BLOCK_SIZE = 512
const MAXIMUM_NAME_BYTES = 100
const REGULAR_FILE_TYPES = new Set(['0', ''])
const DIRECTORY_TYPE = '5'
const LONG_NAME_TYPE = 'L'
const DEFAULT_FILE_MODE = 0o644
const PERMISSION_MASK = 0o777

export interface TarEntry {
  name: string
  data: Buffer
  mode?: number
}

interface ReadTarEntry extends Required<TarEntry> {
  type: string
}

const paddingToBlockSize = (size: number) => (BLOCK_SIZE - (size % BLOCK_SIZE)) % BLOCK_SIZE
const withoutTrailingNulls = (text: string) => text.replace(/\0.*$/s, '')
const readOctal = (text: string) => parseInt(text.trim() || '0', 8)

const readTarEntries = function* (tar: Buffer): Generator<ReadTarEntry> {
  let offset = 0
  let pendingLongName: string | null = null

  while (offset + BLOCK_SIZE <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK_SIZE)

    if (header.every((byte) => byte === 0)) break

    const readHeaderField = (start: number, length: number) =>
      withoutTrailingNulls(header.subarray(start, start + length).toString('utf8'))
    const size = readOctal(readHeaderField(124, 12))
    const type = readHeaderField(156, 1)
    const namePrefix = readHeaderField(345, 155)
    const shortName = readHeaderField(0, 100)
    const name = pendingLongName ?? (namePrefix ? `${namePrefix}/${shortName}` : shortName)
    const data = tar.subarray(offset + BLOCK_SIZE, offset + BLOCK_SIZE + size)

    pendingLongName = null

    if (type === LONG_NAME_TYPE) pendingLongName = withoutTrailingNulls(data.toString('utf8'))
    else yield { name, type, mode: readOctal(readHeaderField(100, 8)), data }

    offset += BLOCK_SIZE + size + paddingToBlockSize(size)
  }
}

export const extractTarGzEntry = (archive: Buffer, matchesName: (name: string) => boolean): Buffer => {
  for (const entry of readTarEntries(gunzipSync(archive))) {
    if (REGULAR_FILE_TYPES.has(entry.type) && matchesName(entry.name)) return Buffer.from(entry.data)
  }

  throw new Error('File not found in tar.')
}

export const extractTarGz = async (archive: Buffer, directory: string): Promise<string[]> => {
  const folder = archiveFolder(directory, 'tar')
  const extractedNames: string[] = []

  for (const entry of readTarEntries(await gunzipAsync(archive))) {
    const isDirectory = entry.type === DIRECTORY_TYPE

    if (!isDirectory && !REGULAR_FILE_TYPES.has(entry.type)) continue

    const targetPath = folder.pathFor(entry.name)

    extractedNames.push(entry.name)

    if (isDirectory) {
      await mkdir(targetPath, { recursive: true })
      continue
    }

    await writeArchiveFile(targetPath, entry.data, entry.mode & PERMISSION_MASK)
  }

  return extractedNames
}

const createTarHeader = (entry: TarEntry, modifiedTimeSeconds: number): Buffer => {
  const header = Buffer.alloc(BLOCK_SIZE)
  const writeField = (value: string, start: number, length: number) => header.write(value, start, length, 'utf8')
  const toOctalField = (value: number, length: number) => `${value.toString(8).padStart(length - 1, '0')}\0`

  writeField(entry.name, 0, 100)
  writeField(toOctalField(entry.mode ?? DEFAULT_FILE_MODE, 8), 100, 8)
  writeField(toOctalField(0, 8), 108, 8)
  writeField(toOctalField(0, 8), 116, 8)
  writeField(toOctalField(entry.data.length, 12), 124, 12)
  writeField(toOctalField(modifiedTimeSeconds, 12), 136, 12)
  writeField('        ', 148, 8)
  writeField('0', 156, 1)
  writeField('ustar\0', 257, 6)
  writeField('00', 263, 2)

  const checksum = header.reduce((sum, byte) => sum + byte, 0)

  writeField(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8)

  return header
}

export const createTarGz = (entries: TarEntry[]): Buffer => {
  const blocks: Buffer[] = []
  const modifiedTimeSeconds = Math.floor(Date.now() / 1000)

  for (const entry of entries) {
    if (Buffer.byteLength(entry.name) > MAXIMUM_NAME_BYTES) throw new Error(`Name too long for tar: ${entry.name}`)

    blocks.push(
      createTarHeader(entry, modifiedTimeSeconds),
      entry.data,
      Buffer.alloc(paddingToBlockSize(entry.data.length)),
    )
  }

  blocks.push(Buffer.alloc(BLOCK_SIZE * 2))

  return gzipSync(Buffer.concat(blocks), { level: 9 })
}
