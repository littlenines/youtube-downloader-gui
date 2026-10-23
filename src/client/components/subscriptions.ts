import type { Subscription, SubscriptionsResponse } from '@shared/types/subscriptions.js'
import { api } from '@client/api.js'
import { announceDownloadsChanged, onSubscriptionsChanged } from '@client/events.js'
import { formatDateTime } from '@client/locale.js'
import { errorMessage, findElement, showToast } from '@client/utils/dom.js'
import { escapeHtml } from '@client/utils/format.js'

const CHECKING_POLL_MILLISECONDS = 2000
const IDLE_POLL_MILLISECONDS = 60_000
const MINUTE_MILLISECONDS = 60_000
const HOUR_MILLISECONDS = 60 * MINUTE_MILLISECONDS

let pollTimer: ReturnType<typeof setTimeout> | undefined
let wasChecking = false

const subscriptionsDialog = () => findElement<HTMLDialogElement>('#subscriptionsDialog')
const subscriptionCount = () => findElement('#subscriptionCount')
const scheduleText = () => findElement('#subscriptionScheduleText')
const subscriptionList = () => findElement('#subscriptionList')
const checkButton = () => findElement<HTMLButtonElement>('#checkSubscriptionsButton')

const timeAgo = (isoDate: string): string => {
  const elapsedMilliseconds = Date.now() - Date.parse(isoDate)

  if (elapsedMilliseconds < MINUTE_MILLISECONDS) return 'just now'
  if (elapsedMilliseconds < HOUR_MILLISECONDS) return `${Math.floor(elapsedMilliseconds / MINUTE_MILLISECONDS)} min ago`
  if (elapsedMilliseconds < 24 * HOUR_MILLISECONDS)
    return `${Math.floor(elapsedMilliseconds / HOUR_MILLISECONDS)} h ago`

  return formatDateTime(isoDate)
}

const statusHtml = (subscription: Subscription): string => {
  if (subscription.lastError) return `<span class="error-text">${escapeHtml(subscription.lastError)}</span>`

  const checkedText = subscription.lastCheckedAt ? `Checked ${timeAgo(subscription.lastCheckedAt)}` : 'Not checked yet'
  const downloadedText = `${subscription.downloadedCount} added to downloads`

  return `${checkedText} · ${downloadedText}`
}

const subscriptionRowHtml = (subscription: Subscription): string => {
  const thumbnail = subscription.thumbnailUrl
    ? `<img class="subscription-picture" src="${escapeHtml(subscription.thumbnailUrl)}" alt="" referrerpolicy="no-referrer">`
    : '<div class="subscription-picture"></div>'
  const sourceText = subscription.source === 'channel' ? 'Channel' : 'Playlist'

  return `<div class="card subscription-row">${thumbnail}
    <div class="job-details"><div class="job-title" title="${escapeHtml(subscription.title)}">${escapeHtml(subscription.title)}</div>
      <div class="job-status"><span class="chip">${escapeHtml(subscription.label)}</span> ${sourceText} · ${statusHtml(subscription)}</div></div>
    <div class="job-actions"><button class="button small ghost" data-action="unsubscribe" data-id="${escapeHtml(subscription.id)}" title="Unsubscribe (downloaded files stay)">✕</button></div></div>`
}

const EMPTY_LIST_HTML =
  '<div class="empty-state">No subscriptions yet. Open a channel or playlist and click <b>🔔 Subscribe</b> to download its new videos automatically.</div>'

const scheduleDescription = (hours: number): string => {
  if (hours <= 0) return 'when the app starts'

  return `when the app starts, then ${hours === 1 ? 'every hour' : `every ${hours} hours`} while it's open`
}

const renderSubscriptions = ({ subscriptions, isChecking, checkIntervalHours }: SubscriptionsResponse): void => {
  subscriptionCount().hidden = !subscriptions.length
  subscriptionCount().textContent = String(subscriptions.length)
  scheduleText().textContent = `New videos download automatically ${scheduleDescription(checkIntervalHours)} (change it in Settings). Unsubscribing keeps the files already downloaded.`
  subscriptionList().innerHTML = subscriptions.length
    ? subscriptions.map(subscriptionRowHtml).join('')
    : EMPTY_LIST_HTML
  checkButton().hidden = !subscriptions.length
  checkButton().disabled = isChecking
  checkButton().textContent = isChecking ? 'Checking…' : 'Check now'
}

const refreshSubscriptions = async (): Promise<void> => {
  clearTimeout(pollTimer)

  let isChecking = wasChecking

  try {
    const response = await api.subscriptions()

    renderSubscriptions(response)
    isChecking = response.isChecking

    if (wasChecking && !isChecking) announceDownloadsChanged()

    wasChecking = isChecking
  } catch {}

  pollTimer = setTimeout(
    () => void refreshSubscriptions(),
    isChecking ? CHECKING_POLL_MILLISECONDS : IDLE_POLL_MILLISECONDS,
  )
}

const checkNow = async (): Promise<void> => {
  try {
    renderSubscriptions(await api.checkSubscriptions())
    wasChecking = true
  } catch (error) {
    showToast(errorMessage(error))
  }

  void refreshSubscriptions()
}

const unsubscribe = async (button: HTMLButtonElement): Promise<void> => {
  const row = button.closest('.subscription-row')
  const title = row?.querySelector('.job-title')?.textContent ?? 'this subscription'

  try {
    await api.unsubscribe(button.dataset.id ?? '')
    showToast(`Unsubscribed from “${title}”. Files already downloaded stay.`)
  } catch (error) {
    showToast(errorMessage(error))
  }

  void refreshSubscriptions()
}

const openSubscriptionsDialog = (): void => {
  subscriptionsDialog().showModal()
  void refreshSubscriptions()
}

export const initializeSubscriptions = (): void => {
  findElement('#openSubscriptionsButton').addEventListener('click', openSubscriptionsDialog)
  checkButton().addEventListener('click', () => void checkNow())
  subscriptionList().addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action="unsubscribe"]')

    if (button) void unsubscribe(button)
  })
  onSubscriptionsChanged(() => void refreshSubscriptions())
  void refreshSubscriptions()
}
