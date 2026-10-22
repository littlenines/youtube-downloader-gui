import type { DownloadsResponse, HistoryEntry, Job } from '../../shared/types.js';
import { api, OfflineError } from '../api.js';
import { createElement, errorMessage, findElement, setProgress, showToast } from '../utils/dom.js';
import { escapeHtml, formatBytes, formatSpeed, formatTimeLeft } from '../utils/format.js';

const BUSY_POLL_MILLISECONDS = 700;
const IDLE_POLL_MILLISECONDS = 4000;
const OFFLINE_POLL_MILLISECONDS = 3000;

interface RowContent {
  key: string;
  /** Rows are rebuilt only when this changes; the title, status text and progress bar update in place. */
  structure: string;
  html: string;
  title: string;
  statusText: string;
  progressPercent: number | null;
}

const rowsByKey = new Map<string, { element: HTMLElement; structure: string }>();
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let isOffline = false;

const list = () => findElement('#jobs');
const isActive = (job: Job) => job.status === 'downloading' || job.status === 'queued';

function jobStatusText(job: Job): string {
  const percent = Math.round(job.progress * 100);
  switch (job.status) {
    case 'queued':
      return 'Waiting…';
    case 'downloading': {
      const position = job.playlistPosition?.count
        ? `Video ${job.playlistPosition.index ?? '?'} of ${job.playlistPosition.count}: ${job.playlistPosition.title} · `
        : '';
      const parts = [
        `${position}${job.stage ?? 'Downloading'}`,
        job.stage?.startsWith('Download') ? `${percent}%` : '',
        formatSpeed(job.bytesPerSecond),
        formatTimeLeft(job.secondsLeft),
      ];
      return parts.filter(Boolean).join(' · ');
    }
    case 'done':
      return ['Done', formatBytes(job.sizeBytes), job.files.length > 1 ? `${job.files.length} files` : '', job.warning ?? '']
        .filter(Boolean)
        .join(' · ');
    case 'cancelled':
      return 'Cancelled';
    default:
      return job.error ?? 'Failed';
  }
}

const actionButton = (action: string, id: string, label: string, extraClass = '', title = '') =>
  `<button class="button small ${extraClass}" data-action="${action}" data-id="${escapeHtml(id)}" ${title ? `title="${title}"` : ''}>${label}</button>`;

const removeButton = (id: string) => actionButton('remove', id, '✕', 'ghost', 'Remove from the list (the file stays)');

function rowHtml(options: {
  thumbnailUrl: string | null;
  title: string;
  label: string;
  status: string;
  actions: string;
  showProgress: boolean;
}): string {
  const thumbnail = options.thumbnailUrl
    ? `<img class="job-thumbnail" src="${escapeHtml(options.thumbnailUrl)}" alt="" referrerpolicy="no-referrer">`
    : '<div class="job-thumbnail"></div>';
  const statusClass = options.status === 'error' ? 'job-status error-text' : 'job-status';
  return `<div class="card job-row ${options.status}">${thumbnail}
    <div class="job-details"><div class="job-title" title="${escapeHtml(options.title)}">${escapeHtml(options.title)}</div>
      <div class="${statusClass}"><span class="chip">${escapeHtml(options.label)}</span> <span class="job-status-text"></span></div>
      ${options.showProgress ? `<div class="progress-track" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="progress-fill"></div></div>` : ''}</div>
    <div class="job-actions">${options.actions}</div></div>`;
}

function jobRow(job: Job): RowContent {
  const actions = [
    job.status === 'done' ? actionButton('reveal', job.id, 'Show in folder') : '',
    isActive(job) ? actionButton('cancel', job.id, 'Cancel') : '',
    job.status === 'error' || job.status === 'cancelled' ? actionButton('retry', job.id, 'Retry') : '',
    isActive(job) ? '' : removeButton(job.id),
  ].join('');
  const showProgress = isActive(job);
  return {
    key: job.id,
    structure: [isActive(job) ? 'active' : job.status, job.thumbnailUrl, job.label].join('\n'),
    html: rowHtml({ thumbnailUrl: job.thumbnailUrl, title: job.title, label: job.label, status: job.status, actions, showProgress }),
    title: job.title,
    statusText: jobStatusText(job),
    progressPercent: showProgress ? Math.round(job.progress * 100) : null,
  };
}

function historyRow(entry: HistoryEntry): RowContent {
  const actions = actionButton('reveal', entry.id, 'Show in folder') + removeButton(entry.id);
  return {
    key: `history-${entry.id}`,
    structure: entry.id,
    html: rowHtml({
      thumbnailUrl: entry.thumbnailUrl,
      title: entry.title,
      label: entry.label,
      status: 'done',
      actions,
      showProgress: false,
    }),
    title: entry.title,
    statusText: [formatBytes(entry.sizeBytes), new Date(entry.finishedAt).toLocaleString()].filter(Boolean).join(' · '),
    progressPercent: null,
  };
}

const staticRow = (key: string, html: string): RowContent => ({
  key,
  structure: key,
  html,
  title: '',
  statusText: '',
  progressPercent: null,
});

function render({ jobs, history }: DownloadsResponse): void {
  const jobIds = new Set(jobs.map((job) => job.id));
  const earlier = history.filter((entry) => !jobIds.has(entry.id));
  const rows: RowContent[] = jobs.map(jobRow);
  if (earlier.length) rows.push(staticRow('earlier-label', '<div class="group-label">Earlier</div>'), ...earlier.map(historyRow));
  if (!rows.length) rows.push(staticRow('empty', '<div class="empty-state">Downloads you start appear here.</div>'));

  const container = list();
  const wantedKeys = new Set(rows.map((row) => row.key));
  for (const [key, row] of rowsByKey) {
    if (wantedKeys.has(key)) continue;
    row.element.remove();
    rowsByKey.delete(key);
  }
  rows.forEach((content, position) => {
    const element = upsertRow(content);
    if (container.children[position] !== element) container.insertBefore(element, container.children[position] ?? null);
  });

  const hasFinishedJobs = jobs.some((job) => !isActive(job));
  findElement('#clearHistoryButton').hidden = !hasFinishedJobs && !earlier.length;
}

function upsertRow(content: RowContent): HTMLElement {
  let row = rowsByKey.get(content.key);
  if (!row || row.structure !== content.structure) {
    const element = createElement(content.html);
    row?.element.replaceWith(element);
    row = { element, structure: content.structure };
    rowsByKey.set(content.key, row);
  }
  const title = row.element.querySelector<HTMLElement>('.job-title');
  if (title && title.textContent !== content.title) {
    title.textContent = content.title;
    title.title = content.title;
  }
  const statusText = row.element.querySelector('.job-status-text');
  if (statusText && statusText.textContent !== content.statusText) {
    statusText.textContent = content.statusText;
    statusText.setAttribute('title', content.statusText);
  }
  const progressFill = row.element.querySelector<HTMLElement>('.progress-fill');
  if (progressFill && content.progressPercent !== null) setProgress(progressFill, content.progressPercent / 100);
  return row.element;
}

const ACTIONS: Record<string, (id: string) => Promise<unknown>> = {
  reveal: api.reveal,
  cancel: api.cancel,
  retry: api.retry,
  remove: api.remove,
};

async function handleClick(event: Event): Promise<void> {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  const action = button && ACTIONS[button.dataset.action ?? ''];
  if (!button || !action) return;
  try {
    await action(button.dataset.id ?? '');
    void refresh();
  } catch (error) {
    showToast(errorMessage(error));
  }
}

export async function refresh(): Promise<void> {
  clearTimeout(pollTimer);
  let isBusy = false;
  try {
    const data = await api.downloads();
    if (isOffline) showToast('Reconnected.');
    isOffline = false;
    render(data);
    isBusy = data.jobs.some(isActive);
  } catch (error) {
    if (error instanceof OfflineError && !isOffline) {
      isOffline = true;
      showToast(error.message, 8000);
    }
  }
  const delay = isBusy ? BUSY_POLL_MILLISECONDS : isOffline ? OFFLINE_POLL_MILLISECONDS : IDLE_POLL_MILLISECONDS;
  pollTimer = setTimeout(() => void refresh(), delay);
}

export function initialize(): void {
  list().addEventListener('click', (event) => void handleClick(event));
  findElement('#clearHistoryButton').addEventListener('click', async () => {
    await api.clearFinished().catch(() => {});
    void refresh();
  });
  document.addEventListener('downloads:changed', () => void refresh());
  void refresh();
}
