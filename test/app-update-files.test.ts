import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { swapAppFiles } from '@server/services/app-updates/file-swap.js'
import { findAppFolder, releasePackageFor } from '@server/services/app-updates/release-package.js'
import { withTemporaryFolder } from './support/temporary-folder.js'

const writeFiles = async (folder: string, files: Record<string, string>): Promise<void> => {
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(folder, name)), { recursive: true })
    await writeFile(join(folder, name), content)
  }
}

const readText = (folder: string, name: string) => readFile(join(folder, name), 'utf8')

const KEPT_NAMES = new Set(['data', 'tools', 'downloads', '.update'])

describe('swapAppFiles', () => {
  it('replaces the app files, keeps the user’s folders and sets the old files aside', () =>
    withTemporaryFolder('app-swap-', async (folder) => {
      const appFolder = join(folder, 'app')
      const newFolder = join(folder, 'new')
      const previousFolder = join(folder, 'app', '.update', 'previous')

      await writeFiles(appFolder, {
        'yt-downloader.exe': 'old exe',
        'locales/en-US.pak': 'old locale',
        'resources/app/desktop.cjs': 'old app',
        'data/settings.json': 'my settings',
        'tools/ffmpeg/ffmpeg.exe': 'my ffmpeg',
        'notes.txt': 'my notes',
      })
      await writeFiles(newFolder, {
        'yt-downloader.exe': 'new exe',
        'locales/en-US.pak': 'new locale',
        'resources/app/desktop.cjs': 'new app',
        'resources/app/client/main.js': 'new page',
        'data/settings.json': 'shipped by mistake',
      })

      await swapAppFiles({ newFolder, appFolder, previousFolder, keptNames: KEPT_NAMES })

      assert.equal(await readText(appFolder, 'yt-downloader.exe'), 'new exe')
      assert.equal(await readText(appFolder, 'locales/en-US.pak'), 'new locale')
      assert.equal(await readText(appFolder, 'resources/app/client/main.js'), 'new page')
      assert.equal(await readText(appFolder, 'data/settings.json'), 'my settings')
      assert.equal(await readText(appFolder, 'tools/ffmpeg/ffmpeg.exe'), 'my ffmpeg')
      assert.equal(await readText(appFolder, 'notes.txt'), 'my notes')
      assert.equal(await readText(previousFolder, 'yt-downloader.exe'), 'old exe')
      assert.equal(await readText(previousFolder, 'resources/app/desktop.cjs'), 'old app')
    }))

  it('puts every file back when one cannot be replaced', () =>
    withTemporaryFolder('app-swap-', async (folder) => {
      const appFolder = join(folder, 'app')
      const newFolder = join(folder, 'new')
      const previousFolder = join(folder, 'previous')

      await writeFiles(appFolder, { 'a.dll': 'old a', 'b.dll': 'old b', resources: 'a file where a folder goes' })
      await writeFiles(newFolder, { 'a.dll': 'new a', 'b.dll': 'new b', 'resources/app/desktop.cjs': 'new app' })

      await assert.rejects(
        swapAppFiles({ newFolder, appFolder, previousFolder, keptNames: KEPT_NAMES }),
        /Couldn't replace .*desktop\.cjs .*current version was kept/,
      )

      assert.equal(await readText(appFolder, 'a.dll'), 'old a')
      assert.equal(await readText(appFolder, 'b.dll'), 'old b')
      assert.equal(await readText(newFolder, 'a.dll'), 'new a', 'the new files go back, ready for another try')
      assert.equal(existsSync(join(previousFolder, 'a.dll')), false)
    }))
})

describe('release packages', () => {
  it('names the release file for each system that has one', () => {
    assert.equal(releasePackageFor('win32', 'x64')?.fileName, 'yt-downloader-win-x64.zip')
    assert.equal(releasePackageFor('linux', 'arm64')?.fileName, 'yt-downloader-linux-arm64.tar.gz')
    assert.equal(releasePackageFor('linux', 'x64')?.executableName, 'yt-downloader.bin')
    assert.equal(releasePackageFor('darwin', 'arm64'), null)
    assert.equal(releasePackageFor('win32', 'arm64'), null)
  })

  it('finds the app in the folder the archive unpacked into', () =>
    withTemporaryFolder('app-unpacked-', async (folder) => {
      await writeFiles(folder, { 'yt-downloader-win-x64/yt-downloader.exe': 'exe' })

      assert.equal(await findAppFolder(folder, 'yt-downloader.exe'), join(folder, 'yt-downloader-win-x64'))
      assert.equal(
        await findAppFolder(join(folder, 'yt-downloader-win-x64'), 'yt-downloader.exe'),
        join(folder, 'yt-downloader-win-x64'),
      )
      await assert.rejects(findAppFolder(folder, 'yt-downloader.bin'), /doesn't contain yt-downloader\.bin/)
    }))
})
