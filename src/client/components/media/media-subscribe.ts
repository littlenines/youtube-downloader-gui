import type { PlaylistInfo } from '@shared/types/media.js'
import { api } from '@client/api.js'
import { announceSubscriptionsChanged } from '@client/events.js'
import { state } from '@client/state.js'
import { LONG_TOAST_MILLISECONDS, showToast } from '@client/utils/dom.js'
import { runButtonAction } from '@client/components/button-action.js'
import { chosenFormat } from '@client/components/choices/chosen-format.js'

export const subscribeToMedia = (info: PlaylistInfo, button: HTMLButtonElement): Promise<void> =>
  runButtonAction({
    button,
    busyText: 'Subscribing…',
    retry: () => void subscribeToMedia(info, button),
    run: async () => {
      const subscription = await api.subscribe({
        ...chosenFormat(state.choices.resolution),
        url: info.url,
        skipShorts: state.choices.skipShorts,
      })

      showToast(
        `Subscribed to “${subscription.title}”. Its new videos download automatically when the app starts. See 🔔 Subscriptions.`,
        LONG_TOAST_MILLISECONDS,
      )
      announceSubscriptionsChanged()
    },
  })
