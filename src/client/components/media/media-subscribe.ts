import type { PlaylistInfo } from '@shared/types/media.js'
import { api, ApiError, TOOLS_MISSING_STATUS } from '@client/api.js'
import { announceSubscriptionsChanged } from '@client/events.js'
import { state } from '@client/state.js'
import { errorMessage, showToast } from '@client/utils/dom.js'
import { chosenFormat } from '@client/components/choices/chosen-format.js'
import { requestSetup } from '@client/components/setup/setup.js'

const SUBSCRIBED_TOAST_MILLISECONDS = 6000

export const subscribeToMedia = async (info: PlaylistInfo, button: HTMLButtonElement): Promise<void> => {
  const buttonText = button.textContent

  button.disabled = true
  button.textContent = 'Subscribing…'

  try {
    const subscription = await api.subscribe({
      ...chosenFormat(state.choices.resolution),
      url: info.url,
      skipShorts: state.choices.skipShorts,
    })

    showToast(
      `Subscribed to “${subscription.title}”. Its new videos download automatically when the app starts. See 🔔 Subscriptions.`,
      SUBSCRIBED_TOAST_MILLISECONDS,
    )
    announceSubscriptionsChanged()
  } catch (error) {
    if (error instanceof ApiError && error.status === TOOLS_MISSING_STATUS) {
      requestSetup(() => void subscribeToMedia(info, button))
    } else {
      showToast(errorMessage(error), SUBSCRIBED_TOAST_MILLISECONDS)
    }
  } finally {
    button.disabled = false
    button.textContent = buttonText
  }
}
