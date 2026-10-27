import { desktopBridge } from '@client/desktop.js'
import { MINI_MODE_ICON_HTML } from '@client/icons/mini-mode-icon.js'
import { errorMessage, findElement, showToast } from '@client/utils/dom.js'

export const initializeMiniModeButton = (): void => {
  const bridge = desktopBridge

  if (!bridge) return

  const button = findElement<HTMLButtonElement>('#miniModeButton')

  button.innerHTML = MINI_MODE_ICON_HTML
  button.hidden = false
  button.addEventListener('click', () => {
    bridge.enterMiniMode().catch((error: unknown) => showToast(errorMessage(error)))
  })
}
