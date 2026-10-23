import type { MediaInfo } from '@shared/types/media.js'
import { api } from '@client/api.js'
import { announceDownloadsChanged } from '@client/events.js'
import { state } from '@client/state.js'
import { errorMessage, showToast } from '@client/utils/dom.js'
import { chosenFormat } from '@client/components/choices/chosen-format.js'
import { selectedVideoResolution } from './media-options-html.js'
import { selectedPlaylistItems, selectedVideoCount } from './playlist-picker.js'

const ERROR_TOAST_MILLISECONDS = 6000

const displayTitle = (info: MediaInfo, tags: typeof state.tags): string =>
  tags?.title ? `${tags.artist ? `${tags.artist} - ` : ''}${tags.title}` : info.title

const videoCountText = (count: number): string => `${count} ${count === 1 ? 'video' : 'videos'}`

const requestedResolution = (info: MediaInfo): number | null => {
  if (state.choices.kind === 'audio') return null

  return info.kind === 'video' ? selectedVideoResolution(info) : state.choices.resolution
}

export const startMediaDownload = async (info: MediaInfo, button: HTMLButtonElement): Promise<void> => {
  const isPlaylist = info.kind === 'playlist'
  const videoCount = info.kind === 'playlist' ? selectedVideoCount(info) : 1
  const tags = state.choices.kind === 'audio' && !isPlaylist ? state.tags : null

  button.disabled = true

  try {
    await api.startDownload({
      ...chosenFormat(requestedResolution(info)),
      url: info.url,
      playlist: isPlaylist,
      playlistItems: info.kind === 'playlist' ? selectedPlaylistItems(info) : null,
      clip: info.kind === 'video' ? state.clip : null,
      tags,
      title: displayTitle(info, tags),
      thumbnailUrl: info.thumbnailUrl,
      videoCount,
    })
    showToast(isPlaylist ? `Added ${videoCountText(videoCount)} to the downloads.` : 'Download started.')
    announceDownloadsChanged()
  } catch (error) {
    showToast(errorMessage(error), ERROR_TOAST_MILLISECONDS)
  } finally {
    button.disabled = false
  }
}
