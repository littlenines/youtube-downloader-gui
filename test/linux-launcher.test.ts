import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import { LINUX_LAUNCHER } from '@scripts/release-texts.js'
import { createTemporaryFolder, removeFolder } from './support/temporary-folder.js'

const unescapeDesktopEntryString = (value: string): string =>
  value.replace(/\\(.)/g, (_, character: string) => (character === 's' ? ' ' : character))

const iconFromDesktopEntry = (entry: string): string =>
  unescapeDesktopEntryString(/^Icon=(.*)$/m.exec(entry)?.[1] ?? '')

const execArgumentsFromDesktopEntry = (entry: string): string[] => {
  const execValue = /^Exec=(.*)$/m.exec(entry)?.[1] ?? ''
  const unescapedValue = unescapeDesktopEntryString(execValue)
  const [, program, quotedPath] = /^(\/bin\/sh )?"(.*)"$/.exec(unescapedValue) ?? []

  assert.ok(quotedPath !== undefined, `unexpected Exec line: ${execValue}`)

  const path = quotedPath.replace(/\\(.)/g, '$1').replaceAll('%%', '%')

  return program ? [program.trim(), path] : [path]
}

describe('LINUX_LAUNCHER', { skip: process.platform === 'win32' }, async () => {
  const folder = await createTemporaryFolder('launcher-test-')

  after(() => removeFolder(folder))

  it('starts the app without ELECTRON_RUN_AS_NODE, with or without the sandbox', async () => {
    const appFolder = join(folder, 'start')
    const launcher = join(appFolder, 'yt-downloader')
    const noSandboxLauncher = `${LINUX_LAUNCHER.split('\nif [ -u')[0]}\nexec "$DIR/yt-downloader.bin" --no-sandbox "$@"\n`

    await mkdir(appFolder)
    await writeFile(join(appFolder, 'yt-downloader.bin'), '#!/bin/sh\necho "[$ELECTRON_RUN_AS_NODE]" "$@"\n', {
      mode: 0o755,
    })

    for (const [script, expectedOutput] of [
      [LINUX_LAUNCHER, /^\[\] (--no-sandbox )?--flag$/],
      [noSandboxLauncher, /^\[\] --no-sandbox --flag$/],
    ] as const) {
      await writeFile(launcher, script, { mode: 0o755 })

      const output = execFileSync(launcher, ['--flag'], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        encoding: 'utf8',
      })

      assert.match(output.trim(), expectedOutput)
    }
  })

  const installFrom = async (folderName: string): Promise<{ launcher: string; entry: string }> => {
    const appFolder = join(folder, folderName)
    const launcher = join(appFolder, 'yt-downloader')
    const dataFolder = join(appFolder, 'data')

    await mkdir(appFolder)
    await writeFile(launcher, LINUX_LAUNCHER, { mode: 0o755 })
    execFileSync(launcher, ['--install'], { env: { ...process.env, XDG_DATA_HOME: dataFolder } })

    return { launcher, entry: await readFile(join(dataFolder, 'applications', 'yt-downloader.desktop'), 'utf8') }
  }

  it('writes a menu entry that runs the launcher directly and shows its icon', async () => {
    const { launcher, entry } = await installFrom('Apps $HOME "new" `x` back\\slash')

    assert.deepEqual(execArgumentsFromDesktopEntry(entry), [launcher])
    assert.equal(iconFromDesktopEntry(entry), join(dirname(launcher), 'icon.png'))
    assert.match(entry, /^Categories=AudioVideo;$/m)
  })

  it('runs the launcher through sh when its folder has a % in it', async () => {
    const { launcher, entry } = await installFrom('Apps 100%')

    assert.deepEqual(execArgumentsFromDesktopEntry(entry), ['/bin/sh', launcher])
  })
})
