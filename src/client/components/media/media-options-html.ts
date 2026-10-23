import type { AudioFormat, AudioTags, MediaInfo, VideoInfo, VideoQuality } from '@shared/types.js'
import { state } from '@client/state.js'
import { escapeHtml, formatBytes } from '@client/utils/format.js'
import {
  audioFormatCardsHtml,
  audioOptionsHtml,
  checkboxHtml,
  containerControlHtml,
  generalResolutionListHtml,
  kindTabsHtml,
  pressedAttribute,
  selectedClass,
} from '@client/components/choices/choice-html.js'
import { audioFormatCard } from '@client/components/choices/choice-options.js'

const FOUR_K_RESOLUTION = 2160
const AUDIO_BYTES_PER_SECOND: Partial<Record<AudioFormat, number>> = { mp3: 320_000 / 8, wav: 192_000, flac: 110_000 }

export const TAG_FIELDS: { field: keyof AudioTags; label: string; placeholder: string }[] = [
  { field: 'artist', label: 'Artist', placeholder: 'Artist' },
  { field: 'title', label: 'Title', placeholder: 'Song title' },
  { field: 'album', label: 'Album', placeholder: 'Optional' },
]

export const selectedVideoResolution = (info: VideoInfo): number | null =>
  state.choices.resolution ?? info.qualities[0]?.resolution ?? null

const selectedVideoQuality = (info: VideoInfo): VideoQuality | undefined =>
  info.qualities.find((quality) => quality.resolution === selectedVideoResolution(info))

export const fileNamePreview = (): string => {
  const title = state.tags?.title.trim() || state.info?.title || ''
  const artist = state.tags?.artist.trim()
  const artistPrefix = artist ? `${artist} - ` : ''

  return `${artistPrefix}${title}.${audioFormatCard(state.choices.format).fileExtension}`
}

const tagEditorHtml = (): string => {
  const tags = state.tags

  if (!tags) return ''

  const fields = TAG_FIELDS.map(
    ({ field, label, placeholder }) =>
      `<label class="tag-field">${label}<input type="text" data-tag="${field}" value="${escapeHtml(tags[field])}" placeholder="${placeholder}" spellcheck="false"></label>`,
  ).join('')

  return `<div class="section-label">Tags and file name</div>
    <div class="tag-fields">${fields}</div>
    <p class="note">Saved as <b class="file-name-preview">${escapeHtml(fileNamePreview())}</b></p>`
}

const audioPanelHtml = (info: MediaInfo): string => {
  const sourceText =
    info.kind === 'video' && info.audio
      ? `YouTube's best audio for this video: <b>${escapeHtml(info.audio.codec)} ~${info.audio.bitrateKbps} kbps</b>.`
      : ''

  return `${audioFormatCardsHtml()}${audioOptionsHtml()}${tagEditorHtml()}
    <p class="note">${sourceText} Converting to MP3 can't add quality beyond the source; 320 kbps just makes sure none is lost. For the absolute original, pick <b>Opus · original</b>.</p>`
}

const qualityOptionHtml = (quality: VideoQuality, isSelected: boolean): string => {
  const resolutionChip = quality.tag
    ? `<span class="chip ${quality.resolution >= FOUR_K_RESOLUTION ? 'accent' : ''}">${quality.tag}</span>`
    : ''
  const hdrChip = quality.hdr ? '<span class="chip accent">HDR</span>' : ''
  const sizeText = quality.estimatedBytes ? `~${formatBytes(quality.estimatedBytes)}` : ''

  return `<button class="quality-option ${selectedClass(isSelected)}" ${pressedAttribute(isSelected)} data-resolution="${quality.resolution}">
    <b>${escapeHtml(quality.label)}</b>
    <span class="quality-codecs">${resolutionChip}${hdrChip}<span>${quality.codecs.map(escapeHtml).join(' · ')}</span></span>
    <span class="quality-size">${sizeText}</span></button>`
}

const videoPanelHtml = (info: MediaInfo): string => {
  if (info.kind === 'playlist') return generalResolutionListHtml() + containerControlHtml()

  if (!info.qualities.length) {
    return '<p class="muted">No separate video qualities were found for this link. It will download in the best available format.</p>'
  }

  const pickedResolution = selectedVideoResolution(info)
  const qualityOptions = info.qualities
    .map((quality) => qualityOptionHtml(quality, quality.resolution === pickedResolution))
    .join('')
  const subtitlesOption = info.subtitleLanguages.length
    ? `<div class="option-list">${checkboxHtml('subtitles', 'Embed English subtitles', state.choices.container === 'webm')}</div>`
    : ''

  return `<div class="section-label">Quality</div>
    <div class="quality-list">${qualityOptions}</div>
    ${containerControlHtml()}${subtitlesOption}`
}

const estimatedBytes = (info: MediaInfo): number | null => {
  if (info.kind !== 'video' || !info.durationSeconds) return null
  if (state.choices.kind === 'video') return selectedVideoQuality(info)?.estimatedBytes ?? null

  const bytesPerSecond = AUDIO_BYTES_PER_SECOND[state.choices.format]

  return bytesPerSecond ? bytesPerSecond * info.durationSeconds : (info.audio?.sizeBytes ?? null)
}

const videoQualityLabel = (info: MediaInfo): string => {
  if (info.kind === 'playlist') return state.choices.resolution ? `${state.choices.resolution}p` : 'best quality'

  return selectedVideoQuality(info)?.label ?? 'best quality'
}

const summaryHtml = (info: MediaInfo): string => {
  const { choices } = state
  const formatText =
    choices.kind === 'audio'
      ? audioFormatCard(choices.format).title
      : `${choices.container.toUpperCase()} · ${videoQualityLabel(info)}`
  const videoCountText = info.kind === 'playlist' ? ` · all ${info.videoCount} videos` : ''
  const estimate = estimatedBytes(info)
  const estimateText = estimate ? ` · ~${formatBytes(estimate)}` : ''

  return `<b>${escapeHtml(formatText)}</b>${videoCountText}${estimateText}`
}

const footerHtml = (info: MediaInfo): string =>
  `<div class="media-footer"><span class="download-summary">${summaryHtml(info)}</span>
    <button class="button primary large" data-action="download">⬇ Download</button></div>`

export const mediaOptionsHtml = (info: MediaInfo): string => {
  const panelHtml = state.choices.kind === 'audio' ? audioPanelHtml(info) : videoPanelHtml(info)

  return `${kindTabsHtml()}<div class="tab-panel">${panelHtml}</div>${footerHtml(info)}`
}
