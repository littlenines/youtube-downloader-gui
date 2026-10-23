import { suggestTags } from '@shared/tags.js'
import type { AudioTags } from '@shared/types/downloads.js'
import { api, ApiError, isAbortError, TOOLS_MISSING_STATUS } from '@client/api.js'
import { state } from '@client/state.js'
import { errorMessage, findElement } from '@client/utils/dom.js'
import { applyChoiceButton, applyChoiceCheckbox } from '@client/components/choices/apply-choice.js'
import { showPanel } from '@client/components/panels.js'
import { requestSetup } from '@client/components/setup/setup.js'
import {
  applyClipTimeInput,
  applyPreviewTime,
  canTrim,
  isClipTimeInput,
  isClipToggle,
  setClipEnabled,
} from './clip-editor.js'
import { startMediaDownload } from './media-download.js'
import { fileNamePreview, TAG_FIELDS } from './media-options-html.js'
import {
  mediaPanel,
  renderMediaOptions,
  renderMediaOptionsKeepingClipFocus,
  renderMediaPanel,
  showLoading,
} from './media-panel-view.js'
import { startPreview } from './media-preview.js'
import {
  applyPlaylistCheckbox,
  isPlaylistCheckbox,
  selectWholePlaylist,
  setWholePlaylistSelected,
} from './playlist-picker.js'

let currentMediaRequest: AbortController | null = null

const isTagField = (value: string | undefined): value is keyof AudioTags =>
  TAG_FIELDS.some(({ field }) => field === value)

const showLinkError = (error: unknown): void => {
  const errorBox = findElement('#linkError')

  errorBox.textContent = errorMessage(error)
  errorBox.hidden = false
}

export const loadMediaInfo = async (url: string, playlist = false, { fromSearch = false } = {}): Promise<void> => {
  currentMediaRequest?.abort()

  const request = new AbortController()

  currentMediaRequest = request
  state.url = url
  state.openedFromSearch = fromSearch
  showLoading()

  try {
    const info = await api.mediaInfo(url, playlist, request.signal)

    if (request.signal.aborted) return

    state.info = info
    state.tags = info.kind === 'video' ? suggestTags(info) : null
    state.clip = null

    if (info.kind === 'playlist') selectWholePlaylist(info)

    if (info.kind === 'video' && !info.qualities.some((quality) => quality.resolution === state.choices.resolution)) {
      state.choices.resolution = null
    }

    renderMediaPanel(info)
  } catch (error) {
    if (request.signal.aborted || isAbortError(error)) return

    state.info = null
    showPanel(fromSearch ? 'search' : null)

    if (error instanceof ApiError && error.status === TOOLS_MISSING_STATUS) {
      requestSetup(() => void loadMediaInfo(url, playlist, { fromSearch }))

      return
    }

    showLinkError(error)
  }
}

const handleMediaPanelClick = (event: Event): void => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')

  if (!button) return
  if (applyChoiceButton(button)) return renderMediaOptions()

  const action = button.dataset.action

  if (action === 'load-playlist') void loadMediaInfo(state.url, true)
  else if (action === 'download' && state.info) void startMediaDownload(state.info, button)
  else if (action === 'preview' && state.info?.kind === 'video') startPreview(mediaPanel(), state.info)
  else if (action === 'back-to-results') showPanel('search')
  else if ((action === 'clip-start-from-preview' || action === 'clip-end-from-preview') && canTrim(state.info)) {
    applyPreviewTime(mediaPanel(), state.info, action === 'clip-start-from-preview' ? 'start' : 'end')
    renderMediaOptions()
  } else if (action === 'select-all-videos' || action === 'select-no-videos') {
    if (state.info?.kind !== 'playlist') return

    setWholePlaylistSelected(mediaPanel(), state.info, action === 'select-all-videos')
    renderMediaOptions()
  }
}

const handleMediaPanelChange = (event: Event): void => {
  const target = event.target as HTMLElement

  if (isClipToggle(target) && canTrim(state.info)) {
    setClipEnabled(state.info, target.checked)
    renderMediaOptions()
  } else if (isClipTimeInput(target) && canTrim(state.info)) {
    applyClipTimeInput(state.info, target)
    renderMediaOptionsKeepingClipFocus()
  } else if (isPlaylistCheckbox(target) && state.info?.kind === 'playlist') {
    applyPlaylistCheckbox(mediaPanel(), state.info, target)
    renderMediaOptions()
  } else if (applyChoiceCheckbox(target)) {
    renderMediaOptions()
  }
}

const handleTagInput = (event: Event): void => {
  const input = event.target as HTMLInputElement
  const field = input.dataset.tag

  if (!state.tags || !isTagField(field)) return

  state.tags[field] = input.value

  const fileNameElement = mediaPanel().querySelector('.file-name-preview')

  if (fileNameElement) fileNameElement.textContent = fileNamePreview()
}

export const initializeMediaPanel = (): void => {
  mediaPanel().addEventListener('click', handleMediaPanelClick)
  mediaPanel().addEventListener('change', handleMediaPanelChange)
  mediaPanel().addEventListener('input', handleTagInput)
}
