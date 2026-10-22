import { extractLinks, isWebLink } from '../shared/links.js';
import * as batch from './components/batch.js';
import * as downloads from './components/downloads.js';
import * as media from './components/media.js';
import * as search from './components/search.js';
import * as settings from './components/settings.js';
import * as setup from './components/setup.js';
import { desktopBridge } from './desktop.js';
import { state } from './state.js';
import { findElement, showToast } from './utils/dom.js';

const linkInput = findElement<HTMLInputElement>('#linkInput');
const linkError = findElement('#linkError');
const dropOverlay = findElement('#dropOverlay');

function openLink(url: string): void {
  if (!setup.toolsAvailable()) return setup.requestSetup(() => openLink(url));
  void media.loadMediaInfo(url);
}

/** Several links go to the batch panel, one link opens it, and anything else is a search. */
function handleText(text: string): void {
  const trimmed = text.trim();
  const links = extractLinks(trimmed);
  linkError.hidden = true;
  if (links.length > 1) {
    linkInput.value = '';
    batch.showBatch(links);
  } else if (links[0]) {
    linkInput.value = links[0];
    openLink(links[0]);
  } else if (trimmed) {
    linkInput.value = trimmed;
    void search.search(trimmed);
  }
}

findElement<HTMLFormElement>('#linkForm').addEventListener('submit', (event) => {
  event.preventDefault();
  handleText(linkInput.value);
});

linkInput.addEventListener('paste', (event) => {
  const text = event.clipboardData?.getData('text') ?? '';
  if (!extractLinks(text).length) return;
  event.preventDefault();
  handleText(text);
});

window.addEventListener('paste', (event) => {
  if ((event.target as HTMLElement).closest('input, textarea')) return;
  const text = event.clipboardData?.getData('text') ?? '';
  if (extractLinks(text).length) handleText(text);
});

findElement('#pasteButton').addEventListener('click', async () => {
  try {
    handleText(await navigator.clipboard.readText());
  } catch {
    linkInput.focus();
    linkError.textContent = 'Clipboard access was blocked. Press Ctrl+V in the box instead.';
    linkError.hidden = false;
  }
});

let dragDepth = 0;
const carriesText = (event: DragEvent) =>
  Boolean(event.dataTransfer?.types.some((type) => type === 'text/uri-list' || type === 'text/plain'));

window.addEventListener('dragenter', (event) => {
  if (!carriesText(event)) return;
  dragDepth++;
  dropOverlay.hidden = false;
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropOverlay.hidden = true;
});
// Without this the window would navigate to whatever is dropped on it.
window.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = carriesText(event) ? 'copy' : 'none';
});
window.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  const text = event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain') || '';
  if (extractLinks(text).length) handleText(text);
  else showToast('Drop a link, or the icon next to a browser’s address bar.');
});

document.documentElement.classList.toggle('desktop', Boolean(desktopBridge));
setup.initialize();
settings.initialize();
media.initialize();
search.initialize();
batch.initialize();
downloads.initialize();
linkInput.focus();

// http://localhost:5190/?url=<link>&mode=video opens straight to that link, for a bookmark button.
const parameters = new URLSearchParams(location.search);
const sharedLink = parameters.get('url');
const mode = parameters.get('mode');
if (mode === 'audio' || mode === 'video') state.choices.kind = mode;
if (sharedLink && isWebLink(sharedLink)) {
  history.replaceState(null, '', location.pathname);
  handleText(sharedLink);
}
