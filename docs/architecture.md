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
│        └── preload ◄──IPC─┤  folder picker, mini mode, taskbar progress      │
│                           ├─ tools service (tools/ yt-dlp, ffmpeg)           │
│                           └─ app updater (.update/ → swaps the app files)    │
└──────────────────────────────────────────────────────────────────────────────┘
```

The details are split by topic; see the [documentation index](README.md).

## Source layout

Each file has one job, and its name says what that job is. Folders group files by area:

| Path | Responsibility |
|---|---|
| `src/shared/types/` | The API contract: every type that crosses between server, desktop and page, in `media.ts` (link info, qualities, playlists, search), `downloads.ts` (requests, options, jobs, history) and `app.ts` (settings, setup, status, updates). |
| `src/shared/` | Pure helpers both sides use: tag suggestions (`tags.ts`), finding links (`links.ts`), whether a job is active (`jobs.ts`), resolution labels such as 4K (`resolution.ts`), "1 video" / "3 videos" (`count-text.ts`). |
| `src/server/config.ts` | Where things live (next to the executable when packaged, the project root otherwise), the port and the host. |
| `src/server/index.ts` | Browser/headless entry point. |
| `src/server/server.ts` | Start-up shared by both front ends: creates the services and listens. |
| `src/server/app.ts` | The HTTP server: request checks, API router, static page. |
| `src/server/security/` | The cross-site and DNS-rebinding check (`request-guard.ts`), the access cookie and access link (`access-cookie.ts`), and the stored access key (`access-key-file.ts`). |
| `src/server/routes/` | The REST endpoints, one file per area: settings and setup, media (link info, search, preview), downloads. See [http-api.md](http-api.md). |
| `src/server/services/tools/` | Installing and updating the tools: paths (`tool-paths.ts`), release files and pinned checksums (`release-assets.ts`), one install step per tool (`install-steps.ts`), the setup state machine (`tool-setup.ts`) and the app's instance of it (`app-tool-setup.ts`). |
| `src/server/services/ytdlp/` | Everything that talks to yt-dlp: shared arguments, reading a link (`media-info.ts`, `video-qualities.ts`), remembering a playlist's full list of videos for downloading it (`playlist-videos.ts`), search, readable error messages, download arguments and audio presets, running a download and reading its output lines (`download-process.ts`, `download-events.ts`), and the shapes of its JSON output (`ytdlp-json.ts`). |
| `src/server/services/downloads/` | The download queue (`download-queue.ts`), which decides what runs, with its parts: running one download (`job-runner.ts`), the runs in progress and how they were stopped (`active-runs.ts`), the folder each job started in (`job-folders.ts`), converting to and from `queue.json` (`saved-jobs.ts`) and the real yt-dlp engine (`download-engine.ts`). Also validating requests (`download-options.ts`), creating and resetting jobs (`jobs.ts`), turning yt-dlp events into job progress (`job-progress.ts`), partial folders (`partial-folders.ts`), the video info a download starts from (`video-info-file.ts`: the panel's saved read, or a new one when a subtitle track must be picked), picking that track (`subtitle-track-choice.ts`) and naming the spoken language's `.srt` file (`subtitle-files.ts`), splitting a playlist into one download per video (`playlist-jobs.ts`), and downloading later: the clock rules (`download-window.ts`) and what they do to jobs (`later-jobs.ts`). |
| `src/server/services/preview/` | Choosing a playable preview stream and relaying it to the page. |
| `src/server/services/stores/` | Settings, history, the saved queue and subscriptions, stored as JSON in `data/`. |
| `src/server/services/subscriptions/` | Following channels and playlists (see [subscriptions.md](subscriptions.md)): the service that subscribes and checks on a schedule (`subscription-service.ts`), what a link subscribes to (`subscription-target.ts`), listing a channel's or playlist's videos (`listed-videos.ts`), deciding which are new and what to remember (`new-videos.ts`) and whether a new video can be downloaded yet (`video-availability.ts`). |
| `src/server/services/app-updates/` | New app versions: the start-up check (`app-update-check.ts`), the install state machine (`updater.ts`) and the app's instance of it (`app-updater.ts`), downloading and unpacking a release (`app-update-files.ts`, `release-package.ts`) and swapping the files (`file-swap.ts`). |
| `src/server/lib/` | Building blocks with no app knowledge: HTTP router, JSON helpers and fetching text from the web (`http/download-text.ts`), static files, JSON files, zip and tar (with the shared path check and file writing in `archive/archive-folder.ts`), checksums, GitHub releases, verified downloads, the desktop shell (open a link, show a file) and whether a file exists (`existing-file.ts`), stopping a process tree, removing a folder that Windows still holds for a moment (`remove-folder.ts`), saving at most every so often (`throttled-save.ts`), and `ignoreFailure` for promises whose failure doesn't matter. |
| `src/desktop/` | The Electron main process: `main.ts` starts it; the window, saved window position, mini mode (`mini-window.ts`), the right-click menu (`context-menu.ts`), taskbar progress, notifications, quit confirmation and start-up switches each have their own file. `download-watcher.ts` checks the queue once a second and hands the running and newly finished downloads to the taskbar progress and the notifications. `app-updates.ts` lets the updater restart the app into a new version, and `shut-down.ts` is the shutdown step that quitting and restarting share: stop the server and pause the downloads. `preload.ts` exposes `window.desktop` to the page: the native folder picker, entering and leaving mini mode, and the system locale (passed in by `system-locale.ts`) for formatting dates. |
| `src/client/` | The page. `main.ts` starts every part; `link-input.ts` and `drag-and-drop.ts` take links, searches and drops; `components/` holds the media panel, choice controls, search results, batch panel, downloads list, settings (`settings/`: the dialog, the "Later" times and saving one setting), setup, and the new-version notice (`update-notice/`: the polling and buttons, what the banner says, and remembering **Not now**), `icons/` holds the page's icons, one file each, as inline SVG (`chevron-icon.ts`); and `button-action.ts`, which runs a button's request with a busy label, the tools check and the error message. |
| `src/client/styles/` | The stylesheet in parts, imported in order by `index.css` and bundled into one `styles.css`. |
| `scripts/` | Build, packaging and icon generation (see [releasing.md](releasing.md) and [development.md](development.md)). |

## Files at run time

Everything the app creates lives next to it, so deleting the folder removes the app completely:

| Folder | Contents |
|---|---|
| `tools/` | `yt-dlp/` (the folder build), `yt-dlp-plugins/` (the app's thumbnail plugin, see [Tools and updates](tools-and-updates.md#the-thumbnail-plugin)), `ffmpeg/ffmpeg`, `ffmpeg/ffprobe`, and `deno` for the single-executable server. |
| `data/` | `settings.json`, `history.json`, `queue.json` (downloads that haven't finished), `subscriptions.json` (followed channels and playlists, with the videos already seen), `window.json` (window size and position) and `window/` (the desktop window's browser data). |
| `downloads/` | The default download folder; changeable in Settings. |

When running from source, the project root plays this role (these folders are git-ignored).

## The page

The page is plain TypeScript with no framework, bundled by esbuild:

- **Media panel:** one click and one change listener handle every option. A choice redraws only the options area, not the header and thumbnail. A link response that arrives after a newer one was requested is ignored.
- **Closing panels:** the search results and the media panel have a **✕** in their top bar (`panelBarHtml` in `panels.ts`). `close-panels.ts` closes the open panel on that button and on <kbd>Esc</kbd>, unless a dialog is open, an IME composition is ending, or the cursor is in a text field other than the link box. Clearing the link box closes it too, except for the several-links panel, which empties the box on purpose. Whenever `showPanel` hides a panel, it pauses that panel's preview player and runs the panel's `whenPanelHidden` handler, which cancels its search or link still loading. So a result arriving late can never replace the panel that is on screen, whichever way the user moved on.
- **Downloads list:** polls `GET /api/downloads` every 0.7 s while something is active and every 4 s otherwise. Rows are keyed by job id and rebuilt only when their layout changes (finished, failed, cancelled). The title, status text and progress bar update in place, so buttons stay put and clicks are never lost.
- **Settings:** in the desktop app, **Browse…** opens the native folder picker through `window.desktop.pickFolder`.
- **Dates:** follow the system's format settings. The desktop window turns `app.getSystemLocale()` into a language tag (`de_DE.UTF-8` becomes `de-DE`; `C` and `POSIX` give none) and passes it to the preload, which exposes it as `window.desktop.systemLocale`. `src/client/locale.ts` checks it once and builds one shared date format. In the browser the browser's own locale is used.

## Smooth rendering

Measured on a 180 Hz display with a second monitor and a game running, three things made the window feel slow. Each is now avoided.

1. **Animating the progress bar.** Any continuous animation, including a cheap `transform` transition, kept the window producing frames, and with the graphics card busy those frames stalled. Scrolling during a download dropped 11–20 frames beyond 33 ms per few seconds; without the animation, none. The bar is set with `transform: scaleX()` (no page layout) and jumps to each new value without a transition.
2. **DirectComposition on Windows.** It added 25–30 ms before every frame reached the screen, so a click took 40–48 ms to show; without it, one frame (16 ms or less). The desktop app starts Chromium with `--disable-direct-composition` unless **Settings → Faster screen updates** is turned off. The setting is read from `settings.json` before the app is ready, because graphics switches only apply at start-up.
3. **Taskbar progress.** Every update makes Windows redraw the taskbar, so it is only sent when the percentage changes.

To measure again, start the app with `--remote-debugging-port=9333` and record frame gaps with `requestAnimationFrame`, or event timing (`PerformanceObserver` with `type: 'event'`) for clicks. Compare with and without a change in the same session, because the graphics load of other programs changes the absolute numbers.

## Platform and format details

Facts the code depends on that its names can't say:

- **Window cache.** Chromium keeps its web cache (mostly thumbnails) in `data/window`; `--disk-cache-size` caps it at 10 MB (`start-up-switches.ts`), where it otherwise grew to 17 MB and more.
- **Fixed desktop port.** The desktop app prefers port 5199 because the page's saved choices live in browser storage, which belongs to one address. Only if 5199 is taken does it use another free port.
- **Remembered choices.** Format, container, options and the subtitle language are remembered in the page's storage; the resolution is not, because it depends on each video. In private windows, where storage is unavailable, nothing is remembered.
- **Resolution means the short side.** A vertical 1080×1920 video counts as 1080p, and yt-dlp's `res` sort key compares the short side too, so vertical videos are picked like horizontal ones.
- **Subtitles in the video's own languages.** The media panel offers the languages the uploader provided (`subtitles` in yt-dlp's read) plus the spoken language YouTube recognised itself, marked "auto-generated", unless a track in that language was uploaded (`subtitle-tracks.ts`). YouTube lists the spoken one in `automatic_captions` as `<code>-orig`. The other 150-odd `automatic_captions` languages are YouTube's machine translations, which are poor, and fetching them got the whole download refused with HTTP 429. So yt-dlp is only ever asked for one kind of track (`subtitleMatch`): an uploaded one by its exact code (`exact`: `--write-subs --sub-langs de`) or the spoken language (`spoken`: `--write-auto-subs --sub-langs ja-orig`). `subtitleChoiceFor` turns a track into one of those, for the panel and the server alike. `--write-subs` is needed even with `--embed-subs`: once `--write-auto-subs` is given, yt-dlp no longer turns it on by itself and considers only the automatic tracks, so the old `--sub-langs en --write-auto-subs` embedded YouTube's machine-translated English even where English was uploaded. `--sub-langs` reads each code as a regular expression and `all` as every language, so only plain codes of letters, digits, `-` and `_` are accepted (`isSubtitleLanguage`), on both sides. The chosen language is remembered; another video gets it, or the plain language (`pt` for `pt-BR`), or another region of it (`en-US` for `en`), or none (`matchingSubtitleTrack`). Another script is another language: `zh-Hans` never gets `zh-Hant`, nor `sr-Latn` `sr-Cyrl`. The script comes from `Intl.Locale(...).maximize()` (`languageWithScript`), because YouTube often gives it only by region or not at all: `zh-CN` and `zh` are Simplified, `zh-TW` and `zh-HK` Traditional, `sr` is Cyrillic. A plain code of the same language and script comes before a regional one (`pt` before `pt-PT` for `pt-BR`). A code `Intl.Locale` can't read is compared by its first part only. A request with `subtitles: true` and no `subtitleLanguage`, as earlier versions saved them, means English (`savedSubtitleLanguage`).
- **Subtitles for downloads without a panel.** Playlists, several links and subscriptions send only the remembered language (`language`). Their panels can't know which languages the videos have, so their **Subtitles (when a video has them)** list offers common languages plus the remembered one, and None. In one yt-dlp run, the code `en` can't tell a video's own captions from a machine translation into English, so the job picks the track itself (`subtitle-track-choice.ts`): it reads the video with `-J` (no extra request to YouTube, since yt-dlp then downloads from that read with `--load-info-json` instead of reading the link), picks the track with the panel's rule, and downloads with `exact` or `spoken`, or without subtitles when the video has neither. Pause or Cancel stops the read. When the read fails, the download fails with its error, which is the error yt-dlp would give too, without asking YouTube a second time while it may be refusing. A live stream's read isn't used (it isn't downloaded from a saved read), and a whole playlist downloaded as one job (nested playlists, entries without a link, queues saved by earlier versions) has no read per video: these ask yt-dlp for the uploaded track with exactly the remembered code (`--write-subs --sub-langs en-US`), at most one track and never a translation. They miss the spoken language and other regions, because in one run `en` can't be told apart from a translation into English.
- **Subtitles in the video or as a file.** Next to the language, **Save as** chooses **In the video** (the default, `subtitleFormat: embedded`) or **As a .srt file** (`srt`), remembered like the other choices. Embedded: `--embed-subs --compat-options no-keep-subs`. yt-dlp deletes the subtitle file after embedding it only when it turned on `--write-subs` by itself, which it no longer does once `--write-subs` is given, so without `no-keep-subs` an uploaded track left a stray `.vtt` next to the video. As a file: `--convert-subs srt`, without `--embed-subs`, so the video has no track and `Title.en.srt` is saved next to it (yt-dlp moves it out of the partial folder with the video). WebM can't hold subtitles, but it can have a `.srt` file. The spoken language's file would be called `Title.ja-orig.srt`, which players don't recognise as Japanese, so a finished download renames it to `Title.ja.srt` (`nameSpokenSubtitleFiles`), unless that name is taken. Requesting plain `ja` instead isn't the same track: in YouTube's list only `ja-orig` points at the captions themselves. Embedded, the spoken track is tagged as Japanese either way.
- **No subtitles for clips.** yt-dlp cuts the picture and sound for `--download-sections` but not the subtitles: a 10-second clip got the whole video's subtitles, so it showed the wrong lines and its file reported the whole video's length. The panel turns the list off while **Download only part** is on, and `normalizeDownloadRequest` drops the language for clips.
- **Failed subtitles don't fail the download.** YouTube rate-limits subtitle requests sooner than videos, also for a video's own track, and yt-dlp treats a subtitle it can't fetch as an error that ends the download. yt-dlp fetches subtitles before the video, so nothing is lost yet: when the last error is "Unable to download video subtitles" (`isSubtitlesFailure`, whatever the cause: 429, 403, 404), `download-process.ts` rejects with a `SubtitlesFailedError` whose message is the reason worded for subtitles (`subtitlesFailureReason`: "YouTube refused them for now. Download it again later to add them." for a rate limit, the bare error otherwise). The job runner then downloads once more without them, reusing the saved read when there is one, and the finished download says "Saved without Serbian subtitles: <reason>", naming the language; the job's `subtitleLanguage` is cleared. It skips the usual step of reading the video again for a saved read: that is one more request to YouTube while it is refusing, and if that read were refused too, the whole download would fail. Stale subtitle links aren't a reason to read again: measured, they stay valid for 7 hours (video links for 6), and a saved read is kept for 30 minutes. A whole playlist downloaded as one job (the fallback for sub-playlists) needs nothing extra: yt-dlp's default `--no-abort-on-error` goes on with the next video and the failed one is listed as skipped. `--ignore-errors` would also turn a failed subtitle into a warning, but the app runs with `--no-warnings`, so the missing subtitles would go unnoticed.
- **Marker lines.** In `VITEM` lines the title comes last, because a title may contain the `|` separator.
- **Tag values.** The always-empty `%(id&|)s` around an edited tag also keeps a trailing `\` in the value away from the `:` separator.
- **Not blocking the main process.** In the desktop app the server runs in Electron's main process, so it avoids long synchronous work: zip entries are unpacked with zlib's async `inflateRaw`. Measured on yt-dlp's 18 MB zip, the longest pause of the event loop while unpacking is about 10 ms either way, since the writes already gave way between files; the async version matters most for a single large file such as Deno's. `taskkill` stays synchronous on purpose: when it returns, ffmpeg and every other child are gone, so a cancelled job's partial files can be deleted and a Retry can't start while an old ffmpeg still writes the same file.
- **Stopping downloads.** On Linux and macOS yt-dlp runs in its own process group, so cancelling also stops the ffmpeg it started. On Windows, `taskkill /T` stops the tree. Removing a partial folder retries a few times, because Windows keeps a stopped process's files locked for a moment.
- **Showing a file on Windows.** Explorer only accepts `/select,"path"` passed verbatim, and `windowsHide` would open its window invisibly, so neither option is used for it.
- **Square album art from JPG thumbnails.** In downloads, the square crop runs inside yt-dlp's thumbnail converter, which yt-dlp skips when the thumbnail is already a JPG. Those (SoundCloud, Bandcamp) are usually square already, so the MP3 keeps the picture as it is. **Save square** crops with ffmpeg itself, so it always comes out square.
- **Release folders.** They already contain Electron's own `LICENSE`, so the app's license is named `YT-Downloader-LICENSE.txt`.

## Compatibility with older data

`parseSettings` and `parseHistory` validate stored JSON and also accept the key names used by earlier versions (`outDir`, `concurrent`, `thumbnail`, `size`). An old single-file `tools/yt-dlp(.exe)` is replaced by the folder build on the next setup.
