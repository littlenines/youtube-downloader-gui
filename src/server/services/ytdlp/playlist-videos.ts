import { isWebLink } from '@shared/links.js'
import { ExpiringMap } from '@server/lib/expiring-map.js'
import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import { runYtdlpForJson } from './run-ytdlp.js'
import { entryPageUrl, type YtdlpEntry, type YtdlpInfo } from './ytdlp-json.js'

export interface PositionedEntry {
  entry: YtdlpEntry
  position: number
}

export interface PlaylistVideo {
  position: number
  url: string | null
  title: string
  thumbnailUrl: string | null
}

export interface PlaylistListing {
  title: string
  videos: PlaylistVideo[]
}

const playlistListings = new ExpiringMap<PlaylistListing>({ lifetimeMilliseconds: 30 * 60_000, maximumEntries: 20 })

export const withPlaylistPositions = (entries: (YtdlpEntry | null)[]): PositionedEntry[] =>
  entries.flatMap((entry, index) => (entry ? [{ entry, position: index + 1 }] : []))

export const playlistListingFromInfo = (info: YtdlpInfo): PlaylistListing => ({
  title: info.title ?? 'Playlist',
  videos: withPlaylistPositions(info.entries ?? []).map(({ entry, position }) => {
    const url = entryPageUrl(entry)
    const isVideoLink = entry._type !== 'playlist' && url !== null && isWebLink(url)

    return {
      position,
      url: isVideoLink ? url : null,
      title: entry.title ?? url ?? `Video ${position}`,
      thumbnailUrl: entry.thumbnails?.at(-1)?.url ?? null,
    }
  }),
})

export const rememberPlaylistListing = (url: string, info: YtdlpInfo): void =>
  playlistListings.set(url, playlistListingFromInfo(info))

export const listPlaylistVideos = async (url: string, signal?: AbortSignal): Promise<PlaylistListing> => {
  const rememberedListing = playlistListings.get(url)

  if (rememberedListing) return rememberedListing

  await toolSetup.requireInstalled()

  const info = (await runYtdlpForJson(['-J', '--flat-playlist', '--yes-playlist', '--', url], signal)) as YtdlpInfo

  if (info._type !== 'playlist') throw new Error('This link is not a playlist.')

  rememberPlaylistListing(url, info)

  return playlistListingFromInfo(info)
}
