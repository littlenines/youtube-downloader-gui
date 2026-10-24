import { ApiError, TOOLS_MISSING_STATUS } from '@client/api.js'
import { errorMessage, LONG_TOAST_MILLISECONDS, showToast } from '@client/utils/dom.js'
import { requestSetup } from './setup/setup.js'

export interface ButtonAction {
  button: HTMLButtonElement
  busyText: string
  run: () => Promise<void>
  retry: () => void
}

export const runButtonAction = async ({ button, busyText, run, retry }: ButtonAction): Promise<void> => {
  const buttonText = button.textContent

  button.disabled = true
  button.textContent = busyText

  try {
    await run()
  } catch (error) {
    if (error instanceof ApiError && error.status === TOOLS_MISSING_STATUS) requestSetup(retry)
    else showToast(errorMessage(error), LONG_TOAST_MILLISECONDS)
  } finally {
    button.disabled = false
    button.textContent = buttonText
  }
}
