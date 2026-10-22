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
| `npm run format` / `format:check` | Prettier. |
| `npm run package` | Desktop releases for Windows x64, Linux x64 and Linux ARM64 in `release/`. |
| `npm run package:win`, `package:linux` | The same, for one platform. |
| `npm run package:server` | Single-executable builds of the browser/headless mode (`release/yt-downloader-server-*`). |
| `npm run icon` | Redraws `assets/icon.png` and `assets/icon.ico`. |

`start.cmd` (Windows) and `start.sh` (Linux and macOS) install, build and start the app in one step.

If Electron starts and behaves like plain Node (for example `Cannot read properties of undefined (reading 'setPath')`), the environment sets `ELECTRON_RUN_AS_NODE`. VS Code does this for its own processes. Unset it, or use the start scripts, which do.

## Continuous integration

`.github/workflows/ci.yml` runs `npm run typecheck`, `npm test` and `npm run format:check` on Windows and Linux for every push and pull request. It skips Electron's binary download, which the tests don't need.

## Code conventions

- **Names are full words.** Use `downloadFolder`, `bytesPerSecond`, `response`, `error`, `findElement`, not `dir`, `bps`, `res`, `e`, `$`. Established technical terms (`url`, `id`, `hdr`, `ffmpeg`) are fine. Field names that come from yt-dlp's JSON (`vcodec`, `abr`, `filesize_approx`) keep yt-dlp's spelling.
- **Comments explain why, not what.** Write one only when the code can't say it itself: a platform quirk, a format detail, a non-obvious constraint. Keep design explanations in these docs.
- **Pure logic stays pure.** `formats.ts`, `parseMediaInfo`, `parseSettings` and `parseHistory` have no I/O, so they can be tested directly.
- **The API contract lives in `src/shared/types.ts`.** Change it there first; TypeScript then points at every place that needs updating.
- Prettier formats everything (`printWidth` 140, single quotes).

## Tests

Tests live in `test/` and cover:

| File | Covers |
|---|---|
| `formats.test.ts` | Choices → yt-dlp arguments: MP3 320, Opus original, cover art, edited tags and their escaping, video codec preferences, playlists, the `--` safety rule. |
| `media-info.test.ts` | Parsing `yt-dlp -J` output (one row per resolution, vertical video, best audio, playlists), search results, the preview stream choice, readable error messages. |
| `tags-and-links.test.ts` | Tag suggestions from video titles and channels, and finding links in pasted or dropped text. |
| `archive.test.ts` | Zip and tar.gz reading and writing, including refusing zip entries and symbolic links that escape the target folder. |
| `json-file.test.ts` | Validation on load, concurrent saves keeping the last value, and keeping a copy of a damaged file. |
| `stores.test.ts` | Defaults and reading settings and history saved by earlier versions. |
| `queue.test.ts` | The download queue with a fake download engine: cancel then retry while the old process is still exiting, failures, success, playlists that skip videos, partial-folder cleanup and stale folders. |
| `request-guard.test.ts` | Refusing cross-site requests and DNS rebinding, and allowing the app's own page. |
| `access.test.ts` | The access key (cookie, access link, refusals), the Content-Security-Policy, and malformed addresses answering 400. |
| `verified-download.test.ts` | Checksum match and mismatch, stalled downloads, reading checksum files and release tags (against a local test server). |
| `tool-setup.test.ts` | The setup states with fake tools: missing, installing, ready, a tool lost later, failed installs, and the update-check schedule. |

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
  1. Add it to `AudioFormat` in `src/shared/types.ts`.
  2. Add its yt-dlp arguments to `AUDIO_PRESETS` in `formats.ts`.
  3. Add a card to `AUDIO_FORMAT_CARDS` in `src/client/components/media.ts`.
  4. Add a test.
- **A new setting:**
  1. Extend `Settings` in `src/shared/types.ts`.
  2. Validate it in `parseSettings` and `SettingsStore.update`.
  3. Add the control to the settings dialog in `index.html` and `components/settings.ts`.
- **Tool versions:**
  - yt-dlp always comes from its latest release and updates itself weekly.
  - ffmpeg is pinned by `FFMPEG_RELEASE` in `tools.ts`.
