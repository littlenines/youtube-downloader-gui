import { runYtdlpForJson } from '@server/services/ytdlp/run-ytdlp.js'
import { linkArguments } from '@server/services/ytdlp/ytdlp-command.js'
import { isYoutubeChannel, youtubeChannelTab, youtubeChannelUrl } from '@server/services/ytdlp/youtube-links.js'
import type { YtdlpInfo, YtdlpThumbnail } from '@server/services/ytdlp/ytdlp-json.js'
import type { VideoSource } from './listed-videos.js'

export interface SubscriptionTarget extends VideoSource {
  title: string
  thumbnailUrl: string | null
  onlyShorts: boolean
}

const NOT_A_CHANNEL_MESSAGE =
  'Paste a channel or playlist link to subscribe. A single video has no new uploads to follow.'

const pictureUrl = (thumbnails: YtdlpThumbnail[] = []): string | null =>
  (thumbnails.find((thumbnail) => thumbnail.id?.includes('avatar')) ?? thumbnails.at(-1))?.url ?? null

export const subscriptionTargetFromInfo = (info: YtdlpInfo, requestedUrl: string): SubscriptionTarget => {
  const thumbnailUrl = pictureUrl(info.thumbnails)

  if (isYoutubeChannel(info, requestedUrl) && info.channel_id) {
    return {
      source: 'channel',
      url: youtubeChannelUrl(info.channel_id),
      channelId: info.channel_id,
      title: info.channel ?? info.uploader ?? info.title ?? 'Channel',
      thumbnailUrl,
      onlyShorts: youtubeChannelTab(requestedUrl) === 'shorts',
    }
  }

  if (info._type !== 'playlist') throw new Error(NOT_A_CHANNEL_MESSAGE)

  return {
    source: 'playlist',
    url: info.webpage_url ?? requestedUrl,
    channelId: null,
    title: info.title ?? 'Playlist',
    thumbnailUrl,
    onlyShorts: false,
  }
}

export const resolveSubscriptionTarget = async (url: string): Promise<SubscriptionTarget> => {
  const info = await runYtdlpForJson([
    '-J',
    '--flat-playlist',
    '--yes-playlist',
    '--playlist-items',
    '1',
    ...linkArguments(url),
  ])

  return subscriptionTargetFromInfo(info as YtdlpInfo, url)
}
