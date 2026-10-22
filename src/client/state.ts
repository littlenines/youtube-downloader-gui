import type { AudioFormat, AudioTags, Container, MediaInfo, MediaKind } from '../shared/types.js';

export interface Choices {
  kind: MediaKind;
  format: AudioFormat;
  resolution: number | null;
  container: Container;
  coverArt: boolean;
  removeNonMusic: boolean;
  subtitles: boolean;
}

export interface AppState {
  url: string;
  info: MediaInfo | null;
  /** The tags shown for editing; reset to suggestions for every new video. */
  tags: AudioTags | null;
  openedFromSearch: boolean;
  choices: Choices;
}

const STORAGE_KEY = 'yt-downloader.choices';
const DEFAULT_CHOICES: Choices = {
  kind: 'audio',
  format: 'mp3',
  resolution: null,
  container: 'mp4',
  coverArt: true,
  removeNonMusic: false,
  subtitles: false,
};

/** The resolution depends on each video, so it is never remembered. */
function loadChoices(): Choices {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Choices>;
    return { ...DEFAULT_CHOICES, ...saved, resolution: null };
  } catch {
    return { ...DEFAULT_CHOICES };
  }
}

export const state: AppState = { url: '', info: null, tags: null, openedFromSearch: false, choices: loadChoices() };

export function saveChoices(): void {
  try {
    const { resolution: _resolution, ...remembered } = state.choices;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remembered));
  } catch {
    // Storage is unavailable in private windows; the choices just aren't remembered.
  }
}
