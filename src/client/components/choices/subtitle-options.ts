import { languageName, matchingSubtitleTrack } from '@shared/subtitle-languages.js'
import type { ClipRange, SubtitleFormat } from '@shared/types/downloads.js'
import type { SubtitleTrack } from '@shared/types/media.js'
import type { Choices } from '@client/state.js'

export interface SubtitleOption {
  value: string
  label: string
}

export type SubtitleChoices = Pick<Choices, 'container' | 'subtitleFormat' | 'subtitleLanguage'>

export const NO_SUBTITLES_OPTION: SubtitleOption = { value: '', label: 'None' }

export const SUBTITLE_FORMAT_OPTIONS: { value: SubtitleFormat; label: string }[] = [
  { value: 'embedded', label: 'In the video' },
  { value: 'srt', label: 'As a .srt file' },
]

export const CLIP_REASON = 'Subtitles can’t be added to part of a video yet.'

const COMMON_LANGUAGES = [
  'ar',
  'de',
  'en',
  'es',
  'fr',
  'hi',
  'hr',
  'id',
  'it',
  'ja',
  'ko',
  'nl',
  'pl',
  'pt',
  'ru',
  'sr',
  'sv',
  'tr',
  'uk',
  'zh-Hans',
  'zh-Hant',
]

export const whyNoSubtitles = ({ container, subtitleFormat }: SubtitleChoices): string | null =>
  container === 'webm' && subtitleFormat === 'embedded'
    ? 'WebM can’t hold subtitles. Save them as a .srt file, or pick MP4 or MKV.'
    : null

export const whyNoVideoSubtitles = (choices: SubtitleChoices, clip: ClipRange | null): string | null =>
  clip ? CLIP_REASON : whyNoSubtitles(choices)

export const pickedTrack = (
  tracks: SubtitleTrack[],
  choices: SubtitleChoices,
  clip: ClipRange | null,
): SubtitleTrack | null => {
  const wantedLanguage = choices.subtitleLanguage

  if (!wantedLanguage || whyNoVideoSubtitles(choices, clip)) return null

  return matchingSubtitleTrack(tracks, wantedLanguage)
}

export const trackOptions = (tracks: SubtitleTrack[]): SubtitleOption[] =>
  tracks.map(({ language, isAutomatic }) => ({
    value: language,
    label: isAutomatic ? `${languageName(language)} (auto-generated)` : languageName(language),
  }))

export const commonLanguageOptions = (rememberedLanguage: string | null): SubtitleOption[] => {
  const languages =
    rememberedLanguage && !COMMON_LANGUAGES.includes(rememberedLanguage)
      ? [...COMMON_LANGUAGES, rememberedLanguage]
      : COMMON_LANGUAGES

  return languages
    .map((language) => ({ value: language, label: languageName(language) }))
    .sort((first, second) => first.label.localeCompare(second.label))
}
