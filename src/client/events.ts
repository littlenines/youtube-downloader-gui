const DOWNLOADS_CHANGED_EVENT = 'downloads:changed'

export const announceDownloadsChanged = (): void => {
  document.dispatchEvent(new CustomEvent(DOWNLOADS_CHANGED_EVENT))
}

export const onDownloadsChanged = (listener: () => void): void => {
  document.addEventListener(DOWNLOADS_CHANGED_EVENT, listener)
}
