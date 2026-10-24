import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import type { Settings } from '@shared/types/app.js'
import { DATA_DIRECTORY, DEFAULT_DOWNLOAD_FOLDER } from '@server/config.js'
import { HttpError } from '@server/lib/http/http-error.js'
import { isClockTime } from '@server/services/downloads/download-window.js'
import { JsonFile } from '@server/lib/json-file.js'
import { asRecord, stringOrDefault } from './stored-values.js'

const DEFAULT_SIMULTANEOUS_DOWNLOADS = 2
const MAXIMUM_SIMULTANEOUS_DOWNLOADS = 4
const ONLY_AT_START_UP = 0

export const SUBSCRIPTION_CHECK_HOURS = [ONLY_AT_START_UP, 1, 2, 3, 6, 12, 24]

const isValidSimultaneousDownloads = (value: number) =>
  Number.isInteger(value) && value >= 1 && value <= MAXIMUM_SIMULTANEOUS_DOWNLOADS

const isValidSubscriptionCheckHours = (value: number) => SUBSCRIPTION_CHECK_HOURS.includes(value)

export const parseSettings = (content: unknown): Settings => {
  const stored = asRecord(content)
  const simultaneousDownloads = Number(stored.simultaneousDownloads ?? stored.concurrent)
  const subscriptionCheckHours = Number(stored.subscriptionCheckHours ?? ONLY_AT_START_UP)

  return {
    downloadFolder: stringOrDefault(stored.downloadFolder ?? stored.outDir, '') || DEFAULT_DOWNLOAD_FOLDER,
    simultaneousDownloads: isValidSimultaneousDownloads(simultaneousDownloads)
      ? simultaneousDownloads
      : DEFAULT_SIMULTANEOUS_DOWNLOADS,
    lowLatencyRendering: stored.lowLatencyRendering !== false,
    notifyWhenFinished: stored.notifyWhenFinished !== false,
    subscriptionCheckHours: isValidSubscriptionCheckHours(subscriptionCheckHours)
      ? subscriptionCheckHours
      : ONLY_AT_START_UP,
    laterStartTime: isClockTime(stored.laterStartTime) ? stored.laterStartTime : null,
    laterStopTime: isClockTime(stored.laterStopTime) ? stored.laterStopTime : null,
  }
}

const changedClockTime = (value: unknown): string | null | undefined => {
  if (value === null || value === '') return null

  return isClockTime(value) ? value : undefined
}

export const absoluteFolder = (input: string): string => {
  const unquoted = input.trim().replace(/^["']|["']$/g, '')
  const expanded = /^~(?=$|[/])/.test(unquoted) ? join(homedir(), unquoted.slice(1)) : unquoted

  if (!isAbsolute(expanded)) {
    throw new HttpError(400, 'Enter a full folder path, for example D:Music or /home/you/Music.')
  }

  return resolve(expanded)
}

const createUsableFolder = async (input: string): Promise<string> => {
  const folder = absoluteFolder(input)

  try {
    await mkdir(folder, { recursive: true })
  } catch {
    throw new HttpError(400, `Can't use that folder: ${folder}`)
  }

  return folder
}

export class SettingsStore {
  private readonly file = new JsonFile(join(DATA_DIRECTORY, 'settings.json'), parseSettings)
  private settings = parseSettings(undefined)

  async load(): Promise<this> {
    this.settings = await this.file.load()

    return this
  }

  get(): Settings {
    return { ...this.settings }
  }

  async update(changes: Partial<Settings>): Promise<Settings> {
    if (typeof changes.downloadFolder === 'string' && changes.downloadFolder.trim()) {
      this.settings.downloadFolder = await createUsableFolder(changes.downloadFolder)
    }

    const simultaneousDownloads = Number(changes.simultaneousDownloads)
    const subscriptionCheckHours = Number(changes.subscriptionCheckHours)

    if (isValidSimultaneousDownloads(simultaneousDownloads)) this.settings.simultaneousDownloads = simultaneousDownloads
    if (typeof changes.lowLatencyRendering === 'boolean')
      this.settings.lowLatencyRendering = changes.lowLatencyRendering
    if (typeof changes.notifyWhenFinished === 'boolean') this.settings.notifyWhenFinished = changes.notifyWhenFinished
    if (isValidSubscriptionCheckHours(subscriptionCheckHours)) {
      this.settings.subscriptionCheckHours = subscriptionCheckHours
    }

    const laterStartTime = changedClockTime(changes.laterStartTime)
    const laterStopTime = changedClockTime(changes.laterStopTime)

    if (laterStartTime !== undefined) this.settings.laterStartTime = laterStartTime
    if (laterStopTime !== undefined) this.settings.laterStopTime = laterStopTime

    await this.file.save(this.settings)

    return this.get()
  }
}
