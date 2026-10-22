import type { SearchResult } from '../../shared/types.js';
import { api, ApiError, isAbortError, TOOLS_MISSING_STATUS } from '../api.js';
import { errorMessage, findElement } from '../utils/dom.js';
import { escapeHtml, formatCount, formatDuration } from '../utils/format.js';
import { loadMediaInfo } from './media.js';
import { showPanel } from './panels.js';
import { requestSetup } from './setup.js';

let currentSearch: AbortController | null = null;

const panel = () => findElement('#searchPanel');

export function initialize(): void {
  panel().addEventListener('click', (event) => {
    const result = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-url]');
    if (result?.dataset.url) void loadMediaInfo(result.dataset.url, false, { fromSearch: true });
  });
}

function resultHtml(result: SearchResult): string {
  const details = [
    result.channel ? escapeHtml(result.channel) : '',
    formatDuration(result.durationSeconds),
    result.viewCount ? `${formatCount(result.viewCount)} views` : '',
  ].filter(Boolean);
  const thumbnail = result.thumbnailUrl
    ? `<img class="search-thumbnail" src="${escapeHtml(result.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '<div class="search-thumbnail"></div>';
  return `<button class="search-result" data-url="${escapeHtml(result.url)}">${thumbnail}
    <span class="search-text"><b class="search-title">${escapeHtml(result.title)}</b>
      <span class="search-details">${details.join(' · ')}</span></span></button>`;
}

function render(query: string, results: SearchResult[]): void {
  const heading = `<div class="section-header"><h2>Results for “${escapeHtml(query)}”</h2></div>`;
  panel().innerHTML = results.length
    ? `${heading}<div class="card search-results">${results.map(resultHtml).join('')}</div>`
    : `${heading}<div class="empty-state">Nothing found. Try other words, or paste a link.</div>`;
}

export async function search(query: string): Promise<void> {
  currentSearch?.abort();
  const request = new AbortController();
  currentSearch = request;
  panel().innerHTML = `<div class="card loading"><div class="spinner"></div>Searching for “${escapeHtml(query)}”…</div>`;
  showPanel('search');
  try {
    const results = await api.search(query, request.signal);
    if (!request.signal.aborted) render(query, results);
  } catch (error) {
    if (request.signal.aborted || isAbortError(error)) return;
    if (error instanceof ApiError && error.status === TOOLS_MISSING_STATUS) {
      showPanel(null);
      requestSetup(() => void search(query));
      return;
    }
    panel().innerHTML = `<div class="empty-state error-text">${escapeHtml(errorMessage(error))}</div>`;
  }
}
