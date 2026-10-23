import type { SearchResult } from '@shared/types/media.js'
import { api, ApiError, isAbortError, TOOLS_MISSING_STATUS } from '@client/api.js'
import { errorMessage, findElement } from '@client/utils/dom.js'
import { escapeHtml, formatCount, formatDuration } from '@client/utils/format.js'
import { loadMediaInfo } from './media/media-panel.js'
import { panelBarHtml, showPanel, whenPanelHidden } from './panels.js'
import { requestSetup } from './setup/setup.js'

let currentSearchRequest: AbortController | null = null

const searchPanel = () => findElement('#searchPanel')

const searchResultHtml = (result: SearchResult): string => {
  const details = [
    result.channel ? escapeHtml(result.channel) : '',
    formatDuration(result.durationSeconds),
    result.viewCount ? `${formatCount(result.viewCount)} views` : '',
  ].filter(Boolean)
  const thumbnail = result.thumbnailUrl
    ? `<img class="search-thumbnail" src="${escapeHtml(result.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '<div class="search-thumbnail"></div>'

  return `<button class="search-result" data-url="${escapeHtml(result.url)}">${thumbnail}
    <span class="search-text"><b class="search-title">${escapeHtml(result.title)}</b>
      <span class="search-details">${details.join(' · ')}</span></span></button>`
}

const renderSearchPanel = (headingHtml: string, bodyHtml: string): void => {
  searchPanel().innerHTML = `${panelBarHtml(headingHtml)}${bodyHtml}`
}

const renderSearchResults = (query: string, results: SearchResult[]): void =>
  renderSearchPanel(
    `<h2>Results for “${escapeHtml(query)}”</h2>`,
    results.length
      ? `<div class="card search-results">${results.map(searchResultHtml).join('')}</div>`
      : '<div class="empty-state">Nothing found. Try other words, or paste a link.</div>',
  )

const cancelSearch = (): void => {
  currentSearchRequest?.abort()
  currentSearchRequest = null
}

export const searchVideos = async (query: string): Promise<void> => {
  cancelSearch()

  const request = new AbortController()

  currentSearchRequest = request
  renderSearchPanel(
    '',
    `<div class="card loading"><div class="spinner"></div>Searching for “${escapeHtml(query)}”…</div>`,
  )
  showPanel('search')

  try {
    const results = await api.search(query, request.signal)

    if (!request.signal.aborted) renderSearchResults(query, results)
  } catch (error) {
    if (request.signal.aborted || isAbortError(error)) return

    if (error instanceof ApiError && error.status === TOOLS_MISSING_STATUS) {
      showPanel(null)
      requestSetup(() => void searchVideos(query))

      return
    }

    renderSearchPanel('', `<div class="empty-state error-text">${escapeHtml(errorMessage(error))}</div>`)
  }
}

export const initializeSearchPanel = (): void => {
  whenPanelHidden('search', cancelSearch)
  searchPanel().addEventListener('click', (event) => {
    const resultButton = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-url]')

    if (resultButton?.dataset.url) void loadMediaInfo(resultButton.dataset.url, false, { fromSearch: true })
  })
}
