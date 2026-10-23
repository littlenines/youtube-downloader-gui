import { resolutionTag } from '@shared/resolution.js'
import { state } from '@client/state.js'
import {
  AUDIO_FORMAT_CARDS,
  CONTAINER_OPTIONS,
  GENERAL_RESOLUTIONS,
  selectedContainerOption,
  type AudioFormatCard,
  type CheckboxChoice,
} from './choice-options.js'

export const selectedClass = (isSelected: boolean): string => (isSelected ? 'selected' : '')

export const pressedAttribute = (isSelected: boolean): string => `aria-pressed="${isSelected}"`

export const kindTabsHtml = (): string => {
  const kind = state.choices.kind

  return `<div class="tabs" role="tablist" aria-label="Download as">
    <button class="tab ${selectedClass(kind === 'audio')}" role="tab" aria-selected="${kind === 'audio'}" data-kind="audio">🎵 Audio</button>
    <button class="tab ${selectedClass(kind === 'video')}" role="tab" aria-selected="${kind === 'video'}" data-kind="video">🎬 Video</button></div>`
}

export const checkboxHtml = (choice: CheckboxChoice, label: string, disabled = false, title = ''): string => {
  const checked = state.choices[choice] ? 'checked' : ''

  return `<label class="checkbox-label" ${title ? `title="${title}"` : ''}>
    <input type="checkbox" data-choice="${choice}" ${checked} ${disabled ? 'disabled' : ''}> ${label}</label>`
}

const audioFormatCardHtml = (card: AudioFormatCard): string => {
  const isSelected = state.choices.format === card.format
  const badge = card.badge ? `<span class="chip ${card.format === 'opus' ? 'success' : ''}">${card.badge}</span>` : ''

  return `<button class="format-card ${selectedClass(isSelected)}" ${pressedAttribute(isSelected)} data-format="${card.format}">
      ${badge}<b>${card.title}</b><span class="format-description">${card.description}</span></button>`
}

export const audioFormatCardsHtml = (): string =>
  `<div class="format-cards">${AUDIO_FORMAT_CARDS.map(audioFormatCardHtml).join('')}</div>`

export const audioOptionsHtml = (): string => `<div class="option-list">
    ${checkboxHtml('coverArt', 'Embed album art (square)', state.choices.format === 'wav')}
    ${checkboxHtml('removeNonMusic', 'Cut out non-music parts (intros, talking) when known', false, 'Uses community-submitted SponsorBlock segments; only works on videos that have them')}
  </div>`

const generalResolutionHtml = (resolution: number | null): string => {
  const isSelected = state.choices.resolution === resolution
  const description = resolution ? resolutionTag(resolution) : 'Highest available for each video'

  return `<button class="quality-option ${selectedClass(isSelected)}" ${pressedAttribute(isSelected)} data-resolution="${resolution ?? ''}">
      <b>${resolution ? `${resolution}p` : 'Best'}</b><span class="quality-codecs">${description}</span><span></span></button>`
}

export const generalResolutionListHtml = (): string =>
  `<div class="section-label">Quality (each video gets the closest it has)</div><div class="quality-list">${GENERAL_RESOLUTIONS.map(generalResolutionHtml).join('')}</div>`

export const containerControlHtml = (): string => {
  const selectedOption = selectedContainerOption(state.choices.container)
  const buttons = CONTAINER_OPTIONS.map((option) => {
    const isSelected = option === selectedOption

    return `<button data-container="${option.container}" class="${selectedClass(isSelected)}" ${pressedAttribute(isSelected)}>${option.label}</button>`
  }).join('')

  return `<div class="section-label">Format</div><div class="segmented-control">${buttons}</div><p class="note">${selectedOption.note}</p>`
}
