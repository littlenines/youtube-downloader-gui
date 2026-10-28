import { matchingSubtitleTrack, subtitleChoiceFor } from '@shared/subtitle-languages.js'
import type { DownloadOptions } from '@shared/types/downloads.js'
import { subtitleTracks } from '@server/services/ytdlp/subtitle-tracks.js'
import type { YtdlpInfo } from '@server/services/ytdlp/ytdlp-json.js'

export const needsSubtitleTrack = ({ subtitleLanguage, subtitleMatch, playlist }: DownloadOptions): boolean =>
  Boolean(subtitleLanguage) && subtitleMatch === 'language' && !playlist

export const withSubtitleTrack = (options: DownloadOptions, videoInfo: unknown): DownloadOptions => {
  if (!options.subtitleLanguage) return options

  const track = matchingSubtitleTrack(subtitleTracks(videoInfo as YtdlpInfo), options.subtitleLanguage)

  return { ...options, ...subtitleChoiceFor(track) }
}
