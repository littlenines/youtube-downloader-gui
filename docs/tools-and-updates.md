# Tools and updates

## First run: installing the tools

No tools are bundled. The `ToolSetup` class in `services/tools/tool-setup.ts` owns this state. Everything it touches outside itself (install steps, `yt-dlp -U`, the clock, the update-check marker) is passed in, so `tool-setup.test.ts` drives every state with fakes. On start-up, `toolSetup.initialize()` checks what is installed:

1. **Everything present:** setup runs right away in the background and only checks whether a yt-dlp update is due. A successful check counts for a week (recorded in `tools/.yt-dlp-checked`); a failed one is retried a day later. An app left running checks again whenever no download is running, so an update never replaces yt-dlp mid-download.
2. **Something missing:** setup waits. The page opens the setup dialog, which explains what will be downloaded and how much, and starts the install through `POST /api/setup` when the user agrees. It then polls `GET /api/status` for progress and ends with "You're all set".

While the tools are missing, reading a link answers with status `409`, and the page opens the setup dialog instead of showing an error. Downloads already queued wait for a running setup. This also covers a tool that disappears while the app runs (for example, removed by antivirus software): the status turns back to `missing` and the same dialog reinstalls it.

### Verified downloads

Every tool is checked before it is installed (`lib/verified-download.ts`). The file is written as `<name>.part`, its SHA-256 is computed while it downloads, and it is renamed into place only if the hash matches. A download that receives nothing for 30 seconds is aborted with a clear message instead of hanging the setup.

| Tool | Where the expected checksum comes from |
|---|---|
| yt-dlp | `SHA2-256SUMS` of the same release. "latest" is first resolved to a fixed tag, so the file and its checksum can't come from different releases. |
| Deno | The `.sha256sum` file published next to each download, from the same resolved tag. |
| ffmpeg, ffprobe | Pinned in `FFMPEG_SHA256_BY_ASSET` (`services/tools/release-assets.ts`). The pinned release publishes no checksums, so the values were taken from GitHub's asset digests and one was checked against an independent download. |
| Node (server builds) | `SHASUMS256.txt` on nodejs.org, checked by `scripts/package-server.ts`. |
| Electron (desktop builds) | Checked by `@electron/packager` against Electron's own checksums. |

Checksums from the same release protect against corrupted or swapped downloads. They don't protect against a compromised release itself; the pinned ffmpeg hashes do.

yt-dlp is installed as its **folder build** (`yt-dlp_win.zip`, `yt-dlp_linux.zip`, …), not the single-file build. The single-file build unpacks a Python runtime on every launch, which costs about one second per link read and per download. The folder build starts in about a third of that and still updates itself with `-U`.

### The JavaScript runtime yt-dlp needs

YouTube requires yt-dlp to run JavaScript. The runtime depends on how the app runs:

| Mode | Runtime |
|---|---|
| Desktop app | The Electron binary itself, started with `ELECTRON_RUN_AS_NODE=1` |
| From source with Node | Node (`process.execPath`) |
| Single-executable server | Deno, downloaded during setup, because running the executable would start the app |

## New app versions

The app doesn't update itself, but it tells the user when a newer release exists:

- **Its own version** comes from `package.json`, baked into every Node bundle at build time (`__APP_VERSION__` in `scripts/build.ts`). Running from source, it reads `package.json` directly. If neither works the version is `unknown`, and no update is offered rather than a false one.
- **The check** runs once, when the app starts: it asks GitHub for `littlenines/youtube-downloader-gui/releases/latest`, using the same redirect as the tools setup, so there is no API rate limit. Only full versions like `v1.2.3` count; anything else is ignored. A failed check is written to the console and means no notice this run.
- **The page** asks `GET /api/app-update` once when it opens; the request waits for the start-up check, so a slow connection can't make the notice go missing.
- **The notice** is a banner under the link box: "Version 1.1.0 is available (you have 1.0.0)", with **Download**, which opens the release page in the browser, and **Not now**, which hides it until a newer version than the dismissed one appears.
