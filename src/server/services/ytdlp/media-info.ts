import type { MediaInfo, PlaylistInfo, VideoInfo } from '@shared/types/media.js'
import { registerPreview } from '@server/services/preview/preview-streams.js'
import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import { rememberPlaylistListing, withPlaylistPositions } from './playlist-videos.js'
import { runYtdlpForJson } from './run-ytdlp.js'
import { subtitleTracks } from './subtitle-tracks.js'
import { videoInfoCache } from './video-info-cache.js'
import { bestAudioSource, isUsableFormat, videoQualities } from './video-qualities.js'
import { isVimeoVideoPage } from './vimeo-links.js'
import { linkArguments } from './ytdlp-command.js'
import { isYoutubeChannel, isYoutubeChannelLink, playlistIdFromUrl } from './youtube-links.js'
import { finiteNumberOrNull, type YtdlpInfo } from './ytdlp-json.js'

const MAXIMUM_PLAYLIST_ENTRIES = 500
const UNTITLED = '(untitled)'

const parsePlaylistInfo = (info: YtdlpInfo, requestedUrl: string): PlaylistInfo => {
  const isChannel = isYoutubeChannel(info, requestedUrl)
  const positionedEntries = isChannel ? [] : withPlaylistPositions(info.entries ?? [])
  const totalSeconds = positionedEntries.reduce((sum, { entry }) => sum + (finiteNumberOrNull(entry.duration) ?? 0), 0)

  return {
    kind: 'playlist',
    isChannel,
    title: (isChannel ? info.channel : null) ?? info.title ?? 'Playlist',
    uploader: info.uploader ?? info.channel ?? null,
    url: info.webpage_url ?? requestedUrl,
    videoCount: positionedEntries.length,
    thumbnailUrl: info.thumbnails?.at(-1)?.url ?? positionedEntries[0]?.entry.thumbnails?.at(-1)?.url ?? null,
    durationSeconds: totalSeconds || null,
    entries: positionedEntries
      .slice(0, MAXIMUM_PLAYLIST_ENTRIES)
      .map(({ entry, position }) => ({
        position,
        title: entry.title ?? UNTITLED,
        durationSeconds: finiteNumberOrNull(entry.duration),
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
    url: isVimeoVideoPage(requestedUrl) ? requestedUrl : (info.webpage_url ?? requestedUrl),
    thumbnailUrl: info.thumbnail ?? null,
    durationSeconds: finiteNumberOrNull(info.duration),
    viewCount: finiteNumberOrNull(info.view_count),
    isLive: Boolean(info.is_live),
    artist: info.artist ?? info.creator ?? null,
    track: info.track ?? null,
    album: info.album ?? null,
    playlistId: playlistIdFromUrl(requestedUrl),
    preview: null,
    audio,
    qualities: videoQualities(usableFormats, audio?.sizeBytes ?? 0),
    subtitleTracks: subtitleTracks(info),
  }
}

export const parseMediaInfo = (ytdlpOutput: unknown, requestedUrl: string): MediaInfo => {
  const info = ytdlpOutput as YtdlpInfo

  return info._type === 'playlist' ? parsePlaylistInfo(info, requestedUrl) : parseVideoInfo(info, requestedUrl)
}

export const readVideoInfo = (url: string, signal?: AbortSignal): Promise<unknown> =>
  runYtdlpForJson(['-J', '--no-playlist', ...linkArguments(url)], signal)

export const fetchMediaInfo = async (
  url: string,
  { playlist = false, signal }: { playlist?: boolean; signal?: AbortSignal } = {},
): Promise<MediaInfo> => {
  await toolSetup.requireInstalled()

  const playlistArgument = playlist ? '--yes-playlist' : '--no-playlist'
  const channelArguments = isYoutubeChannelLink(url) ? ['--playlist-items', '1'] : []
  const ytdlpOutput = await runYtdlpForJson(
    ['-J', '--flat-playlist', playlistArgument, ...channelArguments, ...linkArguments(url)],
    signal,
  )
  const mediaInfo = parseMediaInfo(ytdlpOutput, url)

  if (mediaInfo.kind === 'video') mediaInfo.preview = registerPreview((ytdlpOutput as YtdlpInfo).formats ?? [])
  if (mediaInfo.kind === 'video' && !mediaInfo.isLive) videoInfoCache.set(mediaInfo.url, ytdlpOutput)
  if (mediaInfo.kind === 'playlist' && !mediaInfo.isChannel)
    rememberPlaylistListing(mediaInfo.url, ytdlpOutput as YtdlpInfo)

  return mediaInfo
}
