import { findElement, showToast } from './utils/dom.js'
import { containsLinks, handleEnteredText } from './link-input.js'

const TEXT_DATA_TYPES = new Set(['text/uri-list', 'text/plain'])
const PAGE_DRAG_TYPE = 'application/x-yt-downloader-page-drag'

let dragDepth = 0

const dropOverlay = () => findElement('#dropOverlay')

const carriesText = (event: DragEvent): boolean =>
  Boolean(event.dataTransfer?.types.some((type) => TEXT_DATA_TYPES.has(type)))

const isDragFromPage = (event: DragEvent): boolean => Boolean(event.dataTransfer?.types.includes(PAGE_DRAG_TYPE))

const droppedText = (event: DragEvent): string =>
  event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain') || ''

export const initializeDragAndDrop = (): void => {
  window.addEventListener('dragstart', (event) => event.dataTransfer?.setData(PAGE_DRAG_TYPE, 'page'))

  window.addEventListener('dragenter', (event) => {
    if (isDragFromPage(event) || !carriesText(event)) return

    dragDepth++
    dropOverlay().hidden = false
  })

  window.addEventListener('dragleave', (event) => {
    if (isDragFromPage(event)) return

    dragDepth = Math.max(0, dragDepth - 1)

    if (!dragDepth) dropOverlay().hidden = true
  })

  window.addEventListener('dragover', (event) => {
    if (isDragFromPage(event)) return

    event.preventDefault()

    if (event.dataTransfer) event.dataTransfer.dropEffect = carriesText(event) ? 'copy' : 'none'
  })

  window.addEventListener('drop', (event) => {
    if (isDragFromPage(event)) return

    event.preventDefault()
    dragDepth = 0
    dropOverlay().hidden = true

    const text = droppedText(event)

    if (containsLinks(text)) handleEnteredText(text)
    else showToast('Drop a link, or the icon next to a browser’s address bar.')
  })
}
