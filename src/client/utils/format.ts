const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character)

const KILOBYTE = 1024
const MEGABYTE = 1024 ** 2
const GIGABYTE = 1024 ** 3

export const formatBytes = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) return ''
  if (bytes >= GIGABYTE) return `${(bytes / GIGABYTE).toFixed(2)} GB`
  if (bytes >= MEGABYTE) return `${(bytes / MEGABYTE).toFixed(bytes >= 100 * MEGABYTE ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(bytes / KILOBYTE))} KB`
}

const twoDigits = (value: number) => String(value).padStart(2, '0')

export const formatDuration = (totalSeconds: number | null | undefined): string => {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return ''

  const seconds = Math.round(totalSeconds)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  return hours
    ? `${hours}:${twoDigits(minutes)}:${twoDigits(remainingSeconds)}`
    : `${minutes}:${twoDigits(remainingSeconds)}`
}

export const formatSpeed = (bytesPerSecond: number | null | undefined): string =>
  bytesPerSecond ? `${formatBytes(bytesPerSecond)}/s` : ''

export const formatSeconds = (totalSeconds: number | null | undefined): string => {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return ''

  const seconds = Math.round(totalSeconds)

  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export const formatTimeLeft = (seconds: number | null | undefined): string => {
  const duration = formatSeconds(seconds)

  return duration ? `${duration} left` : ''
}

const DATE_TIME_PARTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
}

export const supportedLocale = (locale: string | null | undefined): string | undefined => {
  if (!locale) return undefined

  try {
    return Intl.DateTimeFormat.supportedLocalesOf(locale)[0]
  } catch {
    return undefined
  }
}

export const createDateTimeFormatter = (locale: string | undefined) => {
  const dateTimeFormat = new Intl.DateTimeFormat(locale, DATE_TIME_PARTS)

  return (isoDate: string): string => {
    const date = new Date(isoDate)

    return Number.isNaN(date.getTime()) ? '' : dateTimeFormat.format(date)
  }
}

const isSameDay = (first: Date, second: Date): boolean => first.toDateString() === second.toDateString()

export const describeStartTime = (
  startsAt: Date,
  now: Date,
  formatTime: (date: Date) => string,
  formatDate: (date: Date) => string,
): string => {
  const tomorrow = new Date(now)

  tomorrow.setDate(now.getDate() + 1)

  if (isSameDay(startsAt, tomorrow)) return `tomorrow at ${formatTime(startsAt)}`
  if (isSameDay(startsAt, now) || startsAt < now) return `at ${formatTime(startsAt)}`
  return `on ${formatDate(startsAt)} at ${formatTime(startsAt)}`
}

export const formatCount = (count: number | null | undefined): string => {
  if (typeof count !== 'number' || !Number.isFinite(count) || !count) return ''
  if (count >= 1e9) return `${(count / 1e9).toFixed(1)}B`
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`
  if (count >= 1e3) return `${(count / 1e3).toFixed(1)}K`
  return String(count)
}
