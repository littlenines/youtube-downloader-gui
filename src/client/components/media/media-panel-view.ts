import type { MediaInfo } from '@shared/types/media.js'
import { state } from '@client/state.js'
import { findElement } from '@client/utils/dom.js'
import { panelBarHtml, showPanel } from '@client/components/panels.js'
import { channelNoteHtml, mediaHeaderHtml, playlistLinkNoteHtml } from './media-header-html.js'
import { mediaOptionsHtml } from './media-options-html.js'
import { playlistPickerHtml } from './playlist-picker.js'

export const mediaPanel = () => findElement('#media')

export const renderMediaOptions = (): void => {
  const optionsContainer = mediaPanel().querySelector('.media-options')

  if (state.info && optionsContainer) optionsContainer.innerHTML = mediaOptionsHtml(state.info)
}

const CLIP_EDGE_ATTRIBUTE = 'data-clip-edge'

export const renderMediaOptionsKeepingClipFocus = (): void => {
  setTimeout(() => {
    const focusedElement = document.activeElement
    const focusedEdge = focusedElement instanceof HTMLElement ? focusedElement.getAttribute(CLIP_EDGE_ATTRIBUTE) : null

    renderMediaOptions()

    if (focusedEdge) mediaPanel().querySelector<HTMLInputElement>(`[${CLIP_EDGE_ATTRIBUTE}="${focusedEdge}"]`)?.select()
  })
}

const mediaPanelBarHtml = (): string =>
  panelBarHtml(
    state.openedFromSearch
      ? '<button class="button ghost small" data-action="back-to-results">← Back to results</button>'
      : '',
  )

const linkDetailsHtml = (info: MediaInfo): string => {
  if (info.kind === 'video') return playlistLinkNoteHtml(info)

  return info.isChannel ? channelNoteHtml() : playlistPickerHtml(info)
}

export const renderMediaPanel = (info: MediaInfo): void => {
  mediaPanel().innerHTML = `${mediaPanelBarHtml()}<div class="card">${mediaHeaderHtml(info)}${linkDetailsHtml(info)}<div class="media-options"></div></div>`
  renderMediaOptions()
  showPanel('media')
}

export const showLoading = (): void => {
  mediaPanel().innerHTML = `${mediaPanelBarHtml()}<div class="card loading"><div class="spinner"></div>Reading the link…</div>`
  showPanel('media')
}
