# Development

The details are split by topic; see the [documentation index](README.md).

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
