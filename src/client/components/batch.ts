import { api } from '@client/api.js'
import { announceDownloadsChanged } from '@client/events.js'
import { state } from '@client/state.js'
import { errorMessage, findElement, showToast } from '@client/utils/dom.js'
import { escapeHtml } from '@client/utils/format.js'
import { applyChoiceButton, applyChoiceCheckbox } from './choices/apply-choice.js'
import {
  audioFormatCardsHtml,
  audioOptionsHtml,
  containerControlHtml,
  generalResolutionListHtml,
  kindTabsHtml,
} from './choices/choice-html.js'
import { audioFormatCard } from './choices/choice-options.js'
import { chosenFormat } from './choices/chosen-format.js'
import { showPanel } from './panels.js'
import { requestSetup, toolsAvailable } from './setup/setup.js'

const SUCCESS_TOAST_MILLISECONDS = 3500
const FAILURE_TOAST_MILLISECONDS = 8000

let batchLinks: string[] = []

const batchPanel = () => findElement('#batchPanel')

const isPlaylistLink = (url: string) => /[?&]list=/.test(url) && !/[?&]v=/.test(url)

const youtubeThumbnailUrl = (url: string): string | null => {
  const videoId = /(?:[?&]v=|youtu\.be\/|\/shorts\/)([\w-]{11})/.exec(url)?.[1]

  return videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null
}

const linkRowHtml = (link: string, index: number): string =>
  `<li class="batch-link"><span class="batch-link-text" title="${escapeHtml(link)}">${escapeHtml(link)}</span>
        <button class="button small ghost" data-action="remove-link" data-index="${index}" title="Remove from the list">✕</button></li>`

const chosenFormatText = (): string => {
  const { choices } = state

  if (choices.kind === 'audio') return audioFormatCard(choices.format).title

  return `${choices.container.toUpperCase()} · ${choices.resolution ? `${choices.resolution}p` : 'best quality'}`
}

const renderBatchPanel = (): void => {
  const optionsHtml =
    state.choices.kind === 'audio'
      ? audioFormatCardsHtml() + audioOptionsHtml()
      : generalResolutionListHtml() + containerControlHtml()

  batchPanel().innerHTML = `<div class="card">
    <div class="batch-header"><h2>${batchLinks.length} links</h2><span class="muted">All of them download with the same settings.</span></div>
    <ul class="batch-links">${batchLinks.map(linkRowHtml).join('')}</ul>
    ${kindTabsHtml()}<div class="tab-panel">${optionsHtml}</div>
    <div class="media-footer"><span class="download-summary"><b>${escapeHtml(chosenFormatText())}</b></span>
      <span class="footer-buttons"><button class="button" data-action="cancel-batch">Cancel</button>
      <button class="button primary large" data-action="download-all">⬇ Download all (${batchLinks.length})</button></span></div></div>`
}

const removeLink = (index: number): void => {
  batchLinks.splice(index, 1)

  if (batchLinks.length) renderBatchPanel()
  else showPanel(null)
}

const startBatchDownload = (url: string): Promise<unknown> =>
  api.startDownload({
    ...chosenFormat(state.choices.resolution),
    url,
    playlist: isPlaylistLink(url),
    title: url,
    thumbnailUrl: youtubeThumbnailUrl(url),
  })

const downloadAll = async (button: HTMLButtonElement): Promise<void> => {
  if (!toolsAvailable()) return requestSetup(() => void downloadAll(button))

  const failures: string[] = []

  button.disabled = true

  for (const url of batchLinks) {
    try {
      await startBatchDownload(url)
    } catch (error) {
      failures.push(`${url}: ${errorMessage(error)}`)
    }
  }

  button.disabled = false
  announceDownloadsChanged()

  const addedCount = batchLinks.length - failures.length

  if (failures.length) {
    showToast(`Added ${addedCount} of ${batchLinks.length}. ${failures[0]}`, FAILURE_TOAST_MILLISECONDS)
  } else {
    showToast(`Added ${addedCount} downloads.`, SUCCESS_TOAST_MILLISECONDS)
    showPanel(null)
  }
}

export const showBatch = (links: string[]): void => {
  batchLinks = links
  renderBatchPanel()
  showPanel('batch')
}

export const initializeBatchPanel = (): void => {
  batchPanel().addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')

    if (!button) return
    if (applyChoiceButton(button)) return renderBatchPanel()

    const { action, index } = button.dataset

    if (action === 'remove-link') removeLink(Number(index))
    else if (action === 'cancel-batch') showPanel(null)
    else if (action === 'download-all') void downloadAll(button)
  })
  batchPanel().addEventListener('change', (event) => {
    if (applyChoiceCheckbox(event.target as HTMLElement)) renderBatchPanel()
  })
}
