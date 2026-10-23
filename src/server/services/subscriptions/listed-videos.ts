import type { SubscriptionSource } from '@shared/types/subscriptions.js'
import { downloadText } from '@server/lib/http/download-text.js'
import { runYtdlpForJson } from '@server/services/ytdlp/run-ytdlp.js'
import { youtubeVideoUrl } from '@server/services/ytdlp/youtube-links.js'
import type { YtdlpInfo } from '@server/services/ytdlp/ytdlp-json.js'

export interface ListedVideo {
  id: string
  url: string
  title: string
  thumbnailUrl: string | null
  publishedAt: string | null
  isShort: boolean
}

export interface VideoSource {
  source: SubscriptionSource
  url: string
  channelId: string | null
}

const YOUTUBE_FEED_URL = 'https://www.youtube.com/feeds/videos.xml'
const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

const decodeXml = (text: string): string =>
  text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, entity: string) => {
    if (!entity.startsWith('#')) return XML_ENTITIES[entity] ?? match

    const isHexadecimal = entity[1]?.toLowerCase() === 'x'
    const codePoint = Number.parseInt(entity.slice(isHexadecimal ? 2 : 1), isHexadecimal ? 16 : 10)

    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
  })

const elementText = (xml: string, tagName: string): string | null => {
  const text = new RegExp(`<${tagName}>([^<]*)</${tagName}>`).exec(xml)?.[1]

  return text === undefined ? null : decodeXml(text)
}

const attributeValue = (xml: string, pattern: RegExp): string | null => {
  const value = pattern.exec(xml)?.[1]

  return value === undefined ? null : decodeXml(value)
}

export const parseYoutubeFeed = (xml: string): ListedVideo[] =>
  [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(([, entry = '']) => {
    const id = elementText(entry, 'yt:videoId')

    if (!id) return []

    const link = attributeValue(entry, /<link rel="alternate" href="([^"]+)"/) ?? ''

    return [
      {
        id,
        url: youtubeVideoUrl(id),
        title: elementText(entry, 'title') ?? id,
        thumbnailUrl: attributeValue(entry, /<media:thumbnail url="([^"]+)"/),
        publishedAt: elementText(entry, 'published'),
        isShort: link.includes('/shorts/'),
      },
    ]
  })

export const parsePlaylistVideos = (info: YtdlpInfo): ListedVideo[] =>
  (info.entries ?? []).flatMap((entry) => {
    const url = entry?.url ?? entry?.webpage_url

    if (!entry || !url || entry._type === 'playlist') return []

    return [
      {
        id: entry.id ?? url,
        url,
        title: entry.title ?? url,
        thumbnailUrl: entry.thumbnails?.at(-1)?.url ?? null,
        publishedAt: null,
        isShort: url.includes('/shorts/'),
      },
    ]
  })

const fetchChannelFeed = async (channelId: string): Promise<ListedVideo[]> =>
  parseYoutubeFeed(await downloadText(`${YOUTUBE_FEED_URL}?channel_id=${encodeURIComponent(channelId)}`))

const fetchPlaylistVideos = async (url: string): Promise<ListedVideo[]> =>
  parsePlaylistVideos((await runYtdlpForJson(['-J', '--flat-playlist', '--yes-playlist', '--', url])) as YtdlpInfo)

export const listVideos = ({ source, url, channelId }: VideoSource): Promise<ListedVideo[]> =>
  source === 'channel' && channelId ? fetchChannelFeed(channelId) : fetchPlaylistVideos(url)
