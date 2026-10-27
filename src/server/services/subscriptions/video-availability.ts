import { errorText } from '@server/lib/http/http-error.js'
import { runYtdlpForJson } from '@server/services/ytdlp/run-ytdlp.js'
import { linkArguments } from '@server/services/ytdlp/ytdlp-command.js'
import type { YtdlpInfo } from '@server/services/ytdlp/ytdlp-json.js'

export type VideoAvailability = 'ready' | 'not-yet' | 'never' | 'unknown'

const NOT_YET_LIVE_STATUSES = new Set(['is_upcoming', 'is_live', 'post_live'])
const RESTRICTED_AVAILABILITIES = new Set(['private', 'premium_only', 'subscriber_only', 'needs_auth'])
const TEMPORARY_MESSAGES = /try again|for now|rate-limit|too many requests|timed out|took too long|internet connection/i
const NOT_YET_MESSAGES = /not started yet|premieres? in|will begin|upcoming|is live/i
const NEVER_AVAILABLE_MESSAGES =
  /private|members[ -]only|join this channel|age-restricted|confirm your age|video is unavailable|video unavailable|not a video yt-dlp supports|unsupported url/i

export const availabilityFromInfo = ({ live_status, availability }: YtdlpInfo): VideoAvailability => {
  if (live_status && NOT_YET_LIVE_STATUSES.has(live_status)) return 'not-yet'
  if (availability && RESTRICTED_AVAILABILITIES.has(availability)) return 'never'

  return 'ready'
}

export const availabilityFromError = (message: string): VideoAvailability => {
  if (TEMPORARY_MESSAGES.test(message)) return 'unknown'
  if (NOT_YET_MESSAGES.test(message)) return 'not-yet'
  if (NEVER_AVAILABLE_MESSAGES.test(message)) return 'never'

  return 'unknown'
}

export const checkVideoAvailability = async (url: string): Promise<VideoAvailability> => {
  try {
    return availabilityFromInfo((await runYtdlpForJson(['-J', '--no-playlist', ...linkArguments(url)])) as YtdlpInfo)
  } catch (error) {
    return availabilityFromError(errorText(error))
  }
}
