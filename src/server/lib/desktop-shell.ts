import { spawn, type SpawnOptions } from 'node:child_process'
import { dirname } from 'node:path'
import { IS_MAC, IS_WINDOWS } from '@server/config.js'
import { isExistingFile } from './existing-file.js'

export interface DesktopShell {
  openUrl(url: string): void
  reveal(target: string): void
  openFile(file: string): Promise<void>
}

const launchDetached = (command: string, commandArguments: string[], options: SpawnOptions = {}): void => {
  try {
    const child = spawn(command, commandArguments, { detached: true, stdio: 'ignore', ...options })

    child.on('error', () => {})
    child.unref()
  } catch {}
}

export const isWebAddress = (url: string): boolean => /^https?:\/\//i.test(url)

const systemShell: DesktopShell = {
  openUrl: (url) => {
    if (!isWebAddress(url)) return

    if (IS_WINDOWS) launchDetached('explorer.exe', [url])
    else launchDetached(IS_MAC ? 'open' : 'xdg-open', [url])
  },
  reveal: (target) => {
    const isFile = isExistingFile(target)

    if (IS_WINDOWS) {
      launchDetached('explorer.exe', [isFile ? `/select,"${target}"` : `"${target}"`], {
        windowsVerbatimArguments: true,
      })
    } else if (IS_MAC) {
      launchDetached('open', isFile ? ['-R', target] : [target])
    } else {
      launchDetached('xdg-open', [isFile ? dirname(target) : target])
    }
  },
  openFile: async (file) => {
    if (IS_WINDOWS) launchDetached('explorer.exe', [`"${file}"`], { windowsVerbatimArguments: true })
    else launchDetached(IS_MAC ? 'open' : 'xdg-open', [file])
  },
}

let activeShell: DesktopShell = systemShell

export const useDesktopShell = (shell: DesktopShell): void => {
  activeShell = shell
}

export const openInBrowser = (url: string): void => activeShell.openUrl(url)

export const revealInFileManager = (target: string): void => activeShell.reveal(target)

export const openWithDefaultApp = (file: string): Promise<void> => activeShell.openFile(file)
