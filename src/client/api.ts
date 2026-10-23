import type {
  DownloadRequest,
  DownloadsResponse,
  Job,
  MediaInfo,
  SearchResult,
  Settings,
  SetupStatus,
  StatusResponse,
} from '@shared/types.js'

export class OfflineError extends Error {
  constructor() {
    super("Can't reach the app. Is the YT Downloader window still open?")
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export const TOOLS_MISSING_STATUS = 409

export const isAbortError = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError'

const sendRequest = async <ResponseBody>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<ResponseBody> => {
  let response: Response

  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
      signal: signal ?? null,
    })
  } catch (error) {
    if (isAbortError(error)) throw error

    throw new OfflineError()
  }

  const data = (await response.json().catch(() => ({}))) as ResponseBody & { error?: string }

  if (!response.ok) throw new ApiError(data.error ?? `Request failed (${response.status})`, response.status)
  return data
}

const downloadPath = (id: string, action = '') => `/api/downloads/${encodeURIComponent(id)}${action}`

export const api = {
  status: () => sendRequest<StatusResponse>('GET', '/api/status'),
  startSetup: () => sendRequest<SetupStatus>('POST', '/api/setup'),
  mediaInfo: (url: string, playlist: boolean, signal: AbortSignal) =>
    sendRequest<MediaInfo>('POST', '/api/info', { url, playlist }, signal),
  search: (query: string, signal: AbortSignal) => sendRequest<SearchResult[]>('POST', '/api/search', { query }, signal),
  previewUrl: (token: string) => `/api/preview/${encodeURIComponent(token)}`,
  startDownload: (download: DownloadRequest) => sendRequest<Job>('POST', '/api/downloads', download),
  downloads: () => sendRequest<DownloadsResponse>('GET', '/api/downloads'),
  cancel: (id: string) => sendRequest<Job>('POST', downloadPath(id, '/cancel')),
  retry: (id: string) => sendRequest<Job>('POST', downloadPath(id, '/retry')),
  reveal: (id: string) => sendRequest<{ ok: true }>('POST', downloadPath(id, '/reveal')),
  remove: (id: string) => sendRequest<{ ok: true }>('DELETE', downloadPath(id)),
  clearFinished: () => sendRequest<{ ok: true }>('DELETE', '/api/downloads'),
  saveSettings: (changes: Partial<Settings>) => sendRequest<Settings>('POST', '/api/settings', changes),
  openDownloadFolder: () => sendRequest<{ ok: true }>('POST', '/api/open-folder'),
}
