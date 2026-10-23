import type { VideoInfo } from '@shared/types/media.js'
import { api, ApiError, TOOLS_MISSING_STATUS } from '@client/api.js'
import { announceDownloadsChanged } from '@client/events.js'
import { errorMessage, showToast } from '@client/utils/dom.js'
import { requestSetup } from '@client/components/setup/setup.js'

const COVER_TOAST_MILLISECONDS = 5000

const fileName = (file: string | undefined): string => file?.split(/[\\/]/).at(-1) ?? ''

export const saveCover = async (info: VideoInfo, square: boolean, button: HTMLButtonElement): Promise<void> => {
  const buttonText = button.textContent

  button.disabled = true
  button.textContent = 'Saving…'

  try {
    const entry = await api.saveCover({ url: info.url, square, title: info.title, thumbnailUrl: info.thumbnailUrl })

    showToast(`Saved “${fileName(entry.files[0])}” in the downloads folder.`, COVER_TOAST_MILLISECONDS)
    announceDownloadsChanged()
  } catch (error) {
    if (error instanceof ApiError && error.status === TOOLS_MISSING_STATUS) {
      requestSetup(() => void saveCover(info, square, button))
    } else {
      showToast(errorMessage(error), COVER_TOAST_MILLISECONDS)
    }
  } finally {
    button.disabled = false
    button.textContent = buttonText
  }
}
