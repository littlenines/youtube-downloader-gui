import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync, inflateRawSync } from 'node:zlib';

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_END_LOCATOR = 0x07064b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const ZIP64_EXTRA_FIELD = 0x0001;
const OVERFLOW_32 = 0xffffffff;
const FILE_TYPE_MASK = 0o170000;
const SYMBOLIC_LINK = 0o120000;

interface ZipEntry {
  name: string;
  /** Unix permission and file type bits; 0 when the zip was made on Windows. */
  mode: number;
  read(): Buffer;
}

function findEndOfCentralDirectory(zip: Buffer): number {
  const earliest = Math.max(0, zip.length - 65_557);
  for (let offset = zip.length - 22; offset >= earliest; offset--) {
    if (zip.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error('Not a zip file.');
}

function* readZipEntries(zip: Buffer): Generator<ZipEntry> {
  const end = findEndOfCentralDirectory(zip);
  let entryCount = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  if (offset === OVERFLOW_32 || entryCount === 0xffff) {
    const locator = end - 20;
    if (locator >= 0 && zip.readUInt32LE(locator) === ZIP64_END_LOCATOR) {
      const zip64End = Number(zip.readBigUInt64LE(locator + 8));
      entryCount = Number(zip.readBigUInt64LE(zip64End + 32));
      offset = Number(zip.readBigUInt64LE(zip64End + 48));
    }
  }

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    if (zip.readUInt32LE(offset) !== CENTRAL_DIRECTORY_HEADER) throw new Error('Corrupt zip (central directory).');
    const method = zip.readUInt16LE(offset + 10);
    let compressedSize = zip.readUInt32LE(offset + 20);
    let uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const mode = zip.readUInt32LE(offset + 38) >>> 16;
    let localHeaderOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');

    // Zip64 stores each overflowed 32-bit field, in this order, in an extra field.
    let extraOffset = offset + 46 + nameLength;
    const extraEnd = extraOffset + extraLength;
    while (extraOffset + 4 <= extraEnd) {
      const fieldId = zip.readUInt16LE(extraOffset);
      const fieldSize = zip.readUInt16LE(extraOffset + 2);
      if (fieldId === ZIP64_EXTRA_FIELD) {
        let valueOffset = extraOffset + 4;
        if (uncompressedSize === OVERFLOW_32) {
          uncompressedSize = Number(zip.readBigUInt64LE(valueOffset));
          valueOffset += 8;
        }
        if (compressedSize === OVERFLOW_32) {
          compressedSize = Number(zip.readBigUInt64LE(valueOffset));
          valueOffset += 8;
        }
        if (localHeaderOffset === OVERFLOW_32) localHeaderOffset = Number(zip.readBigUInt64LE(valueOffset));
      }
      extraOffset += 4 + fieldSize;
    }

    const headerOffset = localHeaderOffset;
    const storedSize = compressedSize;
    const expectedSize = uncompressedSize;
    yield {
      name,
      mode,
      read() {
        if (zip.readUInt32LE(headerOffset) !== LOCAL_FILE_HEADER) throw new Error('Corrupt zip (local header).');
        const dataStart = headerOffset + 30 + zip.readUInt16LE(headerOffset + 26) + zip.readUInt16LE(headerOffset + 28);
        const data = zip.subarray(dataStart, dataStart + storedSize);
        if (method === 0) return Buffer.from(data);
        if (method !== 8) throw new Error(`Unsupported zip compression method ${method}.`);
        const content = inflateRawSync(data);
        if (content.length !== expectedSize) throw new Error(`Zip entry ${name} has the wrong size.`);
        return content;
      },
    };
    offset += 46 + nameLength + extraLength + commentLength;
  }
}

export function extractZipEntry(zip: Buffer, matches: (name: string) => boolean): Buffer {
  for (const entry of readZipEntries(zip)) {
    if (!entry.name.endsWith('/') && matches(entry.name)) return entry.read();
  }
  throw new Error('File not found in zip.');
}

/**
 * Extracts every entry into `directory`, keeping Unix permissions and symbolic links.
 * Refuses entries, and symbolic links, that would point outside `directory`. Returns the entry names.
 */
export async function extractZip(zip: Buffer, directory: string): Promise<string[]> {
  const root = resolve(directory);
  const isInsideRoot = (path: string) => path === root || path.startsWith(root + sep);
  const names: string[] = [];
  const isWindows = process.platform === 'win32';
  for (const entry of readZipEntries(zip)) {
    const target = resolve(root, entry.name);
    if (!isInsideRoot(target)) throw new Error(`Unsafe path in zip: ${entry.name}`);
    names.push(entry.name);
    if (entry.name.endsWith('/')) {
      await mkdir(target, { recursive: true });
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    if ((entry.mode & FILE_TYPE_MASK) === SYMBOLIC_LINK) {
      const linkTarget = entry.read().toString('utf8');
      // A link out of the folder would let a later entry such as "link/file" be written anywhere.
      if (!isInsideRoot(resolve(dirname(target), linkTarget))) throw new Error(`Unsafe link in zip: ${entry.name}`);
      if (!isWindows) await symlink(linkTarget, target);
      continue;
    }
    await writeFile(target, entry.read());
    const permissions = entry.mode & 0o777;
    if (!isWindows && permissions) await chmod(target, permissions);
  }
  return names;
}

export function extractTarGzEntry(archive: Buffer, matches: (name: string) => boolean): Buffer {
  const tar = gunzipSync(archive);
  let offset = 0;
  let longName: string | null = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start: number, length: number) =>
      header
        .subarray(start, start + length)
        .toString('utf8')
        .replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1);
    const prefix = field(345, 155);
    const name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    longName = null;
    const data = tar.subarray(offset + 512, offset + 512 + size);
    if (type === 'L') longName = data.toString('utf8').replace(/\0.*$/s, '');
    else if ((type === '0' || type === '') && matches(name)) return Buffer.from(data);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('File not found in tar.');
}

export interface TarEntry {
  name: string;
  data: Buffer;
  mode?: number;
}

export function createTarGz(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  const modifiedTime = Math.floor(Date.now() / 1000);
  for (const entry of entries) {
    if (Buffer.byteLength(entry.name) > 100) throw new Error(`Name too long for tar: ${entry.name}`);
    const header = Buffer.alloc(512);
    const writeField = (value: string, start: number, length: number) => header.write(value, start, length, 'utf8');
    const octal = (value: number, length: number) => value.toString(8).padStart(length - 1, '0') + '\0';
    writeField(entry.name, 0, 100);
    writeField(octal(entry.mode ?? 0o644, 8), 100, 8);
    writeField(octal(0, 8), 108, 8);
    writeField(octal(0, 8), 116, 8);
    writeField(octal(entry.data.length, 12), 124, 12);
    writeField(octal(modifiedTime, 12), 136, 12);
    writeField('        ', 148, 8);
    writeField('0', 156, 1);
    writeField('ustar\0', 257, 6);
    writeField('00', 263, 2);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeField(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    blocks.push(header, entry.data, Buffer.alloc((512 - (entry.data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 9 });
}
