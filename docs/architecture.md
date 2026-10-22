# Architecture

YT Downloader is a TypeScript app with one download engine and two front ends:

- **Desktop app** (the normal way to run it): an Electron window.
- **Browser / headless mode**: the same page served on `http://localhost:5190`, for servers without a screen and for development.

Both front ends run the same local HTTP API and show the same page.

```
┌──────────────── Electron main process (src/desktop/main.ts) ────────────────┐
│                                                                              │
│  BrowserWindow ──HTTP──► local API on 127.0.0.1:5199 (src/server)            │
│   (the page,              │                                                  │
│    src/client)            ├─ DownloadQueue ──spawns──► yt-dlp ──► ffmpeg     │
│        ▲                  ├─ SettingsStore / HistoryStore (data/*.json)      │
│        └── preload ◄──IPC─┤  native folder picker, taskbar progress          │
│                           └─ tools service (tools/ yt-dlp, ffmpeg)           │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Source layout

| Path | Responsibility |
|---|---|
| `src/shared/types.ts` | The API contract: every type that crosses between server, desktop and page. |
| `src/shared/tags.ts`, `src/shared/links.ts` | Pure helpers both sides use: tag suggestions, and finding links in pasted or dropped text. |
| `src/server/config.ts` | Where things live (next to the executable when packaged, the project root otherwise), the port and the host. |
| `src/server/server.ts` | Start-up shared by both front ends: creates the services and listens. |
| `src/server/index.ts` | Browser/headless entry point. |
| `src/server/app.ts` | The HTTP server: cross-site request check, API router, static page. |
| `src/server/routes/index.ts` | The REST endpoints (see [http-api.md](http-api.md)). |
| `src/server/services/tools.ts` | Installs and updates yt-dlp, ffmpeg, ffprobe (and Deno for the single-executable server), and reports setup progress. |
| `src/server/services/formats.ts` | Pure rules that turn the user's choices into yt-dlp arguments. |
| `src/server/services/ytdlp.ts` | Runs yt-dlp: reads a link's formats (`parseMediaInfo` is pure), searches YouTube, and runs downloads with progress. |
| `src/server/services/ytdlp-output.ts` | The shapes of yt-dlp's JSON output. |
| `src/server/services/preview.ts` | Picks a playable stream for the preview and relays it to the page. |
| `src/server/services/queue.ts` | The download queue: concurrency, progress, cancel with partial-file cleanup, retry. |
| `src/server/services/stores.ts` | Settings and history, stored as JSON in `data/`. |
| `src/server/lib/` | Small building blocks: router, static files, JSON files, archives, OS helpers. |
| `src/desktop/main.ts` | The Electron main process: window, single instance, native dialogs, taskbar progress, quit confirmation. |
| `src/desktop/preload.ts` | Exposes `window.desktop` (the native folder picker) to the page. |
| `src/client/` | The page: link box (links, searches, drops), media panel (formats, quality picker, tags, preview), search results, batch panel, downloads list, settings and setup dialogs. |
| `scripts/` | Build, packaging and icon generation (see [development.md](development.md)). |

## Files at run time

Everything the app creates lives next to it, so deleting the folder removes the app completely:

| Folder | Contents |
|---|---|
| `tools/` | `yt-dlp/` (the folder build), `ffmpeg/ffmpeg`, `ffmpeg/ffprobe`, and `deno` for the single-executable server. |
| `data/` | `settings.json`, `history.json`, `window.json` (window size and position) and `window/` (the desktop window's browser data). |
| `downloads/` | The default download folder; changeable in Settings. |

When running from source, the project root plays this role (these folders are git-ignored).

## First run: installing the tools

No tools are bundled. On start-up, `initializeTools()` checks what is installed:

1. **Everything present:** setup runs right away in the background and only checks whether a yt-dlp update is due. A successful check counts for a week (recorded in `tools/.yt-dlp-checked`); a failed one is retried a day later. An app left running checks again whenever no download is running, so an update never replaces yt-dlp mid-download.
2. **Something missing:** setup waits. The page opens the setup dialog, which explains what will be downloaded and how much, and starts the install through `POST /api/setup` when the user agrees. It then polls `GET /api/status` for progress and ends with "You're all set".

While the tools are missing, reading a link answers with status `409`, and the page opens the setup dialog instead of showing an error. Downloads already queued wait for a running setup. This also covers a tool that disappears while the app runs (for example, removed by antivirus software): the status turns back to `missing` and the same dialog reinstalls it.

yt-dlp is installed as its **folder build** (`yt-dlp_win.zip`, `yt-dlp_linux.zip`, …), not the single-file build. The single-file build unpacks a Python runtime on every launch, which costs about one second per link read and per download. The folder build starts in about a third of that and still updates itself with `-U`.

### The JavaScript runtime yt-dlp needs

YouTube requires yt-dlp to run JavaScript. The runtime depends on how the app runs:

| Mode | Runtime |
|---|---|
| Desktop app | The Electron binary itself, started with `ELECTRON_RUN_AS_NODE=1` |
| From source with Node | Node (`process.execPath`) |
| Single-executable server | Deno, downloaded during setup, because running the executable would start the app |

## A download, step by step

1. The page sends `POST /api/downloads` with the user's choices.
2. `normalizeRequest` validates them into `DownloadOptions`, and the queue creates a `Job`.
3. When a slot is free (Settings → downloads at the same time), the queue waits for the tools and starts yt-dlp with `buildDownloadArguments`. The link always comes after `--`, so it can never be read as an option.
4. Each job gets its own partial folder, `<download folder>/.yt-downloader-partial/<job id>`, passed as `-P temp:`. yt-dlp keeps everything unfinished there (stream parts, fragments, thumbnails, merge and conversion output) and moves each file to the download folder only once it is complete.
5. yt-dlp prints marker lines that the app reads (`parseOutputLine`):
   - `VITEM`: an item starts, with its playlist position and title.
   - `VPROG`: progress, with the stream's video and audio codec, bytes, total, speed and seconds left.
   - `VFILE`: the final file after merging and conversion.
6. The codecs tell the streams apart: picture only, sound only, both in one stream, or neither (subtitles). For a video, the picture fills the progress bar to 85% and the sound the rest.
7. When the job ends in any way, its partial folder is deleted. On success the job is added to the history. On cancel the process tree is stopped (process group on Linux and macOS, `taskkill /T` on Windows), so nothing unfinished reaches the download folder at any stage.

A job keeps its slot until its yt-dlp process has exited, even after it was cancelled. Retrying a cancelled job queues it, and it starts only once the previous run has fully ended, so two runs never write the same file.

## Finding and choosing what to download

Everything typed, pasted, or dropped on the window goes through one function, `handleText` in `src/client/main.ts`:

| Input | Result |
|---|---|
| Several links | The batch panel: one set of choices, then **Download all** queues each link. |
| One link | The media panel for that link. |
| Anything else | A YouTube search. |

- **Links in text:** `extractLinks` finds every distinct link in the text, so a pasted list, a chat message or a dropped `text/uri-list` all work.
- **Drag and drop:** the window cancels the browser's default drag handling. Without that, the window would navigate to the dropped link.
- **Search:** runs `yt-dlp -J --flat-playlist "ytsearch12:<query>"`. A flat search lists results without reading each video, so it answers in about a second. Choosing a result opens it in the media panel, which then offers **Back to results**.

### Tags

For a single audio download, the media panel shows Artist, Title and Album fields.

`suggestTags` pre-fills them:

1. The artist, track and album the site provides (YouTube Music has them).
2. Otherwise, an "Artist - Title" video title, split in two.
3. Otherwise, the channel name, without " - Topic" or "VEVO".

Noise such as "(Official Video)" or "[Lyrics]" is removed.

The edited values reach yt-dlp as `--parse-metadata "%(id&|)s<value>:(?P<meta_<field>>[\s\S]+)"`:

- **Why the prefix:** the always-empty `%(id&|)s` prefix makes yt-dlp read the value as text rather than as a field name.
- **Escaping:** colons and percent signs in the value are escaped.
- **Effect:** `meta_` fields override what yt-dlp embeds, and the output template `%(meta_artist,artist&{} - |)s%(meta_title,track,title)s` names the file after them, with yt-dlp making the name safe for the file system.

### Preview

When a link is read, `registerPreview` picks a stream the page can play directly:

- **First choice:** a single stream with picture and sound, up to 720p (on YouTube, format 18 at 360p).
- **Otherwise:** a stereo audio stream, preferring M4A.

It remembers the stream's address and request headers under a random token for an hour. The page's `<video>` or `<audio>` element plays `/api/preview/<token>`, which relays the stream and passes the `Range` header through, so seeking works.

YouTube refuses a freshly issued stream address (HTTP 403) for a few seconds. The relay retries refusals for up to about ten seconds, which is why a preview typically starts two to three seconds after clicking ▶.

## The page

The page is plain TypeScript with no framework, bundled by esbuild:

- **Media panel:** one click and one change listener handle every option. A choice redraws only the options area, not the header and thumbnail. A link response that arrives after a newer one was requested is ignored.
- **Downloads list:** polls `GET /api/downloads` every 0.7 s while something is active and every 4 s otherwise. Rows are keyed by job id and rebuilt only when their layout changes (finished, failed, cancelled). The title, status text and progress bar update in place, so buttons stay put and clicks are never lost.
- **Settings:** in the desktop app, **Browse…** opens the native folder picker through `window.desktop.pickFolder`.

## Smooth rendering

Measured on a 180 Hz display with a second monitor and a game running, three things made the window feel slow. Each is now avoided.

1. **Animating the progress bar.** Any continuous animation, including a cheap `transform` transition, kept the window producing frames, and with the graphics card busy those frames stalled. Scrolling during a download dropped 11–20 frames beyond 33 ms per few seconds; without the animation, none. The bar is set with `transform: scaleX()` (no page layout) and jumps to each new value without a transition.
2. **DirectComposition on Windows.** It added 25–30 ms before every frame reached the screen, so a click took 40–48 ms to show; without it, one frame (16 ms or less). The desktop app starts Chromium with `--disable-direct-composition`. Starting it with `--enable-direct-composition` keeps the default.
3. **Taskbar progress.** Every update makes Windows redraw the taskbar, so it is only sent when the percentage changes.

To measure again, start the app with `--remote-debugging-port=9333` and record frame gaps with `requestAnimationFrame`, or event timing (`PerformanceObserver` with `type: 'event'`) for clicks. Compare with and without a change in the same session, because the graphics load of other programs changes the absolute numbers.

## Security

- The API listens on `127.0.0.1` only (the headless mode can opt into `HOST=0.0.0.0`).
- Requests with an `Origin` from another site are refused, so a website open in the user's browser can't drive the local API.
- While the server is local only, every request must name a loopback host (`127.0.0.1`, `localhost`, `[::1]`). This stops DNS rebinding, where a website points its own name at `127.0.0.1` so that its requests look same-origin.
- Links are passed to yt-dlp after `--`.
- Static files are served only from inside the page's folder.
- Zip extraction refuses entries, and symbolic links, that would point outside the target folder.
- A settings or history file that can't be parsed is kept as `<name>.broken-<time>` before the defaults are used, so the next save can't destroy it.
- The desktop window loads only the app's own page. Other links open in the system browser, and the renderer runs sandboxed with context isolation.
- On Linux, the release launcher keeps Chromium's sandbox when user namespaces or a setuid `chrome-sandbox` are available, and otherwise starts without it. That is acceptable only because the window never loads outside content.

## Compatibility with older data

`parseSettings` and `parseHistory` validate stored JSON and also accept the key names used by earlier versions (`outDir`, `concurrent`, `thumbnail`, `size`). An old single-file `tools/yt-dlp(.exe)` is replaced by the folder build on the next setup.
