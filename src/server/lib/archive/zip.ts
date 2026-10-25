import { mkdir, symlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { inflateRaw } from 'node:zlib'
import { archiveFolder, writeArchiveFile } from './archive-folder.js'

const inflateRawAsync = promisify(inflateRaw)

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const ZIP64_END_LOCATOR_SIGNATURE = 0x07064b50
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP64_EXTRA_FIELD_ID = 0x0001
const OVERFLOWED_32_BIT_VALUE = 0xffffffff
const OVERFLOWED_16_BIT_VALUE = 0xffff
const MAXIMUM_END_OF_CENTRAL_DIRECTORY_SIZE = 65_557
const MINIMUM_END_OF_CENTRAL_DIRECTORY_SIZE = 22
const UNIX_FILE_TYPE_MASK = 0o170000
const UNIX_SYMBOLIC_LINK_TYPE = 0o120000
const UNIX_PERMISSION_MASK = 0o777
const STORED_METHOD = 0
const DEFLATE_METHOD = 8

interface ZipEntry {
  name: string
  unixModeBits: number
  read(): Promise<Buffer>
}

interface CentralDirectorySizes {
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

const findEndOfCentralDirectory = (zip: Buffer): number => {
  const earliestOffset = Math.max(0, zip.length - MAXIMUM_END_OF_CENTRAL_DIRECTORY_SIZE)

  for (let offset = zip.length - MINIMUM_END_OF_CENTRAL_DIRECTORY_SIZE; offset >= earliestOffset; offset--) {
    if (zip.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset
  }

  throw new Error('Not a zip file.')
}

const readCentralDirectoryLocation = (zip: Buffer): { entryCount: number; offset: number } => {
  const endOffset = findEndOfCentralDirectory(zip)
  const entryCount = zip.readUInt16LE(endOffset + 10)
  const offset = zip.readUInt32LE(endOffset + 16)

  if (offset !== OVERFLOWED_32_BIT_VALUE && entryCount !== OVERFLOWED_16_BIT_VALUE) return { entryCount, offset }

  const zip64LocatorOffset = endOffset - 20

  if (zip64LocatorOffset < 0 || zip.readUInt32LE(zip64LocatorOffset) !== ZIP64_END_LOCATOR_SIGNATURE) {
    return { entryCount, offset }
  }

  const zip64EndOffset = Number(zip.readBigUInt64LE(zip64LocatorOffset + 8))

  return {
    entryCount: Number(zip.readBigUInt64LE(zip64EndOffset + 32)),
    offset: Number(zip.readBigUInt64LE(zip64EndOffset + 48)),
  }
}

const applyZip64ExtraField = (zip: Buffer, extraStart: number, extraEnd: number, sizes: CentralDirectorySizes) => {
  for (let fieldOffset = extraStart; fieldOffset + 4 <= extraEnd;) {
    const fieldId = zip.readUInt16LE(fieldOffset)
    const fieldSize = zip.readUInt16LE(fieldOffset + 2)

    if (fieldId === ZIP64_EXTRA_FIELD_ID) {
      let valueOffset = fieldOffset + 4

      for (const key of ['uncompressedSize', 'compressedSize', 'localHeaderOffset'] as const) {
        if (sizes[key] !== OVERFLOWED_32_BIT_VALUE) continue

        sizes[key] = Number(zip.readBigUInt64LE(valueOffset))
        valueOffset += 8
      }
    }

    fieldOffset += 4 + fieldSize
  }
}

const readEntryContent = async (
  zip: Buffer,
  name: string,
  method: number,
  sizes: CentralDirectorySizes,
): Promise<Buffer> => {
  const { localHeaderOffset, compressedSize, uncompressedSize } = sizes

  if (zip.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_HEADER_SIGNATURE)
    throw new Error('Corrupt zip (local header).')

  const dataStart =
    localHeaderOffset + 30 + zip.readUInt16LE(localHeaderOffset + 26) + zip.readUInt16LE(localHeaderOffset + 28)
  const compressedData = zip.subarray(dataStart, dataStart + compressedSize)

  if (method === STORED_METHOD) return Buffer.from(compressedData)
  if (method !== DEFLATE_METHOD) throw new Error(`Unsupported zip compression method ${method}.`)

  const content = await inflateRawAsync(compressedData)

  if (content.length !== uncompressedSize) throw new Error(`Zip entry ${name} has the wrong size.`)

  return content
}

const readZipEntries = function* (zip: Buffer): Generator<ZipEntry> {
  let { entryCount, offset } = readCentralDirectoryLocation(zip)

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    if (zip.readUInt32LE(offset) !== CENTRAL_DIRECTORY_HEADER_SIGNATURE) {
      throw new Error('Corrupt zip (central directory).')
    }

    const method = zip.readUInt16LE(offset + 10)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const unixModeBits = zip.readUInt32LE(offset + 38) >>> 16
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    const extraStart = offset + 46 + nameLength
    const sizes: CentralDirectorySizes = {
      compressedSize: zip.readUInt32LE(offset + 20),
      uncompressedSize: zip.readUInt32LE(offset + 24),
      localHeaderOffset: zip.readUInt32LE(offset + 42),
    }

    applyZip64ExtraField(zip, extraStart, extraStart + extraLength, sizes)

    yield { name, unixModeBits, read: () => readEntryContent(zip, name, method, sizes) }

    offset += 46 + nameLength + extraLength + commentLength
  }
}

const isDirectoryEntry = (entry: ZipEntry) => entry.name.endsWith('/')
const isSymbolicLinkEntry = (entry: ZipEntry) => (entry.unixModeBits & UNIX_FILE_TYPE_MASK) === UNIX_SYMBOLIC_LINK_TYPE

export const extractZipEntry = async (zip: Buffer, matchesName: (name: string) => boolean): Promise<Buffer> => {
  for (const entry of readZipEntries(zip)) {
    if (!isDirectoryEntry(entry) && matchesName(entry.name)) return entry.read()
  }

  throw new Error('File not found in zip.')
}

export const extractZip = async (zip: Buffer, directory: string): Promise<string[]> => {
  const folder = archiveFolder(directory, 'zip')
  const extractedNames: string[] = []
  const isWindows = process.platform === 'win32'

  for (const entry of readZipEntries(zip)) {
    const targetPath = folder.pathFor(entry.name)

    extractedNames.push(entry.name)

    if (isDirectoryEntry(entry)) {
      await mkdir(targetPath, { recursive: true })
      continue
    }

    if (isSymbolicLinkEntry(entry)) {
      const linkTarget = (await entry.read()).toString('utf8')

      if (!folder.isInside(resolve(dirname(targetPath), linkTarget))) {
        throw new Error(`Unsafe link in zip: ${entry.name}`)
      }

      if (!isWindows) {
        await mkdir(dirname(targetPath), { recursive: true })
        await symlink(linkTarget, targetPath)
      }

      continue
    }

    await writeArchiveFile(targetPath, await entry.read(), entry.unixModeBits & UNIX_PERMISSION_MASK)
  }

  return extractedNames
}
