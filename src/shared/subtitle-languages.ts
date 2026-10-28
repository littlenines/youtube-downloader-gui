import type { SubtitleChoice, SubtitleFormat, SubtitleMatch } from './types/downloads.js'
import type { SubtitleTrack } from './types/media.js'

const SUBTITLE_LANGUAGE_PATTERN = /^[a-z\d][\w-]{0,34}$/i
const EVERY_LANGUAGE = 'all'
const ENGLISH = 'en'
const SUBTITLE_MATCHES: SubtitleMatch[] = ['exact', 'spoken', 'language']
const SUBTITLE_FORMATS: SubtitleFormat[] = ['embedded', 'srt']

export const DEFAULT_SUBTITLE_FORMAT: SubtitleFormat = 'embedded'

const languageNames = new Intl.DisplayNames(['en'], { type: 'language', languageDisplay: 'standard' })

export const isSubtitleLanguage = (value: unknown): value is string =>
  typeof value === 'string' && SUBTITLE_LANGUAGE_PATTERN.test(value) && value.toLowerCase() !== EVERY_LANGUAGE

export const isSubtitleMatch = (value: unknown): value is SubtitleMatch =>
  SUBTITLE_MATCHES.includes(value as SubtitleMatch)

export const subtitleFormatOrDefault = (value: unknown): SubtitleFormat =>
  SUBTITLE_FORMATS.includes(value as SubtitleFormat) ? (value as SubtitleFormat) : DEFAULT_SUBTITLE_FORMAT

export const savedSubtitleLanguage = ({
  subtitleLanguage,
  subtitles,
}: {
  subtitleLanguage?: unknown
  subtitles?: unknown
}): string | null => {
  if (subtitleLanguage === undefined) return subtitles === true ? ENGLISH : null

  return isSubtitleLanguage(subtitleLanguage) ? subtitleLanguage : null
}

export const languageName = (language: string): string => {
  try {
    return languageNames.of(language) ?? language
  } catch {
    return language
  }
}

const REGION_SEPARATOR_PATTERN = /[-_]/

export const languageWithScript = (language: string): string => {
  try {
    const { language: base, script } = new Intl.Locale(language.replaceAll('_', '-')).maximize()

    return (script ? `${base}-${script}` : base).toLowerCase()
  } catch {
    return language.split(REGION_SEPARATOR_PATTERN)[0]!.toLowerCase()
  }
}

const isSameLanguage = (language: string, otherLanguage: string): boolean =>
  languageWithScript(language) === languageWithScript(otherLanguage)

const isPlainLanguage = (language: string): boolean => !REGION_SEPARATOR_PATTERN.test(language)

export const matchingSubtitleTrack = (tracks: SubtitleTrack[], wantedLanguage: string): SubtitleTrack | null =>
  tracks.find(({ language }) => language === wantedLanguage) ??
  tracks.find(({ language }) => isPlainLanguage(language) && isSameLanguage(language, wantedLanguage)) ??
  tracks.find(({ language }) => isSameLanguage(language, wantedLanguage)) ??
  null

const NO_SUBTITLES: SubtitleChoice = { subtitleLanguage: null, subtitleMatch: 'language' }

export const subtitleChoiceFor = (track: SubtitleTrack | null): SubtitleChoice =>
  track ? { subtitleLanguage: track.language, subtitleMatch: track.isAutomatic ? 'spoken' : 'exact' } : NO_SUBTITLES

export const hasSameLanguage = (languages: string[], language: string): boolean =>
  languages.some((otherLanguage) => isSameLanguage(otherLanguage, language))
