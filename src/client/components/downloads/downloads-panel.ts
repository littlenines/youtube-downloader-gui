import { isActiveJob, isFinishedJob, isPausedJob } from '@shared/jobs.js'
import type { DownloadsResponse, Job } from '@shared/types/downloads.js'
import { api, OfflineError } from '@client/api.js'
import { runButtonAction } from '@client/components/button-action.js'
import { onDownloadsChanged } from '@client/events.js'
import { errorMessage, findElement, showToast } from '@client/utils/dom.js'
import { historyRow, jobRow, staticRow, type RowContent } from './download-rows.js'
import { renderRows } from './row-list.js'

const BUSY_POLL_MILLISECONDS = 700
const IDLE_POLL_MILLISECONDS = 4000
const OFFLINE_POLL_MILLISECONDS = 3000
const OFFLINE_TOAST_MILLISECONDS = 8000
const MINIMUM_DOWNLOADS_FOR_ALL_BUTTONS = 2

const ROW_ACTIONS: Record<string, (id: string) => Promise<unknown>> = {
  reveal: api.reveal,
  cancel: api.cancel,
  retry: api.retry,
  pause: api.pause,
  resume: api.resume,
  'start-now': api.startNow,
  remove: api.remove,
}

let pollTimer: ReturnType<typeof setTimeout> | undefined
let isOffline = false

const jobList = () => findElement('#jobs')
const clearHistoryButton = () => findElement<HTMLButtonElement>('#clearHistoryButton')
const pauseAllButton = () => findElement<HTMLButtonElement>('#pauseAllButton')
const resumeAllButton = () => findElement<HTMLButtonElement>('#resumeAllButton')

const countOf = (jobs: Job[], matches: (job: Job) => boolean): number => jobs.filter(matches).length

const renderDownloads = ({ jobs, history }: DownloadsResponse): void => {
  const jobIds = new Set(jobs.map((job) => job.id))
  const earlierEntries = history.filter((entry) => !jobIds.has(entry.id))
  const rows: RowContent[] = jobs.map(jobRow)

  if (earlierEntries.length) {
    rows.push(staticRow('earlier-label', '<div class="group-label">Earlier</div>'), ...earlierEntries.map(historyRow))
  }

  if (!rows.length) rows.push(staticRow('empty', '<div class="empty-state">Downloads you start appear here.</div>'))

  renderRows(jobList(), rows)
  clearHistoryButton().hidden = !jobs.some(isFinishedJob) && !earlierEntries.length
  pauseAllButton().hidden = countOf(jobs, isActiveJob) < MINIMUM_DOWNLOADS_FOR_ALL_BUTTONS
  resumeAllButton().hidden = countOf(jobs, isPausedJob) < MINIMUM_DOWNLOADS_FOR_ALL_BUTTONS
}

const nextPollDelay = (isBusy: boolean): number => {
  if (isBusy) return BUSY_POLL_MILLISECONDS

  return isOffline ? OFFLINE_POLL_MILLISECONDS : IDLE_POLL_MILLISECONDS
}

export const refreshDownloads = async (): Promise<void> => {
  clearTimeout(pollTimer)

  let isBusy = false

  try {
    const downloads = await api.downloads()

    if (isOffline) showToast('Reconnected.')

    isOffline = false
    renderDownloads(downloads)
    isBusy = downloads.jobs.some(isActiveJob)
  } catch (error) {
    if (error instanceof OfflineError && !isOffline) {
      isOffline = true
      showToast(error.message, OFFLINE_TOAST_MILLISECONDS)
    }
  }

  pollTimer = setTimeout(() => void refreshDownloads(), nextPollDelay(isBusy))
}

const handleRowAction = async (event: Event): Promise<void> => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')
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
  void refreshDownloads()
}
