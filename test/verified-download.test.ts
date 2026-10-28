import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { gzipSync } from 'node:zlib'
import { parseSha256 } from '@server/lib/checksums.js'
import { releaseTagFromLocation } from '@server/lib/github-releases.js'
import { downloadVerifiedFile, IntegrityError } from '@server/lib/verified-download.js'
import { createTemporaryFolder, removeFolder } from './support/temporary-folder.js'
import { listenForFetch } from './support/listen.js'

const content = Buffer.from('pretend this is ffmpeg '.repeat(2000))
const compressed = gzipSync(content)
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex')

describe('downloadVerifiedFile', async () => {
  const directory = await createTemporaryFolder('verified-download-test-')
  let server: Server
  let baseUrl = ''

  before(async () => {
    server = createServer((request, response) => {
      if (request.url === '/stall') {
        response.writeHead(200, { 'content-length': '1000' })
        response.write('only the start')
        return
      }

      response.writeHead(200, { 'content-length': String(compressed.length) })
      response.end(compressed)
    })
    baseUrl = await listenForFetch(server)
  })
  after(async () => {
    server.closeAllConnections()
    server.close()
    await removeFolder(directory)
  })

  it('saves the unpacked file when the checksum matches', async () => {
    const destination = join(directory, 'tool')

    await downloadVerifiedFile(`${baseUrl}/tool.gz`, destination, {
      label: 'tool',
      expectedSha256: sha256(compressed),
      gunzip: true,
    })
    assert.deepEqual(await readFile(destination), content)
    assert.equal(existsSync(`${destination}.part`), false)
  })

  it('refuses a file whose checksum differs, leaving nothing behind', async () => {
    const destination = join(directory, 'tampered')

    await assert.rejects(
      downloadVerifiedFile(`${baseUrl}/tool.gz`, destination, {
        label: 'tool',
        expectedSha256: 'a'.repeat(64),
        gunzip: true,
      }),
      IntegrityError,
    )
    assert.equal(existsSync(destination), false)
    assert.equal(existsSync(`${destination}.part`), false)
  })

  it('gives up on a download that stops sending data', async () => {
    const destination = join(directory, 'stalled')

    await assert.rejects(
      downloadVerifiedFile(`${baseUrl}/stall`, destination, {
        label: 'tool',
        expectedSha256: 'a'.repeat(64),
        stallTimeoutMilliseconds: 200,
      }),
      /stopped responding/,
    )
    assert.equal(existsSync(`${destination}.part`), false)
  })
})

describe('parseSha256', () => {
  const hash = 'dcddc44b6151ccd855a9a3c8fcdb00e897bb872ec9f4908b1b708b16eaaaa114'

  it('finds the line for a file in a "<hash>  <name>" list', () => {
    const list = `${'1'.repeat(64)}  yt-dlp_linux_aarch64.zip\n${hash}  yt-dlp_linux.zip\n`

    assert.equal(parseSha256(list, 'yt-dlp_linux.zip'), hash)
    assert.equal(parseSha256(list, 'yt-dlp_macos.zip'), null)
  })

  it('reads the single hash in a Deno checksum file, in either case', () => {
    assert.equal(parseSha256(`\r\nAlgorithm : SHA256\r\nHash      : ${hash.toUpperCase()}\r\n`), hash)
  })
})

describe('releaseTagFromLocation', () => {
  it('reads the tag GitHub redirects "latest" to', () => {
    assert.equal(releaseTagFromLocation('https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.21'), '2026.10.21')
    assert.equal(releaseTagFromLocation('https://github.com/denoland/deno/releases/tag/v2.9.8'), 'v2.9.8')
    assert.equal(releaseTagFromLocation(null), null)
  })
})
