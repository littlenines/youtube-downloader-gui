import { findElement } from '@client/utils/dom.js'

export type PanelName = 'media' | 'search' | 'batch'

const PANEL_SELECTORS: Record<PanelName, string> = { media: '#media', search: '#searchPanel', batch: '#batchPanel' }
const PANEL_NAMES = Object.keys(PANEL_SELECTORS) as PanelName[]
const hideHandlers: Partial<Record<PanelName, () => void>> = {}

export const CLOSE_PANEL_ACTION = 'close-panel'

export const panelBarHtml = (contentHtml: string): string =>
  `<div class="panel-bar">${contentHtml}<button class="button ghost small close-panel-button" data-action="${CLOSE_PANEL_ACTION}" title="Close (Esc)" aria-label="Close">✕</button></div>`

export const whenPanelHidden = (name: PanelName, handler: () => void): void => {
  hideHandlers[name] = handler
}

const pausePlayingMedia = (panel: HTMLElement): void => {
  for (const player of panel.querySelectorAll<HTMLMediaElement>('video, audio')) player.pause()
}

export const showPanel = (name: PanelName | null): void => {
  for (const panelName of PANEL_NAMES) {
    const panel = findElement(PANEL_SELECTORS[panelName])

    panel.hidden = panelName !== name

    if (!panel.hidden) continue

    pausePlayingMedia(panel)
    hideHandlers[panelName]?.()
  }
}

export const openPanel = (): PanelName | null =>
  PANEL_NAMES.find((panelName) => !findElement(PANEL_SELECTORS[panelName]).hidden) ?? null
