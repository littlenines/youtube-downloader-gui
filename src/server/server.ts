import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { DATA_DIRECTORY } from './config.js';
import { DownloadQueue, removeStalePartialFolders } from './services/queue.js';
import { HistoryStore, SettingsStore } from './services/stores.js';

const ACCESS_KEY_FILE = join(DATA_DIRECTORY, 'access-key');

export interface Services {
  settings: SettingsStore;
  history: HistoryStore;
  queue: DownloadQueue;
}

export async function createServices(): Promise<Services> {
  const settings = await new SettingsStore().load();
  const history = await new HistoryStore().load();
  removeStalePartialFolders(settings.get().downloadFolder).catch(() => {});
  return { settings, history, queue: new DownloadQueue(settings, history) };
}

/** Created once and kept, so a browser that has the cookie stays signed in across restarts. */
export async function loadAccessKey(): Promise<string> {
  try {
    const stored = (await readFile(ACCESS_KEY_FILE, 'utf8')).trim();
    if (stored.length >= 32) return stored;
  } catch {
    // First start.
  }
  const accessKey = randomBytes(32).toString('base64url');
  await mkdir(DATA_DIRECTORY, { recursive: true });
  await writeFile(ACCESS_KEY_FILE, accessKey, { mode: 0o600 });
  return accessKey;
}

/** Resolves with the port actually used; port 0 picks a free one. */
export function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    });
  });
}
