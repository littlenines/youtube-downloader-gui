export const findElement = <ElementType extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): ElementType => {
  const element = root.querySelector<ElementType>(selector)

  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}

export const createElement = (html: string): HTMLElement => {
  const template = document.createElement('template')

  template.innerHTML = html.trim()
  return template.content.firstElementChild as HTMLElement
}

export const setProgress = (progressFill: HTMLElement, fraction: number): void => {
  const clampedFraction = Math.min(1, Math.max(0, fraction))
  const transform = `scaleX(${clampedFraction.toFixed(3)})`

  if (progressFill.style.transform === transform) return

  progressFill.style.transform = transform
  progressFill.parentElement?.setAttribute('aria-valuenow', String(Math.round(clampedFraction * 100)))
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const showToast = (message: string, durationMilliseconds = 3500): void => {
  const toast = findElement('#toast')

  toast.textContent = message
  toast.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.hidden = true), durationMilliseconds)
}
