import { createElement, setProgress, showIndeterminate } from '@client/utils/dom.js'
import type { RowContent } from './download-rows.js'

interface RenderedRow {
  element: HTMLElement
  structure: string
}

const renderedRowsByKey = new Map<string, RenderedRow>()

const updateTextIfChanged = (element: HTMLElement | null, text: string): void => {
  if (!element || element.textContent === text) return

  element.textContent = text
  element.title = text
}

const createOrUpdateRow = (content: RowContent): HTMLElement => {
  let row = renderedRowsByKey.get(content.key)

  if (!row || row.structure !== content.structure) {
    const element = createElement(content.html)

    row?.element.replaceWith(element)
    row = { element, structure: content.structure }
    renderedRowsByKey.set(content.key, row)
  }

  updateTextIfChanged(row.element.querySelector<HTMLElement>('.job-title'), content.title)
  updateTextIfChanged(row.element.querySelector<HTMLElement>('.job-status-text'), content.statusText)

  const progressFill = row.element.querySelector<HTMLElement>('.progress-fill')

  if (progressFill) showIndeterminate(progressFill, content.isIndeterminate)
  if (progressFill && content.progressPercent !== null) setProgress(progressFill, content.progressPercent / 100)

  return row.element
}

const removeRowsNotIn = (wantedKeys: Set<string>): void => {
  for (const [key, row] of renderedRowsByKey) {
    if (wantedKeys.has(key)) continue

    row.element.remove()
    renderedRowsByKey.delete(key)
  }
}

export const renderRows = (container: HTMLElement, rows: RowContent[]): void => {
  removeRowsNotIn(new Set(rows.map((row) => row.key)))

  rows.forEach((content, position) => {
    const element = createOrUpdateRow(content)

    if (container.children[position] !== element) container.insertBefore(element, container.children[position] ?? null)
  })
}
