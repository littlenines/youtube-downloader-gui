import { findElement, showToast } from './utils/dom.js'
import { containsLinks, handleEnteredText } from './link-input.js'

const TEXT_DATA_TYPES = new Set(['text/uri-list', 'text/plain'])

let dragDepth = 0

const dropOverlay = () => findElement('#dropOverlay')

const carriesText = (event: DragEvent): boolean =>
  Boolean(event.dataTransfer?.types.some((type) => TEXT_DATA_TYPES.has(type)))

const droppedText = (event: DragEvent): string =>
  event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain') || ''

export const initializeDragAndDrop = (): void => {
  window.addEventListener('dragenter', (event) => {
    if (!carriesText(event)) return

    dragDepth++
    dropOverlay().hidden = false
  })

  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1)

    if (!dragDepth) dropOverlay().hidden = true
  })

  window.addEventListener('dragover', (event) => {
    event.preventDefault()

    if (event.dataTransfer) event.dataTransfer.dropEffect = carriesText(event) ? 'copy' : 'none'
  })

  window.addEventListener('drop', (event) => {
    event.preventDefault()
    dragDepth = 0
    dropOverlay().hidden = true

    const text = droppedText(event)

    if (containsLinks(text)) handleEnteredText(text)
    else showToast('Drop a link, or the icon next to a browser’s address bar.')
  })
}
