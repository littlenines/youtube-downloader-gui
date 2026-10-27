import { isActiveJob, isFinishedJob, isPausedJob, isUnfinishedJob } from '@shared/jobs.js'
import type { HistoryEntry, Job } from '@shared/types/downloads.js'
import { formatDateTime, formatStartTime } from '@client/locale.js'
import {
  escapeHtml,
  formatBytes,
  formatSeconds,
  formatSpeed,
  formatTimeLeft,
  joinNonEmpty,
} from '@client/utils/format.js'

export interface RowContent {
  key: string
  structure: string
  html: string
  title: string
  statusText: string
  progressPercent: number | null
  isIndeterminate: boolean
}

interface RowHtmlOptions {
  thumbnailUrl: string | null
  title: string
  label: string
  status: string
  actions: string
  showProgress: boolean
  rowClass?: string
}

export interface JobRowOptions {
  isGrouped?: boolean
}

const PROGRESS_BAR_HTML =
  '<div class="progress-track" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="progress-fill"></div></div>'

const playlistPositionText = (job: Job): string => {
  const position = job.playlistPosition

  return position?.count ? `Video ${position.index ?? '?'} of ${position.count}: ${position.title} · ` : ''
}

const isWorkingWithoutProgress = (job: Job): boolean =>
  job.status === 'downloading' && (job.activity === 'preparing' || job.activity === 'processing')

const percentText = (job: Job): string => `${Math.round(job.progress * 100)}%`

const sizeText = (job: Job): string =>
  job.downloadedBytes && job.totalBytes ? `${formatBytes(job.downloadedBytes)} of ${formatBytes(job.totalBytes)}` : ''

const downloadingStatusText = (job: Job): string => {
  const stage = `${playlistPositionText(job)}${job.stage ?? 'Downloading'}`

  if (isWorkingWithoutProgress(job)) return `${stage}…`

  return joinNonEmpty([
    stage,
    job.activity === 'downloading' ? percentText(job) : '',
    sizeText(job),
    formatSpeed(job.bytesPerSecond),
    formatTimeLeft(job.secondsLeft),
  ])
}

const tookText = ({ activeSeconds }: Job): string => (activeSeconds ? `took ${formatSeconds(activeSeconds)}` : '')

const jobStatusText = (job: Job): string => {
  switch (job.status) {
    case 'scheduled':
      return joinNonEmpty([
        `${job.progress ? 'Continues' : 'Starts'} ${formatStartTime(job.startsAt)}`,
        job.progress ? percentText(job) : '',
      ])
    case 'queued':
      return 'Waiting…'
    case 'downloading':
      return downloadingStatusText(job)
    case 'paused':
      return joinNonEmpty(['Paused', job.progress ? percentText(job) : ''])
    case 'done':
      return joinNonEmpty([
        'Done',
        formatBytes(job.sizeBytes),
        job.files.length > 1 ? `${job.files.length} files` : '',
        tookText(job),
        job.warning ?? '',
      ])
    case 'cancelled':
      return 'Cancelled'
    default:
      return job.error ?? 'Failed'
  }
}

export const actionButtonHtml = (action: string, id: string, label: string, extraClass = '', title = ''): string =>
  `<button class="button small ${extraClass}" data-action="${action}" data-id="${escapeHtml(id)}" ${title ? `title="${title}"` : ''}>${label}</button>`

const removeButtonHtml = (id: string): string =>
  actionButtonHtml('remove', id, '✕', 'ghost', 'Remove from the list (the file stays)')

export const rowHtml = (options: RowHtmlOptions): string => {
  const thumbnail = options.thumbnailUrl
    ? `<img class="job-thumbnail" src="${escapeHtml(options.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '<div class="job-thumbnail"></div>'
  const statusClass = options.status === 'error' ? 'job-status error-text' : 'job-status'

  return `<div class="card job-row ${options.status} ${options.rowClass ?? ''}">${thumbnail}
    <div class="job-details"><div class="job-title" title="${escapeHtml(options.title)}">${escapeHtml(options.title)}</div>
      <div class="${statusClass}"><span class="chip">${escapeHtml(options.label)}</span> <span class="job-status-text"></span></div>
      ${options.showProgress ? PROGRESS_BAR_HTML : ''}</div>
    <div class="job-actions">${options.actions}</div></div>`
}

const jobActionsHtml = (job: Job): string => {
  const canRetry = job.status === 'error' || job.status === 'cancelled'

  return [
    job.status === 'done' ? actionButtonHtml('reveal', job.id, 'Show in folder') : '',
    isActiveJob(job) ? actionButtonHtml('pause', job.id, 'Pause') : '',
    isPausedJob(job) ? actionButtonHtml('resume', job.id, 'Resume', 'primary') : '',
    job.status === 'scheduled' ? actionButtonHtml('start-now', job.id, 'Start now', 'primary') : '',
    isUnfinishedJob(job) ? actionButtonHtml('cancel', job.id, 'Cancel') : '',
    canRetry ? actionButtonHtml('retry', job.id, 'Retry') : '',
    isFinishedJob(job) && !job.group ? removeButtonHtml(job.id) : '',
  ].join('')
}

const numberedTitle = (job: Job): string =>
  job.options.playlistNumber ? `${job.options.playlistNumber}. ${job.title}` : job.title

export const jobRow = (job: Job, { isGrouped = false }: JobRowOptions = {}): RowContent => {
  const isActive = isActiveJob(job)
  const showsProgress = isUnfinishedJob(job)
  const title = numberedTitle(job)

  return {
    key: job.id,
    structure: [isActive ? 'active' : job.status, job.thumbnailUrl, job.label, isGrouped].join('\n'),
    html: rowHtml({
      thumbnailUrl: job.thumbnailUrl,
      title,
      label: job.label,
      status: job.status,
      actions: jobActionsHtml(job),
      showProgress: showsProgress,
      rowClass: isGrouped ? 'grouped' : '',
    }),
    title,
    statusText: jobStatusText(job),
    progressPercent: showsProgress ? Math.round(job.progress * 100) : null,
    isIndeterminate: isWorkingWithoutProgress(job),
  }
}

export const historyRow = (entry: HistoryEntry): RowContent => ({
  key: `history-${entry.id}`,
  structure: entry.id,
  html: rowHtml({
    thumbnailUrl: entry.thumbnailUrl,
    title: entry.title,
    label: entry.label,
    status: 'done',
    actions: actionButtonHtml('reveal', entry.id, 'Show in folder') + removeButtonHtml(entry.id),
    showProgress: false,
  }),
  title: entry.title,
  statusText: joinNonEmpty([formatBytes(entry.sizeBytes), formatDateTime(entry.finishedAt)]),
  progressPercent: null,
  isIndeterminate: false,
})

export const staticRow = (key: string, html: string): RowContent => ({
  key,
  structure: key,
  html,
  title: '',
  statusText: '',
  progressPercent: null,
  isIndeterminate: false,
})
