import type { YtdlpInfo } from './ytdlp-json.js'

const YOUTUBE_TAB_EXTRACTOR = 'YoutubeTab'
const YOUTUBE_CHANNEL_LINK =
  /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/(?:@[^/?#]+|channel\/UC[\w-]+|c\/[^/?#]+|user\/[^/?#]+)(?:\/[\w-]+)?\/?(?:[?#].*)?$/i

export const playlistIdFromUrl = (url: string): string | null => {
  try {
    return new URL(url).searchParams.get('list')
  } catch {
    return null
  }
}

export const isYoutubeChannelLink = (url: string): boolean => YOUTUBE_CHANNEL_LINK.test(url) && !playlistIdFromUrl(url)

export const youtubeChannelTab = (url: string): string | null => {
  if (!isYoutubeChannelLink(url)) return null

  const pathSegments = new URL(url).pathname.split('/').filter(Boolean)
  const tabPosition = pathSegments[0]?.startsWith('@') ? 1 : 2

  return pathSegments[tabPosition]?.toLowerCase() ?? null
}

export const isYoutubeChannel = (info: YtdlpInfo, requestedUrl: string): boolean =>
  isYoutubeChannelLink(requestedUrl) && info.extractor_key === YOUTUBE_TAB_EXTRACTOR && Boolean(info.channel_id)

export const youtubeChannelUrl = (channelId: string): string => `https://www.youtube.com/channel/${channelId}`

export const youtubeVideoUrl = (videoId: string): string => `https://www.youtube.com/watch?v=${videoId}`
