import { spawn, spawnSync, type SpawnOptions } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { IS_MAC, IS_WINDOWS } from '../config.js';

export interface DesktopShell {
  openUrl(url: string): void;
  /** Shows a file selected in the file manager, or opens a folder. */
  reveal(target: string): void;
}

function launchDetached(command: string, commandArguments: string[], options: SpawnOptions = {}): void {
  try {
    const child = spawn(command, commandArguments, { detached: true, stdio: 'ignore', ...options });
    child.on('error', () => {});
    child.unref();
  } catch {
    // No opener on this system, e.g. a server without a desktop.
  }
}

const systemShell: DesktopShell = {
  openUrl(url) {
    if (IS_WINDOWS) launchDetached('cmd', ['/c', 'start', '', url], { windowsHide: true });
    else launchDetached(IS_MAC ? 'open' : 'xdg-open', [url]);
  },
  reveal(target) {
    const isFile = existsSync(target) && statSync(target).isFile();
    if (IS_WINDOWS) {
      // Explorer only accepts /select,"path" verbatim, and windowsHide would open its window invisibly.
      launchDetached('explorer.exe', [isFile ? `/select,"${target}"` : `"${target}"`], { windowsVerbatimArguments: true });
    } else if (IS_MAC) {
      launchDetached('open', isFile ? ['-R', target] : [target]);
    } else {
      launchDetached('xdg-open', [isFile ? dirname(target) : target]);
    }
  },
};

let activeShell: DesktopShell = systemShell;

export function useDesktopShell(shell: DesktopShell): void {
  activeShell = shell;
}

export const openInBrowser = (url: string): void => activeShell.openUrl(url);
export const revealInFileManager = (target: string): void => activeShell.reveal(target);

export function killProcessTree(processId: number | undefined): void {
  if (!processId) return;
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/PID', String(processId), '/T', '/F'], { windowsHide: true });
    return;
  }
  try {
    process.kill(-processId, 'SIGTERM');
  } catch {
    try {
      process.kill(processId, 'SIGTERM');
    } catch {
      // Already exited.
    }
  }
}
