import { countJobs, isActiveJob, isFinishedJob, isPausedJob } from '@shared/jobs.js'
import type { DownloadsResponse, JobGroup } from '@shared/types/downloads.js'
import { api, OfflineError } from '@client/api.js'
import { runButtonAction } from '@client/components/button-action.js'
import { onDownloadsChanged } from '@client/events.js'
import { errorMessage, findElement, showToast } from '@client/utils/dom.js'
import { jobRows } from './download-group-rows.js'
import { VIDEOS_SHOWN_AT_ONCE, type PlaylistView } from './download-groups.js'
import { historyRow, staticRow, type RowContent } from './download-rows.js'
import { renderRows } from './row-list.js'

const BUSY_POLL_MILLISECONDS = 700
const IDLE_POLL_MILLISECONDS = 4000
const OFFLINE_POLL_MILLISECONDS = 3000
const OFFLINE_TOAST_MILLISECONDS = 8000
const MINIMUM_DOWNLOADS_FOR_ALL_BUTTONS = 2
const FOLDED_PLAYLIST_SIZE = 50

const ROW_ACTIONS: Record<string, (id: string) => Promise<unknown>> = {
  reveal: api.reveal,
  play: api.play,
  cancel: api.cancel,
  retry: api.retry,
  pause: api.pause,
  resume: api.resume,
  'start-now': api.startNow,
  remove: api.remove,
  'pause-group': api.pauseGroup,
  'resume-group': api.resumeGroup,
  'cancel-group': api.cancelGroup,
  'remove-group': api.removeGroup,
}

const toggledGroupIds = new Set<string>()

const isLongPlaylist = (group: JobGroup): boolean => group.size > FOLDED_PLAYLIST_SIZE
const shownVideoCounts = new Map<string, number>()

const playlistView: PlaylistView = {
  isFolded: (group) => isLongPlaylist(group) !== toggledGroupIds.has(group.id),
  shownVideoCount: (group) => shownVideoCounts.get(group.id) ?? VIDEOS_SHOWN_AT_ONCE,
}

let pollTimer: ReturnType<typeof setTimeout> | undefined
let isOffline = false
let lastDownloads: DownloadsResponse | null = null

const jobList = () => findElement('#jobs')
const clearHistoryButton = () => findElement<HTMLButtonElement>('#clearHistoryButton')
const pauseAllButton = () => findElement<HTMLButtonElement>('#pauseAllButton')
const resumeAllButton = () => findElement<HTMLButtonElement>('#resumeAllButton')

const renderDownloads = ({ jobs, history }: DownloadsResponse): void => {
  const shownIds = new Set(jobs.flatMap((job) => (job.group ? [job.id, job.group.id] : [job.id])))
  const earlierEntries = history.filter((entry) => !shownIds.has(entry.id))
  const rows: RowContent[] = jobRows(jobs, playlistView)

  if (earlierEntries.length) {
    rows.push(staticRow('earlier-label', '<div class="group-label">Earlier</div>'), ...earlierEntries.map(historyRow))
  }

  if (!rows.length) rows.push(staticRow('empty', '<div class="empty-state">Downloads you start appear here.</div>'))

  renderRows(jobList(), rows)
  clearHistoryButton().hidden = !jobs.some(isFinishedJob) && !earlierEntries.length
  pauseAllButton().hidden = countJobs(jobs, isActiveJob) < MINIMUM_DOWNLOADS_FOR_ALL_BUTTONS
  resumeAllButton().hidden = countJobs(jobs, isPausedJob) < MINIMUM_DOWNLOADS_FOR_ALL_BUTTONS
}

const nextPollDelay = (isBusy: boolean): number => {
  if (isBusy && !document.hidden) return BUSY_POLL_MILLISECONDS

  return isOffline ? OFFLINE_POLL_MILLISECONDS : IDLE_POLL_MILLISECONDS
}

export const refreshDownloads = async (): Promise<void> => {
  clearTimeout(pollTimer)

  let isBusy = false

  try {
    const downloads = await api.downloads()

    if (isOffline) showToast('Reconnected.')

    isOffline = false
    lastDownloads = downloads
    renderDownloads(downloads)
    isBusy = downloads.jobs.some(isActiveJob)
  } catch (error) {
    if (error instanceof OfflineError && !isOffline) {
      isOffline = true
      showToast(error.message, OFFLINE_TOAST_MILLISECONDS)
    }
  }

  clearTimeout(pollTimer)
  pollTimer = setTimeout(() => void refreshDownloads(), nextPollDelay(isBusy))
}

const PAGE_ACTIONS: Record<string, (groupId: string) => void> = {
  'toggle-group': (groupId) => {
    if (toggledGroupIds.has(groupId)) toggledGroupIds.delete(groupId)
    else toggledGroupIds.add(groupId)
  },
  'show-more-group': (groupId) =>
    shownVideoCounts.set(groupId, (shownVideoCounts.get(groupId) ?? VIDEOS_SHOWN_AT_ONCE) + VIDEOS_SHOWN_AT_ONCE),
  'show-all-group': (groupId) => shownVideoCounts.set(groupId, Number.POSITIVE_INFINITY),
}

const runPageAction = (action: (groupId: string) => void, groupId: string): void => {
  action(groupId)

  if (lastDownloads) renderDownloads(lastDownloads)
}

const handleRowAction = async (event: Event): Promise<void> => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')

  const pageAction = PAGE_ACTIONS[button?.dataset.action ?? '']

  if (pageAction) return runPageAction(pageAction, button?.dataset.id ?? '')

  const action = button && ROW_ACTIONS[button.dataset.action ?? '']

  if (!button || !action) return

  try {
    await action(button.dataset.id ?? '')
    void refreshDownloads()
  } catch (error) {
    showToast(errorMessage(error))
  }
}

const listButton = (button: HTMLButtonElement, busyText: string, request: () => Promise<unknown>): void => {
  const run = async () => {
    await request()
    await refreshDownloads()
  }

  const click = () => void runButtonAction({ button, busyText, run, retry: click })

  button.addEventListener('click', click)
}

export const initializeDownloadsPanel = (): void => {
  jobList().addEventListener('click', (event) => void handleRowAction(event))
  listButton(clearHistoryButton(), 'Clearing…', api.clearFinished)
  listButton(pauseAllButton(), 'Pausing…', api.pauseAll)
  listButton(resumeAllButton(), 'Resuming…', api.resumeAll)
  onDownloadsChanged(() => void refreshDownloads())
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refreshDownloads()
  })
  void refreshDownloads()
}
