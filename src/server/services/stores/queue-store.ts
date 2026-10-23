import { isAbsolute, join } from 'node:path'
import { isWebLink } from '@shared/links.js'
import type { DownloadOptions } from '@shared/types/downloads.js'
import { DATA_DIRECTORY } from '@server/config.js'
import { JsonFile } from '@server/lib/json-file.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { asRecord, stringOrDefault, stringOrNull, type StoredRecord } from './stored-values.js'

const JOB_ID_PATTERN = /^[\w-]{1,64}$/

export interface SavedJob {
  id: string
  options: DownloadOptions
  title: string
  thumbnailUrl: string | null
  label: string
  createdAt: string
  paused: boolean
  downloadFolder: string | null
}

const savedDownloadFolder = (value: unknown): string | null => {
  const folder = stringOrNull(value)

  return folder && isAbsolute(folder) ? folder : null
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
    downloadFolder: savedDownloadFolder(stored.downloadFolder),
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
  save(savedJobs: SavedJob[]): Promise<void>
}

export class QueueStore implements SavedQueue {
  private readonly file = new JsonFile(join(DATA_DIRECTORY, 'queue.json'), parseSavedQueue)

  loadSavedJobs(): Promise<SavedJob[]> {
    return this.file.load()
  }

  save(savedJobs: SavedJob[]): Promise<void> {
    return this.file.save(savedJobs)
  }
}
