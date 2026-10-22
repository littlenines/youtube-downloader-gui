import type { AudioFormat, Container } from '../../shared/types.js';
import { saveChoices, state, type Choices } from '../state.js';

interface AudioFormatCard {
  format: AudioFormat;
  title: string;
  description: string;
  fileExtension: string;
  badge?: string;
}

export const AUDIO_FORMAT_CARDS: AudioFormatCard[] = [
  {
    format: 'mp3',
    title: 'MP3 · 320 kbps',
    description: 'Plays on everything: phones, cars, DJ apps.',
    fileExtension: 'mp3',
    badge: 'Most compatible',
  },
  {
    format: 'opus',
    title: 'Opus · original',
    description: "YouTube's own audio, saved without re-encoding. No quality loss at all.",
    fileExtension: 'opus',
    badge: 'Best quality',
  },
  {
    format: 'm4a',
    title: 'M4A · AAC',
    description: 'Apple/iTunes friendly. Kept as-is when YouTube has an AAC stream.',
    fileExtension: 'm4a',
  },
  {
    format: 'flac',
    title: 'FLAC',
    description: 'Lossless container for DJ and music software. Same quality as the source, bigger file.',
    fileExtension: 'flac',
  },
  { format: 'wav', title: 'WAV', description: 'Uncompressed, for editing in a DAW or video editor. No cover art.', fileExtension: 'wav' },
  {
    format: 'original',
    title: 'Original file',
    description: 'Whatever YouTube serves (usually Opus or AAC), untouched.',
    fileExtension: 'opus or .m4a',
  },
];

const CONTAINER_OPTIONS: { container: Container; label: string; note: string }[] = [
  {
    container: 'mp4',
    label: 'MP4',
    note: 'Plays everywhere. Uses H.264 when available (up to 1080p on YouTube). Higher resolutions use VP9/AV1, which modern players and phones handle.',
  },
  { container: 'mkv', label: 'MKV', note: 'Best quality with any codec, plus chapters and subtitles. Great in VLC, Plex and editors.' },
  { container: 'webm', label: 'WebM', note: "YouTube's native VP9 + Opus, no conversion. Ideal for the web." },
];

const GENERAL_RESOLUTIONS = [null, 2160, 1440, 1080, 720, 480, 360];
const CHECKBOX_CHOICES = ['coverArt', 'removeNonMusic', 'subtitles'] as const;
type CheckboxChoice = (typeof CHECKBOX_CHOICES)[number];

export const selectedClass = (isSelected: boolean): string => (isSelected ? 'selected' : '');

export const audioFormatCard = (format: AudioFormat): AudioFormatCard =>
  AUDIO_FORMAT_CARDS.find((card) => card.format === format) ?? AUDIO_FORMAT_CARDS[0]!;

export function resolutionTag(resolution: number): string {
  if (resolution >= 4320) return '8K';
  if (resolution >= 2160) return '4K';
  if (resolution >= 1440) return '2K';
  if (resolution >= 720) return 'HD';
  return '';
}

export function tabsHtml(): string {
  const kind = state.choices.kind;
  return `<div class="tabs">
    <button class="tab ${selectedClass(kind === 'audio')}" data-kind="audio">🎵 Audio</button>
    <button class="tab ${selectedClass(kind === 'video')}" data-kind="video">🎬 Video</button></div>`;
}

export function checkboxHtml(choice: CheckboxChoice, label: string, disabled = false, title = ''): string {
  const checked = state.choices[choice] ? 'checked' : '';
  return `<label class="checkbox-label" ${title ? `title="${title}"` : ''}>
    <input type="checkbox" data-choice="${choice}" ${checked} ${disabled ? 'disabled' : ''}> ${label}</label>`;
}

export function audioFormatCardsHtml(): string {
  const cards = AUDIO_FORMAT_CARDS.map((card) => {
    const badge = card.badge ? `<span class="chip ${card.format === 'opus' ? 'success' : ''}">${card.badge}</span>` : '';
    return `<button class="format-card ${selectedClass(state.choices.format === card.format)}" data-format="${card.format}">
      ${badge}<b>${card.title}</b><span class="format-description">${card.description}</span></button>`;
  }).join('');
  return `<div class="format-cards">${cards}</div>`;
}

export function audioOptionsHtml(): string {
  return `<div class="option-list">
    ${checkboxHtml('coverArt', 'Embed album art (square)', state.choices.format === 'wav')}
    ${checkboxHtml('removeNonMusic', 'Cut out non-music parts (intros, talking) when known', false, 'Uses community-submitted SponsorBlock segments; only works on videos that have them')}
  </div>`;
}

/** Resolutions for several videos at once: each video gets the closest it has. */
export function generalResolutionListHtml(): string {
  const options = GENERAL_RESOLUTIONS.map((resolution) => {
    const description = resolution ? resolutionTag(resolution) : 'Highest available for each video';
    return `<button class="quality-option ${selectedClass(state.choices.resolution === resolution)}" data-resolution="${resolution ?? ''}">
      <b>${resolution ? `${resolution}p` : 'Best'}</b><span class="quality-codecs">${description}</span><span></span></button>`;
  }).join('');
  return `<div class="section-label">Quality (each video gets the closest it has)</div><div class="quality-list">${options}</div>`;
}

export function containerControlHtml(): string {
  const current = CONTAINER_OPTIONS.find((option) => option.container === state.choices.container) ?? CONTAINER_OPTIONS[0]!;
  const buttons = CONTAINER_OPTIONS.map(
    (option) => `<button data-container="${option.container}" class="${selectedClass(option === current)}">${option.label}</button>`,
  ).join('');
  return `<div class="section-label">Format</div><div class="segmented-control">${buttons}</div><p class="note">${current.note}</p>`;
}

function updateChoices(changes: Partial<Choices>): void {
  Object.assign(state.choices, changes);
  saveChoices();
}

/** Applies a clicked choice control. Returns false when the button is not one. */
export function applyChoiceButton(button: HTMLButtonElement): boolean {
  const { kind, format, resolution, container } = button.dataset;
  if (kind) updateChoices({ kind: kind === 'video' ? 'video' : 'audio' });
  else if (format) updateChoices({ format: format as AudioFormat });
  else if (resolution !== undefined) updateChoices({ resolution: resolution ? Number(resolution) : null });
  else if (container) updateChoices({ container: container as Container });
  else return false;
  return true;
}

/** Applies a changed choice checkbox. Returns false when the element is not one. */
export function applyChoiceCheckbox(element: HTMLElement): boolean {
  const choice = CHECKBOX_CHOICES.find((name) => name === element.dataset.choice);
  if (!choice || !(element instanceof HTMLInputElement)) return false;
  updateChoices({ [choice]: element.checked });
  return true;
}
