import type { SearchKind, SearchResult } from '@shared/types/media.js'
import { api, ApiError, isAbortError, TOOLS_MISSING_STATUS } from '@client/api.js'
import { errorMessage, findElement } from '@client/utils/dom.js'
import { escapeHtml, formatCount, formatDuration } from '@client/utils/format.js'
import { loadMediaInfo } from './media/media-panel.js'
import { panelBarHtml, showPanel, whenPanelHidden } from './panels.js'
import {
  ANY_LENGTH_FILTER_ID,
  applyFilterChange,
  FILTER_ATTRIBUTE,
  filterChangeFromId,
  filterResults,
  hiddenResultsHtml,
  loadSearchFilters,
  noMatchHtml,
  saveSearchFilters,
  searchFiltersHtml,
  type FilterChange,
} from './search-filters.js'
import { requestSetup } from './setup/setup.js'

let currentSearchRequest: AbortController | null = null
let activeSearch: { query: string; kind: SearchKind } | null = null
let shownResults: SearchResult[] | null = null
let filters = loadSearchFilters()

const searchPanel = () => findElement('#searchPanel')

const channelHtml = (result: SearchResult): string => {
  if (!result.channel) return ''

  return result.isVerified
    ? `${escapeHtml(result.channel)} <span class="verified-mark" title="Verified channel">✓</span>`
    : escapeHtml(result.channel)
}

const searchResultHtml = (result: SearchResult): string => {
  const details = [
    channelHtml(result),
    result.kind === 'playlist' ? 'Playlist' : formatDuration(result.durationSeconds),
    result.viewCount ? `${formatCount(result.viewCount)} views` : '',
  ].filter(Boolean)
  const thumbnail = result.thumbnailUrl
    ? `<img class="search-thumbnail" src="${escapeHtml(result.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '<div class="search-thumbnail"></div>'

  return `<button class="search-result" data-url="${escapeHtml(result.url)}" data-result-kind="${result.kind}">${thumbnail}
    <span class="search-text"><b class="search-title">${escapeHtml(result.title)}</b>
      <span class="search-details">${details.join(' · ')}</span></span></button>`
}

const renderSearchPanel = (headingHtml: string, bodyHtml: string): void => {
  searchPanel().innerHTML = `${panelBarHtml(headingHtml)}${bodyHtml}`
}

const resultListHtml = (results: SearchResult[]): string => {
  if (!results.length) return '<div class="empty-state">Nothing found. Try other words, or paste a link.</div>'

  const matchingResults = filterResults(results, filters)

  if (!matchingResults.length) return noMatchHtml(filters)

  return `${hiddenResultsHtml(matchingResults.length, results.length)}
    <div class="card search-results">${matchingResults.map(searchResultHtml).join('')}</div>`
}

const isFocusFree = (): boolean => {
  const focusedElement = document.activeElement

  return !focusedElement || focusedElement === document.body || searchPanel().contains(focusedElement)
}

const focusFilter = (filterId: string | null): void => {
  if (!filterId || !isFocusFree()) return

  searchPanel().querySelector<HTMLButtonElement>(`[${FILTER_ATTRIBUTE}="${filterId}"]`)?.focus()
}

const renderSearchOutcome = (bodyHtml: string, focusedFilterId: string | null): void => {
  if (!activeSearch) return

  renderSearchPanel(
    `<h2>Results for “${escapeHtml(activeSearch.query)}”</h2>`,
    `${searchFiltersHtml(activeSearch.kind, filters)}${bodyHtml}`,
  )
  focusFilter(focusedFilterId)
}

const cancelSearch = (): void => {
  currentSearchRequest?.abort()
  currentSearchRequest = null
}

const runSearch = async (query: string, kind: SearchKind, focusedFilterId: string | null): Promise<void> => {
  cancelSearch()

  const request = new AbortController()
  const searchingText = kind === 'playlist' ? 'Searching playlists for' : 'Searching for'

  currentSearchRequest = request
  activeSearch = { query, kind }
  shownResults = null
  renderSearchPanel(
    '',
    `<div class="card loading"><div class="spinner"></div>${searchingText} “${escapeHtml(query)}”…</div>`,
  )
  showPanel('search')

  try {
    const results = await api.search(query, kind, request.signal)

    if (request.signal.aborted) return

    shownResults = results
    renderSearchOutcome(resultListHtml(results), focusedFilterId)
  } catch (error) {
    if (request.signal.aborted || isAbortError(error)) return

    if (error instanceof ApiError && error.status === TOOLS_MISSING_STATUS) {
      showPanel(null)
      requestSetup(() => void runSearch(query, kind, null))

      return
    }

    renderSearchOutcome(`<div class="empty-state error-text">${escapeHtml(errorMessage(error))}</div>`, focusedFilterId)
  }
}

export const searchVideos = (query: string): Promise<void> => runSearch(query, 'video', null)

const changeFilter = (change: FilterChange, filterId: string): void => {
  if ('kind' in change) {
    const isRetry = !shownResults

    if (activeSearch && (activeSearch.kind !== change.kind || isRetry)) {
      void runSearch(activeSearch.query, change.kind, filterId)
    }

    return
  }

  filters = applyFilterChange(filters, change)
  saveSearchFilters(filters)

  if (shownResults)
    renderSearchOutcome(resultListHtml(shownResults), 'reset' in change ? ANY_LENGTH_FILTER_ID : filterId)
}

export const initializeSearchPanel = (): void => {
  whenPanelHidden('search', cancelSearch)
  searchPanel().addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const filterId = target.closest<HTMLButtonElement>(`button[${FILTER_ATTRIBUTE}]`)?.getAttribute(FILTER_ATTRIBUTE)

    if (filterId) {
      const change = filterChangeFromId(filterId)

      if (change) changeFilter(change, filterId)

      return
    }

    const resultButton = target.closest<HTMLButtonElement>('button[data-url]')

    if (resultButton?.dataset.url) {
      void loadMediaInfo(resultButton.dataset.url, resultButton.dataset.resultKind === 'playlist', { fromSearch: true })
    }
  })
}
