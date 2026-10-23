import type { MediaInfo } from '@shared/types.js'
import { api } from '@client/api.js'
import { announceDownloadsChanged } from '@client/events.js'
import { state } from '@client/state.js'
import { errorMessage, showToast } from '@client/utils/dom.js'
import { selectedVideoResolution } from './media-options-html.js'

const ERROR_TOAST_MILLISECONDS = 6000

const displayTitle = (info: MediaInfo, tags: typeof state.tags): string =>
  tags?.title ? `${tags.artist ? `${tags.artist} - ` : ''}${tags.title}` : info.title

const requestedResolution = (info: MediaInfo): number | null => {
  if (state.choices.kind === 'audio') return null

  return info.kind === 'video' ? selectedVideoResolution(info) : state.choices.resolution
}

export const startMediaDownload = async (info: MediaInfo, button: HTMLButtonElement): Promise<void> => {
  const { choices } = state
  const isPlaylist = info.kind === 'playlist'
  const videoCount = info.kind === 'playlist' ? info.videoCount : 1
  const tags = choices.kind === 'audio' && !isPlaylist ? state.tags : null

  button.disabled = true

  try {
    await api.startDownload({
      url: info.url,
      kind: choices.kind,
      format: choices.format,
      resolution: requestedResolution(info),
      container: choices.container,
      playlist: isPlaylist,
      coverArt: choices.coverArt,
      squareCoverArt: true,
      removeNonMusic: choices.removeNonMusic,
      subtitles: choices.subtitles,
      tags,
      title: displayTitle(info, tags),
      thumbnailUrl: info.thumbnailUrl,
      videoCount,
    })
    showToast(isPlaylist ? `Added ${videoCount} videos to the downloads.` : 'Download started.')
    announceDownloadsChanged()
  } catch (error) {
    showToast(errorMessage(error), ERROR_TOAST_MILLISECONDS)
  } finally {
    button.disabled = false
  }
}
