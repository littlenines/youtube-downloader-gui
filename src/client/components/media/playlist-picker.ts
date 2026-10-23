import type { PlaylistEntry, PlaylistInfo } from '@shared/types.js'
import { state } from '@client/state.js'
import { escapeHtml, formatDuration } from '@client/utils/format.js'

const POSITION_ATTRIBUTE = 'data-playlist-position'

export const isWholePlaylistSelected = (info: PlaylistInfo): boolean =>
  state.selectedPlaylistPositions.size === info.entries.length

export const selectedVideoCount = (info: PlaylistInfo): number =>
  isWholePlaylistSelected(info) ? info.videoCount : state.selectedPlaylistPositions.size

export const selectedPlaylistItems = (info: PlaylistInfo): number[] | null =>
  isWholePlaylistSelected(info) ? null : [...state.selectedPlaylistPositions].sort((first, second) => first - second)

export const selectWholePlaylist = (info: PlaylistInfo): void => {
  state.selectedPlaylistPositions = new Set(info.entries.map((entry) => entry.position))
}

const selectionText = (info: PlaylistInfo): string => {
  if (isWholePlaylistSelected(info)) return `All ${info.videoCount} videos selected`

  return `${state.selectedPlaylistPositions.size} of ${info.videoCount} videos selected`
}

const entryHtml = (entry: PlaylistEntry): string => {
  const checkedAttribute = state.selectedPlaylistPositions.has(entry.position) ? 'checked' : ''
  const title = escapeHtml(entry.title)

  return `<li><label class="playlist-entry">
    <input type="checkbox" ${POSITION_ATTRIBUTE}="${entry.position}" ${checkedAttribute}>
    <span class="playlist-entry-position">${entry.position}</span>
    <span class="playlist-entry-title" title="${title}">${title}</span>
    <span class="playlist-entry-duration">${formatDuration(entry.durationSeconds)}</span></label></li>`
}

const hiddenEntriesNoteHtml = (info: PlaylistInfo): string => {
  if (info.videoCount <= info.entries.length) return ''

  return `<p class="note">Showing the first ${info.entries.length} of ${info.videoCount} videos. With all of them selected, the whole playlist downloads.</p>`
}

export const playlistPickerHtml = (info: PlaylistInfo): string => `<div class="playlist-picker">
    <div class="playlist-picker-header"><span class="playlist-selection-count">${selectionText(info)}</span>
      <span class="playlist-picker-actions">
        <button class="button small ghost" data-action="select-all-videos">Select all</button>
        <button class="button small ghost" data-action="select-no-videos">Select none</button></span></div>
    <ul class="playlist-entries">${info.entries.map(entryHtml).join('')}</ul>${hiddenEntriesNoteHtml(info)}</div>`

const refreshSelectionCount = (panel: HTMLElement, info: PlaylistInfo): void => {
  const countElement = panel.querySelector('.playlist-selection-count')

  if (countElement) countElement.textContent = selectionText(info)
}

const playlistCheckboxes = (panel: HTMLElement) =>
  panel.querySelectorAll<HTMLInputElement>(`input[${POSITION_ATTRIBUTE}]`)

export const isPlaylistCheckbox = (element: HTMLElement): element is HTMLInputElement =>
  element instanceof HTMLInputElement && element.hasAttribute(POSITION_ATTRIBUTE)

export const applyPlaylistCheckbox = (panel: HTMLElement, info: PlaylistInfo, checkbox: HTMLInputElement): void => {
  const position = Number(checkbox.getAttribute(POSITION_ATTRIBUTE))

  if (checkbox.checked) state.selectedPlaylistPositions.add(position)
  else state.selectedPlaylistPositions.delete(position)

  refreshSelectionCount(panel, info)
}

export const setWholePlaylistSelected = (panel: HTMLElement, info: PlaylistInfo, isSelected: boolean): void => {
  if (isSelected) selectWholePlaylist(info)
  else state.selectedPlaylistPositions = new Set()

  playlistCheckboxes(panel).forEach((checkbox) => (checkbox.checked = isSelected))
  refreshSelectionCount(panel, info)
}
