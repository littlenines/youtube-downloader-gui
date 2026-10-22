import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { HistoryEntry, Settings } from '../../shared/types.js';
import { DATA_DIRECTORY, DEFAULT_DOWNLOAD_FOLDER } from '../config.js';
import { HttpError } from '../lib/http.js';
import { JsonFile } from '../lib/json-file.js';

const HISTORY_LIMIT = 300;
const isValidSimultaneousDownloads = (value: number) => Number.isInteger(value) && value >= 1 && value <= 4;

type StoredRecord = Record<string, unknown>;
const asRecord = (value: unknown): StoredRecord => (value && typeof value === 'object' ? (value as StoredRecord) : {});
const stringOrDefault = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);
const stringOrNull = (value: unknown) => (typeof value === 'string' ? value : null);
const numberOrNull = (value: unknown) => (typeof value === 'number' ? value : null);

// The older keys (outDir, concurrent, thumbnail, size) are still read so existing data keeps working.
export function parseSettings(content: unknown): Settings {
  const stored = asRecord(content);
  const simultaneousDownloads = Number(stored.simultaneousDownloads ?? stored.concurrent);
  return {
    downloadFolder: stringOrDefault(stored.downloadFolder ?? stored.outDir, '') || DEFAULT_DOWNLOAD_FOLDER,
    simultaneousDownloads: isValidSimultaneousDownloads(simultaneousDownloads) ? simultaneousDownloads : 2,
    lowLatencyRendering: stored.lowLatencyRendering !== false,
  };
}

/** A relative path would depend on the folder the app happened to be started from, so it is refused. "~" means the home folder. */
export function absoluteFolder(input: string): string {
  const unquoted = input.trim().replace(/^["']|["']$/g, '');
  const expanded = /^~(?=$|[\\/])/.test(unquoted) ? join(homedir(), unquoted.slice(1)) : unquoted;
  if (!isAbsolute(expanded)) throw new HttpError(400, 'Enter a full folder path, for example D:\\Music or /home/you/Music.');
  return resolve(expanded);
}

export function parseHistory(content: unknown): HistoryEntry[] {
  if (!Array.isArray(content)) return [];
  return content.map(asRecord).map((stored) => ({
    id: stringOrDefault(stored.id, ''),
    title: stringOrDefault(stored.title, ''),
    thumbnailUrl: stringOrNull(stored.thumbnailUrl ?? stored.thumbnail),
    label: stringOrDefault(stored.label, ''),
    files: Array.isArray(stored.files) ? stored.files.filter((file): file is string => typeof file === 'string') : [],
    sizeBytes: numberOrNull(stored.sizeBytes ?? stored.size),
    finishedAt: stringOrDefault(stored.finishedAt, new Date(0).toISOString()),
    url: stringOrDefault(stored.url, ''),
  }));
}

export class SettingsStore {
  private readonly file = new JsonFile(join(DATA_DIRECTORY, 'settings.json'), parseSettings);
  private settings = parseSettings(undefined);

  async load(): Promise<this> {
    this.settings = await this.file.load();
    return this;
  }

  get(): Settings {
    return { ...this.settings };
  }

  async update(changes: Partial<Settings>): Promise<Settings> {
    if (typeof changes.downloadFolder === 'string' && changes.downloadFolder.trim()) {
      const folder = absoluteFolder(changes.downloadFolder);
      try {
        await mkdir(folder, { recursive: true });
      } catch {
        throw new HttpError(400, `Can't use that folder: ${folder}`);
      }
      this.settings.downloadFolder = folder;
    }
    const simultaneousDownloads = Number(changes.simultaneousDownloads);
    if (isValidSimultaneousDownloads(simultaneousDownloads)) this.settings.simultaneousDownloads = simultaneousDownloads;
    if (typeof changes.lowLatencyRendering === 'boolean') this.settings.lowLatencyRendering = changes.lowLatencyRendering;
    await this.file.save(this.settings);
    return this.get();
  }
}

export class HistoryStore {
  private readonly file = new JsonFile(join(DATA_DIRECTORY, 'history.json'), parseHistory);
  private entries: HistoryEntry[] = [];

  async load(): Promise<this> {
    this.entries = await this.file.load();
    return this;
  }

  list(limit: number): HistoryEntry[] {
    return this.entries.slice(0, limit);
  }

  find(id: string): HistoryEntry | undefined {
    return this.entries.find((entry) => entry.id === id);
  }

  add(entry: HistoryEntry): Promise<void> {
    this.entries = [entry, ...this.entries.filter((existing) => existing.id !== entry.id)].slice(0, HISTORY_LIMIT);
    return this.file.save(this.entries);
  }

  remove(id: string): Promise<void> {
    this.entries = this.entries.filter((entry) => entry.id !== id);
    return this.file.save(this.entries);
  }

  clear(): Promise<void> {
    this.entries = [];
    return this.file.save(this.entries);
  }
}
