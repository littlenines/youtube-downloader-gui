import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { dirname } from 'node:path';
import { isWebLink } from '../../shared/links.js';
import type { DownloadRequest, DownloadsResponse, Settings, StatusResponse } from '../../shared/types.js';
import { HttpError, readJsonBody, type Router } from '../lib/http.js';
import { revealInFileManager } from '../lib/os.js';
import { normalizeRequest } from '../services/formats.js';
import { streamPreview } from '../services/preview.js';
import type { DownloadQueue } from '../services/queue.js';
import type { HistoryStore, SettingsStore } from '../services/stores.js';
import { toolSetup, ToolsMissingError } from '../services/tools.js';
import { fetchMediaInfo, searchVideos } from '../services/ytdlp.js';

export interface RouteDependencies {
  settings: SettingsStore;
  history: HistoryStore;
  queue: DownloadQueue;
}

const HISTORY_ENTRIES_SHOWN = 30;

const isLinkValue = (value: unknown): value is string => typeof value === 'string' && isWebLink(value);
const MAXIMUM_QUERY_LENGTH = 200;

function asHttpError(error: unknown): HttpError {
  if (error instanceof ToolsMissingError) return new HttpError(409, error.message);
  return new HttpError(400, error instanceof Error ? error.message : String(error));
}

/** Aborts when the page stops waiting (it moved on to another link), so yt-dlp doesn't keep working for nothing. */
function abortWhenClientLeaves(response: ServerResponse): AbortSignal {
  const controller = new AbortController();
  response.on('close', () => {
    if (!response.writableFinished) controller.abort();
  });
  return controller.signal;
}

function noSuchDownload(): never {
  throw new HttpError(404, 'No such download.');
}

/** Shows the file, its folder when the file was moved or deleted, or else the download folder. */
async function showInFileManager(file: string | undefined, downloadFolder: string): Promise<void> {
  if (file && existsSync(file)) return revealInFileManager(file);
  const folder = file && existsSync(dirname(file)) ? dirname(file) : downloadFolder;
  await mkdir(folder, { recursive: true });
  revealInFileManager(folder);
}

export function registerRoutes(router: Router, { settings, history, queue }: RouteDependencies): void {
  router.get('/api/status', (): StatusResponse => ({
    ...settings.get(),
    ytdlpVersion: toolSetup.ytdlpVersion,
    platform: `${process.platform}/${process.arch}`,
    setup: toolSetup.status(),
  }));

  router.post('/api/setup', () => {
    toolSetup.ensure().catch(() => {});
    return toolSetup.status();
  });

  router.post('/api/info', async ({ request, response }) => {
    const body = await readJsonBody<{ url: string; playlist: boolean }>(request);
    if (!isLinkValue(body.url)) throw new HttpError(400, 'Paste a full link that starts with https://');
    try {
      return await fetchMediaInfo(body.url.trim(), { playlist: Boolean(body.playlist), signal: abortWhenClientLeaves(response) });
    } catch (error) {
      throw asHttpError(error);
    }
  });

  router.post('/api/search', async ({ request, response }) => {
    const { query } = await readJsonBody<{ query: string }>(request);
    const cleanQuery = typeof query === 'string' ? query.trim().slice(0, MAXIMUM_QUERY_LENGTH) : '';
    if (!cleanQuery) throw new HttpError(400, 'Type something to search for.');
    try {
      return await searchVideos(cleanQuery, abortWhenClientLeaves(response));
    } catch (error) {
      throw asHttpError(error);
    }
  });

  router.get('/api/preview/:token', ({ request, response, parameters: [token = ''] }) => streamPreview(token, request, response));

  router.post('/api/downloads', async ({ request }) => {
    const body = await readJsonBody<DownloadRequest>(request);
    if (!isLinkValue(body.url)) throw new HttpError(400, 'No link to download.');
    return queue.add(normalizeRequest(body), { title: body.title, thumbnailUrl: body.thumbnailUrl, videoCount: body.videoCount });
  });

  router.get('/api/downloads', (): DownloadsResponse => ({ jobs: queue.list(), history: history.list(HISTORY_ENTRIES_SHOWN) }));

  router.post('/api/downloads/:id/cancel', ({ parameters: [id = ''] }) => queue.cancel(id) ?? noSuchDownload());
  router.post('/api/downloads/:id/retry', ({ parameters: [id = ''] }) => queue.retry(id) ?? noSuchDownload());

  router.post('/api/downloads/:id/reveal', async ({ parameters: [id = ''] }) => {
    const lastFile = queue.get(id)?.files.at(-1) ?? history.find(id)?.files.at(-1);
    await showInFileManager(lastFile, settings.get().downloadFolder);
    return { ok: true };
  });

  router.delete('/api/downloads/:id', async ({ parameters: [id = ''] }) => {
    queue.remove(id);
    await history.remove(id);
    return { ok: true };
  });

  router.delete('/api/downloads', async () => {
    queue.clearFinished();
    await history.clear();
    return { ok: true };
  });

  router.post('/api/settings', async ({ request }) => {
    const updated = await settings.update(await readJsonBody<Settings>(request));
    queue.startQueuedJobs();
    return updated;
  });

  router.post('/api/open-folder', async () => {
    await showInFileManager(undefined, settings.get().downloadFolder);
    return { ok: true };
  });
}
