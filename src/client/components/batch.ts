import { api } from '../api.js';
import { state } from '../state.js';
import { errorMessage, findElement, showToast } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import {
  applyChoiceButton,
  applyChoiceCheckbox,
  audioFormatCard,
  audioFormatCardsHtml,
  audioOptionsHtml,
  containerControlHtml,
  generalResolutionListHtml,
  tabsHtml,
} from './choice-controls.js';
import { showPanel } from './panels.js';
import { requestSetup, toolsAvailable } from './setup.js';

let links: string[] = [];

const panel = () => findElement('#batchPanel');

const isPlaylistLink = (url: string) => /[?&]list=/.test(url) && !/[?&]v=/.test(url);

function youtubeThumbnail(url: string): string | null {
  const videoId = /(?:[?&]v=|youtu\.be\/|\/shorts\/)([\w-]{11})/.exec(url)?.[1];
  return videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null;
}

export function initialize(): void {
  panel().addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (applyChoiceButton(button)) return render();
    const { action, index } = button.dataset;
    if (action === 'remove-link') removeLink(Number(index));
    else if (action === 'cancel-batch') showPanel(null);
    else if (action === 'download-all') void downloadAll(button);
  });
  panel().addEventListener('change', (event) => {
    if (applyChoiceCheckbox(event.target as HTMLElement)) render();
  });
}

export function showBatch(newLinks: string[]): void {
  links = newLinks;
  render();
  showPanel('batch');
}

function removeLink(index: number): void {
  links.splice(index, 1);
  if (links.length) render();
  else showPanel(null);
}

function render(): void {
  const linkRows = links
    .map(
      (link, index) => `<li class="batch-link"><span class="batch-link-text" title="${escapeHtml(link)}">${escapeHtml(link)}</span>
        <button class="button small ghost" data-action="remove-link" data-index="${index}" title="Remove from the list">✕</button></li>`,
    )
    .join('');
  const options =
    state.choices.kind === 'audio' ? audioFormatCardsHtml() + audioOptionsHtml() : generalResolutionListHtml() + containerControlHtml();
  const what =
    state.choices.kind === 'audio'
      ? audioFormatCard(state.choices.format).title
      : `${state.choices.container.toUpperCase()} · ${state.choices.resolution ? `${state.choices.resolution}p` : 'best quality'}`;
  panel().innerHTML = `<div class="card">
    <div class="batch-header"><h2>${links.length} links</h2><span class="muted">All of them download with the same settings.</span></div>
    <ul class="batch-links">${linkRows}</ul>
    ${tabsHtml()}<div class="tab-panel">${options}</div>
    <div class="media-footer"><span class="download-summary"><b>${escapeHtml(what)}</b></span>
      <span class="footer-buttons"><button class="button" data-action="cancel-batch">Cancel</button>
      <button class="button primary large" data-action="download-all">⬇ Download all (${links.length})</button></span></div></div>`;
}

async function downloadAll(button: HTMLButtonElement): Promise<void> {
  if (!toolsAvailable()) return requestSetup(() => void downloadAll(button));
  const choices = state.choices;
  button.disabled = true;
  const failures: string[] = [];
  for (const url of links) {
    try {
      await api.startDownload({
        url,
        kind: choices.kind,
        format: choices.format,
        resolution: choices.kind === 'video' ? choices.resolution : null,
        container: choices.container,
        playlist: isPlaylistLink(url),
        coverArt: choices.coverArt,
        squareCoverArt: true,
        removeNonMusic: choices.removeNonMusic,
        title: url,
        thumbnailUrl: youtubeThumbnail(url),
      });
    } catch (error) {
      failures.push(`${url}: ${errorMessage(error)}`);
    }
  }
  button.disabled = false;
  document.dispatchEvent(new CustomEvent('downloads:changed'));
  const added = links.length - failures.length;
  showToast(
    failures.length ? `Added ${added} of ${links.length}. ${failures[0]}` : `Added ${added} downloads.`,
    failures.length ? 8000 : 3500,
  );
  if (!failures.length) showPanel(null);
}
