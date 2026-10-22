import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import postject from 'postject';
import { createTarGz, extractTarGzEntry, extractZipEntry } from '../src/server/lib/archive.js';
import { WEB_ASSETS } from '../src/server/web-assets.js';
import {
  APP_NAME,
  BUILD_DIRECTORY,
  DIST_DIRECTORY,
  isLinuxTarget,
  RELEASE_DIRECTORY,
  runScript,
  targetsFromCommandLine,
  toMegabytes,
  type ReleaseTarget,
} from './common.js';

const NODE_CACHE_DIRECTORY = join(BUILD_DIRECTORY, 'cache');
/** The application blob must be injected into the same Node version that created it. */
const NODE_VERSION = process.version;
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const currentTarget = `${process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`;

async function downloadToMemory(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/** This machine's Node binary, or the official build from nodejs.org (cached in build/cache). */
async function nodeBinary(target: ReleaseTarget): Promise<Buffer> {
  if (target === currentTarget) return readFile(process.execPath);
  const isWindows = !isLinuxTarget(target);
  const cachedFile = join(NODE_CACHE_DIRECTORY, `node-${NODE_VERSION}-${target}${isWindows ? '.exe' : ''}`);
  if (existsSync(cachedFile)) return readFile(cachedFile);
  console.log(`Downloading Node ${NODE_VERSION} for ${target}…`);
  const archiveUrl = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${target}`;
  const binary = isWindows
    ? extractZipEntry(await downloadToMemory(`${archiveUrl}.zip`), (name) => name.endsWith('/node.exe'))
    : extractTarGzEntry(await downloadToMemory(`${archiveUrl}.tar.gz`), (name) => name.endsWith('/bin/node'));
  await mkdir(NODE_CACHE_DIRECTORY, { recursive: true });
  await writeFile(cachedFile, binary);
  return binary;
}

function readme(executable: string, isLinux: boolean): string {
  const start = isLinux ? `./${executable}    (from a terminal in this folder)` : `Double-click ${executable}`;
  const platformNotes = isLinux
    ? `If the file is not executable after copying: chmod +x ${executable}
On a server without a desktop, set HOST=0.0.0.0 to reach it from another machine, and start it with --no-open.`
    : `Windows may show "Windows protected your PC" because the file is not code-signed:
click "More info", then "Run anyway".`;
  return `${APP_NAME} (server edition)
=============================

Start it:
  ${start}

Your browser opens the app at http://localhost:5190. Keep the ${isLinux ? 'terminal' : 'console'} window open while
you use it; closing it stops the app.

The first time, the page offers to download yt-dlp, ffmpeg and Deno (about 130 MB) into a "tools"
folder next to this file. Downloads are saved to the "downloads" folder here (change it in Settings).
Everything stays in this folder: delete the folder to remove it completely.

${platformNotes}
`;
}

async function createApplicationBlob(): Promise<Buffer> {
  const configFile = join(BUILD_DIRECTORY, 'sea-config.json');
  const blobFile = join(BUILD_DIRECTORY, 'app.blob');
  // No code cache or snapshot, so the same blob works for every platform.
  const config = {
    main: join(DIST_DIRECTORY, 'app.cjs'),
    output: blobFile,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets: Object.fromEntries(WEB_ASSETS.map((asset) => [asset, join(DIST_DIRECTORY, 'client', asset)])),
  };
  await writeFile(configFile, JSON.stringify(config, null, 2));
  execFileSync(process.execPath, ['--experimental-sea-config', configFile], { stdio: 'inherit' });
  return readFile(blobFile);
}

async function main(): Promise<void> {
  const targets = targetsFromCommandLine();
  for (const file of ['app.cjs', ...WEB_ASSETS.map((asset) => `client/${asset}`)]) {
    if (!existsSync(join(DIST_DIRECTORY, file))) throw new Error(`dist/${file} is missing. Run "npm run build" first.`);
  }
  await mkdir(BUILD_DIRECTORY, { recursive: true });
  await mkdir(RELEASE_DIRECTORY, { recursive: true });
  const blob = await createApplicationBlob();

  for (const target of targets) {
    const isLinux = isLinuxTarget(target);
    const executable = isLinux ? 'yt-downloader' : 'yt-downloader.exe';
    const workingFile = join(BUILD_DIRECTORY, `${target}-${executable}`);
    await writeFile(workingFile, await nodeBinary(target));
    await postject.inject(workingFile, 'NODE_SEA_BLOB', blob, { sentinelFuse: SEA_FUSE });
    const binary = await readFile(workingFile);
    await rm(workingFile, { force: true });

    if (isLinux) {
      const archive = join(RELEASE_DIRECTORY, `yt-downloader-server-${target}.tar.gz`);
      const entries = [
        { name: 'yt-downloader/yt-downloader', data: binary, mode: 0o755 },
        { name: 'yt-downloader/README.txt', data: Buffer.from(readme(executable, true)) },
      ];
      await writeFile(archive, createTarGz(entries));
      console.log(`✓ ${archive} (${toMegabytes(binary.length)} executable)`);
    } else {
      const folder = join(RELEASE_DIRECTORY, `yt-downloader-server-${target}`);
      await rm(folder, { recursive: true, force: true });
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, executable), binary);
      await writeFile(join(folder, 'README.txt'), readme(executable, false).replace(/\n/g, '\r\n'));
      console.log(`✓ ${join(folder, executable)} (${toMegabytes(binary.length)})`);
    }
  }
}

runScript(main);
