import { findElement } from '../utils/dom.js';

export type PanelName = 'media' | 'search' | 'batch';

const PANEL_SELECTORS: Record<PanelName, string> = { media: '#media', search: '#searchPanel', batch: '#batchPanel' };

/** Shows one panel below the link box and hides the others; null hides them all. */
export function showPanel(name: PanelName | null): void {
  for (const [panelName, selector] of Object.entries(PANEL_SELECTORS)) {
    findElement(selector).hidden = panelName !== name;
  }
}
