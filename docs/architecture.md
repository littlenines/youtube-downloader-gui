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
| `src/shared/types/` | The API contract: every type that crosses between server, desktop and page, in `media.ts` (link info, qualities, playlists, search), `downloads.ts` (requests, options, jobs, history) and `app.ts` (settings, setup, status, updates). |
| `src/shared/` | Pure helpers both sides use: tag suggestions (`tags.ts`), finding links (`links.ts`), whether a job is active (`jobs.ts`), resolution labels such as 4K (`resolution.ts`). |
| `src/server/config.ts` | Where things live (next to the executable when packaged, the project root otherwise), the port and the host. |
| `src/server/index.ts` | Browser/headless entry point. |
| `src/server/server.ts` | Start-up shared by both front ends: creates the services and listens. |
| `src/server/app.ts` | The HTTP server: request checks, API router, static page. |
| `src/server/security/` | The cross-site and DNS-rebinding check (`request-guard.ts`), the access cookie and access link (`access-cookie.ts`), and the stored access key (`access-key-file.ts`). |
| `src/server/routes/` | The REST endpoints, one file per area: settings and setup, media (link info, search, preview), downloads. See [http-api.md](http-api.md). |
| `src/server/services/tools/` | Installing and updating the tools: paths (`tool-paths.ts`), release files and pinned checksums (`release-assets.ts`), one install step per tool (`install-steps.ts`), the setup state machine (`tool-setup.ts`) and the app's instance of it (`app-tool-setup.ts`). |
| `src/server/services/ytdlp/` | Everything that talks to yt-dlp: shared arguments, reading a link (`media-info.ts`, `video-qualities.ts`), search, readable error messages, download arguments and audio presets, running a download and reading its output lines (`download-process.ts`, `download-events.ts`), and the shapes of its JSON output (`ytdlp-json.ts`). |
| `src/server/services/downloads/` | The download queue (`download-queue.ts`), which decides what runs, with its parts: running one download (`job-runner.ts`), the runs in progress and how they were stopped (`active-runs.ts`), the folder each job started in (`job-folders.ts`), converting to and from `queue.json` (`saved-jobs.ts`) and the real yt-dlp engine (`download-engine.ts`). Also validating requests (`download-options.ts`), creating and resetting jobs (`jobs.ts`), turning yt-dlp events into job progress (`job-progress.ts`) and partial folders (`partial-folders.ts`). |
| `src/server/services/preview/` | Choosing a playable preview stream and relaying it to the page. |
| `src/server/services/stores/` | Settings, history, the saved queue and subscriptions, stored as JSON in `data/`. |
| `src/server/services/subscriptions/` | Following channels and playlists (see *Subscriptions*): the service that subscribes and checks on a schedule (`subscription-service.ts`), what a link subscribes to (`subscription-target.ts`), listing a channel's or playlist's videos (`listed-videos.ts`), deciding which are new and what to remember (`new-videos.ts`) and whether a new video can be downloaded yet (`video-availability.ts`). |
| `src/server/lib/` | Building blocks with no app knowledge: HTTP router, JSON helpers and fetching text from the web (`http/download-text.ts`), static files, JSON files, zip and tar, checksums, GitHub releases, verified downloads, the desktop shell (open a link, show a file) and stopping a process tree. |
| `src/desktop/` | The Electron main process: `main.ts` starts it; the window, saved window position, taskbar progress, quit confirmation and start-up switches each have their own file. `preload.ts` exposes `window.desktop` to the page: the native folder picker, and the system locale (passed in by `system-locale.ts`) for formatting dates. |
| `src/client/` | The page. `main.ts` starts every part; `link-input.ts` and `drag-and-drop.ts` take links, searches and drops; `components/` holds the media panel, choice controls, search results, batch panel, downloads list, settings and setup. |
| `src/client/styles/` | The stylesheet in parts, imported in order by `index.css` and bundled into one `styles.css`. |
| `scripts/` | Build, packaging and icon generation (see [development.md](development.md)). |

## Files at run time

Everything the app creates lives next to it, so deleting the folder removes the app completely:

| Folder | Contents |
|---|---|
| `tools/` | `yt-dlp/` (the folder build), `ffmpeg/ffmpeg`, `ffmpeg/ffprobe`, and `deno` for the single-executable server. |
| `data/` | `settings.json`, `history.json`, `queue.json` (downloads that haven't finished), `subscriptions.json` (followed channels and playlists, with the videos already seen), `window.json` (window size and position) and `window/` (the desktop window's browser data). |
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

**Pausing and resuming.** **Pause** stops a download's yt-dlp process but keeps its partial folder, and the job becomes `paused`, which frees its slot. **Resume** queues it again: yt-dlp continues the `.part` files in the same partial folder instead of starting over (measured: a 4K download paused at 7% resumed at 7%). A clip is the exception, because its ffmpeg cut can't continue and starts again. A job remembers the download folder it started in, so changing the folder in Settings while it is paused doesn't lose its partial files. Partial files are deleted when a job is finished (done, failed or cancelled), or when its run was cancelled even if Retry was clicked before the process exited, so a retry always starts fresh. Pausing then resuming while the old process is still exiting keeps them. If yt-dlp finishes on its own just as Pause is clicked, the job counts as done. A process the app stopped is never mistaken for success, not even a playlist that had already saved files. Paused downloads can't be removed from the list; cancel them first.

**Keeping the queue across restarts.** Every time the list of unfinished downloads (waiting, running or paused) changes, it is saved to `data/queue.json`, together with whether each one was paused and the folder it started in. So a crash, a closed console window or a power cut loses nothing. Quitting the app pauses running downloads, keeping their partial files, and the quit question says they'll continue where they stopped. At start-up, downloads that were running come back and continue; downloads the user paused stay paused. Saved downloads are restored before the server answers any request, so they keep their order and nothing added in the meantime can overwrite them. The start-up cleanup of old partial folders runs alongside and skips the folders of saved downloads, however long they have been paused. A job's folder is saved as soon as it starts, and quitting waits for the final save of `queue.json`. Finished downloads go to the history as before; failed and cancelled ones are not kept.

**Trimming a clip.** For a single video (not a live stream), the media panel can download only part of it. Times are typed as `1:23`, `1:02:03` or seconds, or taken from where the preview is paused. yt-dlp gets `--download-sections "*<start>-<end>"`; for video also `--force-keyframes-at-cuts`, which re-encodes around the cuts so the clip starts on the exact frame rather than the nearest keyframe (measured: a 10-second 1080p clip is exactly 10.000 s and takes about 10 s to make). The file name ends with the range, start rounded down and end rounded up (`Title (1m23s-4m57s).mp3`). yt-dlp reports progress for a section only once it is done, so the job shows "Downloading the clip" until then. It also reports the finished file twice when cutting, so a job ignores a file it already has.

**Picking videos from a playlist.** A playlist opens with every video ticked in a checklist (the first 500 are listed). The page sends the ticked positions as `playlistItems`, and yt-dlp gets them as `--playlist-items`, with runs written as ranges (`1-3,7,9-12`). With every listed video ticked, the page sends `null` instead, so a playlist longer than 500 still downloads completely. Positions count unavailable videos too, because yt-dlp's numbering does; the files keep their playlist number (`004 - Title`).

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
- **Reading a link:** runs `yt-dlp -J --flat-playlist` with `--no-playlist` (or `--yes-playlist` for **Open the playlist**). `--flat-playlist` lists a playlist's entries without reading each video, so a 180-video playlist opens in about two seconds instead of timing out; it has no effect on a single video. Some sites list fewer details this way (SoundCloud lists titles but no lengths), so the playlist picker may show no durations for them. A YouTube channel link (`/@name`, `/channel/…`, `/c/…`, `/user/…`, with or without one tab segment like `/videos` or `/shorts`) also gets `--playlist-items 1`, because only the channel's name and picture are needed. Whether a link is a channel is decided from the link alone (`isYoutubeChannelLink`), for both the arguments and the panel, so an album or other playlist page that yt-dlp also tags with its owner's channel stays a playlist: the media panel shows it as a channel, with **Subscribe** as its action instead of a video list and **Download**.
- **Search:** runs `yt-dlp -J --flat-playlist "ytsearch30:<query>"`. A flat search lists results without reading each video, so it answers in about two seconds (12 results take about 1.5). Choosing a result opens it in the media panel, which then offers **Back to results**.
- **Searching playlists:** with **📃 Playlists** chosen, the search reads YouTube's own results page with its "Playlists" filter (`https://www.youtube.com/results?search_query=…&sp=EgIQAw%3D%3D`) instead of `ytsearch30:`, with `--playlist-items 1:30` so yt-dlp stops after 30. That's how to find full albums. A playlist result (or any result whose link has `list=`) opens with `playlist: true`, straight into the playlist picker. Flat playlist results have no length, view count or verified flag, so the video filters are hidden for them; a playlist by an artist's Topic channel (an official album) still gets the ✓.
- **Search filters:** chips above the results (`search-filters.ts`), also shown when a search fails, so the other kind is one click away and clicking the chosen one tries again. **🎬 Videos** / **📃 Playlists** searches the same words again. It applies to that search only: a search typed in the link box always looks for videos, so a playlist search for one album doesn't quietly change every later search. The others only redraw the list, keeping the focus on the chip (unless the focus has moved elsewhere, such as into the link box, while a search was loading), since every result already has what they need; that's why the search asks for 30 results, so a filter still leaves enough to choose from:
  - **Length:** **Any length**, **Under 4 min**, **4–20 min**, **Over 20 min**. Results without a duration (live streams) show only under **Any length**.
  - **✓ Verified only:** channels YouTube has verified (`channel_is_verified`), and artists' auto-generated "Name - Topic" channels. Those results also get a ✓ after the channel name. It's named "verified", not "official", because YouTube verifies any large channel, such as movie-clip channels, not only artists.

  The page remembers the length and **Verified only** in `localStorage`. Because a remembered filter can hide results from a new search, the list says "13 of 30 shown" with **Show all** whenever a filter hides something, and the "no results" message has **Show all** too.

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

### Saving the cover

**🖼 Save cover** and **Save square** under a video's title save its thumbnail as a JPG in the download folder (`POST /api/covers`, `cover-image.ts`), without downloading the video:

1. **yt-dlp saves the thumbnail** into a work folder inside the hidden partial folder (`.yt-downloader-partial/cover-<id>/`), with `--skip-download --no-playlist --write-thumbnail --convert-thumbnails jpg` and ffmpeg at the best JPG quality. It picks the largest thumbnail (on YouTube usually 1280×720, `maxresdefault`), and converts YouTube's WebP, which some photo viewers and music taggers can't open. It prints the file's path (`%(thumbnails.-1.filepath)s` at the `after_video` stage); there's no `-P temp:`, because with one that path would point at the file before it was moved.
2. **Square:** the app crops it with ffmpeg itself (`crop=min(iw\,ih):min(iw\,ih)`, the middle square). Not through yt-dlp's converter, because yt-dlp skips that when the thumbnail is already a JPG (SoundCloud, many other sites), and the crop with it. Taking the shorter side keeps it working for pictures taller than wide, where the older `crop=ih:ih` failed. ffmpeg is stopped after 30 seconds, so a stuck crop can't leave the button on "Saving…".
3. **Copied into the download folder** as `<title>.jpg` or `<title> (square).jpg`, with the title made safe for file names by yt-dlp. A name that is taken gets a number, `<title> (2).jpg`, so nothing is ever overwritten, not even a different video's cover with the same title. The copy uses `COPYFILE_EXCL`, so two saves at once can't pick the same name.
4. **The work folder is removed** whether the save worked, failed or was cancelled, so no stray WebP or half-written JPG is left in the download folder. After a crash, the start-up cleanup of old partial folders removes it.

- **In the downloads list:** the saved picture becomes a history entry labelled **Cover · JPG** or **Square cover · JPG**, so **Show in folder** and ✕ work as for any finished download, without a route that reveals any path the page sends.

### Preview

When a link is read, `registerPreview` picks a stream the page can play directly:

- **First choice:** a single stream with picture and sound, up to 720p (on YouTube, format 18 at 360p).
- **Otherwise:** a stereo audio stream, preferring M4A.

It remembers the stream's address and request headers under a random token for an hour. The page's `<video>` or `<audio>` element plays `/api/preview/<token>`, which relays the stream and passes the `Range` header through, so seeking works.

YouTube refuses a freshly issued stream address (HTTP 403) for a few seconds. The relay retries refusals for up to about ten seconds, which is why a preview typically starts two to three seconds after clicking ▶.

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

## Subscriptions

A channel or playlist can be followed, so its new videos download automatically with the choices made when subscribing.

- **Managing:** the **🔔 Subscriptions** button in the header shows how many there are and opens the list, with **Check now** and ✕ to unsubscribe.
- **Subscribing:** the media panel for a channel or playlist has **Subscribe**, which sends the current choices (and, for channels, **Skip Shorts**) to `POST /api/subscriptions`. The server reads the link with `yt-dlp -J --flat-playlist --playlist-items 1`:
  - A YouTube channel, in any link form, becomes `https://www.youtube.com/channel/<id>`. From the Shorts tab (`/@name/shorts`) it follows only Shorts; from anywhere else, **Skip Shorts** decides. The whole channel and its Shorts can be followed separately.
  - Anything else that yt-dlp reads as a playlist becomes that playlist, on any site.
  - A single video is refused.
  - Everything listed at that moment is marked as seen, so subscribing never downloads the back catalogue. Subscribing to the same channel or playlist twice is refused, checked again after listing so two requests at once can't both succeed.
- **Where files go:** each subscription's downloads go into a folder named after the channel or playlist inside the download folder. `DownloadOptions.folder` carries the name; it is reduced to one safe folder name (no path separators, no `..`, no Windows device names) and its `%` signs are escaped for yt-dlp's output template.
- **Listing new videos:**
  - **Channels** use YouTube's feed (`/feeds/videos.xml?channel_id=…`). It lists the latest 15 uploads, newest first, needs no tools and answers in a fraction of a second. Shorts are recognized by their `/shorts/` link. A channel only counts videos published at or after the newest upload it had when subscribing. That date comes from YouTube, not the computer's clock, so a wrong clock can't hide new uploads, and a video that drops out of the remembered list can't come back as new.
  - **Playlists** use `yt-dlp -J --flat-playlist`, because a playlist's feed lists its *first* 15 items, not the newest, and items added to the end of a long playlist would never appear.
- **Before downloading** a new video, the app reads it once (`yt-dlp -J --no-playlist`):
  - **Ready:** it goes into the normal download queue, so pause, resume, retry and history work as for any download.
  - **Premieres, live streams and just-ended streams** (`live_status` upcoming, live or post-live, or the matching errors) are not marked as seen. They are checked again next time and download once they're over. After 14 days of waiting (for example a 24/7 live stream), they are skipped.
  - **Private, members-only, age-restricted or removed** videos are marked as seen and skipped.
  - **Any other failure** is retried at the next checks, up to six times, then skipped. Temporary refusals (rate limiting, timeouts, and YouTube's "Video unavailable … try again later") always count as this kind, never as a removed video; `error-messages.ts` gives that refusal its own message so the "try again" isn't lost.
- **Remembering:** `data/subscriptions.json` keeps the IDs of seen videos. For channels, the most recent 200. For playlists, up to 5,000, with the ones still in the playlist kept first. A video missing from one listing is not forgotten, because yt-dlp can return a cut-off playlist without an error, and forgetting would make every old video look new.
- **When:** checks run only while the app (or the browser-mode server) is open: 5 seconds after start-up, and then, if chosen in Settings (**Check subscriptions for new videos**), every 1, 2, 3, 6, 12 or 24 hours. The default is **Only when the app starts**, so an app left open never checks again until it is restarted. Changing the setting moves the next check to that long after the last one, or runs it at once if that time has passed; switching to **Only when the app starts** cancels the next check. **Check now** starts one at any time. Only one check runs at a time. With no subscriptions a check does nothing at all, and nothing is checked while the tools are missing. A failed check shows its message on the subscription and is cleared by the next good one. After a check with a failure, one more check runs 10 minutes later (or at the interval, if that is sooner), so a connection that wasn't up yet at start-up doesn't cost the whole session. If saving `subscriptions.json` fails, the check carries on with the other subscriptions and the state is saved after the next one.
- **Unsubscribing** (✕) stops future checks. Files already downloaded stay, and a check that is running stops queuing videos for it.

## New app versions

The app doesn't update itself, but it tells the user when a newer release exists:

- **Its own version** comes from `package.json`, baked into every Node bundle at build time (`__APP_VERSION__` in `scripts/build.ts`). Running from source, it reads `package.json` directly. If neither works the version is `unknown`, and no update is offered rather than a false one.
- **The check** runs once, when the app starts: it asks GitHub for `littlenines/youtube-downloader-gui/releases/latest`, using the same redirect as the tools setup, so there is no API rate limit. Only full versions like `v1.2.3` count; anything else is ignored. A failed check is written to the console and means no notice this run.
- **The page** asks `GET /api/app-update` once when it opens; the request waits for the start-up check, so a slow connection can't make the notice go missing.
- **The notice** is a banner under the link box: "Version 1.1.0 is available (you have 1.0.0)", with **Download**, which opens the release page in the browser, and **Not now**, which hides it until a newer version than the dismissed one appears.

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
- **Square album art from JPG thumbnails.** In downloads, the square crop runs inside yt-dlp's thumbnail converter, which yt-dlp skips when the thumbnail is already a JPG. Those (SoundCloud, Bandcamp) are usually square already, so the MP3 keeps the picture as it is. **Save square** crops with ffmpeg itself, so it always comes out square.
- **Release folders.** They already contain Electron's own `LICENSE`, so the app's license is named `YT-Downloader-LICENSE.txt`.

## Compatibility with older data

`parseSettings` and `parseHistory` validate stored JSON and also accept the key names used by earlier versions (`outDir`, `concurrent`, `thumbnail`, `size`). An old single-file `tools/yt-dlp(.exe)` is replaced by the folder build on the next setup.
