import { spawn } from 'node:child_process'
import { killProcessTree } from '@server/lib/process-tree.js'
import { ytdlpPath } from '@server/services/tools/tool-paths.js'
import { appendErrorOutput, friendlyErrorMessage } from './error-messages.js'
import { ytdlpCommonArguments, ytdlpEnvironment } from './ytdlp-command.js'

const TIMEOUT_MILLISECONDS = 120_000
const READING_TIMEOUT_MESSAGE = 'Reading the link took too long. Check the internet connection and try again.'
const CANCELLED_MESSAGE = 'Cancelled.'

export const runYtdlpForText = (
  ytdlpArguments: string[],
  signal?: AbortSignal,
  timeoutMessage = READING_TIMEOUT_MESSAGE,
): Promise<string> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error(CANCELLED_MESSAGE))

    const child = spawn(ytdlpPath(), [...ytdlpCommonArguments(), ...ytdlpArguments], {
      windowsHide: true,
      env: ytdlpEnvironment(),
    })
    const outputChunks: Buffer[] = []
    let errorOutput = ''
    const stopWithError = (message: string) => {
      killProcessTree(child.pid)
      reject(new Error(message))
    }

    const timeout = setTimeout(() => stopWithError(timeoutMessage), TIMEOUT_MILLISECONDS)
    const stopOnAbort = () => stopWithError(CANCELLED_MESSAGE)

    signal?.addEventListener('abort', stopOnAbort, { once: true })
    child.stdout.on('data', (chunk: Buffer) => outputChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      errorOutput = appendErrorOutput(errorOutput, chunk.toString('utf8'))
    })
    child.on('error', reject)
    child.on('close', (exitCode) => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', stopOnAbort)

      if (exitCode !== 0) return reject(new Error(friendlyErrorMessage(errorOutput)))

      resolve(Buffer.concat(outputChunks).toString('utf8'))
    })
  })

export const runYtdlpForJson = async (ytdlpArguments: string[], signal?: AbortSignal): Promise<unknown> => {
  const output = await runYtdlpForText(ytdlpArguments, signal)

  try {
    return JSON.parse(output)
  } catch {
    throw new Error('yt-dlp returned unreadable data.')
  }
}
