import type { SearchResult } from '@shared/types/media.js'
import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import { runYtdlpForJson } from './run-ytdlp-json.js'
import type { YtdlpEntry, YtdlpInfo } from './ytdlp-json.js'

const SEARCH_RESULT_COUNT = 12

const isLinkableEntry = (entry: YtdlpEntry | null): entry is YtdlpEntry => Boolean(entry?.url || entry?.id)

export const parseSearchResults = (ytdlpOutput: unknown): SearchResult[] =>
  ((ytdlpOutput as YtdlpInfo).entries ?? [])
    .filter(isLinkableEntry)
    .map((entry) => ({
      title: entry.title ?? '(untitled)',
      url: entry.url ?? `https://www.youtube.com/watch?v=${entry.id}`,
      channel: entry.channel ?? entry.uploader ?? null,
      durationSeconds: entry.duration ?? null,
      viewCount: entry.view_count ?? null,
      thumbnailUrl: entry.thumbnails?.at(-1)?.url ?? null,
    }))

export const searchVideos = async (query: string, signal?: AbortSignal): Promise<SearchResult[]> => {
  await toolSetup.requireInstalled()

  const ytdlpOutput = await runYtdlpForJson(
    ['-J', '--flat-playlist', '--', `ytsearch${SEARCH_RESULT_COUNT}:${query}`],
    signal,
  )

  return parseSearchResults(ytdlpOutput)
}
