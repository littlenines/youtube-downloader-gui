import { isAbsolute, join } from 'node:path'
import { isWebLink } from '@shared/links.js'
import type { DownloadOptions, JobGroup } from '@shared/types/downloads.js'
import { DATA_DIRECTORY } from '@server/config.js'
import { JsonFile } from '@server/lib/json-file.js'
import { throttleSaves, type SaveOptions } from '@server/lib/throttled-save.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { asRecord, stringOrDefault, stringOrNull, type StoredRecord } from './stored-values.js'

const QUEUE_SAVE_QUIET_MILLISECONDS = 30_000
const JOB_ID_PATTERN = /^[\w-]{1,64}$/

export interface SavedFinish {
  status: 'done' | 'error' | 'cancelled'
  files: string[]
  sizeBytes: number | null
  error: string | null
  finishedAt: string | null
}

export interface SavedJob {
  id: string
  options: DownloadOptions
  title: string
  thumbnailUrl: string | null
  label: string
  createdAt: string
  paused: boolean
  progress: number
  activeSeconds: number
  later: boolean
  startsAt: string | null
  downloadFolder: string | null
  group: JobGroup | null
  finished: SavedFinish | null
}

const savedProgress = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0

const savedTime = (value: unknown): string | null => {
  const text = stringOrNull(value)

  return text && !Number.isNaN(Date.parse(text)) ? text : null
}

const savedDownloadFolder = (value: unknown): string | null => {
  const folder = stringOrNull(value)

  return folder && isAbsolute(folder) ? folder : null
}

const FINISHED_STATUSES: ReadonlySet<unknown> = new Set(['done', 'error', 'cancelled'])

const savedFinish = (value: unknown): SavedFinish | null => {
  const stored = asRecord(value)

  if (!FINISHED_STATUSES.has(stored.status)) return null

  return {
    status: stored.status as SavedFinish['status'],
    files: Array.isArray(stored.files) ? stored.files.filter((file): file is string => typeof file === 'string') : [],
    sizeBytes: typeof stored.sizeBytes === 'number' && stored.sizeBytes >= 0 ? stored.sizeBytes : null,
    error: stringOrNull(stored.error),
    finishedAt: savedTime(stored.finishedAt),
  }
}

const savedGroup = (value: unknown): JobGroup | null => {
  const stored = asRecord(value)
  const id = stringOrDefault(stored.id, '')
  const size = Number(stored.size)

  if (!JOB_ID_PATTERN.test(id) || !Number.isSafeInteger(size) || size < 1) return null

  return { id, title: stringOrDefault(stored.title, 'Playlist'), size, url: stringOrDefault(stored.url, '') }
}

const parseSavedJob = (stored: StoredRecord): SavedJob | null => {
  const id = stringOrDefault(stored.id, '')
  const options = normalizeDownloadRequest(asRecord(stored.options))

  if (!JOB_ID_PATTERN.test(id) || !isWebLink(options.url)) return null

  return {
    id,
    options,
    title: stringOrDefault(stored.title, options.url),
    thumbnailUrl: stringOrNull(stored.thumbnailUrl),
    label: stringOrDefault(stored.label, ''),
    createdAt: stringOrDefault(stored.createdAt, new Date().toISOString()),
    paused: stored.paused === true,
    progress: savedProgress(stored.progress),
    activeSeconds: typeof stored.activeSeconds === 'number' && stored.activeSeconds > 0 ? stored.activeSeconds : 0,
    later: stored.later === true,
    startsAt: savedTime(stored.startsAt),
    downloadFolder: savedDownloadFolder(stored.downloadFolder),
    group: savedGroup(stored.group),
    finished: savedFinish(stored.finished),
  }
}

export const parseSavedQueue = (content: unknown): SavedJob[] =>
  Array.isArray(content)
    ? content.map(asRecord).flatMap((stored) => {
        const savedJob = parseSavedJob(stored)

        return savedJob ? [savedJob] : []
      })
    : []

export interface SavedQueue {
  save(savedJobs: SavedJob[], options?: SaveOptions): Promise<void>
}

export class QueueStore implements SavedQueue {
  private readonly file = new JsonFile(join(DATA_DIRECTORY, 'queue.json'), parseSavedQueue)
  private readonly throttledSave = throttleSaves(
    (savedJobs: SavedJob[]) => this.file.save(savedJobs),
    QUEUE_SAVE_QUIET_MILLISECONDS,
  )

  loadSavedJobs(): Promise<SavedJob[]> {
    return this.file.load()
  }

  save(savedJobs: SavedJob[], options?: SaveOptions): Promise<void> {
    return this.throttledSave(savedJobs, options)
  }
}
