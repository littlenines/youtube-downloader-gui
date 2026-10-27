import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { promisify } from 'node:util'
import { ytdlpPath } from '@server/services/tools/tool-paths.js'
import {
  installReadableThumbnailsPlugin,
  READABLE_THUMBNAILS_PLUGIN_SOURCE,
  readableThumbnailsArguments,
} from '@server/services/ytdlp/readable-thumbnails-plugin.js'

const runFile = promisify(execFile)

const thumbnail = (url: string, width: number) => ({ url, width })

describe('installing the readable thumbnails plugin', () => {
  it('adds no arguments until the plugin is installed, so yt-dlp never asks for a missing plugin', () => {
    assert.deepEqual(readableThumbnailsArguments(join(tmpdir(), `no-plugins-${randomUUID()}`)), [])
  })

  it('rewrites the plugin only when it differs, so a running yt-dlp never sees it half-written', async () => {
    const pluginsFolder = await mkdtemp(join(tmpdir(), 'readable-thumbnails-install-'))
    const pluginFile = join(
      pluginsFolder,
      'readable-thumbnails',
      'yt_dlp_plugins',
      'postprocessor',
      'readable_thumbnails.py',
    )

    try {
      await installReadableThumbnailsPlugin(pluginsFolder)

      const firstWrite = (await stat(pluginFile)).mtimeMs

      await installReadableThumbnailsPlugin(pluginsFolder)
      assert.equal((await stat(pluginFile)).mtimeMs, firstWrite)

      await writeFile(pluginFile, 'changed')
      await installReadableThumbnailsPlugin(pluginsFolder)
      assert.equal(await readFile(pluginFile, 'utf8'), READABLE_THUMBNAILS_PLUGIN_SOURCE)
    } finally {
      await rm(pluginsFolder, { recursive: true, force: true })
    }
  })
})

describe('the readable thumbnails plugin, run by the real yt-dlp', { skip: !existsSync(ytdlpPath()) }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'readable-thumbnails-'))
  const pluginsFolder = join(folder, 'plugins')

  after(() => rm(folder, { recursive: true, force: true }))
  await installReadableThumbnailsPlugin(pluginsFolder)

  const thumbnailYtdlpWrites = async (thumbnails: object[]): Promise<string> => {
    const infoFile = join(folder, `${randomUUID()}.info.json`)
    const info = {
      id: 'video',
      title: 'Video',
      extractor: 'generic',
      extractor_key: 'Generic',
      webpage_url: 'https://example.com/video',
      formats: [{ format_id: 'mp4', url: 'https://example.com/video.mp4', ext: 'mp4' }],
      thumbnails,
    }

    await writeFile(infoFile, JSON.stringify(info))

    const { stdout } = await runFile(ytdlpPath(), [
      ...readableThumbnailsArguments(pluginsFolder),
      '--no-warnings',
      '--simulate',
      '--print',
      '%(thumbnails.-1.url|none)s',
      '--load-info-json',
      infoFile,
    ])

    return stdout.trim()
  }

  it('skips an AVIF thumbnail, which ffmpeg cannot convert, for the next best one', async () => {
    const written = await thumbnailYtdlpWrites([
      thumbnail('https://example.com/small.jpg', 320),
      thumbnail('https://example.com/large.avif?size=big', 1280),
      thumbnail('https://example.com/larger.AVIF', 1920),
    ])

    assert.equal(written, 'https://example.com/small.jpg')
  })

  it('leaves the thumbnails alone when none is AVIF', async () => {
    const written = await thumbnailYtdlpWrites([
      thumbnail('https://example.com/small.jpg', 320),
      thumbnail('https://example.com/large.webp', 1280),
    ])

    assert.equal(written, 'https://example.com/large.webp')
  })

  it('keeps the thumbnails as they are, instead of failing the download, when it hits an error', async () => {
    const written = await thumbnailYtdlpWrites([
      thumbnail('https://example.com/small.jpg', 320),
      { ...thumbnail('https://example.com/large.avif', 1280), ext: 5 },
    ])

    assert.equal(written, 'https://example.com/large.avif')
  })

  it('writes no thumbnail when every one is AVIF', async () => {
    assert.equal(await thumbnailYtdlpWrites([thumbnail('https://example.com/large.avif', 1280)]), 'none')
  })
})
