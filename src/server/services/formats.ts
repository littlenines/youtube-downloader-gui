import type { AudioFormat, AudioTags, Container, DownloadOptions, DownloadRequest } from '../../shared/types.js';

interface AudioPreset {
  label: string;
  ytdlpArguments: string[];
  supportsCoverArt: boolean;
}

export const AUDIO_PRESETS: Record<AudioFormat, AudioPreset> = {
  mp3: {
    label: 'MP3 · 320 kbps',
    ytdlpArguments: ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '320K'],
    supportsCoverArt: true,
  },
  m4a: {
    label: 'M4A (AAC)',
    ytdlpArguments: ['-f', 'bestaudio[ext=m4a]/bestaudio/best', '-x', '--audio-format', 'm4a', '--audio-quality', '0'],
    supportsCoverArt: true,
  },
  opus: {
    label: 'Opus · original',
    ytdlpArguments: ['-f', 'bestaudio[acodec=opus]/bestaudio/best', '-x', '--audio-format', 'opus'],
    supportsCoverArt: true,
  },
  original: { label: 'Original audio (no conversion)', ytdlpArguments: ['-f', 'bestaudio/best', '-x'], supportsCoverArt: true },
  flac: { label: 'FLAC', ytdlpArguments: ['-f', 'bestaudio/best', '-x', '--audio-format', 'flac'], supportsCoverArt: true },
  wav: { label: 'WAV', ytdlpArguments: ['-f', 'bestaudio/best', '-x', '--audio-format', 'wav'], supportsCoverArt: false },
};

const CONTAINERS: Container[] = ['mp4', 'mkv', 'webm'];
const MAXIMUM_TAG_LENGTH = 200;

const CODEC_PREFERENCE: Record<Container, string> = {
  mp4: 'vcodec:h264,acodec:m4a',
  webm: 'vcodec:vp9,acodec:opus',
  mkv: 'vcodec,acodec',
};

/** Lines yt-dlp prints for the app to read (see startDownload in ytdlp.ts). */
export const OUTPUT_MARKERS = { progress: 'VPROG ', item: 'VITEM ', file: 'VFILE ' } as const;

export function normalizeRequest(request: Partial<DownloadRequest>): DownloadOptions {
  const resolution = Number(request.resolution);
  return {
    url: String(request.url ?? '').trim(),
    kind: request.kind === 'video' ? 'video' : 'audio',
    format: request.format && request.format in AUDIO_PRESETS ? request.format : 'mp3',
    resolution: Number.isFinite(resolution) && resolution > 0 ? Math.round(resolution) : null,
    container: request.container && CONTAINERS.includes(request.container) ? request.container : 'mp4',
    playlist: Boolean(request.playlist),
    coverArt: request.coverArt !== false,
    squareCoverArt: request.squareCoverArt !== false,
    removeNonMusic: Boolean(request.removeNonMusic),
    subtitles: Boolean(request.subtitles),
    tags: request.kind !== 'video' && !request.playlist ? normalizeTags(request.tags) : null,
  };
}

function normalizeTags(tags: unknown): AudioTags | null {
  if (!tags || typeof tags !== 'object') return null;
  const stored = tags as Record<string, unknown>;
  const clean = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAXIMUM_TAG_LENGTH) : '');
  const normalized = { artist: clean(stored.artist), title: clean(stored.title), album: clean(stored.album) };
  return normalized.artist || normalized.title || normalized.album ? normalized : null;
}

/** Always empty: it makes yt-dlp read the value as text rather than a field name, and keeps a trailing "\" off the separator. */
const EMPTY_TEMPLATE = '%(id&|)s';

function setTagArguments(field: keyof AudioTags, value: string): string[] {
  if (!value) return [];
  const escapedValue = value.replace(/%/g, '%%').replace(/:/g, '\\:');
  return ['--parse-metadata', `${EMPTY_TEMPLATE}${escapedValue}${EMPTY_TEMPLATE}:(?P<meta_${field}>[\\s\\S]+)`];
}

export function describeOptions(options: DownloadOptions): string {
  if (options.kind === 'audio') return AUDIO_PRESETS[options.format].label;
  return `${options.resolution ? `${options.resolution}p` : 'Best quality'} · ${options.container.toUpperCase()}`;
}

/** Unfinished files go to `partialFolder`; yt-dlp moves each file to `downloadFolder` once it is complete. */
export function buildDownloadArguments(options: DownloadOptions, downloadFolder: string, partialFolder: string): string[] {
  const commandArguments = [
    '--newline',
    '--progress',
    '--windows-filenames',
    '--no-mtime',
    '-P',
    downloadFolder,
    '-P',
    `temp:${partialFolder}`,
    '--progress-template',
    `download:${OUTPUT_MARKERS.progress}%(info.vcodec)s|%(info.acodec)s|%(progress.downloaded_bytes)s|%(progress.total_bytes,progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s`,
    // The title goes last because it may contain "|".
    '--print',
    `before_dl:${OUTPUT_MARKERS.item}%(playlist_index|)s|%(n_entries|)s|%(title)s`,
    '--print',
    `after_move:${OUTPUT_MARKERS.file}%(filepath)s`,
    options.playlist ? '--yes-playlist' : '--no-playlist',
  ];
  const playlistFolder = options.playlist ? '%(playlist_title)s/%(playlist_index)03d - ' : '';

  if (options.kind === 'audio') {
    const preset = AUDIO_PRESETS[options.format];
    commandArguments.push(...preset.ytdlpArguments, '--embed-metadata');
    if (options.tags) {
      const { artist, title, album } = options.tags;
      commandArguments.push(...setTagArguments('artist', artist), ...setTagArguments('title', title), ...setTagArguments('album', album));
      commandArguments.push('-o', '%(meta_artist,artist&{} - |)s%(meta_title,track,title)s.%(ext)s');
    } else {
      commandArguments.push('-o', `${playlistFolder}%(artist&{} - |)s%(track,title)s.%(ext)s`);
    }
    if (options.coverArt && preset.supportsCoverArt) {
      commandArguments.push('--embed-thumbnail', '--convert-thumbnails', 'jpg');
      if (options.squareCoverArt) {
        commandArguments.push('--ppa', 'ThumbnailsConvertor+FFmpeg_o:-c:v mjpeg -qmin 1 -q:v 1 -vf crop=ih:ih');
      }
    }
    if (options.removeNonMusic) commandArguments.push('--sponsorblock-remove', 'music_offtopic');
  } else {
    // yt-dlp's "res" sort key compares the short side, so vertical videos are picked like horizontal ones.
    const maximumResolution = options.resolution ?? 100_000;
    commandArguments.push(
      '-f',
      'bv*+ba/b',
      '-S',
      `res:${maximumResolution},fps,${CODEC_PREFERENCE[options.container]}`,
      '--merge-output-format',
      options.container,
      '--embed-metadata',
    );
    if (options.container !== 'webm') commandArguments.push('--embed-thumbnail', '--embed-chapters');
    if (options.subtitles && options.container !== 'webm') {
      // Not "en.*": that also matches YouTube's machine-translated tracks, and fetching them got the whole download refused (HTTP 429).
      commandArguments.push('--embed-subs', '--sub-langs', 'en', '--write-auto-subs');
    }
    const resolutionLabel = options.resolution ? ` [${options.resolution}p]` : '';
    commandArguments.push('-o', `${playlistFolder}%(title)s${resolutionLabel}.%(ext)s`);
  }

  commandArguments.push('--', options.url);
  return commandArguments;
}
