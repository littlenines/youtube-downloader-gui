import { isActiveJob, isFinishedJob, isUnfinishedJob } from '@shared/jobs.js'
import type { HistoryEntry, Job } from '@shared/types/downloads.js'
import { escapeHtml, formatBytes, formatSpeed, formatTimeLeft } from '@client/utils/format.js'

export interface RowContent {
  key: string
  structure: string
  html: string
  title: string
  statusText: string
  progressPercent: number | null
}

interface RowHtmlOptions {
  thumbnailUrl: string | null
  title: string
  label: string
  status: string
  actions: string
  showProgress: boolean
}

const PROGRESS_BAR_HTML =
  '<div class="progress-track" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="progress-fill"></div></div>'

const joinNonEmpty = (parts: string[]) => parts.filter(Boolean).join(' · ')

const playlistPositionText = (job: Job): string => {
  const position = job.playlistPosition

  return position?.count ? `Video ${position.index ?? '?'} of ${position.count}: ${position.title} · ` : ''
}

const jobStatusText = (job: Job): string => {
  switch (job.status) {
    case 'queued':
      return 'Waiting…'
    case 'downloading':
      return joinNonEmpty([
        `${playlistPositionText(job)}${job.stage ?? 'Downloading'}`,
        job.stage?.startsWith('Download') ? `${Math.round(job.progress * 100)}%` : '',
        formatSpeed(job.bytesPerSecond),
        formatTimeLeft(job.secondsLeft),
      ])
    case 'paused':
      return joinNonEmpty(['Paused', job.progress ? `${Math.round(job.progress * 100)}%` : ''])
    case 'done':
      return joinNonEmpty([
        'Done',
        formatBytes(job.sizeBytes),
        job.files.length > 1 ? `${job.files.length} files` : '',
        job.warning ?? '',
      ])
    case 'cancelled':
      return 'Cancelled'
    default:
      return job.error ?? 'Failed'
  }
}

const actionButtonHtml = (action: string, id: string, label: string, extraClass = '', title = ''): string =>
  `<button class="button small ${extraClass}" data-action="${action}" data-id="${escapeHtml(id)}" ${title ? `title="${title}"` : ''}>${label}</button>`

const removeButtonHtml = (id: string): string =>
  actionButtonHtml('remove', id, '✕', 'ghost', 'Remove from the list (the file stays)')

const rowHtml = (options: RowHtmlOptions): string => {
  const thumbnail = options.thumbnailUrl
    ? `<img class="job-thumbnail" src="${escapeHtml(options.thumbnailUrl)}" alt="" referrerpolicy="no-referrer">`
    : '<div class="job-thumbnail"></div>'
  const statusClass = options.status === 'error' ? 'job-status error-text' : 'job-status'

  return `<div class="card job-row ${options.status}">${thumbnail}
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
    job.status === 'paused' ? actionButtonHtml('resume', job.id, 'Resume', 'primary') : '',
    isUnfinishedJob(job) ? actionButtonHtml('cancel', job.id, 'Cancel') : '',
    canRetry ? actionButtonHtml('retry', job.id, 'Retry') : '',
    isFinishedJob(job) ? removeButtonHtml(job.id) : '',
  ].join('')
}

export const jobRow = (job: Job): RowContent => {
  const isActive = isActiveJob(job)
  const showsProgress = isUnfinishedJob(job)

  return {
    key: job.id,
    structure: [isActive ? 'active' : job.status, job.thumbnailUrl, job.label].join('\n'),
    html: rowHtml({
      thumbnailUrl: job.thumbnailUrl,
      title: job.title,
      label: job.label,
      status: job.status,
      actions: jobActionsHtml(job),
      showProgress: showsProgress,
    }),
    title: job.title,
    statusText: jobStatusText(job),
    progressPercent: showsProgress ? Math.round(job.progress * 100) : null,
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
  statusText: joinNonEmpty([formatBytes(entry.sizeBytes), new Date(entry.finishedAt).toLocaleString()]),
  progressPercent: null,
})

export const staticRow = (key: string, html: string): RowContent => ({
  key,
  structure: key,
  html,
  title: '',
  statusText: '',
  progressPercent: null,
})
