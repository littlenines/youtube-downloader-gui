import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { createGunzip } from 'node:zlib'

const DEFAULT_STALL_TIMEOUT_MILLISECONDS = 30_000

export class IntegrityError extends Error {
  constructor(label: string) {
    super(`The downloaded ${label} did not match its published checksum, so it was not installed. Try again later.`)
  }
}

export interface VerifiedDownloadOptions {
  label: string
  expectedSha256: string
  onProgress?: (fraction: number) => void
  gunzip?: boolean
  stallTimeoutMilliseconds?: number
}

const createStallWatchdog = (timeoutMilliseconds: number) => {
  const controller = new AbortController()
  let stallTimer: ReturnType<typeof setTimeout> | undefined

  return {
    signal: controller.signal,
    restart: () => {
      clearTimeout(stallTimer)
      stallTimer = setTimeout(() => controller.abort(), timeoutMilliseconds)
    },
    stop: () => clearTimeout(stallTimer),
  }
}

export const downloadVerifiedFile = async (
  url: string,
  destination: string,
  options: VerifiedDownloadOptions,
): Promise<void> => {
  const watchdog = createStallWatchdog(options.stallTimeoutMilliseconds ?? DEFAULT_STALL_TIMEOUT_MILLISECONDS)
  const partialFile = `${destination}.part`

  try {
    watchdog.restart()

    const response = await fetch(url, { redirect: 'follow', signal: watchdog.signal })

    if (!response.ok || !response.body) {
      throw new Error(`Downloading ${options.label} failed (HTTP ${response.status}). Check the internet connection.`)
    }

    const totalBytes = Number(response.headers.get('content-length')) || 0
    const hash = createHash('sha256')
    let receivedBytes = 0
    const progressMeter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        watchdog.restart()
        hash.update(chunk)
        receivedBytes += chunk.length

        if (totalBytes) options.onProgress?.(receivedBytes / totalBytes)

        callback(null, chunk)
      },
    })
    const body = Readable.fromWeb(response.body as unknown as WebReadableStream)

    if (options.gunzip) await pipeline(body, progressMeter, createGunzip(), createWriteStream(partialFile))
    else await pipeline(body, progressMeter, createWriteStream(partialFile))

    if (hash.digest('hex') !== options.expectedSha256.toLowerCase()) throw new IntegrityError(options.label)

    await rename(partialFile, destination)
  } catch (error) {
    await rm(partialFile, { force: true })

    if (watchdog.signal.aborted) {
      throw new Error(`Downloading ${options.label} stopped responding. Check the internet connection and try again.`)
    }

    throw error
  } finally {
    watchdog.stop()
  }
}
