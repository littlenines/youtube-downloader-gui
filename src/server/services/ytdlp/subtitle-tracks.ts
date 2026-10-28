import { hasSameLanguage, isSubtitleLanguage } from '@shared/subtitle-languages.js'
import type { SubtitleTrack } from '@shared/types/media.js'
import type { YtdlpInfo } from './ytdlp-json.js'

export const SPOKEN_LANGUAGE_SUFFIX = '-orig'

const LIVE_CHAT = 'live_chat'

const uploadedLanguages = (info: YtdlpInfo): string[] =>
  Object.keys(info.subtitles ?? {}).filter((language) => language !== LIVE_CHAT && isSubtitleLanguage(language))

const spokenLanguages = (info: YtdlpInfo): string[] =>
  Object.keys(info.automatic_captions ?? {})
    .filter((language) => language.endsWith(SPOKEN_LANGUAGE_SUFFIX))
    .map((language) => language.slice(0, -SPOKEN_LANGUAGE_SUFFIX.length))
    .filter(isSubtitleLanguage)

export const subtitleTracks = (info: YtdlpInfo): SubtitleTrack[] => {
  const uploaded = uploadedLanguages(info)
  const automatic = spokenLanguages(info).filter((language) => !hasSameLanguage(uploaded, language))

  return [
    ...uploaded.map((language) => ({ language, isAutomatic: false })),
    ...automatic.map((language) => ({ language, isAutomatic: true })),
  ]
}
