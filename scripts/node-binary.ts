import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { extractTarGzEntry } from '@server/lib/archive/tar.js'
import { extractZipEntry } from '@server/lib/archive/zip.js'
import { parseSha256 } from '@server/lib/checksums.js'
import { BUILD_DIRECTORY, isLinuxTarget, type ReleaseTarget } from './common.js'

const NODE_CACHE_DIRECTORY = join(BUILD_DIRECTORY, 'cache')
const NODE_VERSION = process.version
const CURRENT_TARGET = `${process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`

const downloadToMemory = async (url: string): Promise<Buffer> => {
  const response = await fetch(url)

  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)

  return Buffer.from(await response.arrayBuffer())
}

const downloadVerifiedNodeArchive = async (fileName: string): Promise<Buffer> => {
  const releaseUrl = `https://nodejs.org/dist/${NODE_VERSION}`
  const checksumText = (await downloadToMemory(`${releaseUrl}/SHASUMS256.txt`)).toString('utf8')
  const expectedSha256 = parseSha256(checksumText, fileName)

  if (!expectedSha256) throw new Error(`nodejs.org lists no checksum for ${fileName}.`)

  const archive = await downloadToMemory(`${releaseUrl}/${fileName}`)

  if (createHash('sha256').update(archive).digest('hex') !== expectedSha256) {
    throw new Error(`${fileName} did not match its published checksum.`)
  }

  return archive
}

const downloadNodeBinary = async (target: ReleaseTarget, isWindows: boolean): Promise<Buffer> => {
  const archiveName = `node-${NODE_VERSION}-${target}`

  console.log(`Downloading Node ${NODE_VERSION} for ${target}…`)

  if (isWindows) {
    const archive = await downloadVerifiedNodeArchive(`${archiveName}.zip`)

    return extractZipEntry(archive, (name) => name.endsWith('/node.exe'))
  }

  const archive = await downloadVerifiedNodeArchive(`${archiveName}.tar.gz`)

  return extractTarGzEntry(archive, (name) => name.endsWith('/bin/node'))
}

export const nodeBinary = async (target: ReleaseTarget): Promise<Buffer> => {
  if (target === CURRENT_TARGET) return readFile(process.execPath)

  const isWindows = !isLinuxTarget(target)
  const cachedFile = join(NODE_CACHE_DIRECTORY, `node-${NODE_VERSION}-${target}-verified${isWindows ? '.exe' : ''}`)

  if (existsSync(cachedFile)) return readFile(cachedFile)

  const binary = await downloadNodeBinary(target, isWindows)

  await mkdir(NODE_CACHE_DIRECTORY, { recursive: true })
  await writeFile(cachedFile, binary)

  return binary
}
