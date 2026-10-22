import { suggestTags } from '../../shared/tags.js';
import type { AudioFormat, AudioTags, MediaInfo, VideoInfo, VideoQuality } from '../../shared/types.js';
import { api, ApiError, TOOLS_MISSING_STATUS } from '../api.js';
import { state } from '../state.js';
import { errorMessage, findElement, showToast } from '../utils/dom.js';
import { escapeHtml, formatBytes, formatCount, formatDuration } from '../utils/format.js';
import {
  applyChoiceButton,
  applyChoiceCheckbox,
  audioFormatCard,
  audioFormatCardsHtml,
  audioOptionsHtml,
  checkboxHtml,
  containerControlHtml,
  generalResolutionListHtml,
  selectedClass,
  tabsHtml,
} from './choice-controls.js';
import { showPanel } from './panels.js';
import { requestSetup } from './setup.js';

const AUDIO_BYTES_PER_SECOND: Partial<Record<AudioFormat, number>> = { mp3: 320_000 / 8, wav: 192_000, flac: 110_000 };
const TAG_FIELDS: { field: keyof AudioTags; label: string; placeholder: string }[] = [
  { field: 'artist', label: 'Artist', placeholder: 'Artist' },
  { field: 'title', label: 'Title', placeholder: 'Song title' },
  { field: 'album', label: 'Album', placeholder: 'Optional' },
];

let latestRequestNumber = 0;

const panel = () => findElement('#media');
const isTagField = (value: string | undefined): value is keyof AudioTags => TAG_FIELDS.some(({ field }) => field === value);

export function initialize(): void {
  panel().addEventListener('click', handleClick);
  panel().addEventListener('change', (event) => {
    if (applyChoiceCheckbox(event.target as HTMLElement)) renderOptions();
  });
  panel().addEventListener('input', handleTagInput);
}

function handleClick(event: Event): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button) return;
  if (applyChoiceButton(button)) return renderOptions();
  const action = button.dataset.action;
  if (action === 'load-playlist') void loadMediaInfo(state.url, true);
  else if (action === 'download' && state.info) void startDownload(state.info, button);
  else if (action === 'preview' && state.info?.kind === 'video') startPreview(state.info);
  else if (action === 'back-to-results') showPanel('search');
}

function handleTagInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const field = input.dataset.tag;
  if (!state.tags || !isTagField(field)) return;
  state.tags[field] = input.value;
  const fileName = panel().querySelector('.file-name-preview');
  if (fileName) fileName.textContent = fileNamePreview();
}

function showLoading(): void {
  panel().innerHTML = '<div class="card loading"><div class="spinner"></div>Reading the link…</div>';
  showPanel('media');
}

function render(info: MediaInfo): void {
  const backButton = state.openedFromSearch
    ? '<button class="button ghost small back-button" data-action="back-to-results">← Back to results</button>'
    : '';
  panel().innerHTML = `${backButton}<div class="card">${headerHtml(info)}${playlistNoteHtml(info)}<div class="media-options"></div></div>`;
  renderOptions();
  showPanel('media');
}

function renderOptions(): void {
  const info = state.info;
  const options = panel().querySelector('.media-options');
  if (!info || !options) return;
  const panelHtml = state.choices.kind === 'audio' ? audioPanelHtml(info) : videoPanelHtml(info);
  options.innerHTML = `${tabsHtml()}<div class="tab-panel">${panelHtml}</div>${footerHtml(info)}`;
}

function thumbnailHtml(info: MediaInfo): string {
  const image = info.thumbnailUrl
    ? `<img class="thumbnail" src="${escapeHtml(info.thumbnailUrl)}" alt="" referrerpolicy="no-referrer">`
    : '<div class="thumbnail"></div>';
  if (info.kind !== 'video' || !info.preview) return image;
  return `<div class="preview-frame">${image}
    <button class="play-button" data-action="preview" title="Preview" aria-label="Preview">▶</button></div>`;
}

function headerHtml(info: MediaInfo): string {
  const details = [
    info.uploader ? escapeHtml(info.uploader) : '',
    info.durationSeconds ? formatDuration(info.durationSeconds) : '',
    info.kind === 'video' && info.viewCount ? `${formatCount(info.viewCount)} views` : '',
    info.kind === 'playlist' ? `${info.videoCount} videos` : '',
  ].filter(Boolean);
  const bestQuality = info.kind === 'video' ? info.qualities[0] : undefined;
  const chips = [
    info.kind === 'playlist' ? '<span class="chip accent">Playlist</span>' : '',
    info.kind === 'video' && info.isLive ? '<span class="chip accent">LIVE</span>' : '',
    bestQuality ? `<span class="chip">up to ${escapeHtml(bestQuality.label)}${bestQuality.tag ? ` · ${bestQuality.tag}` : ''}</span>` : '',
  ].join(' ');
  return `<div class="media-header">${thumbnailHtml(info)}
    <div><h2>${escapeHtml(info.title)}</h2>
      <div class="media-details">${details.map((detail) => `<span>${detail}</span>`).join('')}</div>
      <div class="media-chips">${chips}</div></div></div>`;
}

function startPreview(info: VideoInfo): void {
  const frame = panel().querySelector('.preview-frame');
  if (!frame || !info.preview) return;
  const source = api.previewUrl(info.preview.token);
  if (info.preview.kind === 'video') {
    const poster = info.thumbnailUrl ? `poster="${escapeHtml(info.thumbnailUrl)}"` : '';
    frame.innerHTML = `<video class="thumbnail" src="${source}" ${poster} controls autoplay></video>`;
  } else {
    frame.querySelector('.play-button')?.remove();
    frame.insertAdjacentHTML('beforeend', `<audio class="preview-audio" src="${source}" controls autoplay></audio>`);
  }
  frame.querySelector('video, audio')?.addEventListener('error', () => showToast('The preview could not be played. Read the link again.'));
}

function playlistNoteHtml(info: MediaInfo): string {
  if (info.kind === 'video' && info.playlistId) {
    return `<div class="playlist-note"><span>This video is part of a playlist.</span>
      <button class="button small" data-action="load-playlist">Download the whole playlist instead</button></div>`;
  }
  if (info.kind === 'playlist') {
    const firstTitles = info.entries
      .slice(0, 5)
      .map((entry) => escapeHtml(entry.title))
      .join(' · ');
    const more = info.videoCount > 5 ? ` · and ${info.videoCount - 5} more` : '';
    return `<div class="playlist-note"><span class="small-text">${firstTitles}${more}</span></div>`;
  }
  return '';
}

function fileNamePreview(): string {
  const tags = state.tags;
  const title = tags?.title.trim() || state.info?.title || '';
  const artist = tags?.artist.trim();
  return `${artist ? `${artist} - ` : ''}${title}.${audioFormatCard(state.choices.format).fileExtension}`;
}

function tagEditorHtml(): string {
  if (!state.tags) return '';
  const tags = state.tags;
  const fields = TAG_FIELDS.map(
    ({ field, label, placeholder }) =>
      `<label class="tag-field">${label}<input type="text" data-tag="${field}" value="${escapeHtml(tags[field])}" placeholder="${placeholder}" spellcheck="false"></label>`,
  ).join('');
  return `<div class="section-label">Tags and file name</div>
    <div class="tag-fields">${fields}</div>
    <p class="note">Saved as <b class="file-name-preview">${escapeHtml(fileNamePreview())}</b></p>`;
}

function audioPanelHtml(info: MediaInfo): string {
  const source =
    info.kind === 'video' && info.audio
      ? `YouTube's best audio for this video: <b>${escapeHtml(info.audio.codec)} ~${info.audio.bitrateKbps} kbps</b>.`
      : '';
  return `${audioFormatCardsHtml()}${audioOptionsHtml()}${tagEditorHtml()}
    <p class="note">${source} Converting to MP3 can't add quality beyond the source; 320 kbps just makes sure none is lost. For the absolute original, pick <b>Opus · original</b>.</p>`;
}

const selectedResolution = (info: VideoInfo) => state.choices.resolution ?? info.qualities[0]?.resolution ?? null;

function qualityOptionHtml(quality: VideoQuality, isSelected: boolean): string {
  const tag = quality.tag ? `<span class="chip ${quality.resolution >= 2160 ? 'accent' : ''}">${quality.tag}</span>` : '';
  const hdr = quality.hdr ? '<span class="chip accent">HDR</span>' : '';
  return `<button class="quality-option ${selectedClass(isSelected)}" data-resolution="${quality.resolution}">
    <b>${escapeHtml(quality.label)}</b>
    <span class="quality-codecs">${tag}${hdr}<span>${quality.codecs.map(escapeHtml).join(' · ')}</span></span>
    <span class="quality-size">${quality.estimatedBytes ? `~${formatBytes(quality.estimatedBytes)}` : ''}</span></button>`;
}

function videoPanelHtml(info: MediaInfo): string {
  if (info.kind === 'playlist') return generalResolutionListHtml() + containerControlHtml();
  if (!info.qualities.length) {
    return '<p class="muted">No separate video qualities were found for this link. It will download in the best available format.</p>';
  }
  const picked = selectedResolution(info);
  const subtitles = info.subtitleLanguages.length
    ? `<div class="option-list">${checkboxHtml('subtitles', 'Embed English subtitles', state.choices.container === 'webm')}</div>`
    : '';
  return `<div class="section-label">Quality</div>
    <div class="quality-list">${info.qualities.map((quality) => qualityOptionHtml(quality, quality.resolution === picked)).join('')}</div>
    ${containerControlHtml()}${subtitles}`;
}

function footerHtml(info: MediaInfo): string {
  return `<div class="media-footer"><span class="download-summary">${summaryHtml(info)}</span>
    <button class="button primary large" data-action="download">⬇ Download</button></div>`;
}

function summaryHtml(info: MediaInfo): string {
  const choices = state.choices;
  const what =
    choices.kind === 'audio' ? audioFormatCard(choices.format).title : `${choices.container.toUpperCase()} · ${videoLabel(info)}`;
  const videoCount = info.kind === 'playlist' ? ` · all ${info.videoCount} videos` : '';
  const estimate = estimatedBytes(info);
  return `<b>${escapeHtml(what)}</b>${videoCount}${estimate ? ` · ~${formatBytes(estimate)}` : ''}`;
}

function estimatedBytes(info: MediaInfo): number | null {
  if (info.kind !== 'video' || !info.durationSeconds) return null;
  if (state.choices.kind === 'video') {
    return info.qualities.find((quality) => quality.resolution === selectedResolution(info))?.estimatedBytes ?? null;
  }
  const bytesPerSecond = AUDIO_BYTES_PER_SECOND[state.choices.format];
  return bytesPerSecond ? bytesPerSecond * info.durationSeconds : (info.audio?.sizeBytes ?? null);
}

function videoLabel(info: MediaInfo): string {
  if (info.kind === 'playlist') return state.choices.resolution ? `${state.choices.resolution}p` : 'best quality';
  return info.qualities.find((quality) => quality.resolution === selectedResolution(info))?.label ?? 'best quality';
}

export async function loadMediaInfo(url: string, playlist = false, { fromSearch = false } = {}): Promise<void> {
  const requestNumber = ++latestRequestNumber;
  state.url = url;
  state.openedFromSearch = fromSearch;
  showLoading();
  try {
    const info = await api.mediaInfo(url, playlist);
    if (requestNumber !== latestRequestNumber) return;
    state.info = info;
    state.tags = info.kind === 'video' ? suggestTags(info) : null;
    if (info.kind === 'video' && !info.qualities.some((quality) => quality.resolution === state.choices.resolution)) {
      state.choices.resolution = null;
    }
    render(info);
  } catch (error) {
    if (requestNumber !== latestRequestNumber) return;
    state.info = null;
    showPanel(fromSearch ? 'search' : null);
    if (error instanceof ApiError && error.status === TOOLS_MISSING_STATUS) {
      requestSetup(() => void loadMediaInfo(url, playlist, { fromSearch }));
      return;
    }
    const errorBox = findElement('#linkError');
    errorBox.textContent = errorMessage(error);
    errorBox.hidden = false;
  }
}

async function startDownload(info: MediaInfo, button: HTMLButtonElement): Promise<void> {
  const choices = state.choices;
  const isPlaylist = info.kind === 'playlist';
  const videoCount = info.kind === 'playlist' ? info.videoCount : 1;
  const isAudio = choices.kind === 'audio';
  const tags = isAudio && !isPlaylist ? state.tags : null;
  const displayTitle = tags?.title ? `${tags.artist ? `${tags.artist} - ` : ''}${tags.title}` : info.title;
  button.disabled = true;
  try {
    await api.startDownload({
      url: info.url,
      kind: choices.kind,
      format: choices.format,
      resolution: isAudio ? null : info.kind === 'video' ? selectedResolution(info) : choices.resolution,
      container: choices.container,
      playlist: isPlaylist,
      coverArt: choices.coverArt,
      squareCoverArt: true,
      removeNonMusic: choices.removeNonMusic,
      subtitles: choices.subtitles,
      tags,
      title: displayTitle,
      thumbnailUrl: info.thumbnailUrl,
      videoCount,
    });
    showToast(isPlaylist ? `Added ${videoCount} videos to the downloads.` : 'Download started.');
    document.dispatchEvent(new CustomEvent('downloads:changed'));
  } catch (error) {
    showToast(errorMessage(error), 6000);
  } finally {
    button.disabled = false;
  }
}
