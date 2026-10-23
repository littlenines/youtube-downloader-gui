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

Each file has one job, and its name says what that job is. Folders group files by area:

| Path | Responsibility |
|---|---|
| `src/shared/types.ts` | The API contract: every type that crosses between server, desktop and page. |
| `src/shared/` | Pure helpers both sides use: tag suggestions (`tags.ts`), finding links (`links.ts`), whether a job is active (`jobs.ts`), resolution labels such as 4K (`resolution.ts`). |
| `src/server/config.ts` | Where things live (next to the executable when packaged, the project root otherwise), the port and the host. |
| `src/server/index.ts` | Browser/headless entry point. |
| `src/server/server.ts` | Start-up shared by both front ends: creates the services and listens. |
| `src/server/app.ts` | The HTTP server: request checks, API router, static page. |
| `src/server/security/` | The cross-site and DNS-rebinding check (`request-guard.ts`), the access cookie and access link (`access-cookie.ts`), and the stored access key (`access-key-file.ts`). |
| `src/server/routes/` | The REST endpoints, one file per area: settings and setup, media (link info, search, preview), downloads. See [http-api.md](http-api.md). |
| `src/server/services/tools/` | Installing and updating the tools: paths (`tool-paths.ts`), release files and pinned checksums (`release-assets.ts`), one install step per tool (`install-steps.ts`), the setup state machine (`tool-setup.ts`) and the app's instance of it (`app-tool-setup.ts`). |
| `src/server/services/ytdlp/` | Everything that talks to yt-dlp: shared arguments, reading a link (`media-info.ts`, `video-qualities.ts`), search, readable error messages, download arguments and audio presets, running a download and reading its output lines (`download-process.ts`, `download-events.ts`), and the shapes of its JSON output (`ytdlp-json.ts`). |
| `src/server/services/downloads/` | The download queue (`download-queue.ts`), validating requests (`download-options.ts`), creating and resetting jobs (`jobs.ts`), turning yt-dlp events into job progress (`job-progress.ts`), and partial folders (`partial-folders.ts`). |
| `src/server/services/preview/` | Choosing a playable preview stream and relaying it to the page. |
| `src/server/services/stores/` | Settings and history, stored as JSON in `data/`. |
| `src/server/lib/` | Building blocks with no app knowledge: HTTP router and JSON helpers, static files, JSON files, zip and tar, checksums, GitHub releases, verified downloads, the desktop shell (open a link, show a file) and stopping a process tree. |
| `src/desktop/` | The Electron main process: `main.ts` starts it; the window, saved window position, taskbar progress, quit confirmation and start-up switches each have their own file. `preload.ts` exposes `window.desktop` (the native folder picker) to the page. |
| `src/client/` | The page. `main.ts` starts every part; `link-input.ts` and `drag-and-drop.ts` take links, searches and drops; `components/` holds the media panel, choice controls, search results, batch panel, downloads list, settings and setup. |
| `src/client/styles/` | The stylesheet in parts, imported in order by `index.css` and bundled into one `styles.css`. |
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

## A download, step by step

1. The page sends `POST /api/downloads` with the user's choices.
2. `normalizeDownloadRequest` validates them into `DownloadOptions`, and the queue creates a `Job`.
3. When a slot is free (Settings → downloads at the same time), the queue waits for the tools and starts yt-dlp with `buildDownloadArguments`. The link always comes after `--`, so it can never be read as an option.
4. Each job gets its own partial folder, `<download folder>/.yt-downloader-partial/<job id>`, passed as `-P temp:`. yt-dlp keeps everything unfinished there (stream parts, fragments, thumbnails, merge and conversion output) and moves each file to the download folder only once it is complete.
5. yt-dlp prints marker lines that the app reads (`parseOutputLine`):
   - `VITEM`: an item starts, with its playlist position and title.
   - `VPROG`: progress, with the stream's video and audio codec, bytes, total, speed and seconds left.
   - `VFILE`: the final file after merging and conversion.
6. The codecs tell the streams apart: picture only, sound only, both in one stream, or neither (subtitles). For a video, the picture fills the progress bar to 85% and the sound the rest.
7. When the job ends in any way, its partial folder is deleted. On success the job is added to the history. On cancel the process tree is stopped (process group on Linux and macOS, `taskkill /T` on Windows), so nothing unfinished reaches the download folder at any stage.

A job keeps its slot until its yt-dlp process has exited, even after it was cancelled. Retrying a cancelled job queues it, and it starts only once the previous run has fully ended, so two runs never write the same file.

**Playlists with unavailable videos.** yt-dlp skips a private or removed video and carries on, but then exits with an error code. When a playlist saved at least one file, the job counts as done, and `Job.warning` says how many videos were skipped and why (for example "2 videos could not be downloaded. This video is private."). Only a playlist that saved nothing is a failure.

**Partial folders.** The shared `.yt-downloader-partial` folder is marked hidden on Windows, where a leading dot doesn't hide anything. At start-up, job folders left by a crash or a killed app are removed once nothing in them has changed for six hours. The delay is because another copy of the app (the browser mode, say) may be downloading into the same folder.

**Abandoned requests.** Reading a link and searching stop their yt-dlp process when the page stops waiting. The page aborts the previous request when a new link or search replaces it, and the server notices the closed connection.

## Finding and choosing what to download

Everything typed, pasted, or dropped on the window goes through one function, `handleEnteredText` in `src/client/link-input.ts`:

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
2. **DirectComposition on Windows.** It added 25–30 ms before every frame reached the screen, so a click took 40–48 ms to show; without it, one frame (16 ms or less). The desktop app starts Chromium with `--disable-direct-composition` unless **Settings → Faster screen updates** is turned off. The setting is read from `settings.json` before the app is ready, because graphics switches only apply at start-up.
3. **Taskbar progress.** Every update makes Windows redraw the taskbar, so it is only sent when the percentage changes.

To measure again, start the app with `--remote-debugging-port=9333` and record frame gaps with `requestAnimationFrame`, or event timing (`PerformanceObserver` with `type: 'event'`) for clicks. Compare with and without a change in the same session, because the graphics load of other programs changes the absolute numbers.

## Security

- The API listens on `127.0.0.1` only (the headless mode can opt into `HOST=0.0.0.0`).
- **An access key guards the API.** Other programs and other user accounts on the same computer can reach `127.0.0.1` too, so every `/api/` request must carry the key in an `HttpOnly`, `SameSite=Strict` cookie.
  - The key is random, created once and kept in `data/access-key`.
  - The desktop app gives its own window the cookie before loading the page.
  - The browser mode opens, and prints, a link with `?access=<key>`. The server turns that into the cookie and redirects to the clean address, so a bookmark keeps working afterwards.
  - The page itself (HTML, script, styles) loads without the key; it contains nothing private.
- Requests with an `Origin` from another site are refused, so a website open in the user's browser can't drive the local API.
- While the server is local only, every request must name a loopback host (`127.0.0.1`, `localhost`, `[::1]`). This stops DNS rebinding, where a website points its own name at `127.0.0.1` so that its requests look same-origin.
- Links are passed to yt-dlp after `--`.
- The page is served with a Content-Security-Policy that allows only the app's own scripts and styles. The page builds parts of itself from website text with `innerHTML`; escaping handles that, and the policy is the second line of defense. Every response also carries `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
- Static files are served only from inside the page's folder. A malformed address answers 400, not 500.
- Opening a link in the browser never goes through a shell: `cmd /c start` would treat an `&` in the link as another command.
- Zip extraction refuses entries, and symbolic links, that would point outside the target folder.
- A settings or history file that can't be parsed is kept as `<name>.broken-<time>` before the defaults are used, so the next save can't destroy it.
- The desktop window loads only the app's own page. Other links open in the system browser, and the renderer runs sandboxed with context isolation.
- The desktop window gets no permissions except reading and writing the clipboard (for the Paste button). The folder picker answers only requests from the app's own page.
- Release builds have Electron's `EnableNodeCliInspectArguments` and `EnableNodeOptionsEnvironmentVariable` fuses turned off, so the running app can't be opened to a debugger. A release build started with `--remote-debugging-port` exits. `RunAsNode` stays on because yt-dlp uses the binary as its JavaScript runtime; that mode starts a separate, empty Node process.
- On Linux, the release launcher keeps Chromium's sandbox when user namespaces or a setuid `chrome-sandbox` are available, and otherwise starts without it. That is acceptable only because the window never loads outside content.

## Platform and format details

Facts the code depends on that its names can't say:

- **Fixed desktop port.** The desktop app prefers port 5199 because the page's saved choices live in browser storage, which belongs to one address. Only if 5199 is taken does it use another free port.
- **Remembered choices.** Format, container and options are remembered in the page's storage; the resolution is not, because it depends on each video. In private windows, where storage is unavailable, nothing is remembered.
- **Resolution means the short side.** A vertical 1080×1920 video counts as 1080p, and yt-dlp's `res` sort key compares the short side too, so vertical videos are picked like horizontal ones.
- **Subtitles use `en`, not `en.*`.** `en.*` also matches YouTube's machine-translated tracks, and fetching those got the whole download refused with HTTP 429.
- **Marker lines.** In `VITEM` lines the title comes last, because a title may contain the `|` separator.
- **Tag values.** The always-empty `%(id&|)s` around an edited tag also keeps a trailing `\` in the value away from the `:` separator.
- **Stopping downloads.** On Linux and macOS yt-dlp runs in its own process group, so cancelling also stops the ffmpeg it started. On Windows, `taskkill /T` stops the tree. Removing a partial folder retries a few times, because Windows keeps a stopped process's files locked for a moment.
- **Showing a file on Windows.** Explorer only accepts `/select,"path"` passed verbatim, and `windowsHide` would open its window invisibly, so neither option is used for it.
- **Release folders.** They already contain Electron's own `LICENSE`, so the app's license is named `YT-Downloader-LICENSE.txt`.

## Compatibility with older data

`parseSettings` and `parseHistory` validate stored JSON and also accept the key names used by earlier versions (`outDir`, `concurrent`, `thumbnail`, `size`). An old single-file `tools/yt-dlp(.exe)` is replaced by the folder build on the next setup.
