const RATE_LIMIT_PATTERN = /HTTP Error 429|Too Many Requests/i

const FRIENDLY_ERRORS: [pattern: RegExp, message: string][] = [
  [
    /confirm your age|age-restricted/i,
    'This video is age-restricted; YouTube requires a signed-in account to download it.',
  ],
  [/Private video/i, 'This video is private.'],
  [/members-only|Join this channel/i, 'This video is for channel members only.'],
  [
    /try again later|isn't available, try again/i,
    'YouTube is refusing this request for now (not the video itself). Try again in a few minutes.',
  ],
  [/Video unavailable/i, 'This video is unavailable (removed, blocked in your country, or the link is wrong).'],
  [/Unsupported URL/i, 'That link is not a video yt-dlp supports.'],
  [/live event will begin|is upcoming/i, 'This live stream has not started yet.'],
  [RATE_LIMIT_PATTERN, 'YouTube is rate-limiting this connection. Wait a few minutes and try again.'],
]

const SUBTITLES_FAILURE_PATTERN = /Unable to download video subtitles/i
const SUBTITLES_FAILURE_PREFIX_PATTERN = /^Unable to download video subtitles for '[^']*':\s*/i
const SUBTITLES_REFUSED_REASON = 'YouTube refused them for now. Download it again later to add them.'

export class SubtitlesFailedError extends Error {
  override readonly name = 'SubtitlesFailedError'
}

const ERROR_PREFIX_PATTERN = /^.*?ERROR:\s*(\[[^\]]+\]\s*[\w-]+:\s*)?/

export const KEPT_ERROR_OUTPUT_CHARACTERS = 8_000

const lastErrorLine = (errorOutput: string): string => {
  const lines = errorOutput.split(/\r?\n/)

  return lines.filter((line) => line.includes('ERROR')).pop() ?? lines.filter(Boolean).pop() ?? ''
}

export const friendlyErrorMessage = (errorOutput: string): string => {
  const message = lastErrorLine(errorOutput).replace(ERROR_PREFIX_PATTERN, '').trim()
  const friendlyMessage = FRIENDLY_ERRORS.find(([pattern]) => pattern.test(message))?.[1]

  return friendlyMessage ?? (message || 'yt-dlp failed.')
}

export const isSubtitlesFailure = (errorOutput: string): boolean =>
  SUBTITLES_FAILURE_PATTERN.test(lastErrorLine(errorOutput))

export const subtitlesFailureReason = (errorOutput: string): string => {
  const message = lastErrorLine(errorOutput)
    .replace(ERROR_PREFIX_PATTERN, '')
    .replace(SUBTITLES_FAILURE_PREFIX_PATTERN, '')
    .trim()

  return RATE_LIMIT_PATTERN.test(message) ? SUBTITLES_REFUSED_REASON : message || 'they could not be downloaded.'
}

export const appendErrorOutput = (errorOutput: string, addition: string): string =>
  (errorOutput + addition).slice(-KEPT_ERROR_OUTPUT_CHARACTERS)
