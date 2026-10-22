import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';
import { packager } from '@electron/packager';
import { createTarGz, type TarEntry } from '../src/server/lib/archive.js';
import { WEB_ASSETS } from '../src/server/web-assets.js';
import {
  APP_NAME,
  BUILD_DIRECTORY,
  COPYRIGHT,
  DIST_DIRECTORY,
  isLinuxTarget,
  LICENSE_FILE_NAME,
  LICENSE_SOURCE,
  PROJECT_ROOT,
  RELEASE_DIRECTORY,
  runScript,
  targetsFromCommandLine,
  toMegabytes,
  type ReleaseTarget,
} from './common.js';

const STAGING_DIRECTORY = join(BUILD_DIRECTORY, 'app');
const PACKAGER_OUTPUT_DIRECTORY = join(BUILD_DIRECTORY, 'desktop');
const APP_FILES = ['desktop.cjs', 'preload.cjs', 'icon.png', ...WEB_ASSETS.map((asset) => `client/${asset}`)];
/** Folders the app creates next to itself; kept when a release folder is rebuilt. */
const USER_DATA_FOLDERS = new Set(['data', 'tools', 'downloads']);
const LINUX_EXECUTABLES = new Set(['yt-downloader', 'yt-downloader.bin', 'chrome-sandbox', 'chrome_crashpad_handler']);

/**
 * Stops the running app from being opened to a debugger (--inspect, NODE_OPTIONS). RunAsNode stays on because
 * yt-dlp uses the app's binary as its JavaScript runtime; that mode starts a separate plain Node process without the app's data.
 */
async function lockDownElectron(executable: string): Promise<void> {
  await flipFuses(executable, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
}

// Chromium's sandbox needs unprivileged user namespaces or a setuid-root chrome-sandbox. Several
// distributions restrict the first, and an app run from a folder can't have the second, so the
// launcher checks for either and otherwise starts without it (the window only shows the app's own page).
const LINUX_LAUNCHER = `#!/bin/sh
# Starts ${APP_NAME}.   ./yt-downloader --install   adds it to the applications menu.
DIR=$(dirname "$(readlink -f "$0")")
if [ "$1" = "--install" ]; then
  APPS="\${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$APPS"
  cat > "$APPS/yt-downloader.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=${APP_NAME}
Comment=Download music and video in high quality
Exec="$DIR/yt-downloader"
Icon=$DIR/icon.png
Terminal=false
Categories=AudioVideo;Network;
EOF
  echo "Added ${APP_NAME} to the applications menu."
  exit 0
fi
if [ -u "$DIR/chrome-sandbox" ] || unshare -Ur true 2>/dev/null; then
  exec "$DIR/yt-downloader.bin" "$@"
fi
exec "$DIR/yt-downloader.bin" --no-sandbox "$@"
`;

function readme(isLinux: boolean): string {
  const start = isLinux
    ? './yt-downloader            (once: ./yt-downloader --install adds it to the applications menu)'
    : 'Double-click yt-downloader.exe';
  const platformNotes = isLinux
    ? 'If the files are not executable after copying: chmod +x yt-downloader yt-downloader.bin'
    : 'Windows may show "Windows protected your PC" because the app is not code-signed:\nclick "More info", then "Run anyway".';
  return `${APP_NAME}
=============

Start it:
  ${start}

The first time, the app asks to download yt-dlp and ffmpeg (about ${isLinux ? 90 : 75} MB) into a "tools"
folder next to this file. Downloads are saved to the "downloads" folder here (change it in Settings,
the gear button). Everything stays in this folder: delete the folder to remove the app.

${platformNotes}
`;
}

async function stageApp(version: string): Promise<void> {
  await rm(STAGING_DIRECTORY, { recursive: true, force: true });
  for (const file of APP_FILES) await cp(join(DIST_DIRECTORY, file), join(STAGING_DIRECTORY, file));
  const manifest = { name: 'yt-downloader', productName: APP_NAME, version, main: 'desktop.cjs', license: 'MIT' };
  await writeFile(join(STAGING_DIRECTORY, 'package.json'), JSON.stringify(manifest, null, 2));
}

async function* listFiles(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* listFiles(path);
    else yield path;
  }
}

const isLinuxExecutable = (fileName: string) => LINUX_EXECUTABLES.has(fileName) || /\.so(\.\d+)*$/.test(fileName);

/** A .tar.gz keeps the executable bits, which can't be set on files written from Windows. */
async function writeLinuxArchive(appFolder: string, target: ReleaseTarget): Promise<void> {
  await rename(join(appFolder, 'yt-downloader'), join(appFolder, 'yt-downloader.bin'));
  await writeFile(join(appFolder, 'yt-downloader'), LINUX_LAUNCHER);
  await cp(join(PROJECT_ROOT, 'assets', 'icon.png'), join(appFolder, 'icon.png'));
  await writeFile(join(appFolder, 'README.txt'), readme(true));
  await cp(LICENSE_SOURCE, join(appFolder, LICENSE_FILE_NAME));
  const entries: TarEntry[] = [];
  for await (const file of listFiles(appFolder)) {
    const relativeName = relative(appFolder, file).split(sep).join('/');
    const fileName = relativeName.split('/').pop() ?? relativeName;
    entries.push({ name: `yt-downloader/${relativeName}`, data: await readFile(file), mode: isLinuxExecutable(fileName) ? 0o755 : 0o644 });
  }
  const archive = join(RELEASE_DIRECTORY, `yt-downloader-${target}.tar.gz`);
  await writeFile(archive, createTarGz(entries));
  console.log(`✓ ${archive} (${toMegabytes((await stat(archive)).size)})`);
}

async function writeWindowsFolder(appFolder: string, target: ReleaseTarget): Promise<void> {
  await writeFile(join(appFolder, 'README.txt'), readme(false).replace(/\n/g, '\r\n'));
  await writeFile(join(appFolder, LICENSE_FILE_NAME), (await readFile(LICENSE_SOURCE, 'utf8')).replace(/\n/g, '\r\n'));
  const releaseFolder = join(RELEASE_DIRECTORY, `yt-downloader-${target}`);
  await mkdir(releaseFolder, { recursive: true });
  for (const name of await readdir(releaseFolder)) {
    if (!USER_DATA_FOLDERS.has(name)) await rm(join(releaseFolder, name), { recursive: true, force: true });
  }
  for (const name of await readdir(appFolder)) await rename(join(appFolder, name), join(releaseFolder, name));
  console.log(`✓ ${join(releaseFolder, 'yt-downloader.exe')}`);
}

async function main(): Promise<void> {
  const targets = targetsFromCommandLine();
  for (const file of APP_FILES) {
    if (!existsSync(join(DIST_DIRECTORY, file))) throw new Error(`dist/${file} is missing. Run "npm run build" first.`);
  }
  const readVersion = async (packageFile: string) => (JSON.parse(await readFile(packageFile, 'utf8')) as { version: string }).version;
  const appVersion = await readVersion(join(PROJECT_ROOT, 'package.json'));
  const electronVersion = await readVersion(join(PROJECT_ROOT, 'node_modules/electron/package.json'));
  await stageApp(appVersion);
  await mkdir(RELEASE_DIRECTORY, { recursive: true });

  for (const target of targets) {
    const [, arch] = target.split('-') as [string, 'x64' | 'arm64'];
    const isLinux = isLinuxTarget(target);
    console.log(`Packaging ${target} (Electron ${electronVersion})…`);
    const [appFolder] = await packager({
      dir: STAGING_DIRECTORY,
      out: PACKAGER_OUTPUT_DIRECTORY,
      platform: isLinux ? 'linux' : 'win32',
      arch,
      electronVersion,
      name: APP_NAME,
      executableName: 'yt-downloader',
      appVersion,
      appCopyright: COPYRIGHT,
      icon: join(PROJECT_ROOT, 'assets', isLinux ? 'icon.png' : 'icon.ico'),
      win32metadata: { CompanyName: APP_NAME, FileDescription: APP_NAME, ProductName: APP_NAME, OriginalFilename: 'yt-downloader.exe' },
      asar: false,
      prune: false,
      overwrite: true,
      quiet: true,
    });
    if (!appFolder) throw new Error(`Packaging ${target} produced nothing.`);
    await lockDownElectron(join(appFolder, isLinux ? 'yt-downloader' : 'yt-downloader.exe'));
    if (isLinux) await writeLinuxArchive(appFolder, target);
    else await writeWindowsFolder(appFolder, target);
  }
  await rm(PACKAGER_OUTPUT_DIRECTORY, { recursive: true, force: true });
}

runScript(main);
