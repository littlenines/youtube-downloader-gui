import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SearchKind, SearchResult } from '@shared/types/media.js'
import {
  applyFilterChange,
  filterChangeFromId,
  filterResults,
  hiddenResultsHtml,
  noMatchHtml,
  type SearchFilters,
} from '@client/components/search-filters.js'

const result = (
  title: string,
  durationSeconds: number | null,
  { isVerified = false, kind = 'video' }: { isVerified?: boolean; kind?: SearchKind } = {},
): SearchResult => ({
  kind,
  title,
  url: `https://www.youtube.com/watch?v=${title}`,
  channel: null,
  durationSeconds,
  viewCount: null,
  thumbnailUrl: null,
  isVerified,
})

const RESULTS = [
  result('song', 200, { isVerified: true }),
  result('four-minutes', 240),
  result('twenty-minutes', 1200, { isVerified: true }),
  result('mix', 3600),
  result('live', null),
]

const ANY: SearchFilters = { length: 'any', verifiedOnly: false }

const titles = (results: SearchResult[]): string[] => results.map(({ title }) => title)

describe('filterResults', () => {
  it('keeps every result, live streams included, for any length', () => {
    assert.deepEqual(titles(filterResults(RESULTS, ANY)), ['song', 'four-minutes', 'twenty-minutes', 'mix', 'live'])
  })

  it('splits results at 4 and 20 minutes, with each edge in the middle group', () => {
    assert.deepEqual(titles(filterResults(RESULTS, { ...ANY, length: 'short' })), ['song'])
    assert.deepEqual(titles(filterResults(RESULTS, { ...ANY, length: 'medium' })), ['four-minutes', 'twenty-minutes'])
    assert.deepEqual(titles(filterResults(RESULTS, { ...ANY, length: 'long' })), ['mix'])
  })

  it('keeps only verified channels, together with the length', () => {
    assert.deepEqual(titles(filterResults(RESULTS, { ...ANY, verifiedOnly: true })), ['song', 'twenty-minutes'])
    assert.deepEqual(titles(filterResults(RESULTS, { ...ANY, verifiedOnly: true, length: 'short' })), ['song'])
  })

  it('shows every playlist, since playlists have no length or verified flag', () => {
    const playlists = [result('album', null, { kind: 'playlist' })]

    assert.deepEqual(titles(filterResults(playlists, { length: 'short', verifiedOnly: true })), ['album'])
  })
})

describe('hidden results', () => {
  it('says how many a filter hides, with Show all, and nothing when none are hidden', () => {
    assert.match(hiddenResultsHtml(13, 30), /13 of 30 shown.*Show all/)
    assert.equal(hiddenResultsHtml(30, 30), '')
  })

  it('says which filters left nothing, with Show all', () => {
    assert.match(
      noMatchHtml({ length: 'short', verifiedOnly: true }),
      /No results under 4 minutes from verified channels\..*Show all/,
    )
  })
})

describe('filter chips', () => {
  it('reads known chips and ignores unknown ones', () => {
    assert.deepEqual(filterChangeFromId('kind:playlist'), { kind: 'playlist' })
    assert.deepEqual(filterChangeFromId('length:long'), { length: 'long' })
    assert.deepEqual(filterChangeFromId('verified'), { verifiedOnly: 'toggle' })
    assert.deepEqual(filterChangeFromId('reset'), { reset: true })
    assert.equal(filterChangeFromId('length:forever'), null)
    assert.equal(filterChangeFromId('kind:channel'), null)
  })

  it('changes one filter at a time, and Show all clears both', () => {
    const filters = applyFilterChange(applyFilterChange(ANY, { length: 'long' }), { verifiedOnly: 'toggle' })

    assert.deepEqual(filters, { length: 'long', verifiedOnly: true })
    assert.deepEqual(applyFilterChange(filters, { verifiedOnly: 'toggle' }), { length: 'long', verifiedOnly: false })
    assert.deepEqual(applyFilterChange(filters, { reset: true }), ANY)
  })
})
