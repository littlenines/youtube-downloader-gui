import type { ClipRange } from './types/downloads.js'

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600
const CLIP_TIME_PATTERN = /^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/

const padToTwoDigits = (value: number) => String(value).padStart(2, '0')

const roundToMilliseconds = (seconds: number) => Math.round(seconds * 1000) / 1000

export const clipLengthSeconds = (clip: ClipRange): number => clip.endSeconds - clip.startSeconds

export const parseClipTime = (text: string): number | null => {
  const trimmedText = text.trim()

  if (!CLIP_TIME_PATTERN.test(trimmedText)) return null

  const parts = trimmedText.split(':').map(Number)
  const seconds = parts.pop() ?? 0
  const minutes = parts.pop() ?? 0
  const hours = parts.pop() ?? 0
  const hasMinutes = trimmedText.includes(':')
  const hasHours = trimmedText.split(':').length === 3

  if (hasMinutes && seconds >= SECONDS_PER_MINUTE) return null
  if (hasHours && minutes >= SECONDS_PER_MINUTE) return null

  return roundToMilliseconds(hours * SECONDS_PER_HOUR + minutes * SECONDS_PER_MINUTE + seconds)
}

export const formatClipTime = (totalSeconds: number): string => {
  const wholeSeconds = Math.floor(totalSeconds)
  const fraction = roundToMilliseconds(totalSeconds - wholeSeconds)
  const hours = Math.floor(wholeSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor((wholeSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = wholeSeconds % SECONDS_PER_MINUTE
  const fractionText = fraction ? String(fraction).slice(1) : ''
  const secondsText = `${padToTwoDigits(seconds)}${fractionText}`

  return hours ? `${hours}:${padToTwoDigits(minutes)}:${secondsText}` : `${minutes}:${secondsText}`
}

const compactTime = (wholeSeconds: number): string => {
  const hours = Math.floor(wholeSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor((wholeSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = wholeSeconds % SECONDS_PER_MINUTE

  if (hours) return `${hours}h${padToTwoDigits(minutes)}m${padToTwoDigits(seconds)}s`
  if (minutes) return `${minutes}m${padToTwoDigits(seconds)}s`

  return `${seconds}s`
}

export const clipFileSuffix = (clip: ClipRange): string =>
  ` (${compactTime(Math.floor(clip.startSeconds))}-${compactTime(Math.ceil(clip.endSeconds))})`

export const describeClip = (clip: ClipRange): string =>
  `clip ${formatClipTime(clip.startSeconds)}–${formatClipTime(clip.endSeconds)}`
