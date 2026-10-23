import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'
import type { DownloadOptions } from '@shared/types.js'
import { IS_WINDOWS } from '@server/config.js'
import { killProcessTree } from '@server/lib/process-tree.js'
import { ytdlpPath } from '@server/services/tools/tool-paths.js'
import { buildDownloadArguments } from './download-arguments.js'
import { parseOutputLine, type DownloadEvent } from './download-events.js'
import { appendErrorOutput, friendlyErrorMessage } from './error-messages.js'
import { ytdlpCommonArguments, ytdlpEnvironment } from './ytdlp-command.js'

export interface DownloadResult {
  skippedItems: string[]
}

export interface RunningDownload {
  finished: Promise<DownloadResult>
  cancel(): void
}

export interface DownloadFolders {
  downloadFolder: string
  partialFolder: string
}

const forEachNonEmptyLine = (stream: Readable, onLine: (line: string) => void): void => {
  createInterface({ input: stream, crlfDelay: Infinity }).on('line', (line) => {
    const trimmedLine = line.trim()

    if (trimmedLine) onLine(trimmedLine)
  })
}

export const startDownload = (
  options: DownloadOptions,
  folders: DownloadFolders,
  onEvent: (event: DownloadEvent) => void,
): RunningDownload => {
  const child = spawn(ytdlpPath(), [...ytdlpCommonArguments(), ...buildDownloadArguments(options, folders)], {
    windowsHide: true,
    detached: !IS_WINDOWS,
    env: ytdlpEnvironment(),
  })
  let errorOutput = ''
  const itemErrors: string[] = []
  let savedFileCount = 0

  const handleOutputLine = (line: string) => {
    const event = parseOutputLine(line)

    if (event?.type === 'file') savedFileCount++
    if (event) onEvent(event)
  }

  forEachNonEmptyLine(child.stdout, handleOutputLine)
  forEachNonEmptyLine(child.stderr, (line) => {
    errorOutput = appendErrorOutput(errorOutput, `${line}\n`)

    if (line.startsWith('ERROR:')) itemErrors.push(friendlyErrorMessage(line))

    handleOutputLine(line)
  })

  const finished = new Promise<DownloadResult>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (exitCode) => {
      const isPartlyDownloadedPlaylist = options.playlist && savedFileCount > 0

      if (exitCode === 0) resolve({ skippedItems: itemErrors })
      else if (isPartlyDownloadedPlaylist) {
        resolve({ skippedItems: itemErrors.length ? itemErrors : [friendlyErrorMessage(errorOutput)] })
      } else reject(new Error(friendlyErrorMessage(errorOutput)))
    })
  })

  return { finished, cancel: () => killProcessTree(child.pid) }
}
