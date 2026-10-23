import type { SearchKind, SearchResult } from '@shared/types/media.js'
import { pressedAttribute, selectedClass } from './choices/choice-html.js'

export type LengthFilter = 'any' | 'short' | 'medium' | 'long'

export interface SearchFilters {
  length: LengthFilter
  verifiedOnly: boolean
}

export type FilterChange =
  { kind: SearchKind } | { length: LengthFilter } | { verifiedOnly: 'toggle' } | { reset: true }

interface LengthOption {
  filter: LengthFilter
  label: string
  description: string
  matches: (durationSeconds: number) => boolean
}

const SEARCH_FILTERS_KEY = 'yt-downloader.searchFilters'
const SHORT_SECONDS = 4 * 60
const LONG_SECONDS = 20 * 60
const DEFAULT_FILTERS: SearchFilters = { length: 'any', verifiedOnly: false }
const VERIFIED_FILTER_ID = 'verified'
const RESET_FILTER_ID = 'reset'

const KIND_OPTIONS: { kind: SearchKind; label: string }[] = [
  { kind: 'video', label: '🎬 Videos' },
  { kind: 'playlist', label: '📃 Playlists' },
]

const LENGTH_OPTIONS: LengthOption[] = [
  { filter: 'any', label: 'Any length', description: '', matches: () => true },
  {
    filter: 'short',
    label: 'Under 4 min',
    description: ' under 4 minutes',
    matches: (durationSeconds) => durationSeconds < SHORT_SECONDS,
  },
  {
    filter: 'medium',
    label: '4–20 min',
    description: ' between 4 and 20 minutes',
    matches: (durationSeconds) => durationSeconds >= SHORT_SECONDS && durationSeconds <= LONG_SECONDS,
  },
  {
    filter: 'long',
    label: 'Over 20 min',
    description: ' over 20 minutes',
    matches: (durationSeconds) => durationSeconds > LONG_SECONDS,
  },
]

export const FILTER_ATTRIBUTE = 'data-filter'
export const ANY_LENGTH_FILTER_ID = 'length:any'

const lengthOption = (filter: LengthFilter): LengthOption =>
  LENGTH_OPTIONS.find((option) => option.filter === filter) ?? (LENGTH_OPTIONS[0] as LengthOption)

const isSearchKind = (value: unknown): value is SearchKind => KIND_OPTIONS.some((option) => option.kind === value)

const isLengthFilter = (value: unknown): value is LengthFilter =>
  LENGTH_OPTIONS.some((option) => option.filter === value)

export const filterChangeFromId = (filterId: string): FilterChange | null => {
  const [group, value] = filterId.split(':')

  if (group === 'kind' && isSearchKind(value)) return { kind: value }
  if (group === 'length' && isLengthFilter(value)) return { length: value }
  if (filterId === VERIFIED_FILTER_ID) return { verifiedOnly: 'toggle' }
  if (filterId === RESET_FILTER_ID) return { reset: true }
  return null
}

export const applyFilterChange = (
  filters: SearchFilters,
  change: Exclude<FilterChange, { kind: SearchKind }>,
): SearchFilters => {
  if ('length' in change) return { ...filters, length: change.length }
  if ('verifiedOnly' in change) return { ...filters, verifiedOnly: !filters.verifiedOnly }
  return { ...DEFAULT_FILTERS }
}

const matchesLength = ({ durationSeconds }: SearchResult, filter: LengthFilter): boolean =>
  filter === 'any' || (durationSeconds != null && lengthOption(filter).matches(durationSeconds))

export const filterResults = (results: SearchResult[], filters: SearchFilters): SearchResult[] =>
  results.filter(
    (result) =>
      result.kind === 'playlist' ||
      (matchesLength(result, filters.length) && (!filters.verifiedOnly || result.isVerified)),
  )

const showAllButtonHtml = (): string =>
  `<button class="button ghost small" ${FILTER_ATTRIBUTE}="${RESET_FILTER_ID}">Show all</button>`

export const hiddenResultsHtml = (shownCount: number, totalCount: number): string =>
  shownCount < totalCount
    ? `<div class="filter-summary">${shownCount} of ${totalCount} shown ${showAllButtonHtml()}</div>`
    : ''

export const noMatchHtml = (filters: SearchFilters): string => {
  const verifiedText = filters.verifiedOnly ? ' from verified channels' : ''

  return `<div class="empty-state">No results${lengthOption(filters.length).description}${verifiedText}. ${showAllButtonHtml()}</div>`
}

const chipHtml = (filterId: string, label: string, isSelected: boolean): string =>
  `<button class="filter-chip ${selectedClass(isSelected)}" ${pressedAttribute(isSelected)} ${FILTER_ATTRIBUTE}="${filterId}">${label}</button>`

const videoFiltersHtml = (filters: SearchFilters): string => {
  const lengthChips = LENGTH_OPTIONS.map(({ filter, label }) =>
    chipHtml(`length:${filter}`, label, filter === filters.length),
  ).join('')
  const verifiedChip = chipHtml(VERIFIED_FILTER_ID, '✓ Verified only', filters.verifiedOnly)

  return `<div class="filter-group" role="group" aria-label="Length">${lengthChips}</div>
    <div class="filter-group" title="Only channels YouTube has verified, and artists' own Topic channels">${verifiedChip}</div>`
}

export const searchFiltersHtml = (kind: SearchKind, filters: SearchFilters): string => {
  const kindChips = KIND_OPTIONS.map((option) =>
    chipHtml(`kind:${option.kind}`, option.label, option.kind === kind),
  ).join('')

  return `<div class="search-filters"><div class="filter-group" role="group" aria-label="Search for">${kindChips}</div>
    ${kind === 'video' ? videoFiltersHtml(filters) : ''}</div>`
}

export const loadSearchFilters = (): SearchFilters => {
  try {
    const saved = JSON.parse(localStorage.getItem(SEARCH_FILTERS_KEY) ?? '{}') as Partial<SearchFilters>

    return {
      length: isLengthFilter(saved.length) ? saved.length : DEFAULT_FILTERS.length,
      verifiedOnly: saved.verifiedOnly === true,
    }
  } catch {
    return { ...DEFAULT_FILTERS }
  }
}

export const saveSearchFilters = (filters: SearchFilters): void => {
  try {
    localStorage.setItem(SEARCH_FILTERS_KEY, JSON.stringify(filters))
  } catch {}
}
