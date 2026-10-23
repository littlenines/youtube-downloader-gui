# Development

## Requirements

- Node.js 20 or newer (24 recommended)
- Windows, Linux or macOS. Release packages for Windows and Linux are built on any of them.

```sh
npm install
npm run build
npm start
```

## Commands

| Command | What it does |
|---|---|
| `npm start` | Starts the desktop app from `dist/` (run `npm run build` first). |
| `npm run dev` | Development build (with source maps), then starts the desktop app. |
| `npm run dev:web` | Rebuilds on every change and restarts the server; open `http://localhost:5190` in a browser. |
| `npm run start:web` | Starts the browser/headless mode from `dist/`. |
| `npm run build` | Builds `dist/`: `desktop.cjs`, `preload.cjs`, `app.cjs`, `icon.png` and `client/`. |
| `npm test` | Unit tests (`node:test`, run through `tsx`). |
| `npm run typecheck` | Strict TypeScript for the server, desktop, page, tests and scripts. |
| `npm run lint` / `lint:fix` | oxlint for TypeScript (arrow functions, blank lines around statements, no one-letter names) and Stylelint for CSS (a blank line between rules). `lint:fix` adds missing blank lines and other fixable issues. |
| `npm run format` / `format:check` | Prettier. |
| `npm run package` | Desktop releases for Windows x64, Linux x64 and Linux ARM64 in `release/`. |
| `npm run package:win`, `package:linux` | The same, for one platform. |
| `npm run package:server` | Single-executable builds of the browser/headless mode (`release/yt-downloader-server-*`). |
| `npm run icon` | Redraws `assets/icon.png` and `assets/icon.ico`. |

`start.cmd` (Windows) and `start.sh` (Linux and macOS) install, build and start the app in one step.

If Electron starts and behaves like plain Node (for example `Cannot read properties of undefined (reading 'setPath')`), the environment sets `ELECTRON_RUN_AS_NODE`. VS Code does this for its own processes. Unset it, or use the start scripts, which do.

## Continuous integration

`.github/workflows/ci.yml` runs `npm run typecheck`, `npm run lint`, `npm test` and `npm run format:check` on Windows and Linux for every push and pull request. It skips Electron's binary download, which the tests don't need.

## Releasing

Releases are built and published by `.github/workflows/release.yml` when a version tag is pushed.

1. In `CHANGELOG.md`, rename `## Unreleased` to the new version (for example `## 1.2.0`), and commit it.
2. Tag and push:

```sh
npm version 1.2.0          # checks CHANGELOG.md, sets the version in package.json, commits it and creates the tag v1.2.0
git push --follow-tags     # pushes the commit and the tag; the workflow does the rest
```

`npm version` runs `scripts/release-notes.ts` before it commits, so it stops if `CHANGELOG.md` has no section for the new version. In that case `package.json` is already changed: undo it with `git checkout package.json package-lock.json`, add the section, and run `npm version` again.

The workflow (on a Windows runner):

1. Stops if the tag doesn't match the version in `package.json`.
2. Writes the release notes: that version's section of `CHANGELOG.md` under **What's new**, then a download table linking to this release's files (`releaseNotes` in `scripts/release-texts.ts`). It stops if the section is missing or empty.
3. Runs the typecheck and tests.
4. Builds all three packages and zips the Windows folder.
5. Writes `SHA256SUMS.txt` and a build attestation for each file, so anyone can verify where a file came from with `gh attestation verify <file> --repo littlenines/youtube-downloader-gui`.
6. Publishes the release with those notes.

If a release run fails, delete the tag (`git push --delete origin v1.1.0` and `git tag -d v1.1.0`), fix the problem, and tag again.

## Code conventions

- **Names are full words.** Use `downloadFolder`, `bytesPerSecond`, `response`, `error`, `findElement`, not `dir`, `bps`, `res`, `e`, `$`. Established technical terms (`url`, `id`, `hdr`, `ffmpeg`) are fine. Field names that come from yt-dlp's JSON (`vcodec`, `abr`, `filesize_approx`) keep yt-dlp's spelling.
- **No comments in the code.** Names say what a constant, function or file does. Design explanations, platform quirks and format details go in these docs.
- **One job per file.** When a file mixes concerns or grows long, split it; the folder groups related files.
- **Imports use aliases, not `../`.** `@shared/`, `@server/`, `@client/` and `@desktop/` point into `src/`, and `@scripts/` into `scripts/` (set in `tsconfig.base.json`; TypeScript, esbuild and tsx all read them). Files in the same folder import each other with `./`.
- **Arrow functions only.** `const name = (...) => ...` instead of `function`; generators are `function*` expressions. Class methods stay methods.
- **Blank lines around statements.** Before and after `const`/`let` groups, `if`, loops, `switch` and `try`, and after any block. In CSS, every rule and at-rule is separated by a blank line. `npm run lint:fix` adds them in both.
- **Pure logic stays pure.** `buildDownloadArguments`, `normalizeDownloadRequest`, `parseMediaInfo`, `parseSettings` and `parseHistory` have no I/O, so they can be tested directly.
- **Dates and numbers use `pageLocale` from `src/client/locale.ts`.** In the desktop app the page has no translations, so `toLocaleString()` with no locale would always give US formats. Use `formatDateTime` there, or pass `pageLocale` to `Intl`.
- **The API contract lives in `src/shared/types/`.** Change it there first; TypeScript then points at every place that needs updating.
- Prettier formats everything: no semicolons, single quotes, `printWidth` 120.

## Tests

Tests live in `test/` and cover:

| File | Covers |
|---|---|
| `download-options.test.ts` | Validating download requests, playlist selections, and job labels. |
| `download-arguments.test.ts` | Choices → yt-dlp arguments: MP3 320, Opus original, cover art, video codec preferences, progress and file markers, playlists, the `--` safety rule. |
| `cover-image.test.ts` | Saving only the cover: the yt-dlp arguments, the square crop for wide and tall pictures, finding the saved file, numbered names that never overwrite a file, the whole save with fake tools (the work folder removed after success, failure or cancel; the crop only for square), checking the request, and its history entry. |
| `tag-and-clip-arguments.test.ts` | Edited tags and their escaping, and clip sections with their file names. |
| `clip-range.test.ts` | Reading and writing clip times. |
| `media-info.test.ts` | Parsing `yt-dlp -J` output: one row per resolution, vertical video, best audio, playlists and their positions. |
| `ytdlp-output.test.ts` | Readable error messages, search results (videos, playlists, verified channels, what is searched), the preview stream choice, and yt-dlp's progress and file lines. |
| `search-filters.test.ts` | Narrowing search results by length and to verified channels, the edges between lengths, results without a duration, playlists ignoring the video filters, reading the chips, and **Show all**. |
| `tags-and-links.test.ts` | Tag suggestions from video titles and channels, and finding links in pasted or dropped text. |
| `archive.test.ts` | Zip and tar.gz reading and writing, including refusing zip entries and symbolic links that escape the target folder. |
| `json-file.test.ts` | Validation on load, concurrent saves keeping the last value, and keeping a copy of a damaged file. |
| `stores.test.ts` | Defaults, reading settings and history saved by earlier versions, and reading the saved queue safely. |
| `queue.test.ts` | The download queue with a fake download engine: cancel then retry while the old process is still exiting, failures, success, playlists that skip videos. |
| `queue-pause.test.ts` | Pausing and resuming in the same partial folder, cancelling a paused download, and a pause racing a finished download. |
| `queue-saving.test.ts` | Saving unfinished downloads, restoring them, pausing on shutdown and waiting for the last save. |
| `subscriptions.test.ts` | Subscribing without downloading the back catalogue, new videos downloading with the subscription's choices and folder, skipped Shorts and restricted videos, waiting for premieres, giving up after repeated failures or two weeks of waiting, YouTube's dates instead of the computer's clock, playlist listings that miss videos not causing downloads again, one retry after a failed check, a new interval chosen during a check, errors, missing tools, no work without subscriptions, one check at a time, unsubscribing mid-check, and the schedule (start-up check, only at start-up by default, interval, moving when the setting changes) with fake timers. |
| `subscription-sources.test.ts` | Reading YouTube channel feeds and flat playlists, what a link subscribes to, recognizing channel links, whether a new video can be downloaded yet, safe folder names in the output template, and reading saved subscriptions. |
| `partial-folders.test.ts` | Removing partial folders left by a crash, while keeping ones in use or belonging to saved downloads. |
| `request-guard.test.ts` | Refusing cross-site requests and DNS rebinding, and allowing the app's own page. |
| `access.test.ts` | The access key (cookie, access link, refusals), the Content-Security-Policy, and malformed addresses answering 400. |
| `verified-download.test.ts` | Checksum match and mismatch, stalled downloads, reading checksum files and release tags (against a local test server). |
| `tool-setup.test.ts` | The setup states with fake tools: missing, installing, ready, a tool lost later, failed installs, and the update-check schedule. |
| `app-update.test.ts` | Comparing app versions and offering a newer release. |
| `release-notes.test.ts` | Finding a version's section in `CHANGELOG.md` and building the release notes from it. |
| `locale.test.ts` | Turning the system locale into a language tag, passing it to the page, and formatting dates with it. |

Shared fakes and helpers for these live in `test/support/`.

Everything that needs yt-dlp, the network or a window is checked by running the app. A useful end-to-end pass:

1. Start with an empty `tools/` folder and check that the setup dialog appears and installs the tools.
2. Search for a song, preview it (play and seek), edit its tags and download it as MP3.
3. Paste or drop several links and download them all.
4. Download a 1080p MP4.
5. Cancel a 4K download halfway and confirm no `.part` files or yt-dlp/ffmpeg processes are left.
6. Close the window while downloading and confirm the quit question appears.

## Packaging

### Desktop releases (`npm run package`)

`scripts/package.ts` stages `dist/` into `build/app/` with a minimal `package.json`, then runs `@electron/packager` for each target:

| Target | Output |
|---|---|
| `win-x64` | `release/yt-downloader-win-x64/` with `yt-downloader.exe` (icon and version info set) and `README.txt`. Rebuilding keeps any `data/`, `tools/` and `downloads/` folders already there. |
| `linux-x64`, `linux-arm64` | `release/yt-downloader-<target>.tar.gz`. The archive is written by the app's own tar writer so the executable bits are right even when built on Windows. |

The Linux archive contains:

- `yt-downloader`: a launcher script. It keeps Chromium's sandbox when the system allows it, and `--install` adds a menu entry.
- `yt-downloader.bin`: Electron itself.
- `icon.png` and `README.txt`.

To keep the download small, every package leaves out two parts of Electron that the app doesn't use. Together they are about 22 MB of a 154 MB zip.

- **All of Chromium's interface translations except `en-US.pak`.** The page is English only. Without the other files Chromium's own locale is always `en-US`, so the page formats dates with the system's locale instead (see *Dates* in [architecture.md](architecture.md)). Packaging stops if `en-US.pak` is missing, rather than shipping an app without any.
- **The WebGPU shader compiler (`dxcompiler.dll`, `dxil.dll`).** The page uses no WebGPU. Chromium draws through ANGLE on Direct3D 11, which uses `d3dcompiler_47.dll` (kept). If anything in Chromium does use Dawn's Direct3D 12 backend, Dawn uses that same compiler when these files are missing. After an Electron upgrade, start the packaged app once and check that the window and preview still draw.

Electron downloads for other platforms are cached by Electron in its own cache folder (on Windows, `%LOCALAPPDATA%\electron\Cache`).

### Single-executable server (`npm run package:server`)

`scripts/package-server.ts` builds a Node single executable application from `dist/app.cjs`, with the page embedded as assets:

1. Creates the application blob with `node --experimental-sea-config`, without a code cache, so one blob fits every platform.
2. Downloads the matching official Node binary for each target from nodejs.org (cached in `build/cache/`).
3. Injects the blob with `postject`.

The blob only works in the exact Node version that created it, which is why the script downloads that same version.

### Code signing

Releases are not signed. Windows SmartScreen asks once ("More info" → "Run anyway"). macOS builds are not produced because they would require signing and notarization; macOS works from source.

## Changing common things

- **A new audio format:**
  1. Add it to `AudioFormat` in `src/shared/types/downloads.ts`.
  2. Add its yt-dlp arguments to `AUDIO_PRESETS` in `src/server/services/ytdlp/audio-presets.ts`.
  3. Add a card to `AUDIO_FORMAT_CARDS` in `src/client/components/choices/choice-options.ts`.
  4. Add a test.
- **A new setting:**
  1. Extend `Settings` in `src/shared/types/app.ts`.
  2. Validate it in `parseSettings` and `SettingsStore.update`.
  3. Add the control to the settings dialog in `index.html` and `components/settings.ts`.
- **Tool versions:**
  - yt-dlp always comes from its latest release and updates itself weekly.
  - ffmpeg is pinned by `FFMPEG_RELEASE_URL` and `FFMPEG_SHA256_BY_ASSET` in `src/server/services/tools/release-assets.ts`.
