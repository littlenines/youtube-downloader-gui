import type { VideoInfo } from '@shared/types/media.js'
import { api } from '@client/api.js'
import { announceDownloadsChanged } from '@client/events.js'
import { LONG_TOAST_MILLISECONDS, showToast } from '@client/utils/dom.js'
import { runButtonAction } from '@client/components/button-action.js'

const fileName = (file: string | undefined): string => file?.split(/[\\/]/).at(-1) ?? ''

export const saveCover = (info: VideoInfo, square: boolean, button: HTMLButtonElement): Promise<void> =>
  runButtonAction({
    button,
    busyText: 'Saving…',
    retry: () => void saveCover(info, square, button),
    run: async () => {
      const entry = await api.saveCover({ url: info.url, square, title: info.title, thumbnailUrl: info.thumbnailUrl })

      showToast(`Saved “${fileName(entry.files[0])}” in the downloads folder.`, LONG_TOAST_MILLISECONDS)
      announceDownloadsChanged()
    },
  })
