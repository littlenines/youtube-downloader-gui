import { findElement } from '@client/utils/dom.js'

export type PanelName = 'media' | 'search' | 'batch'

const PANEL_SELECTORS: Record<PanelName, string> = { media: '#media', search: '#searchPanel', batch: '#batchPanel' }

export const showPanel = (name: PanelName | null): void => {
  for (const [panelName, selector] of Object.entries(PANEL_SELECTORS)) {
    findElement(selector).hidden = panelName !== name
  }
}
