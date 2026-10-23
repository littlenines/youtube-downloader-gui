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

export const formatTimeLeft = (seconds: number | null | undefined): string => {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return ''
  if (seconds < 60) return `${Math.round(seconds)}s left`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s left`
}

export const formatCount = (count: number | null | undefined): string => {
  if (!count) return ''
  if (count >= 1e9) return `${(count / 1e9).toFixed(1)}B`
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`
  if (count >= 1e3) return `${(count / 1e3).toFixed(1)}K`
  return String(count)
}
