import type { MediaInfo, PlaylistInfo, VideoInfo } from '@shared/types.js'
import { registerPreview } from '@server/services/preview/preview-streams.js'
import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import { runYtdlpForJson } from './run-ytdlp-json.js'
import { bestAudioSource, isUsableFormat, videoQualities } from './video-qualities.js'
import type { YtdlpEntry, YtdlpInfo } from './ytdlp-json.js'

const MAXIMUM_PLAYLIST_ENTRIES = 500
const UNTITLED = '(untitled)'

const playlistIdFromUrl = (url: string): string | null => {
  try {
    return new URL(url).searchParams.get('list')
  } catch {
    return null
  }
}

const isPresentEntry = (entry: YtdlpEntry | null): entry is YtdlpEntry => Boolean(entry)

const parsePlaylistInfo = (info: YtdlpInfo, requestedUrl: string): PlaylistInfo => {
  const entries = (info.entries ?? []).filter(isPresentEntry)
  const totalSeconds = entries.reduce((sum, entry) => sum + (entry.duration ?? 0), 0)

  return {
    kind: 'playlist',
    title: info.title ?? 'Playlist',
    uploader: info.uploader ?? info.channel ?? null,
    url: info.webpage_url ?? requestedUrl,
    videoCount: entries.length,
    thumbnailUrl: info.thumbnails?.at(-1)?.url ?? entries[0]?.thumbnails?.at(-1)?.url ?? null,
    durationSeconds: totalSeconds || null,
    entries: entries
      .slice(0, MAXIMUM_PLAYLIST_ENTRIES)
      .map((entry) => ({
        title: entry.title ?? UNTITLED,
        durationSeconds: entry.duration ?? null,
        url: entry.url ?? entry.webpage_url ?? '',
      })),
  }
}

const parseVideoInfo = (info: YtdlpInfo, requestedUrl: string): VideoInfo => {
  const usableFormats = (info.formats ?? []).filter(isUsableFormat)
  const audio = bestAudioSource(usableFormats)

  return {
    kind: 'video',
    id: info.id ?? '',
    title: info.title ?? UNTITLED,
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
    qualities: videoQualities(usableFormats, audio?.sizeBytes ?? 0),
    subtitleLanguages: Object.keys(info.subtitles ?? {}).filter((language) => language !== 'live_chat'),
  }
}

export const parseMediaInfo = (ytdlpOutput: unknown, requestedUrl: string): MediaInfo => {
  const info = ytdlpOutput as YtdlpInfo

  return info._type === 'playlist' ? parsePlaylistInfo(info, requestedUrl) : parseVideoInfo(info, requestedUrl)
}

export const fetchMediaInfo = async (
  url: string,
  { playlist = false, signal }: { playlist?: boolean; signal?: AbortSignal } = {},
): Promise<MediaInfo> => {
  await toolSetup.requireInstalled()

  const playlistArguments = playlist ? ['--yes-playlist', '--flat-playlist'] : ['--no-playlist']
  const ytdlpOutput = await runYtdlpForJson(['-J', ...playlistArguments, '--', url], signal)
  const mediaInfo = parseMediaInfo(ytdlpOutput, url)

  if (mediaInfo.kind === 'video') mediaInfo.preview = registerPreview((ytdlpOutput as YtdlpInfo).formats ?? [])

  return mediaInfo
}
