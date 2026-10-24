import type { Settings } from '@shared/types/app.js'
import { api } from '@client/api.js'
import { errorMessage, LONG_TOAST_MILLISECONDS, showToast } from '@client/utils/dom.js'

export const saveSetting = async (changes: Partial<Settings>, savedMessage = 'Saved.'): Promise<Settings | null> => {
  try {
    const settings = await api.saveSettings(changes)

    showToast(savedMessage)

    return settings
  } catch (error) {
    showToast(errorMessage(error), LONG_TOAST_MILLISECONDS)

    return null
  }
}
