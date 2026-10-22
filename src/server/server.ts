import type { Server } from 'node:http';
import { DownloadQueue } from './services/queue.js';
import { HistoryStore, SettingsStore } from './services/stores.js';

export interface Services {
  settings: SettingsStore;
  history: HistoryStore;
  queue: DownloadQueue;
}

export async function createServices(): Promise<Services> {
  const settings = await new SettingsStore().load();
  const history = await new HistoryStore().load();
  return { settings, history, queue: new DownloadQueue(settings, history) };
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
