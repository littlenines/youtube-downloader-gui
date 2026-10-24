import type { Settings } from '@shared/types/app.js'

export interface DownloadWindow {
  startTime: string
  stopTime: string | null
}

const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const MINUTES_PER_HOUR = 60

export const isClockTime = (value: unknown): value is string =>
  typeof value === 'string' && CLOCK_TIME_PATTERN.test(value)

const clockTimeParts = (clockTime: string): [number, number] => {
  const [hours = 0, minutes = 0] = clockTime.split(':').map(Number)

  return [hours, minutes]
}

const minutesOfDay = (clockTime: string): number => {
  const [hours, minutes] = clockTimeParts(clockTime)

  return hours * MINUTES_PER_HOUR + minutes
}

export const downloadWindowFromSettings = ({ laterStartTime, laterStopTime }: Settings): DownloadWindow | null => {
  if (!laterStartTime) return null

  return { startTime: laterStartTime, stopTime: laterStopTime === laterStartTime ? null : laterStopTime }
}

export const isInsideWindow = ({ startTime, stopTime }: DownloadWindow, now: Date): boolean => {
  if (!stopTime) return true

  const start = minutesOfDay(startTime)
  const stop = minutesOfDay(stopTime)
  const current = now.getHours() * MINUTES_PER_HOUR + now.getMinutes()

  return start < stop ? current >= start && current < stop : current >= start || current < stop
}

export const nextStartTime = (window: DownloadWindow, now: Date): Date => {
  if (window.stopTime && isInsideWindow(window, now)) return now

  const [hours, minutes] = clockTimeParts(window.startTime)
  const start = new Date(now)

  start.setHours(hours, minutes, 0, 0)

  if (start <= now) start.setDate(start.getDate() + 1)

  return start
}

export const isTimeToStart = (startsAt: string | null, window: DownloadWindow, now: Date): boolean =>
  (!startsAt || Date.parse(startsAt) <= now.getTime()) && isInsideWindow(window, now)
