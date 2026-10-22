import { join } from 'node:path';

export const PROJECT_ROOT = join(import.meta.dirname, '..');
export const DIST_DIRECTORY = join(PROJECT_ROOT, 'dist');
export const BUILD_DIRECTORY = join(PROJECT_ROOT, 'build');
export const RELEASE_DIRECTORY = join(PROJECT_ROOT, 'release');
export const APP_NAME = 'YT Downloader';
export const COPYRIGHT = 'Copyright (c) 2026 littlenines';
/** Release folders already contain Electron's own "LICENSE", so the app's license gets a name of its own. */
export const LICENSE_FILE_NAME = 'YT-Downloader-LICENSE.txt';
export const LICENSE_SOURCE = join(PROJECT_ROOT, 'LICENSE');

export type ReleaseTarget = 'win-x64' | 'linux-x64' | 'linux-arm64';
export const ALL_TARGETS: ReleaseTarget[] = ['win-x64', 'linux-x64', 'linux-arm64'];

/** Reads `--targets win-x64,linux-x64` from the command line; all targets when absent. */
export function targetsFromCommandLine(): ReleaseTarget[] {
  const flagIndex = process.argv.indexOf('--targets');
  const requested = flagIndex > 0 ? (process.argv[flagIndex + 1] ?? '').split(',') : ALL_TARGETS;
  const targets = requested.filter((target): target is ReleaseTarget => ALL_TARGETS.includes(target as ReleaseTarget));
  if (!targets.length) throw new Error(`No valid targets. Use: ${ALL_TARGETS.join(', ')}`);
  return targets;
}

export const isLinuxTarget = (target: ReleaseTarget) => target.startsWith('linux');

export const toMegabytes = (bytes: number) => `${(bytes / 1048576).toFixed(0)} MB`;

export function runScript(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
