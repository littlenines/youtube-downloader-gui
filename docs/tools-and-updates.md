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


**Why ffprobe stays.** It is 83 MB, but tested without it, yt-dlp can't cut out non-music parts ("Unable to determine video duration: ffprobe not found") or make MKV files ("ffprobe not found"). Every other format, clips, cover art and Save cover worked with ffmpeg alone.

### The thumbnail plugin

Some sites offer their best thumbnail as AVIF. yt-dlp converts a thumbnail with ffmpeg before using it as cover art (to JPG for audio, to PNG to embed in an MP4), and it always reads the thumbnail with `-f image2`. That reader doesn't know AVIF, so ffmpeg fails ("Decoding requested, but no decoder found for: none") and so does the download: "Preprocessing: Error opening output files: Invalid argument" for audio before it starts, "Postprocessing: …" for video after the whole video has downloaded, and the same for **Save cover**. ffmpeg itself reads AVIF; only the forced reader is the problem, and yt-dlp's latest code still forces it. No yt-dlp option picks a thumbnail by format, and the error doesn't say which step failed (`--print` keeps yt-dlp quiet), so the app can't retry without the cover either.

So the app gives yt-dlp a plugin, `ReadableThumbnailsPP` in `readable-thumbnails-plugin.ts`, which drops AVIF thumbnails before yt-dlp picks one. yt-dlp then uses the next best one, often a JPG, or none, which yt-dlp skips without an error. The plugin's Python is kept as a string in that file, because the tests run through `tsx`, which can't import a `.py` file, and the single executable can't ship a loose one.

- **Where:** setup checks it on every start (and every later setup run, such as the weekly yt-dlp update check) at `tools/yt-dlp-plugins/readable-thumbnails/yt_dlp_plugins/postprocessor/readable_thumbnails.py`. That's yt-dlp's plugin layout: `--plugin-dirs` takes the folder holding one package folder per plugin. It's kept outside `tools/yt-dlp/`, so reinstalling or updating yt-dlp never removes it.
- **Written only when it differs,** to a `.partial` file that is then renamed over it. Setup can run while yt-dlp is downloading, so yt-dlp never loads a half-written plugin. Writing it is best effort: if it fails (a read-only folder, a file held by an antivirus), setup still succeeds, and yt-dlp runs without the plugin, as before.
- **When:** downloads and **Save cover**, the two calls that write a thumbnail, get `--plugin-dirs tools/yt-dlp-plugins --use-postprocessor ReadableThumbnails:when=pre_process`, so it runs before yt-dlp writes one. It also runs for a download that reuses the panel's read (`--load-info-json`), since yt-dlp processes a loaded info file again. Reading links, searching and subscription checks don't load it: the media panel keeps showing the site's best thumbnail (browsers show AVIF fine), and if a future yt-dlp breaks the plugin, only downloads are affected. The arguments are added only if the file exists, because yt-dlp crashes when asked for a plugin it can't find.
- **It can't fail a download:** an error inside it (an unexpected thumbnail entry, a change inside yt-dlp) becomes a warning, "Keeping the thumbnails as they are", and yt-dlp goes on with the thumbnails unchanged.
- **Only AVIF is dropped,** whatever the case of its extension. A list of allowed formats instead would also drop the many thumbnails whose link has no extension, which convert fine today.
- **Other plugins:** `--plugin-dirs` adds this folder to yt-dlp's default plugin folders rather than replacing them, so plugins a user installed for yt-dlp still load, as before.

## New app versions

The app tells the user when a newer release exists, and the desktop release can install it itself.

### Finding a new version

- **Its own version** comes from `package.json`, baked into every Node bundle at build time (`__APP_VERSION__` in `scripts/build.ts`). Running from source, it reads `package.json` directly. If neither works the version is `unknown`, and no update is offered rather than a false one.
- **The check** runs once, when the app starts: it asks GitHub for `littlenines/youtube-downloader-gui/releases/latest`, using the same redirect as the tools setup, so there is no API rate limit. Only full versions like `v1.2.3` count; anything else is ignored. A failed check is written to the console and means no notice this run.
- **The page** asks `GET /api/app-update` once when it opens; the request waits for the start-up check, so a slow connection can't make the notice go missing.
- **The notice** is a banner under the link box: "Version 1.3.0 is available (you have 1.2.0)". **Not now** hides it until a newer version than the dismissed one appears. In the desktop release it offers **Update now** and **What's new** (the release page). Running from source, in browser mode or as the server edition, it offers **Download**, which opens the release page, as before.

### Update now

`AppUpdater` (`services/app-updates/updater.ts`) owns the state: `idle`, `downloading` (with progress), `ready`, `installing` or `error` (with the reason). Its file work is passed in, so `app-updater.test.ts` drives every state with fakes. Only the packaged desktop app on a system with a release file (Windows x64, Linux x64 and ARM64) enables it (`desktop/app-updates.ts`); everywhere else `canInstall` is `false`.

1. **Download and check.** `app-update-files.ts` downloads `SHA256SUMS.txt` and the release file (`yt-downloader-win-x64.zip` or `yt-downloader-linux-<arch>.tar.gz`) of the same tag into `.update/download/` in the app folder, through the same verified download as the tools. A file that doesn't match its checksum is never unpacked. Being in the app folder keeps every later move on the same disk, so it is a rename, not a copy.
2. **Unpack** with the app's own zip or tar reader, which also keeps the Linux executable bits. The app is the folder holding `yt-downloader.exe` (or `yt-downloader.bin`), which the archives put in one top folder.
3. **Swap the files** (`file-swap.ts`), one file at a time: the current file moves to `.update/previous/`, and the new one takes its place. Windows can't overwrite a running `.exe` or a loaded DLL, but it can rename them. It can't rename a *folder* with an open file inside (`locales/` holds the open `en-US.pak`), so whole folders are never moved. `data/`, `tools/`, `downloads/` and `.update/` are never touched, even if a release contained them, and files the new version doesn't have stay where they are.
4. **If any file can't be moved,** every file already moved goes back, the app keeps running on the current version, and the banner says why, with **Try again** (which downloads again). If a file can't even be put back, the message says how many and asks to download the app again. The swap happens before the downloads pause, so a failed swap interrupts nothing.
5. **Restart.** Running downloads are paused as when quitting, the window position is saved, and Electron's `app.relaunch` starts the new version once this one has exited. On Linux it starts the `yt-downloader` launcher script, not the `.bin`, so the sandbox check still runs. Paused downloads continue in the new version.
6. **Clean up.** The new version deletes `.update/` when it starts (retrying for a few seconds while the old process is still exiting), and waits for that before downloading another update.

Tested on Windows against the real v1.2.0 release: a 1.1.9 build updated itself with **Update now**, kept `data/` and `tools/`, and restarted as 1.2.0. With automatic updates, it downloaded v1.2.0 in the background and installed it when the window closed. While the app ran, every file could be renamed but the `locales` folder couldn't (`EPERM`), which is why the swap goes file by file.

### Install updates automatically

**Settings → Install updates automatically** (off by default, desktop release only) downloads a new version in the background after the start-up check, or as soon as the setting is turned on. It is installed when the app closes, after the downloads are paused, without restarting, so the next start is the new version. The banner then says "Version 1.3.0 is ready. It's installed when you close the app.", with **Restart now** to install it at once. Turned off again, nothing is installed on closing.

### What it doesn't protect against

The checksums come from the same release, so they catch a corrupted or swapped download, not a compromised release. The release files also carry a build attestation, which the app doesn't check.

**Linux `chrome-sandbox`.** If it was made setuid root by hand (`chown root` and `chmod 4755`), the update replaces it with the release's plain copy. The launcher then uses unprivileged user namespaces, or `--no-sandbox` where those are turned off. Run the two commands again after updating.

**Memory.** The release file is read and unpacked in memory, as for the tools: a few hundred MB for a moment, once per update.
