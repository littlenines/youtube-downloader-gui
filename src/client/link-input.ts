import { extractLinks } from '@shared/links.js'
import { showBatch } from './components/batch.js'
import { loadMediaInfo } from './components/media/media-panel.js'
import { searchVideos } from './components/search.js'
import { requestSetup, toolsAvailable } from './components/setup/setup.js'
import { findElement } from './utils/dom.js'

const linkInput = () => findElement<HTMLInputElement>('#linkInput')
const linkError = () => findElement('#linkError')

const openLink = (url: string): void => {
  if (!toolsAvailable()) return requestSetup(() => openLink(url))

  void loadMediaInfo(url)
}

export const containsLinks = (text: string): boolean => extractLinks(text).length > 0

export const handleEnteredText = (text: string): void => {
  const trimmedText = text.trim()
  const links = extractLinks(trimmedText)
  const [firstLink] = links

  linkError().hidden = true

  if (links.length > 1) {
    linkInput().value = ''
    showBatch(links)
  } else if (firstLink) {
    linkInput().value = firstLink
    openLink(firstLink)
  } else if (trimmedText) {
    linkInput().value = trimmedText
    void searchVideos(trimmedText)
  }
}

const pasteFromClipboard = async (): Promise<void> => {
  try {
    handleEnteredText(await navigator.clipboard.readText())
  } catch {
    linkInput().focus()
    linkError().textContent = 'Clipboard access was blocked. Press Ctrl+V in the box instead.'
    linkError().hidden = false
  }
}

const isTypingInTextField = (event: Event) => Boolean((event.target as HTMLElement).closest('input, textarea'))

export const initializeLinkInput = (): void => {
  findElement<HTMLFormElement>('#linkForm').addEventListener('submit', (event) => {
    event.preventDefault()
    handleEnteredText(linkInput().value)
  })

  linkInput().addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text') ?? ''

    if (!containsLinks(text)) return

    event.preventDefault()
    handleEnteredText(text)
  })

  window.addEventListener('paste', (event) => {
    if (isTypingInTextField(event)) return

    const text = event.clipboardData?.getData('text') ?? ''

    if (containsLinks(text)) handleEnteredText(text)
  })

  findElement('#pasteButton').addEventListener('click', () => void pasteFromClipboard())
  linkInput().focus()
}
