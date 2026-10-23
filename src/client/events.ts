const DOWNLOADS_CHANGED_EVENT = 'downloads:changed'
const SUBSCRIPTIONS_CHANGED_EVENT = 'subscriptions:changed'

export const announceDownloadsChanged = (): void => {
  document.dispatchEvent(new CustomEvent(DOWNLOADS_CHANGED_EVENT))
}

export const onDownloadsChanged = (listener: () => void): void => {
  document.addEventListener(DOWNLOADS_CHANGED_EVENT, listener)
}

export const announceSubscriptionsChanged = (): void => {
  document.dispatchEvent(new CustomEvent(SUBSCRIPTIONS_CHANGED_EVENT))
}

export const onSubscriptionsChanged = (listener: () => void): void => {
  document.addEventListener(SUBSCRIPTIONS_CHANGED_EVENT, listener)
}
