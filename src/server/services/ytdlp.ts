import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import type { AudioSource, DownloadOptions, MediaInfo, SearchResult, VideoQuality } from '../../shared/types.js';
import { IS_WINDOWS } from '../config.js';
import { killProcessTree } from '../lib/os.js';
import { buildDownloadArguments, OUTPUT_MARKERS } from './formats.js';
import { registerPreview } from './preview.js';
import { commonArguments, requireTools, toolEnvironment, ytdlpPath } from './tools.js';
import { hasAudio, hasVideo, type YtdlpEntry, type YtdlpFormat, type YtdlpInfo } from './ytdlp-output.js';

const INFO_TIMEOUT_MILLISECONDS = 120_000;
const SEARCH_RESULT_COUNT = 12;
const KEPT_ERROR_OUTPUT_CHARACTERS = 8_000;

const FRIENDLY_ERRORS: [RegExp, string][] = [
  [/confirm your age|age-restricted/i, 'This video is age-restricted; YouTube requires a signed-in account to download it.'],
  [/Private video/i, 'This video is private.'],
  [/members-only|Join this channel/i, 'This video is for channel members only.'],
  [/Video unavailable/i, 'This video is unavailable (removed, blocked in your country, or the link is wrong).'],
  [/Unsupported URL/i, 'That link is not a video yt-dlp supports.'],
  [/live event will begin|is upcoming/i, 'This live stream has not started yet.'],
  [/HTTP Error 429|Too Many Requests/i, 'YouTube is rate-limiting this connection. Wait a few minutes and try again.'],
];

export function friendlyErrorMessage(errorOutput: string): string {
  const lines = errorOutput.split(/\r?\n/);
  const errorLine = lines.filter((line) => line.includes('ERROR')).pop() ?? lines.filter(Boolean).pop() ?? '';
  const message = errorLine.replace(/^.*?ERROR:\s*(\[[^\]]+\]\s*[\w-]+:\s*)?/, '').trim();
  return FRIENDLY_ERRORS.find(([pattern]) => pattern.test(message))?.[1] ?? (message || 'yt-dlp failed.');
}

function runYtdlpForJson(ytdlpArguments: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(ytdlpPath(), [...commonArguments(), ...ytdlpArguments], { windowsHide: true, env: toolEnvironment() });
    const outputChunks: Buffer[] = [];
    let errorOutput = '';
    const timeout = setTimeout(() => {
      killProcessTree(child.pid);
      reject(new Error('Reading the link took too long. Check the internet connection and try again.'));
    }, INFO_TIMEOUT_MILLISECONDS);
    child.stdout.on('data', (chunk: Buffer) => outputChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      errorOutput = (errorOutput + chunk.toString('utf8')).slice(-KEPT_ERROR_OUTPUT_CHARACTERS);
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      if (exitCode !== 0) return reject(new Error(friendlyErrorMessage(errorOutput)));
      try {
        resolve(JSON.parse(Buffer.concat(outputChunks).toString('utf8')));
      } catch {
        reject(new Error('yt-dlp returned unreadable data.'));
      }
    });
  });
}

const shortSide = (format: YtdlpFormat): number | null =>
  format.width && format.height ? Math.min(format.width, format.height) : (format.height ?? null);
const sizeOf = (format: YtdlpFormat): number | null => format.filesize ?? format.filesize_approx ?? null;

export function codecName(codec = ''): string {
  if (/^(avc1|h264)/.test(codec)) return 'H.264';
  if (/^vp0?9/.test(codec)) return 'VP9';
  if (/^av01/.test(codec)) return 'AV1';
  if (/^(hev|hvc|h265)/.test(codec)) return 'H.265';
  if (/^opus/.test(codec)) return 'Opus';
  if (/^mp4a/.test(codec)) return 'AAC';
  return codec.split('.')[0]?.toUpperCase() ?? codec;
}

function qualityTag(resolution: number): string {
  if (resolution >= 4320) return '8K';
  if (resolution >= 2160) return '4K';
  if (resolution >= 1440) return '2K';
  if (resolution >= 720) return 'HD';
  return '';
}

function playlistIdFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get('list');
  } catch {
    return null;
  }
}

export function parseMediaInfo(ytdlpOutput: unknown, requestedUrl: string): MediaInfo {
  const info = ytdlpOutput as YtdlpInfo;

  if (info._type === 'playlist') {
    const entries = (info.entries ?? []).filter((entry): entry is YtdlpEntry => Boolean(entry));
    const totalSeconds = entries.reduce((sum, entry) => sum + (entry.duration ?? 0), 0);
    return {
      kind: 'playlist',
      title: info.title ?? 'Playlist',
      uploader: info.uploader ?? info.channel ?? null,
      url: info.webpage_url ?? requestedUrl,
      videoCount: entries.length,
      thumbnailUrl: info.thumbnails?.at(-1)?.url ?? entries[0]?.thumbnails?.at(-1)?.url ?? null,
      durationSeconds: totalSeconds || null,
      entries: entries.slice(0, 500).map((entry) => ({
        title: entry.title ?? '(untitled)',
        durationSeconds: entry.duration ?? null,
        url: entry.url ?? entry.webpage_url ?? '',
      })),
    };
  }

  const usableFormats = (info.formats ?? []).filter(
    (format) => format.ext !== 'mhtml' && !/storyboard|premium/i.test(format.format_note ?? ''),
  );
  const bestAudio = usableFormats
    .filter((format) => hasAudio(format) && !hasVideo(format))
    .sort((first, second) => (second.abr ?? 0) - (first.abr ?? 0))[0];
  const audio: AudioSource | null = bestAudio
    ? { codec: codecName(bestAudio.acodec), bitrateKbps: Math.round(bestAudio.abr ?? bestAudio.tbr ?? 0), sizeBytes: sizeOf(bestAudio) }
    : null;

  const rowsByResolution = new Map<number, { framesPerSecond: number; codecs: Set<string>; largestBytes: number; hdr: boolean }>();
  for (const format of usableFormats) {
    const resolution = hasVideo(format) ? shortSide(format) : null;
    if (!resolution) continue;
    const row = rowsByResolution.get(resolution) ?? { framesPerSecond: 0, codecs: new Set<string>(), largestBytes: 0, hdr: false };
    row.framesPerSecond = Math.max(row.framesPerSecond, Math.round(format.fps ?? 0));
    row.codecs.add(codecName(format.vcodec));
    row.largestBytes = Math.max(row.largestBytes, sizeOf(format) ?? 0);
    if (/hdr/i.test(format.dynamic_range ?? '')) row.hdr = true;
    rowsByResolution.set(resolution, row);
  }
  const audioBytes = audio?.sizeBytes ?? 0;
  const qualities: VideoQuality[] = [...rowsByResolution.entries()]
    .sort(([firstResolution], [secondResolution]) => secondResolution - firstResolution)
    .map(([resolution, row]) => ({
      resolution,
      framesPerSecond: row.framesPerSecond,
      label: `${resolution}p${row.framesPerSecond > 30 ? row.framesPerSecond : ''}`,
      tag: qualityTag(resolution),
      hdr: row.hdr,
      codecs: [...row.codecs],
      hasH264: row.codecs.has('H.264'),
      estimatedBytes: row.largestBytes ? row.largestBytes + audioBytes : null,
    }));

  return {
    kind: 'video',
    id: info.id ?? '',
    title: info.title ?? '(untitled)',
    uploader: info.uploader ?? info.channel ?? null,
    url: info.webpage_url ?? requestedUrl,
    thumbnailUrl: info.thumbnail ?? null,
    durationSeconds: info.duration ?? null,
    viewCount: info.view_count ?? null,
    isLive: Boolean(info.is_live),
    artist: info.artist ?? info.creator ?? null,
    track: info.track ?? null,
    album: info.album ?? null,
    playlistId: playlistIdFromUrl(requestedUrl),
    preview: null,
    audio,
    qualities,
    subtitleLanguages: Object.keys(info.subtitles ?? {}).filter((language) => language !== 'live_chat'),
  };
}

export async function fetchMediaInfo(url: string, { playlist = false } = {}): Promise<MediaInfo> {
  await requireTools();
  const playlistArguments = playlist ? ['--yes-playlist', '--flat-playlist'] : ['--no-playlist'];
  const output = await runYtdlpForJson(['-J', ...playlistArguments, '--', url]);
  const info = parseMediaInfo(output, url);
  if (info.kind === 'video') info.preview = registerPreview((output as YtdlpInfo).formats ?? []);
  return info;
}

export function parseSearchResults(ytdlpOutput: unknown): SearchResult[] {
  const entries = ((ytdlpOutput as YtdlpInfo).entries ?? []).filter((entry): entry is YtdlpEntry => Boolean(entry?.url || entry?.id));
  return entries.map((entry) => ({
    title: entry.title ?? '(untitled)',
    url: entry.url ?? `https://www.youtube.com/watch?v=${entry.id}`,
    channel: entry.channel ?? entry.uploader ?? null,
    durationSeconds: entry.duration ?? null,
    viewCount: entry.view_count ?? null,
    thumbnailUrl: entry.thumbnails?.at(-1)?.url ?? null,
  }));
}

export async function searchVideos(query: string): Promise<SearchResult[]> {
  await requireTools();
  return parseSearchResults(await runYtdlpForJson(['-J', '--flat-playlist', '--', `ytsearch${SEARCH_RESULT_COUNT}:${query}`]));
}

/** `other` covers downloads without codecs, such as subtitles. */
export type StreamKind = 'picture' | 'sound' | 'combined' | 'other';

export type DownloadEvent =
  | {
      type: 'progress';
      stream: StreamKind;
      downloadedBytes: number | null;
      totalBytes: number | null;
      bytesPerSecond: number | null;
      secondsLeft: number | null;
    }
  | { type: 'item'; index: number | null; count: number | null; title: string }
  | { type: 'file'; file: string };

const isCodec = (value: string | undefined) => Boolean(value) && value !== 'none' && value !== 'NA';

export function streamKind(videoCodec: string | undefined, audioCodec: string | undefined): StreamKind {
  const hasPicture = isCodec(videoCodec);
  const hasSound = isCodec(audioCodec);
  if (hasPicture && hasSound) return 'combined';
  if (hasPicture) return 'picture';
  return hasSound ? 'sound' : 'other';
}

export interface RunningDownload {
  finished: Promise<void>;
  cancel(): void;
}

const parseNumber = (value: string | undefined): number | null =>
  value === undefined || value === 'NA' || value === 'None' || value === '' ? null : Number(value);

function forEachLine(stream: Readable, onLine: (line: string) => void): void {
  createInterface({ input: stream, crlfDelay: Infinity }).on('line', (line) => {
    const trimmed = line.trim();
    if (trimmed) onLine(trimmed);
  });
}

export function parseOutputLine(line: string): DownloadEvent | null {
  if (line.startsWith(OUTPUT_MARKERS.progress)) {
    const [videoCodec, audioCodec, ...numbers] = line.slice(OUTPUT_MARKERS.progress.length).split('|');
    const [downloadedBytes = null, totalBytes = null, bytesPerSecond = null, secondsLeft = null] = numbers.map(parseNumber);
    return { type: 'progress', stream: streamKind(videoCodec, audioCodec), downloadedBytes, totalBytes, bytesPerSecond, secondsLeft };
  }
  if (line.startsWith(OUTPUT_MARKERS.item)) {
    const [index, count, ...titleParts] = line.slice(OUTPUT_MARKERS.item.length).split('|');
    return { type: 'item', index: parseNumber(index), count: parseNumber(count), title: titleParts.join('|') };
  }
  if (line.startsWith(OUTPUT_MARKERS.file)) return { type: 'file', file: line.slice(OUTPUT_MARKERS.file.length) };
  return null;
}

export function startDownload(
  options: DownloadOptions,
  downloadFolder: string,
  partialFolder: string,
  onEvent: (event: DownloadEvent) => void,
): RunningDownload {
  // A separate process group on Linux and macOS, so cancelling also stops the ffmpeg that yt-dlp starts.
  const child = spawn(ytdlpPath(), [...commonArguments(), ...buildDownloadArguments(options, downloadFolder, partialFolder)], {
    windowsHide: true,
    detached: !IS_WINDOWS,
    env: toolEnvironment(),
  });
  let errorOutput = '';

  const handleLine = (line: string) => {
    const event = parseOutputLine(line);
    if (event) onEvent(event);
  };

  forEachLine(child.stdout, handleLine);
  forEachLine(child.stderr, (line) => {
    errorOutput = `${errorOutput}${line}\n`.slice(-KEPT_ERROR_OUTPUT_CHARACTERS);
    handleLine(line);
  });

  const finished = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (exitCode) => (exitCode === 0 ? resolve() : reject(new Error(friendlyErrorMessage(errorOutput)))));
  });
  return { finished, cancel: () => killProcessTree(child.pid) };
}
