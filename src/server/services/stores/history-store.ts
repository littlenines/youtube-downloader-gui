import { join } from 'node:path'
import type { HistoryEntry } from '@shared/types.js'
import { DATA_DIRECTORY } from '@server/config.js'
import { JsonFile } from '@server/lib/json-file.js'
import {
  asRecord,
  numberOrNull,
  stringArray,
  stringOrDefault,
  stringOrNull,
  type StoredRecord,
} from './stored-values.js'

const MAXIMUM_HISTORY_ENTRIES = 300

const parseHistoryEntry = (stored: StoredRecord): HistoryEntry => ({
  id: stringOrDefault(stored.id, ''),
  title: stringOrDefault(stored.title, ''),
  thumbnailUrl: stringOrNull(stored.thumbnailUrl ?? stored.thumbnail),
  label: stringOrDefault(stored.label, ''),
  files: stringArray(stored.files),
  sizeBytes: numberOrNull(stored.sizeBytes ?? stored.size),
  finishedAt: stringOrDefault(stored.finishedAt, new Date(0).toISOString()),
  url: stringOrDefault(stored.url, ''),
})

export const parseHistory = (content: unknown): HistoryEntry[] =>
  Array.isArray(content) ? content.map(asRecord).map(parseHistoryEntry) : []

export class HistoryStore {
  private readonly file = new JsonFile(join(DATA_DIRECTORY, 'history.json'), parseHistory)
  private entries: HistoryEntry[] = []

  async load(): Promise<this> {
    this.entries = await this.file.load()

    return this
  }

  list(limit: number): HistoryEntry[] {
    return this.entries.slice(0, limit)
  }

  find(id: string): HistoryEntry | undefined {
    return this.entries.find((entry) => entry.id === id)
  }

  add(entry: HistoryEntry): Promise<void> {
    const otherEntries = this.entries.filter((existing) => existing.id !== entry.id)

    this.entries = [entry, ...otherEntries].slice(0, MAXIMUM_HISTORY_ENTRIES)

    return this.file.save(this.entries)
  }

  remove(id: string): Promise<void> {
    this.entries = this.entries.filter((entry) => entry.id !== id)

    return this.file.save(this.entries)
  }

  clear(): Promise<void> {
    this.entries = []

    return this.file.save(this.entries)
  }
}
