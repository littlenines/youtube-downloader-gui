import { execFile } from 'node:child_process';
import { createWriteStream, existsSync, readdirSync, statSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import type { SetupStatus } from '../../shared/types.js';
import { IS_ELECTRON, IS_SINGLE_EXECUTABLE, IS_WINDOWS, TOOLS_DIRECTORY } from '../config.js';
import { extractZip, extractZipEntry } from '../lib/archive.js';

const executableName = (name: string) => (IS_WINDOWS ? `${name}.exe` : name);

const YTDLP_DIRECTORY = join(TOOLS_DIRECTORY, 'yt-dlp');
const UPDATE_CHECK_MARKER = join(TOOLS_DIRECTORY, '.yt-dlp-checked');
const FFMPEG_RELEASE = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1';
const ONE_DAY_MILLISECONDS = 24 * 3600 * 1000;
const ONE_WEEK_MILLISECONDS = 7 * ONE_DAY_MILLISECONDS;
const UPDATE_TIMEOUT_MILLISECONDS = 120_000;

export const toolPaths = {
  ffmpegDirectory: join(TOOLS_DIRECTORY, 'ffmpeg'),
  ffmpeg: join(TOOLS_DIRECTORY, 'ffmpeg', executableName('ffmpeg')),
  ffprobe: join(TOOLS_DIRECTORY, 'ffmpeg', executableName('ffprobe')),
  deno: join(TOOLS_DIRECTORY, executableName('deno')),
};

let ytdlpExecutable: string | null = null;

/** The program file inside yt-dlp's folder, which is named per platform (yt-dlp.exe, yt-dlp_linux, …). */
export function ytdlpPath(): string {
  ytdlpExecutable ??= findYtdlpExecutable();
  return ytdlpExecutable ?? join(YTDLP_DIRECTORY, executableName('yt-dlp'));
}

function findYtdlpExecutable(): string | null {
  try {
    const entry = readdirSync(YTDLP_DIRECTORY, { withFileTypes: true }).find((item) => item.isFile() && item.name.startsWith('yt-dlp'));
    return entry ? join(YTDLP_DIRECTORY, entry.name) : null;
  } catch {
    return null;
  }
}

/** The "folder" build starts in about 0.35 s; the single-file build unpacks itself on every run and takes about 1 s. */
function ytdlpReleaseAsset(): string {
  const { platform, arch } = process;
  if (platform === 'win32') {
    if (arch === 'arm64') return 'yt-dlp_win_arm64.zip';
    return arch === 'ia32' ? 'yt-dlp_win_x86.zip' : 'yt-dlp_win.zip';
  }
  if (platform === 'darwin') return 'yt-dlp_macos.zip';
  if (platform === 'linux') {
    if (arch === 'arm64') return 'yt-dlp_linux_aarch64.zip';
    return arch === 'arm' ? 'yt-dlp_linux_armv7l.zip' : 'yt-dlp_linux.zip';
  }
  throw new Error(`No yt-dlp build for ${platform}.`);
}

function ffmpegReleaseTarget(): string {
  const target = `${process.platform}-${process.arch}`;
  const supportedTargets = ['win32-x64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'];
  if (!supportedTargets.includes(target)) throw new Error(`No ffmpeg build for ${target}.`);
  return target;
}

function denoReleaseTarget(): string {
  const processor = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  if (process.platform === 'win32') return `${processor}-pc-windows-msvc`;
  if (process.platform === 'darwin') return `${processor}-apple-darwin`;
  return `${processor}-unknown-linux-gnu`;
}

/**
 * yt-dlp needs a JavaScript runtime for YouTube. The desktop app lends it the Electron binary
 * (running as Node through ELECTRON_RUN_AS_NODE); only the single-executable server needs Deno,
 * because running that executable would start the app instead.
 */
const needsDeno = () => IS_SINGLE_EXECUTABLE;

export function toolEnvironment(): NodeJS.ProcessEnv {
  return IS_ELECTRON ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env;
}

export function commonArguments(): string[] {
  const runtime = needsDeno() ? `deno:${toolPaths.deno}` : `node:${process.execPath}`;
  return [
    '--js-runtimes',
    runtime,
    '--remote-components',
    'ejs:github',
    '--ffmpeg-location',
    toolPaths.ffmpegDirectory,
    '--encoding',
    'utf-8',
    '--no-warnings',
  ];
}

async function downloadFile(url: string, destination: string, onProgress: (fraction: number) => void, gunzip = false): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`A download failed (HTTP ${response.status}). Check the internet connection.`);
  const totalBytes = Number(response.headers.get('content-length')) || 0;
  let receivedBytes = 0;
  const progressMeter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length;
      if (totalBytes) onProgress(receivedBytes / totalBytes);
      callback(null, chunk);
    },
  });
  const partialFile = `${destination}.part`;
  const source = Readable.fromWeb(response.body as unknown as WebReadableStream);
  if (gunzip) await pipeline(source, progressMeter, createGunzip(), createWriteStream(partialFile));
  else await pipeline(source, progressMeter, createWriteStream(partialFile));
  await rename(partialFile, destination);
  if (!IS_WINDOWS) await chmod(destination, 0o755);
}

interface InstallStep {
  name: string;
  downloadSizeMegabytes: number;
  isInstalled(): boolean;
  install(onProgress: (fraction: number) => void): Promise<void>;
}

const INSTALL_STEPS: InstallStep[] = [
  {
    name: 'yt-dlp',
    downloadSizeMegabytes: IS_WINDOWS ? 17 : 38,
    isInstalled: () => existsSync(ytdlpPath()),
    async install(onProgress) {
      const zipFile = join(TOOLS_DIRECTORY, 'yt-dlp.zip');
      const temporaryDirectory = `${YTDLP_DIRECTORY}.tmp`;
      const asset = ytdlpReleaseAsset();
      await downloadFile(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`, zipFile, (fraction) =>
        onProgress(fraction * 0.9),
      );
      await rm(temporaryDirectory, { recursive: true, force: true });
      await extractZip(await readFile(zipFile), temporaryDirectory);
      // Also removes the single-file build that earlier versions kept at tools/yt-dlp(.exe).
      await rm(YTDLP_DIRECTORY, { recursive: true, force: true });
      await rm(join(TOOLS_DIRECTORY, 'yt-dlp.exe'), { force: true });
      await rename(temporaryDirectory, YTDLP_DIRECTORY);
      await rm(zipFile, { force: true });
      ytdlpExecutable = null;
      await writeFile(UPDATE_CHECK_MARKER, '');
    },
  },
  ...(['ffmpeg', 'ffprobe'] as const).map((name): InstallStep => ({
    name,
    downloadSizeMegabytes: 28,
    isInstalled: () => existsSync(toolPaths[name]),
    install: (onProgress) => downloadFile(`${FFMPEG_RELEASE}/${name}-${ffmpegReleaseTarget()}.gz`, toolPaths[name], onProgress, true),
  })),
  {
    name: 'Deno',
    downloadSizeMegabytes: 45,
    isInstalled: () => !needsDeno() || existsSync(toolPaths.deno),
    async install(onProgress) {
      const zipFile = join(TOOLS_DIRECTORY, 'deno.zip');
      await downloadFile(`https://github.com/denoland/deno/releases/latest/download/deno-${denoReleaseTarget()}.zip`, zipFile, onProgress);
      const partialFile = `${toolPaths.deno}.part`;
      await writeFile(
        partialFile,
        extractZipEntry(await readFile(zipFile), (name) => name === executableName('deno')),
      );
      if (!IS_WINDOWS) await chmod(partialFile, 0o755);
      await rename(partialFile, toolPaths.deno);
      await rm(zipFile, { force: true });
    },
  },
];

const missingSteps = () => INSTALL_STEPS.filter((step) => !step.isInstalled());
export const toolsInstalled = () => missingSteps().length === 0;

const setupState: Omit<SetupStatus, 'installed' | 'downloadSizeMegabytes'> = { state: 'missing', message: null, progress: null };

export function setupStatus(): SetupStatus {
  const steps = missingSteps();
  const installed = steps.length === 0;
  return {
    ...setupState,
    // A tool can disappear after setup, for example when antivirus software removes it.
    state: setupState.state === 'ready' && !installed ? 'missing' : setupState.state,
    installed,
    downloadSizeMegabytes: steps.reduce((sum, step) => sum + step.downloadSizeMegabytes, 0),
  };
}

let ytdlpVersionText: string | null = null;
export const ytdlpVersion = (): string | null => ytdlpVersionText;

let setupTask: Promise<void> | null = null;
let setupSucceeded = false;
let lastUpdateAttempt = 0;

/** Installs what is missing, or checks for a yt-dlp update when one is due. Concurrent callers share one run. */
export function ensureTools(): Promise<void> {
  if (setupSucceeded && !toolsInstalled()) setupTask = null;
  setupTask ??= runSetup().then(
    () => {
      setupSucceeded = true;
      Object.assign(setupState, { state: 'ready', message: null, progress: null });
    },
    (error: unknown) => {
      setupTask = null;
      setupSucceeded = false;
      Object.assign(setupState, { state: 'error', message: error instanceof Error ? error.message : String(error), progress: null });
      throw error;
    },
  );
  return setupTask;
}

/** For an app left running for weeks: called while no download runs, so the update can't replace yt-dlp mid-download. */
export function checkForToolUpdate(): void {
  if (!setupSucceeded || !toolsInstalled() || !isUpdateDue()) return;
  setupTask = null;
  ensureTools().catch(() => {});
}

/** Gets ready at start-up when everything is installed; otherwise the user is asked first. */
export function initializeTools(): void {
  if (toolsInstalled()) ensureTools().catch(() => {});
}

export class ToolsMissingError extends Error {
  constructor() {
    super('The download tools are not installed yet. Click "Download tools" to set them up.');
  }
}

export function requireTools(): Promise<void> {
  if (setupState.state === 'running' || toolsInstalled()) return ensureTools();
  return Promise.reject(new ToolsMissingError());
}

async function runSetup(): Promise<void> {
  setupState.state = 'running';
  await mkdir(toolPaths.ffmpegDirectory, { recursive: true });
  const steps = missingSteps();
  for (const [stepIndex, step] of steps.entries()) {
    const reportProgress = (fraction: number) => {
      setupState.message = `Downloading ${step.name} (${stepIndex + 1} of ${steps.length})…`;
      setupState.progress = (stepIndex + Math.min(1, fraction)) / steps.length;
    };
    reportProgress(0);
    await step.install(reportProgress);
  }
  await updateYtdlpIfDue();
  ytdlpVersionText = await readYtdlpVersion();
}

/** A failed attempt is retried a day later; a successful check counts for a week. */
function isUpdateDue(): boolean {
  const lastCheck = existsSync(UPDATE_CHECK_MARKER) ? statSync(UPDATE_CHECK_MARKER).mtimeMs : 0;
  const now = Date.now();
  return now - lastCheck >= ONE_WEEK_MILLISECONDS && now - lastUpdateAttempt >= ONE_DAY_MILLISECONDS;
}

/** YouTube changes often, and an outdated yt-dlp is the usual reason downloads break. */
async function updateYtdlpIfDue(): Promise<void> {
  if (!isUpdateDue()) return;
  lastUpdateAttempt = Date.now();
  Object.assign(setupState, { message: 'Checking for a yt-dlp update…', progress: null });
  const succeeded = await new Promise<boolean>((resolve) => {
    execFile(ytdlpPath(), ['-U'], { windowsHide: true, env: toolEnvironment(), timeout: UPDATE_TIMEOUT_MILLISECONDS }, (error) =>
      resolve(!error),
    );
  });
  if (succeeded) await writeFile(UPDATE_CHECK_MARKER, '');
}

function readYtdlpVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(ytdlpPath(), ['--version'], { windowsHide: true, encoding: 'utf8' }, (error, output) => resolve(error ? null : output.trim()));
  });
}
