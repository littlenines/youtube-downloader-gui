import { clipLengthSeconds, formatClipTime, parseClipTime } from '@shared/clip-range.js'
import type { ClipRange, MediaInfo, VideoInfo } from '@shared/types.js'
import { state } from '@client/state.js'
import { showToast } from '@client/utils/dom.js'
import { formatDuration } from '@client/utils/format.js'

export type ClipEdge = 'start' | 'end'

const MINIMUM_CLIP_SECONDS = 1
const EDGE_ATTRIBUTE = 'data-clip-edge'
const TOGGLE_ATTRIBUTE = 'data-clip-toggle'
const EDGE_LABELS: Record<ClipEdge, string> = { start: 'Start', end: 'End' }

export const canTrim = (info: MediaInfo | null): info is VideoInfo =>
  info?.kind === 'video' && !info.isLive && Boolean(info.durationSeconds)

const isValidClip = (clip: ClipRange, durationSeconds: number): boolean =>
  clip.startSeconds >= 0 && clip.endSeconds <= durationSeconds && clipLengthSeconds(clip) >= MINIMUM_CLIP_SECONDS

const previewTimeButtonHtml = (info: VideoInfo, edge: ClipEdge): string =>
  info.preview
    ? `<button class="button small ghost" data-action="clip-${edge}-from-preview" title="Use where the preview is paused">Use preview time</button>`
    : ''

const timeFieldHtml = (info: VideoInfo, edge: ClipEdge, seconds: number): string =>
  `<label class="clip-field">${EDGE_LABELS[edge]}<span class="clip-field-row">
    <input type="text" ${EDGE_ATTRIBUTE}="${edge}" value="${formatClipTime(seconds)}" inputmode="decimal" spellcheck="false">
    ${previewTimeButtonHtml(info, edge)}</span></label>`

const clipNoteHtml = (info: VideoInfo, clip: ClipRange): string => {
  const previewHint = info.preview ? ' Pause the preview where the clip should start or end, then use its time.' : ''

  return `<p class="note">The clip is ${formatDuration(clipLengthSeconds(clip))} long.${previewHint}</p>`
}

export const clipEditorHtml = (info: MediaInfo): string => {
  if (!canTrim(info)) return ''

  const toggle = `<div class="option-list"><label class="checkbox-label">
    <input type="checkbox" ${TOGGLE_ATTRIBUTE} ${state.clip ? 'checked' : ''}> Download only part of it</label></div>`

  if (!state.clip) return toggle

  return `${toggle}<div class="clip-fields">${timeFieldHtml(info, 'start', state.clip.startSeconds)}${timeFieldHtml(info, 'end', state.clip.endSeconds)}</div>
    ${clipNoteHtml(info, state.clip)}`
}

export const isClipToggle = (element: HTMLElement): element is HTMLInputElement =>
  element instanceof HTMLInputElement && element.hasAttribute(TOGGLE_ATTRIBUTE)

export const isClipTimeInput = (element: HTMLElement): element is HTMLInputElement =>
  element instanceof HTMLInputElement && element.hasAttribute(EDGE_ATTRIBUTE)

export const setClipEnabled = (info: VideoInfo, isEnabled: boolean): void => {
  state.clip = isEnabled ? { startSeconds: 0, endSeconds: info.durationSeconds ?? 0 } : null
}

const setClipEdge = (info: VideoInfo, edge: ClipEdge, seconds: number): void => {
  if (!state.clip) return

  const durationSeconds = info.durationSeconds ?? 0
  const updatedClip =
    edge === 'start' ? { ...state.clip, startSeconds: seconds } : { ...state.clip, endSeconds: seconds }

  if (!isValidClip(updatedClip, durationSeconds)) {
    showToast(`The clip must be at least 1 second long, between 0:00 and ${formatClipTime(durationSeconds)}.`)

    return
  }

  state.clip = updatedClip
}

export const applyClipTimeInput = (info: VideoInfo, input: HTMLInputElement): void => {
  const seconds = parseClipTime(input.value)
  const edge: ClipEdge = input.getAttribute(EDGE_ATTRIBUTE) === 'end' ? 'end' : 'start'

  if (seconds === null) showToast('Write times like 1:23, 1:02:03 or 83.')
  else setClipEdge(info, edge, seconds)
}

export const applyPreviewTime = (panel: HTMLElement, info: VideoInfo, edge: ClipEdge): void => {
  const player = panel.querySelector<HTMLMediaElement>('.preview-frame video, .preview-frame audio')

  if (!player) {
    showToast(`Play the preview first, then pause where the clip should ${edge}.`)

    return
  }

  setClipEdge(info, edge, Math.round(player.currentTime * 10) / 10)
}

export const clipFraction = (info: VideoInfo): number =>
  state.clip && info.durationSeconds ? clipLengthSeconds(state.clip) / info.durationSeconds : 1
