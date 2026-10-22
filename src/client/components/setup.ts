import type { SetupStatus } from '../../shared/types.js';
import { api } from '../api.js';
import { errorMessage, findElement, setProgress, showToast } from '../utils/dom.js';

const POLL_INTERVAL_MILLISECONDS = 500;

let latestStatus: SetupStatus | null = null;
let installStartedHere = false;
let afterReady: (() => void) | null = null;
let pollTimer: ReturnType<typeof setTimeout> | undefined;

const dialog = () => findElement<HTMLDialogElement>('#setupDialog');

/** True unless the tools are known to be missing; while the status is unknown, the server decides (status 409). */
export const toolsAvailable = (): boolean => !latestStatus || latestStatus.installed || latestStatus.state === 'running';

/** Opens the setup dialog; `onReady` runs once the tools are installed and the user continues. */
export function requestSetup(onReady?: () => void): void {
  afterReady = onReady ?? null;
  if (!dialog().open) dialog().showModal();
  render();
  void refresh();
}

export function initialize(): void {
  findElement('#setupConfirmButton').addEventListener('click', confirm);
  findElement('#setupLaterButton').addEventListener('click', () => dialog().close());
  findElement('#setupBannerButton').addEventListener('click', () => requestSetup());
  dialog().addEventListener('close', render);
  void refresh().then(() => {
    if (latestStatus && !latestStatus.installed && latestStatus.state !== 'running') requestSetup();
  });
}

async function confirm(): Promise<void> {
  if (latestStatus?.state === 'ready' && latestStatus.installed) {
    dialog().close();
    const continuation = afterReady;
    afterReady = null;
    continuation?.();
    return;
  }
  try {
    installStartedHere = true;
    latestStatus = await api.startSetup();
    render();
    void refresh();
  } catch (error) {
    showToast(errorMessage(error), 6000);
  }
}

async function refresh(): Promise<void> {
  clearTimeout(pollTimer);
  const previousState = latestStatus?.state;
  try {
    latestStatus = (await api.status()).setup;
  } catch {
    pollTimer = setTimeout(() => void refresh(), 3000);
    return;
  }
  render();
  if (latestStatus.state === 'running') {
    pollTimer = setTimeout(() => void refresh(), POLL_INTERVAL_MILLISECONDS);
  } else if (previousState === 'running' && latestStatus.state === 'ready' && installStartedHere && !dialog().open) {
    showToast('The tools are installed. You can use the app now.', 6000);
    const continuation = afterReady;
    afterReady = null;
    continuation?.();
  }
}

function render(): void {
  if (!latestStatus) return;
  renderDialog(latestStatus);
  renderBanner(latestStatus);
}

function renderDialog(status: SetupStatus): void {
  const title = findElement('#setupTitle');
  const introduction = findElement('#setupIntroduction');
  const progress = findElement('#setupProgress');
  const progressFill = findElement('#setupProgressFill');
  const progressText = findElement('#setupProgressText');
  const errorText = findElement('#setupError');
  const confirmButton = findElement<HTMLButtonElement>('#setupConfirmButton');
  const laterButton = findElement<HTMLButtonElement>('#setupLaterButton');

  const isRunning = status.state === 'running';
  const isFinished = status.state === 'ready' && installStartedHere;
  introduction.hidden = isRunning || isFinished;
  progress.hidden = !isRunning;
  errorText.hidden = status.state !== 'error';
  confirmButton.hidden = isRunning;
  laterButton.textContent = isRunning ? 'Continue in the background' : 'Not now';
  laterButton.hidden = isFinished;

  if (isRunning) {
    title.textContent = 'Downloading the tools…';
    setProgress(progressFill, status.progress ?? 0);
    progressText.textContent = `${status.message ?? 'Preparing…'}${status.progress != null ? ` ${Math.round(status.progress * 100)}%` : ''}`;
  } else if (isFinished) {
    title.textContent = "You're all set";
    findElement('#setupDone').hidden = false;
    confirmButton.textContent = 'Start using the app';
  } else if (status.state === 'error') {
    title.textContent = "The download didn't work";
    errorText.textContent = `${status.message ?? 'Unknown error.'} Check the internet connection, then try again.`;
    confirmButton.textContent = 'Try again';
  } else {
    title.textContent = 'One-time setup';
    findElement('#setupSize').textContent = `about ${status.downloadSizeMegabytes} MB`;
    confirmButton.textContent = 'Download';
  }
  if (!isFinished) findElement('#setupDone').hidden = true;
}

function renderBanner(status: SetupStatus): void {
  const banner = findElement('#setupBanner');
  const isRunning = status.state === 'running';
  const needsInstall = !status.installed && !isRunning;
  banner.hidden = dialog().open || status.state === 'ready' || (status.installed && !isRunning);
  banner.classList.toggle('error', status.state === 'error');
  findElement('#setupBannerSpinner').hidden = !isRunning;
  findElement('#setupBannerButton').hidden = !needsInstall;
  findElement('#setupBannerButton').textContent = status.state === 'error' ? 'Try again' : 'Download tools';
  findElement('#setupBannerText').textContent = isRunning
    ? `${status.message ?? 'Preparing…'}${status.progress != null ? ` ${Math.round(status.progress * 100)}%` : ''}`
    : status.state === 'error'
      ? `Setup failed: ${status.message ?? ''}`
      : "The tools needed for downloading aren't installed yet.";
}
