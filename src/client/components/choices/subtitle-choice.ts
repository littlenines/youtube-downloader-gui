import { subtitleChoiceFor } from '@shared/subtitle-languages.js'
import type { SubtitleChoice } from '@shared/types/downloads.js'
import type { MediaInfo, SubtitleTrack, VideoInfo } from '@shared/types/media.js'
import { state } from '@client/state.js'
import { escapeHtml } from '@client/utils/format.js'
import { SUBTITLE_FORMAT_CHOICE, SUBTITLE_LANGUAGE_CHOICE } from './choice-options.js'
import {
  CLIP_REASON,
  commonLanguageOptions,
  NO_SUBTITLES_OPTION,
  pickedTrack,
  SUBTITLE_FORMAT_OPTIONS,
  trackOptions,
  whyNoSubtitles,
  whyNoVideoSubtitles,
  type SubtitleOption,
} from './subtitle-options.js'

export const pickedSubtitleTrack = ({ subtitleTracks }: VideoInfo): SubtitleTrack | null =>
  pickedTrack(subtitleTracks, state.choices, state.clip)

export const rememberedSubtitles = (): SubtitleChoice => ({
  subtitleLanguage: state.choices.subtitleLanguage,
  subtitleMatch: 'language',
})

export const requestedSubtitles = (info: MediaInfo): SubtitleChoice =>
  info.kind === 'video' ? subtitleChoiceFor(pickedSubtitleTrack(info)) : rememberedSubtitles()

const optionHtml = ({ value, label }: SubtitleOption, pickedValue: string): string =>
  `<option value="${escapeHtml(value)}" ${value === pickedValue ? 'selected' : ''}>${escapeHtml(label)}</option>`

const titleAttribute = (reason: string | null): string => (reason ? `title="${escapeHtml(reason)}"` : '')

const disabledAttribute = (isDisabled: boolean): string => (isDisabled ? 'disabled' : '')

interface SubtitleSelects {
  options: SubtitleOption[]
  pickedValue: string
  reason: string | null
  isClip: boolean
  label: string
}

const subtitleFormatSelectHtml = (isClip: boolean): string => {
  const optionsHtml = SUBTITLE_FORMAT_OPTIONS.map((option) => optionHtml(option, state.choices.subtitleFormat)).join('')

  return `<label class="select-label" ${titleAttribute(isClip ? CLIP_REASON : null)}>Save as
    <select data-choice="${SUBTITLE_FORMAT_CHOICE}" ${disabledAttribute(isClip)}>${optionsHtml}</select></label>`
}

const subtitleSelectsHtml = ({ options, pickedValue, reason, isClip, label }: SubtitleSelects): string => {
  const optionsHtml = [NO_SUBTITLES_OPTION, ...options].map((option) => optionHtml(option, pickedValue)).join('')

  return `<div class="option-list"><label class="select-label" ${titleAttribute(reason)}>${label}
    <select data-choice="${SUBTITLE_LANGUAGE_CHOICE}" ${disabledAttribute(Boolean(reason))}>${optionsHtml}</select></label>
    ${subtitleFormatSelectHtml(isClip)}</div>`
}

export const subtitleChoiceHtml = (info: VideoInfo): string => {
  if (!info.subtitleTracks.length) return ''

  return subtitleSelectsHtml({
    options: trackOptions(info.subtitleTracks),
    pickedValue: pickedSubtitleTrack(info)?.language ?? NO_SUBTITLES_OPTION.value,
    reason: whyNoVideoSubtitles(state.choices, state.clip),
    isClip: Boolean(state.clip),
    label: 'Subtitles',
  })
}

export const rememberedSubtitleChoiceHtml = (): string =>
  subtitleSelectsHtml({
    options: commonLanguageOptions(state.choices.subtitleLanguage),
    pickedValue: state.choices.subtitleLanguage ?? NO_SUBTITLES_OPTION.value,
    reason: whyNoSubtitles(state.choices),
    isClip: false,
    label: 'Subtitles (when a video has them)',
  })
