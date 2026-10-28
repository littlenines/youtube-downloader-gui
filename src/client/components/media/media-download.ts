import { countText } from '@shared/count-text.js'
import type { Job } from '@shared/types/downloads.js'
import type { MediaInfo } from '@shared/types/media.js'
import { api } from '@client/api.js'
import { announceDownloadsChanged } from '@client/events.js'
import { formatStartTime } from '@client/locale.js'
import { state } from '@client/state.js'
import { showToast } from '@client/utils/dom.js'
import { runButtonAction } from '@client/components/button-action.js'
import { chosenFormat } from '@client/components/choices/chosen-format.js'
import { requestedSubtitles } from '@client/components/choices/subtitle-choice.js'
import { isLaterTimeChosen } from '@client/components/settings/settings.js'
import { selectedVideoResolution } from './media-options-html.js'
import { selectedPlaylistItems, selectedVideoCount } from './playlist-picker.js'

const displayTitle = (info: MediaInfo, tags: typeof state.tags): string =>
  tags?.title ? `${tags.artist ? `${tags.artist} - ` : ''}${tags.title}` : info.title

const requestedResolution = (info: MediaInfo): number | null => {
  if (state.choices.kind === 'audio') return null

  return info.kind === 'video' ? selectedVideoResolution(info) : state.choices.resolution
}

const addedText = (isPlaylist: boolean, videoCount: number, job: Job): string => {
  const added = isPlaylist ? `Added ${countText(videoCount, 'video')}` : 'Added'

  if (job.status === 'scheduled') {
    return `${added}. ${isPlaylist ? 'They start' : 'It starts'} ${formatStartTime(job.startsAt)}.`
  }

  if (job.downloadLater) return `${added}. The “Later” time has begun, so ${isPlaylist ? 'they' : 'it'} started now.`

  return isPlaylist ? `${added} to the downloads.` : 'Download started.'
}

export const startMediaDownload = async (
  info: MediaInfo,
  button: HTMLButtonElement,
  { later = false } = {},
): Promise<void> => {
  const isPlaylist = info.kind === 'playlist'
  const videoCount = info.kind === 'playlist' ? selectedVideoCount(info) : 1
  const tags = state.choices.kind === 'audio' && !isPlaylist ? state.tags : null

  await runButtonAction({
    button,
    busyText: 'Adding…',
    retry: () => void startMediaDownload(info, button, { later }),
    run: async () => {
      if (later && !(await isLaterTimeChosen())) return

      const job = await api.startDownload({
        ...chosenFormat(requestedResolution(info), requestedSubtitles(info)),
        url: info.url,
        playlist: isPlaylist,
        playlistItems: info.kind === 'playlist' ? selectedPlaylistItems(info) : null,
        clip: info.kind === 'video' ? state.clip : null,
        tags,
        title: displayTitle(info, tags),
        thumbnailUrl: info.thumbnailUrl,
        videoCount,
        later,
      })

      showToast(addedText(isPlaylist, videoCount, job))
      announceDownloadsChanged()
    },
  })
}
