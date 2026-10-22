export function findElement<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

export function createElement(html: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement;
}

/** Uses a transform, which changes the bar without re-laying out the rest of the page. */
export function setProgress(fill: HTMLElement, fraction: number): void {
  const clamped = Math.min(1, Math.max(0, fraction));
  const transform = `scaleX(${clamped.toFixed(3)})`;
  if (fill.style.transform === transform) return;
  fill.style.transform = transform;
  fill.parentElement?.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, durationMilliseconds = 3500): void {
  const toast = findElement('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), durationMilliseconds);
}
