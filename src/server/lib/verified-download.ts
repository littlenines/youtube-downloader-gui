import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';

/** A download that receives nothing for this long is treated as stalled and stopped. */
const STALL_TIMEOUT_MILLISECONDS = 30_000;
const REQUEST_TIMEOUT_MILLISECONDS = 30_000;

export class IntegrityError extends Error {
  constructor(label: string) {
    super(`The downloaded ${label} did not match its published checksum, so it was not installed. Try again later.`);
  }
}

export interface VerifiedDownloadOptions {
  label: string;
  /** SHA-256 of the bytes as downloaded (before unpacking). */
  expectedSha256: string;
  onProgress?: (fraction: number) => void;
  gunzip?: boolean;
  stallTimeoutMilliseconds?: number;
}

/** Writes to "<destination>.part" and renames only once the checksum matches, so a broken file never looks installed. */
export async function downloadVerifiedFile(url: string, destination: string, options: VerifiedDownloadOptions): Promise<void> {
  const controller = new AbortController();
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const restartStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(), options.stallTimeoutMilliseconds ?? STALL_TIMEOUT_MILLISECONDS);
  };
  const partialFile = `${destination}.part`;
  try {
    restartStallTimer();
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!response.ok || !response.body)
      throw new Error(`Downloading ${options.label} failed (HTTP ${response.status}). Check the internet connection.`);
    const totalBytes = Number(response.headers.get('content-length')) || 0;
    const hash = createHash('sha256');
    let receivedBytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        restartStallTimer();
        hash.update(chunk);
        receivedBytes += chunk.length;
        if (totalBytes) options.onProgress?.(receivedBytes / totalBytes);
        callback(null, chunk);
      },
    });
    const source = Readable.fromWeb(response.body as unknown as WebReadableStream);
    if (options.gunzip) await pipeline(source, meter, createGunzip(), createWriteStream(partialFile));
    else await pipeline(source, meter, createWriteStream(partialFile));
    if (hash.digest('hex') !== options.expectedSha256.toLowerCase()) throw new IntegrityError(options.label);
    await rename(partialFile, destination);
  } catch (error) {
    await rm(partialFile, { force: true });
    if (controller.signal.aborted)
      throw new Error(`Downloading ${options.label} stopped responding. Check the internet connection and try again.`);
    throw error;
  } finally {
    clearTimeout(stallTimer);
  }
}

export async function downloadText(url: string): Promise<string> {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS) });
  if (!response.ok) throw new Error(`Downloading ${url} failed (HTTP ${response.status}). Check the internet connection.`);
  return response.text();
}

/** GitHub answers ".../releases/latest" with a redirect to ".../releases/tag/<tag>". */
export function releaseTagFromLocation(location: string | null): string | null {
  const tag = /\/releases\/tag\/([^/?#]+)$/.exec(location ?? '')?.[1];
  return tag ? decodeURIComponent(tag) : null;
}

/** Pins "latest" to one release, so a file and its checksum always come from the same release. */
export async function latestReleaseTag(repository: string): Promise<string> {
  const response = await fetch(`https://github.com/${repository}/releases/latest`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
  });
  const tag = releaseTagFromLocation(response.headers.get('location'));
  if (!tag) throw new Error(`Could not find the latest ${repository} release. Check the internet connection.`);
  return tag;
}

/**
 * Reads a SHA-256 from a checksum file: the line for `fileName` in a "<hash>  <name>" list,
 * or, without a name, the first hash in the text (Deno publishes one hash per file).
 */
export function parseSha256(checksumText: string, fileName?: string): string | null {
  if (!fileName) return /\b[a-f0-9]{64}\b/i.exec(checksumText)?.[0].toLowerCase() ?? null;
  for (const line of checksumText.split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line.trim());
    if (match?.[2] === fileName) return match[1]!.toLowerCase();
  }
  return null;
}
