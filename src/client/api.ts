import type {
  DownloadRequest,
  DownloadsResponse,
  Job,
  MediaInfo,
  SearchResult,
  Settings,
  SetupStatus,
  StatusResponse,
} from '../shared/types.js';

export class OfflineError extends Error {
  constructor() {
    super("Can't reach the app. Is the YT Downloader window still open?");
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const TOOLS_MISSING_STATUS = 409;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    throw new OfflineError();
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? `Request failed (${response.status})`, response.status);
  return data;
}

const downloadPath = (id: string, action = '') => `/api/downloads/${encodeURIComponent(id)}${action}`;

export const api = {
  status: () => request<StatusResponse>('GET', '/api/status'),
  startSetup: () => request<SetupStatus>('POST', '/api/setup'),
  mediaInfo: (url: string, playlist = false) => request<MediaInfo>('POST', '/api/info', { url, playlist }),
  search: (query: string) => request<SearchResult[]>('POST', '/api/search', { query }),
  previewUrl: (token: string) => `/api/preview/${encodeURIComponent(token)}`,
  startDownload: (download: DownloadRequest) => request<Job>('POST', '/api/downloads', download),
  downloads: () => request<DownloadsResponse>('GET', '/api/downloads'),
  cancel: (id: string) => request<Job>('POST', downloadPath(id, '/cancel')),
  retry: (id: string) => request<Job>('POST', downloadPath(id, '/retry')),
  reveal: (id: string) => request<{ ok: true }>('POST', downloadPath(id, '/reveal')),
  remove: (id: string) => request<{ ok: true }>('DELETE', downloadPath(id)),
  clearFinished: () => request<{ ok: true }>('DELETE', '/api/downloads'),
  saveSettings: (changes: Partial<Settings>) => request<Settings>('POST', '/api/settings', changes),
  openDownloadFolder: () => request<{ ok: true }>('POST', '/api/open-folder'),
};
