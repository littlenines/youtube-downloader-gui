import { countText } from '@shared/count-text.js'
import { isActiveJob, isFinishedJob, isPausedJob, isUnfinishedJob } from '@shared/jobs.js'
import type { Job, JobGroup } from '@shared/types/downloads.js'
import { CHEVRON_ICON_HTML } from '@client/icons/chevron-icon.js'
import { escapeHtml } from '@client/utils/format.js'
import {
  groupProgress,
  groupStatusText,
  listedDownloads,
  shownVideos,
  VIDEOS_SHOWN_AT_ONCE,
  type PlaylistView,
} from './download-groups.js'
import { actionButtonHtml, jobRow, rowHtml, staticRow, type RowContent } from './download-rows.js'

const toggleButtonHtml = (group: JobGroup, isCollapsed: boolean): string => {
  const label = isCollapsed ? 'Show videos' : 'Hide videos'

  return `<button class="button small ghost icon-button group-toggle" data-action="toggle-group" data-id="${escapeHtml(group.id)}" aria-expanded="${!isCollapsed}" aria-label="${label}" title="${label}">${CHEVRON_ICON_HTML}</button>`
}

const groupActionsHtml = (group: JobGroup, jobs: Job[], isCollapsed: boolean): string => {
  const firstDoneJob = jobs.find((job) => job.status === 'done')
  const isFinished = jobs.every(isFinishedJob)

  return [
    isFinished && firstDoneJob ? actionButtonHtml('reveal', firstDoneJob.id, 'Show in folder') : '',
    jobs.some(isActiveJob) ? actionButtonHtml('pause-group', group.id, 'Pause') : '',
    jobs.some(isPausedJob) ? actionButtonHtml('resume-group', group.id, 'Resume', 'primary') : '',
    jobs.some(isUnfinishedJob) ? actionButtonHtml('cancel-group', group.id, 'Cancel') : '',
    isFinished ? actionButtonHtml('remove-group', group.id, '✕', 'ghost', 'Remove from the list (the files stay)') : '',
    toggleButtonHtml(group, isCollapsed),
  ].join('')
}

const groupHeaderRow = (group: JobGroup, jobs: Job[], isCollapsed: boolean): RowContent => {
  const isUnfinished = jobs.some(isUnfinishedJob)
  const actions = groupActionsHtml(group, jobs, isCollapsed)
  const label = `${jobs[0]?.label ?? ''} · playlist`

  return {
    key: `group-${group.id}`,
    structure: [actions, label, jobs[0]?.thumbnailUrl].join('\n'),
    html: rowHtml({
      thumbnailUrl: jobs[0]?.thumbnailUrl ?? null,
      title: group.title,
      label,
      status: isUnfinished ? 'downloading' : 'done',
      actions,
      showProgress: isUnfinished,
      rowClass: 'group-row',
    }),
    title: group.title,
    statusText: groupStatusText(group, jobs),
    progressPercent: isUnfinished ? Math.round(groupProgress(jobs) * 100) : null,
    isIndeterminate: false,
  }
}

const moreVideosRow = (group: JobGroup, hiddenCount: number, shownCount: number): RowContent =>
  staticRow(
    `group-more-${group.id}-${shownCount}-${hiddenCount}`,
    `<div class="card more-videos-row grouped"><span class="muted">${countText(hiddenCount, 'more video')} not shown</span>
      <div class="job-actions">${actionButtonHtml('show-more-group', group.id, `Show ${Math.min(hiddenCount, VIDEOS_SHOWN_AT_ONCE)} more`)}${actionButtonHtml('show-all-group', group.id, 'Show all', 'ghost')}</div></div>`,
  )

const playlistRows = (group: JobGroup, jobs: Job[], view: PlaylistView): RowContent[] => {
  const isCollapsed = view.isFolded(group)
  const header = groupHeaderRow(group, jobs, isCollapsed)

  if (isCollapsed) return [header]

  const shownCount = view.shownVideoCount(group)
  const { shownJobs, hiddenCount } = shownVideos(jobs, shownCount)
  const videoRows = shownJobs.map((job) => jobRow(job, { isGrouped: true }))

  return hiddenCount ? [header, ...videoRows, moreVideosRow(group, hiddenCount, shownCount)] : [header, ...videoRows]
}

export const jobRows = (jobs: Job[], view: PlaylistView): RowContent[] =>
  listedDownloads(jobs).flatMap((download) =>
    download.kind === 'job' ? [jobRow(download.job)] : playlistRows(download.group, download.jobs, view),
  )
