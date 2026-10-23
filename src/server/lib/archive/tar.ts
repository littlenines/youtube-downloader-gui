import { gunzipSync, gzipSync } from 'node:zlib'

const BLOCK_SIZE = 512
const MAXIMUM_NAME_BYTES = 100
const REGULAR_FILE_TYPES = new Set(['0', ''])
const LONG_NAME_TYPE = 'L'
const DEFAULT_FILE_MODE = 0o644

export interface TarEntry {
  name: string
  data: Buffer
  mode?: number
}

const paddingToBlockSize = (size: number) => (BLOCK_SIZE - (size % BLOCK_SIZE)) % BLOCK_SIZE
const withoutTrailingNulls = (text: string) => text.replace(/\0.*$/s, '')

export const extractTarGzEntry = (archive: Buffer, matchesName: (name: string) => boolean): Buffer => {
  const tar = gunzipSync(archive)
  let offset = 0
  let pendingLongName: string | null = null

  while (offset + BLOCK_SIZE <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK_SIZE)

    if (header.every((byte) => byte === 0)) break

    const readHeaderField = (start: number, length: number) =>
      withoutTrailingNulls(header.subarray(start, start + length).toString('utf8'))
    const size = parseInt(readHeaderField(124, 12).trim() || '0', 8)
    const type = readHeaderField(156, 1)
    const namePrefix = readHeaderField(345, 155)
    const shortName = readHeaderField(0, 100)
    const name = pendingLongName ?? (namePrefix ? `${namePrefix}/${shortName}` : shortName)

    pendingLongName = null

    const data = tar.subarray(offset + BLOCK_SIZE, offset + BLOCK_SIZE + size)

    if (type === LONG_NAME_TYPE) pendingLongName = withoutTrailingNulls(data.toString('utf8'))
    else if (REGULAR_FILE_TYPES.has(type) && matchesName(name)) return Buffer.from(data)

    offset += BLOCK_SIZE + size + paddingToBlockSize(size)
  }

  throw new Error('File not found in tar.')
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
