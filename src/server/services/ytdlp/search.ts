import type { SearchKind, SearchResult } from '@shared/types/media.js'
import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import { runYtdlpForJson } from './run-ytdlp.js'
import type { YtdlpEntry, YtdlpInfo } from './ytdlp-json.js'

const SEARCH_RESULT_COUNT = 30
const YOUTUBE_SEARCH_URL = 'https://www.youtube.com/results'
const PLAYLISTS_ONLY_FILTER = 'EgIQAw=='
const TOPIC_CHANNEL = / - Topic$/
const PLAYLIST_LINK = /[?&]list=/

const isLinkableEntry = (entry: YtdlpEntry | null): entry is YtdlpEntry => Boolean(entry?.url || entry?.id)

const isPlaylistEntry = (entry: YtdlpEntry): boolean =>
  entry.ie_key === 'YoutubeTab' || PLAYLIST_LINK.test(entry.url ?? '')

const entryUrl = (entry: YtdlpEntry, isPlaylist: boolean): string =>
  entry.url ??
  (isPlaylist ? `https://www.youtube.com/playlist?list=${entry.id}` : `https://www.youtube.com/watch?v=${entry.id}`)

const isVerifiedChannel = (entry: YtdlpEntry, channel: string | null): boolean =>
  entry.channel_is_verified === true || Boolean(channel && TOPIC_CHANNEL.test(channel))

export const parseSearchResults = (ytdlpOutput: unknown): SearchResult[] =>
  ((ytdlpOutput as YtdlpInfo).entries ?? []).filter(isLinkableEntry).map((entry) => {
    const channel = entry.channel ?? entry.uploader ?? null
    const isPlaylist = isPlaylistEntry(entry)

    return {
      kind: isPlaylist ? 'playlist' : 'video',
      title: entry.title ?? '(untitled)',
      url: entryUrl(entry, isPlaylist),
      channel,
      durationSeconds: entry.duration ?? null,
      viewCount: entry.view_count ?? null,
      thumbnailUrl: entry.thumbnails?.at(-1)?.url ?? null,
      isVerified: isVerifiedChannel(entry, channel),
    }
  })

const playlistSearchUrl = (query: string): string => {
  const url = new URL(YOUTUBE_SEARCH_URL)

  url.searchParams.set('search_query', query)
  url.searchParams.set('sp', PLAYLISTS_ONLY_FILTER)

  return url.href
}

export const searchArguments = (query: string, kind: SearchKind): string[] =>
  kind === 'playlist'
    ? ['-J', '--flat-playlist', '--playlist-items', `1:${SEARCH_RESULT_COUNT}`, '--', playlistSearchUrl(query)]
    : ['-J', '--flat-playlist', '--', `ytsearch${SEARCH_RESULT_COUNT}:${query}`]

export const searchYoutube = async (query: string, kind: SearchKind, signal?: AbortSignal): Promise<SearchResult[]> => {
  await toolSetup.requireInstalled()

  return parseSearchResults(await runYtdlpForJson(searchArguments(query, kind), signal))
}
