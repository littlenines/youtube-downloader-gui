import { findElement, isTextEntryField } from '@client/utils/dom.js'
import { CLOSE_PANEL_ACTION, openPanel, showPanel } from './panels.js'

const LINK_INPUT_ID = 'linkInput'

export const closePanels = (): void => {
  findElement('#linkError').hidden = true
  showPanel(null)
}

const isEditingAnotherField = (target: EventTarget | null): boolean =>
  isTextEntryField(target) && (target as HTMLElement).id !== LINK_INPUT_ID

const closePanelsOnEscape = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented || !openPanel()) return
  if (document.querySelector('dialog[open]') || isEditingAnotherField(event.target)) return

  closePanels()
}

const closePanelsWhenLinkCleared = (event: Event): void => {
  if ((event.target as HTMLInputElement).value.trim() || openPanel() === 'batch') return

  closePanels()
}

export const initializeClosingPanels = (): void => {
  document.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest(`[data-action="${CLOSE_PANEL_ACTION}"]`)) closePanels()
  })
  document.addEventListener('keydown', closePanelsOnEscape)
  findElement(`#${LINK_INPUT_ID}`).addEventListener('input', closePanelsWhenLinkCleared)
}
