import { execFile } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SetupStatus } from '../../shared/types.js';
import { IS_ELECTRON, IS_SINGLE_EXECUTABLE, IS_WINDOWS, TOOLS_DIRECTORY } from '../config.js';
import { extractZip, extractZipEntry } from '../lib/archive.js';
import { downloadText, downloadVerifiedFile, latestReleaseTag, parseSha256 } from '../lib/verified-download.js';

const executableName = (name: string) => (IS_WINDOWS ? `${name}.exe` : name);

const YTDLP_DIRECTORY = join(TOOLS_DIRECTORY, 'yt-dlp');
const UPDATE_CHECK_MARKER = join(TOOLS_DIRECTORY, '.yt-dlp-checked');
const FFMPEG_RELEASE = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1';
const ONE_DAY_MILLISECONDS = 24 * 3600 * 1000;
const ONE_WEEK_MILLISECONDS = 7 * ONE_DAY_MILLISECONDS;
const UPDATE_TIMEOUT_MILLISECONDS = 120_000;

/** That release publishes no checksums, so these were taken from GitHub's asset digests and checked against a download. */
const FFMPEG_SHA256: Record<string, string> = {
  'ffmpeg-win32-x64': '8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77',
  'ffprobe-win32-x64': 'f309e6223ad89d2fe54bccd420a7709b66fd27540674e92309578ed491a43c8d',
  'ffmpeg-linux-x64': 'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa',
  'ffprobe-linux-x64': '25d9b6ccb05e3d9de9e04e31e2506d8dd7f9f0418981965ac6df12e8d3afd067',
  'ffmpeg-linux-arm64': '754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0',
  'ffprobe-linux-arm64': '2ab6aba60ee84412dff9188720703376cb4e7aaf7e0b5e43aa8249f2acae5bf8',
  'ffmpeg-darwin-x64': '929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106',
  'ffprobe-darwin-x64': 'd4da574d6e2e197bd259b47d69cf262df9e312af24ad960444f6d806d3d4c186',
  'ffmpeg-darwin-arm64': '8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa',
  'ffprobe-darwin-arm64': 'd986a8ec7b030899fe66a8a288ed809a3543338705a3ce178cfb85869c5d80be',
};

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

function ffmpegReleaseAsset(name: 'ffmpeg' | 'ffprobe'): { asset: string; sha256: string } {
  const key = `${name}-${process.platform}-${process.arch}`;
  const sha256 = FFMPEG_SHA256[key];
  if (!sha256) throw new Error(`No ffmpeg build for ${process.platform}/${process.arch}.`);
  return { asset: `${key}.gz`, sha256 };
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

export interface InstallStep {
  name: string;
  downloadSizeMegabytes: number;
  isInstalled(): boolean;
  install(onProgress: (fraction: number) => void): Promise<void>;
}

async function installYtdlp(onProgress: (fraction: number) => void): Promise<void> {
  const asset = ytdlpReleaseAsset();
  const releaseUrl = `https://github.com/yt-dlp/yt-dlp/releases/download/${await latestReleaseTag('yt-dlp/yt-dlp')}`;
  const expectedSha256 = parseSha256(await downloadText(`${releaseUrl}/SHA2-256SUMS`), asset);
  if (!expectedSha256) throw new Error(`The yt-dlp release lists no checksum for ${asset}.`);
  const zipFile = join(TOOLS_DIRECTORY, 'yt-dlp.zip');
  const temporaryDirectory = `${YTDLP_DIRECTORY}.tmp`;
  await downloadVerifiedFile(`${releaseUrl}/${asset}`, zipFile, {
    label: 'yt-dlp',
    expectedSha256,
    onProgress: (fraction) => onProgress(fraction * 0.9),
  });
  await rm(temporaryDirectory, { recursive: true, force: true });
  await extractZip(await readFile(zipFile), temporaryDirectory);
  // Also removes the single-file build that earlier versions kept at tools/yt-dlp(.exe).
  await rm(YTDLP_DIRECTORY, { recursive: true, force: true });
  await rm(join(TOOLS_DIRECTORY, 'yt-dlp.exe'), { force: true });
  await rename(temporaryDirectory, YTDLP_DIRECTORY);
  await rm(zipFile, { force: true });
  ytdlpExecutable = null;
  await writeFile(UPDATE_CHECK_MARKER, '');
}

async function installFfmpegTool(name: 'ffmpeg' | 'ffprobe', onProgress: (fraction: number) => void): Promise<void> {
  const { asset, sha256 } = ffmpegReleaseAsset(name);
  await downloadVerifiedFile(`${FFMPEG_RELEASE}/${asset}`, toolPaths[name], {
    label: name,
    expectedSha256: sha256,
    onProgress,
    gunzip: true,
  });
  if (!IS_WINDOWS) await chmod(toolPaths[name], 0o755);
}

async function installDeno(onProgress: (fraction: number) => void): Promise<void> {
  const asset = `deno-${denoReleaseTarget()}.zip`;
  const releaseUrl = `https://github.com/denoland/deno/releases/download/${await latestReleaseTag('denoland/deno')}`;
  const expectedSha256 = parseSha256(await downloadText(`${releaseUrl}/${asset}.sha256sum`));
  if (!expectedSha256) throw new Error(`The Deno release lists no checksum for ${asset}.`);
  const zipFile = join(TOOLS_DIRECTORY, 'deno.zip');
  await downloadVerifiedFile(`${releaseUrl}/${asset}`, zipFile, { label: 'Deno', expectedSha256, onProgress });
  const partialFile = `${toolPaths.deno}.part`;
  await writeFile(
    partialFile,
    extractZipEntry(await readFile(zipFile), (name) => name === executableName('deno')),
  );
  if (!IS_WINDOWS) await chmod(partialFile, 0o755);
  await rename(partialFile, toolPaths.deno);
  await rm(zipFile, { force: true });
}

const INSTALL_STEPS: InstallStep[] = [
  { name: 'yt-dlp', downloadSizeMegabytes: IS_WINDOWS ? 17 : 38, isInstalled: () => existsSync(ytdlpPath()), install: installYtdlp },
  ...(['ffmpeg', 'ffprobe'] as const).map((name): InstallStep => ({
    name,
    downloadSizeMegabytes: 28,
    isInstalled: () => existsSync(toolPaths[name]),
    install: (onProgress) => installFfmpegTool(name, onProgress),
  })),
  { name: 'Deno', downloadSizeMegabytes: 45, isInstalled: () => !needsDeno() || existsSync(toolPaths.deno), install: installDeno },
];

export class ToolsMissingError extends Error {
  constructor() {
    super('The download tools are not installed yet. Click "Download tools" to set them up.');
  }
}

/** Everything the setup touches outside its own state, so tests can replace it. */
export interface ToolSetupDependencies {
  steps: InstallStep[];
  prepareFolders(): Promise<void>;
  /** Runs `yt-dlp -U`; resolves to whether it succeeded. */
  updateYtdlp(): Promise<boolean>;
  readYtdlpVersion(): Promise<string | null>;
  lastSuccessfulUpdateCheck(): number;
  recordSuccessfulUpdateCheck(): Promise<void>;
  now(): number;
}

type SetupState = Omit<SetupStatus, 'installed' | 'downloadSizeMegabytes'>;

export class ToolSetup {
  private readonly state: SetupState = { state: 'missing', message: null, progress: null };
  private task: Promise<void> | null = null;
  private succeeded = false;
  private lastUpdateAttempt = Number.NEGATIVE_INFINITY;
  private version: string | null = null;

  constructor(private readonly dependencies: ToolSetupDependencies) {}

  get ytdlpVersion(): string | null {
    return this.version;
  }

  installed(): boolean {
    return this.missingSteps().length === 0;
  }

  status(): SetupStatus {
    const steps = this.missingSteps();
    const installed = steps.length === 0;
    return {
      ...this.state,
      // A tool can disappear after setup, for example when antivirus software removes it.
      state: this.state.state === 'ready' && !installed ? 'missing' : this.state.state,
      installed,
      downloadSizeMegabytes: steps.reduce((sum, step) => sum + step.downloadSizeMegabytes, 0),
    };
  }

  /** Installs what is missing, or checks for a yt-dlp update when one is due. Concurrent callers share one run. */
  ensure(): Promise<void> {
    if (this.succeeded && !this.installed()) this.task = null;
    this.task ??= this.run().then(
      () => {
        this.succeeded = true;
        Object.assign(this.state, { state: 'ready', message: null, progress: null });
      },
      (error: unknown) => {
        this.task = null;
        this.succeeded = false;
        Object.assign(this.state, { state: 'error', message: error instanceof Error ? error.message : String(error), progress: null });
        throw error;
      },
    );
    return this.task;
  }

  /** Gets ready at start-up when everything is installed; otherwise the user is asked first. */
  initialize(): void {
    if (this.installed()) this.ensure().catch(() => {});
  }

  /** For reading links and downloading: waits for a running setup, and refuses if the tools are missing. */
  require(): Promise<void> {
    if (this.state.state === 'running' || this.installed()) return this.ensure();
    return Promise.reject(new ToolsMissingError());
  }

  /** For an app left running for weeks: called while no download runs, so the update can't replace yt-dlp mid-download. */
  checkForUpdate(): void {
    if (!this.succeeded || !this.installed() || !this.isUpdateDue()) return;
    this.task = null;
    this.ensure().catch(() => {});
  }

  private missingSteps(): InstallStep[] {
    return this.dependencies.steps.filter((step) => !step.isInstalled());
  }

  private async run(): Promise<void> {
    this.state.state = 'running';
    await this.dependencies.prepareFolders();
    const steps = this.missingSteps();
    for (const [stepIndex, step] of steps.entries()) {
      const reportProgress = (fraction: number) => {
        this.state.message = `Downloading ${step.name} (${stepIndex + 1} of ${steps.length})…`;
        this.state.progress = (stepIndex + Math.min(1, fraction)) / steps.length;
      };
      reportProgress(0);
      await step.install(reportProgress);
    }
    await this.updateIfDue();
    this.version = await this.dependencies.readYtdlpVersion();
  }

  /** A failed attempt is retried a day later; a successful check counts for a week. */
  private isUpdateDue(): boolean {
    const now = this.dependencies.now();
    return (
      now - this.dependencies.lastSuccessfulUpdateCheck() >= ONE_WEEK_MILLISECONDS && now - this.lastUpdateAttempt >= ONE_DAY_MILLISECONDS
    );
  }

  /** YouTube changes often, and an outdated yt-dlp is the usual reason downloads break. */
  private async updateIfDue(): Promise<void> {
    if (!this.isUpdateDue()) return;
    this.lastUpdateAttempt = this.dependencies.now();
    Object.assign(this.state, { message: 'Checking for a yt-dlp update…', progress: null });
    if (await this.dependencies.updateYtdlp()) await this.dependencies.recordSuccessfulUpdateCheck();
  }
}

export const toolSetup = new ToolSetup({
  steps: INSTALL_STEPS,
  prepareFolders: async () => {
    await mkdir(toolPaths.ffmpegDirectory, { recursive: true });
  },
  updateYtdlp: () =>
    new Promise((resolve) => {
      execFile(ytdlpPath(), ['-U'], { windowsHide: true, env: toolEnvironment(), timeout: UPDATE_TIMEOUT_MILLISECONDS }, (error) =>
        resolve(!error),
      );
    }),
  readYtdlpVersion: () =>
    new Promise((resolve) => {
      execFile(ytdlpPath(), ['--version'], { windowsHide: true, encoding: 'utf8' }, (error, output) =>
        resolve(error ? null : output.trim()),
      );
    }),
  lastSuccessfulUpdateCheck: () => (existsSync(UPDATE_CHECK_MARKER) ? statSync(UPDATE_CHECK_MARKER).mtimeMs : 0),
  recordSuccessfulUpdateCheck: () => writeFile(UPDATE_CHECK_MARKER, ''),
  now: () => Date.now(),
});
