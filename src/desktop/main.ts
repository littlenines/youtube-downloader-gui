import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, session, shell } from 'electron';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Job } from '../shared/types.js';
import { ACCESS_COOKIE, createApp } from '../server/app.js';
import { DATA_DIRECTORY, IS_PACKAGED, IS_WINDOWS } from '../server/config.js';
import { useDesktopShell } from '../server/lib/os.js';
import { createServices, listen, loadAccessKey, type Services } from '../server/server.js';
import { parseSettings } from '../server/services/stores.js';
import { toolSetup } from '../server/services/tools.js';

const APP_NAME = 'YT Downloader';
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
/** A fixed port keeps the page's saved choices, because browser storage belongs to one address. */
const PREFERRED_PORT = 5199;
const WINDOW_STATE_FILE = join(DATA_DIRECTORY, 'window.json');
const DEFAULT_WINDOW_SIZE = { width: 1120, height: 860 };
const ALLOWED_PERMISSIONS = new Set(['clipboard-read', 'clipboard-sanitized-write']);
const ACCESS_COOKIE_LIFETIME_SECONDS = 365 * 24 * 3600;

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

const isActive = (job: Job) => job.status === 'downloading' || job.status === 'queued';

app.setPath('userData', join(DATA_DIRECTORY, 'window'));
app.setName(APP_NAME);
app.setAppUserModelId(APP_NAME);

/** Read before the app is ready, because graphics switches only apply at start-up. */
function readStoredSettings() {
  try {
    return parseSettings(JSON.parse(readFileSync(join(DATA_DIRECTORY, 'settings.json'), 'utf8')));
  } catch {
    return parseSettings(undefined);
  }
}

// Windows' DirectComposition added 25-30 ms before each frame reached the screen in testing (high refresh rate,
// two monitors, a game running), which made clicks feel slow. Settings can turn this back off.
if (IS_WINDOWS && readStoredSettings().lowLatencyRendering) app.commandLine.appendSwitch('disable-direct-composition');

// A release build must not be remotely controllable through Chromium's debugging switches.
if (IS_PACKAGED && (app.commandLine.hasSwitch('remote-debugging-port') || app.commandLine.hasSwitch('remote-debugging-pipe'))) {
  app.exit(1);
}

let mainWindow: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);
  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => {
      dialog.showErrorBox(APP_NAME, `The app could not start:\n\n${error instanceof Error ? error.message : String(error)}`);
      app.exit(1);
    });
}

function focusMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

async function start(): Promise<void> {
  Menu.setApplicationMenu(null);
  const services = await createServices();
  const accessKey = await loadAccessKey();
  const server = createApp(services, { loopbackOnly: true, accessKey });
  const port = await listen(server, PREFERRED_PORT, '127.0.0.1').catch(() => listen(server, 0, '127.0.0.1'));
  const origin = `http://127.0.0.1:${port}`;

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => ALLOWED_PERMISSIONS.has(permission));
  await session.defaultSession.cookies.set({
    url: origin,
    name: ACCESS_COOKIE,
    value: accessKey,
    httpOnly: true,
    sameSite: 'strict',
    expirationDate: Date.now() / 1000 + ACCESS_COOKIE_LIFETIME_SECONDS,
  });

  useDesktopShell({
    openUrl: (url) => void shell.openExternal(url),
    reveal: (target) => (statSync(target).isFile() ? shell.showItemInFolder(target) : void shell.openPath(target)),
  });

  const window = createMainWindow(origin);
  mainWindow = window;
  ipcMain.handle('pick-folder', (event, currentFolder: unknown) =>
    event.senderFrame?.url.startsWith(`${origin}/`) ? pickFolder(window, currentFolder) : null,
  );
  showProgressOnTaskbar(window, services);
  confirmCloseWhileDownloading(window, services);
  window.on('closed', () => (mainWindow = null));

  app.on('window-all-closed', () => {
    server.close();
    void services.queue.stopAll().finally(() => app.quit());
  });

  toolSetup.initialize();
}

function createMainWindow(origin: string): BrowserWindow {
  const savedState = loadWindowState();
  const window = new BrowserWindow({
    width: savedState.width,
    height: savedState.height,
    ...(isOnScreen(savedState) ? { x: savedState.x, y: savedState.y } : {}),
    minWidth: 520,
    minHeight: 560,
    title: APP_NAME,
    icon: join(moduleDirectory, 'icon.png'),
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111110' : '#f6f6f4',
    webPreferences: {
      preload: join(moduleDirectory, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  if (savedState.maximized) window.maximize();
  window.once('ready-to-show', () => window.show());

  const openOutside = (url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${origin}/`)) return;
    event.preventDefault();
    openOutside(url);
  });

  void window.loadURL(`${origin}/`);
  return window;
}

async function pickFolder(window: BrowserWindow, currentFolder: unknown): Promise<string | null> {
  const result = await dialog.showOpenDialog(window, {
    title: 'Save downloads to',
    defaultPath: typeof currentFolder === 'string' && existsSync(currentFolder) ? currentFolder : undefined,
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

function confirmCloseWhileDownloading(window: BrowserWindow, { queue }: Services): void {
  let quitConfirmed = false;
  window.on('close', (event) => {
    saveWindowState(window);
    const activeCount = queue.list().filter(isActive).length;
    if (!activeCount || quitConfirmed) return;
    const single = activeCount === 1;
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question',
      title: APP_NAME,
      buttons: ['Keep downloading', 'Quit'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      message: single ? 'A download is still running.' : `${activeCount} downloads are still running.`,
      detail: `Quitting stops ${single ? 'it' : 'them'} and removes the unfinished ${single ? 'file' : 'files'}.`,
    });
    if (choice === 0) event.preventDefault();
    else quitConfirmed = true;
  });
}

function showProgressOnTaskbar(window: BrowserWindow, { queue }: Services): void {
  let previouslyActiveIds = new Set<string>();
  let shownProgress: number | null = null;
  const timer = setInterval(() => {
    if (window.isDestroyed()) return clearInterval(timer);
    const jobs = queue.list();
    const activeJobs = jobs.filter(isActive);
    const averageProgress = activeJobs.reduce((sum, job) => sum + job.progress, 0) / (activeJobs.length || 1);
    // Updating the taskbar makes Windows redraw it, so it only happens when the percentage changes.
    const progress = activeJobs.length ? Math.max(0.01, Math.round(averageProgress * 100) / 100) : -1;
    if (progress !== shownProgress) window.setProgressBar(progress);
    shownProgress = progress;
    const somethingFinished = jobs.some((job) => previouslyActiveIds.has(job.id) && job.status === 'done');
    if (somethingFinished && !window.isFocused()) window.flashFrame(true);
    previouslyActiveIds = new Set(activeJobs.map((job) => job.id));
  }, 1000);
  window.on('focus', () => window.flashFrame(false));
}

function loadWindowState(): WindowState {
  try {
    const state = JSON.parse(readFileSync(WINDOW_STATE_FILE, 'utf8')) as WindowState;
    if (state.width > 0 && state.height > 0) return state;
  } catch {
    // First run.
  }
  return { ...DEFAULT_WINDOW_SIZE };
}

function saveWindowState(window: BrowserWindow): void {
  try {
    mkdirSync(DATA_DIRECTORY, { recursive: true });
    writeFileSync(WINDOW_STATE_FILE, JSON.stringify({ ...window.getNormalBounds(), maximized: window.isMaximized() }));
  } catch {
    // Remembering the window position is optional.
  }
}

/** False when the saved position belongs to a monitor that is no longer connected. */
function isOnScreen({ x, y }: WindowState): boolean {
  if (x === undefined || y === undefined) return false;
  return screen
    .getAllDisplays()
    .some(
      ({ workArea }) =>
        x >= workArea.x - 40 && y >= workArea.y - 40 && x < workArea.x + workArea.width - 100 && y < workArea.y + workArea.height - 100,
    );
}
