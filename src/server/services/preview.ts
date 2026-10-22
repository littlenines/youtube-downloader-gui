import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { PreviewSource } from '../../shared/types.js';
import { HttpError } from '../lib/http.js';
import { hasAudio, hasVideo, type YtdlpFormat } from './ytdlp-output.js';

const PREVIEW_MAXIMUM_HEIGHT = 720;
/** Stream links from YouTube stay valid for several hours; an hour is plenty for a preview. */
const PREVIEW_LIFETIME_MILLISECONDS = 60 * 60 * 1000;
const MAXIMUM_REMEMBERED_PREVIEWS = 50;
const FORWARDED_HEADERS = ['content-type', 'content-length', 'content-range'];
const RETRY_DELAYS_MILLISECONDS = [1000, 1500, 2000, 2500, 3000];

interface PreviewStream {
  url: string;
  headers: Record<string, string>;
  expiresAt: number;
}

const previewStreams = new Map<string, PreviewStream>();

const isDirectStream = (format: YtdlpFormat) => Boolean(format.url) && /^https?$/.test(format.protocol ?? '');
const isStereoOrMono = (format: YtdlpFormat) => (format.audio_channels ?? 2) <= 2;
const isDynamicRangeCompressed = (format: YtdlpFormat) => format.format_id?.includes('drc') ?? false;

/** Picture and sound in one stream when there is one (playable as is), otherwise the plainest audio stream. */
export function choosePreviewFormat(formats: YtdlpFormat[]): { format: YtdlpFormat; kind: PreviewSource['kind'] } | null {
  const directFormats = formats.filter(isDirectStream);
  const combined = directFormats
    .filter((format) => hasVideo(format) && hasAudio(format) && (format.height ?? 0) <= PREVIEW_MAXIMUM_HEIGHT)
    .sort((first, second) => (second.height ?? 0) - (first.height ?? 0));
  if (combined[0]) return { format: combined[0], kind: 'video' };

  const audioOnly = directFormats
    .filter((format) => hasAudio(format) && !hasVideo(format) && isStereoOrMono(format) && !isDynamicRangeCompressed(format))
    .sort((first, second) => Number(second.ext === 'm4a') - Number(first.ext === 'm4a') || (second.abr ?? 0) - (first.abr ?? 0));
  return audioOnly[0] ? { format: audioOnly[0], kind: 'audio' } : null;
}

function forgetOldPreviews(now: number): void {
  for (const [token, stream] of previewStreams) {
    if (stream.expiresAt < now || previewStreams.size > MAXIMUM_REMEMBERED_PREVIEWS) previewStreams.delete(token);
  }
}

export function registerPreview(formats: YtdlpFormat[]): PreviewSource | null {
  const choice = choosePreviewFormat(formats);
  if (!choice?.format.url) return null;
  const now = Date.now();
  forgetOldPreviews(now);
  const token = randomUUID();
  previewStreams.set(token, {
    url: choice.format.url,
    headers: choice.format.http_headers ?? {},
    expiresAt: now + PREVIEW_LIFETIME_MILLISECONDS,
  });
  return { token, kind: choice.kind };
}

/** YouTube refuses a stream link (403) for a few seconds after handing it out, so refusals are retried. */
async function fetchStream(stream: PreviewStream, range: string | undefined): Promise<Response> {
  const headers = { ...stream.headers, ...(range ? { range } : {}) };
  let upstream = await fetch(stream.url, { headers });
  for (const delay of RETRY_DELAYS_MILLISECONDS) {
    if (upstream.status !== 403) break;
    await upstream.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, delay));
    upstream = await fetch(stream.url, { headers });
  }
  return upstream;
}

/** Relays the stream to the page, passing the Range header on so the player can seek. */
export async function streamPreview(token: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const stream = previewStreams.get(token);
  if (!stream || stream.expiresAt < Date.now()) throw new HttpError(404, 'This preview has expired. Read the link again.');
  const upstream = await fetchStream(stream, request.headers.range);
  if (!upstream.ok || !upstream.body) throw new HttpError(502, `The preview could not be loaded (HTTP ${upstream.status}).`);

  const forwardedHeaders: Record<string, string> = { 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  for (const name of FORWARDED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) forwardedHeaders[name] = value;
  }
  response.writeHead(upstream.status, forwardedHeaders);
  const body = Readable.fromWeb(upstream.body as unknown as WebReadableStream);
  await pipeline(body, response).catch(() => {
    // The player stops reading whenever the user seeks or closes the preview.
  });
}
