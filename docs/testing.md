# Tests

Tests live in `test/` and cover:

| File | Covers |
|---|---|
| `download-options.test.ts` | Validating download requests (a subtitle language only as a plain code, never a pattern or `all`, and only for whole MP4 and MKV videos, or WebM with a `.srt` file; embedded unless a `.srt` file was asked for), playlist selections, and job labels. |
| `download-arguments.test.ts` | Choices → yt-dlp arguments: MP3 320, Opus original, cover art, video codec preferences, subtitles (a picked uploaded track exactly, the spoken language, the uploaded track with exactly that code when a track couldn't be picked, never translations; embedded without a leftover file, or a `.srt` file, also for WebM; English for `subtitles: true` from earlier versions), progress and file markers, playlists, the `--` safety rule. |
| `cover-image.test.ts` | Saving only the cover: the yt-dlp arguments, the square crop for wide and tall pictures, finding the saved file, numbered names that never overwrite a file, checking the request, and its history entry. |
| `cover-image-save.test.ts` | The whole cover save with fake tools: the work folder removed after success, failure or cancel, and the crop only for square. |
| `tag-and-clip-arguments.test.ts` | Edited tags and their escaping, and clip sections with their file names, cut at exact times for audio and video with the cut encoded at 320 kbps. |
| `clip-range.test.ts` | Reading and writing clip times. |
| `media-info.test.ts` | Parsing `yt-dlp -J` output: one row per resolution, vertical video, best audio, the subtitle languages (uploaded ones and the spoken one unless it was uploaded too, no machine translations, live chat or codes yt-dlp would read as a pattern), playlists and their positions. |
| `subtitle-languages.test.ts` | Language names in English (a code it can't name stays as it is), reading `subtitles: true` from earlier versions, picking the remembered subtitle language for a video, or the plain language, or another region of it, never another script, also when only the region or the plain code gives the script (`zh-CN`, `zh-TW`, `zh`, `sr`), and asking for an uploaded track exactly and an automatic one as the spoken language. |
| `subtitle-track-choice.test.ts` | Subtitles for a download without a panel: the job reads the video, picks one track the way the panel does and downloads from that read; the spoken language, or none; a failed read fails the download without a second request; for a live stream, the uploaded track with that code only, from the link; no read for a track picked in the panel, a playlist, a clip or no subtitles; Pause during the read. |
| `subtitle-files.test.ts` | The spoken language's `.srt` file is renamed from `Title.ja-orig.srt` to `Title.ja.srt`, but not over a file of that name, and other downloads' files are left alone. |
| `subtitle-options.test.ts` | What the panels' subtitle lists offer: off for WebM only when they would go in the video, off for a clip in the video panel only (so a clip left from another video never blocks a batch), the picked track, track names with the automatic one marked, and the common languages plus a remembered one. |
| `ytdlp-output.test.ts` | Readable error messages, the preview stream choice, and yt-dlp's progress and file lines. |
| `search-results.test.ts` | Search results (videos, playlists, verified channels) and what is searched for each kind. |
| `search-filters.test.ts` | Narrowing search results by length and to verified channels, the edges between lengths, results without a duration, playlists ignoring the video filters, reading the chips, and **Show all**. |
| `tags-and-links.test.ts` | Tag suggestions from video titles and channels, and finding links in pasted or dropped text. |
| `zip-archive.test.ts` | Reading and unpacking zip files, including file permissions, and refusing entries and symbolic links that escape the target folder. |
| `tar-archive.test.ts` | Writing and reading tar.gz files, and unpacking them with their permissions, refusing entries that escape the target folder. |
| `json-file.test.ts` | Validation on load, concurrent saves keeping the last value, and keeping a copy of a damaged file. |
| `stores.test.ts` | Defaults, reading settings and history saved by earlier versions (a playlist from before `isPlaylist` recognised by its label), and reading the saved queue safely. |
| `queue.test.ts` | The download queue with a fake download engine: cancel then retry while the old process is still exiting, failures, success, playlists that skip videos. |
| `queue-pause.test.ts` | Pausing and resuming in the same partial folder, cancelling a paused download, and a pause racing a finished download. |
| `playlist-split.test.ts` | A playlist split into one download per video: positions that count unavailable videos, page links over media links, the picked videos only, falling back to one job for entries that aren't video links, file names without numbers in a folder yt-dlp names, and songs (finished ones too) kept through a restart. |
| `queue-playlists.test.ts` | A playlist in the queue: finished songs saved until the playlist is done, one history entry for the playlist, and finished songs kept in the list while the playlist downloads. |
| `throttled-save.test.ts` | Saving the queue: the first change at once, then the latest one per 30 seconds, and at once when the app quits. |
| `playable-file.test.ts` | Which file Play opens: the one audio or video file of a download; nothing that isn't media (`.exe`, `.mp3.bat`, a cover image, a name without a dot); only finished downloads, never a playlist (also one where a single video finished); and `playFile`'s answers for no file, a missing file, a folder and a file no app can open. |
| `context-menu.test.ts` | The right-click menu: the editing menu in a text field (Undo, Redo, Cut, Copy, Paste, Select all) with unavailable items greyed out, Copy for selected text and Copy link for a link, and no menu elsewhere. |
| `taskbar-progress.test.ts` | The taskbar bar: a playlist counted as one download, and hidden when nothing downloads; sent again only when it changes, and again to a window that comes back after mini mode; the finish flash only on the unfocused main window, also a minimized one, stopped by focusing it, and none while the mini bar is shown. |
| `mini-status.test.ts` | What the mini bar shows: a download's progress, speed and time left; several downloads rotating, with their total speed, the longest time left and what waits; a playlist named once; a bar filled by what it names, not by waiting downloads; a moving bar and the step while converting, but not while a playlist's other song still downloads; and what's left, or how it went, when nothing downloads. |
| `download-group-rows.test.ts` | How the list shows a playlist: once, in playlist order, with its counts and bar, and only its first 100 videos until Show more or Show all. |
| `queue-pause-all.test.ts` | Pause all, which leaves waiting and finished downloads alone, Resume all, oldest first within the simultaneous limit, a Later download that keeps its times through both, the same for one playlist plus Cancel all, and saving nothing when there is nothing to do. |
| `download-window.test.ts` | The download window (across midnight, without a stop time, the same start and stop), the "Later" times in settings, and what the window does to jobs: starting due ones, stopping running ones at the stop time, moving a missed start time, and moving to new times. |
| `job-progress.test.ts` | What a download shows at each step: sizes, speed and time left while downloading, the per-format step and no old speed afterwards, picture then sound then merging, each playlist video, and short durations ("1m 5s"). |
| `video-info-reuse.test.ts` | `ExpiringMap`'s time limit and size, and reusing the media panel's read: `--load-info-json` instead of the link, writing the read into the partial folder, one fresh attempt from the start when it fails before downloading, none after the download started, the link when the read can't be written, no yt-dlp after a Pause during the write, and never for playlists. A clip keeps its stage when it reads the link again. |
| `refused-subtitles.test.ts` | Subtitles that fail: recognised only when they are the last error, with a named error and a reason worded for subtitles (a rate limit, or the bare error); the video downloads again without them, naming the language and saying why, reusing a saved read without asking YouTube again; any other error still fails. |
| `partial-cleanup.test.ts` | Deleting a job's partial folder doesn't hold up a finished download, even when it never finishes, but a failed one waits for it, so a quick Retry is safe. |
| `vimeo-links.test.ts` | Vimeo video pages are read through their player link, keeping an unlisted video's hash, in every yt-dlp call (`linkArguments`); other links are left alone, and the panel keeps the pasted link. |
| `download-notifications.test.ts` | The notification text (a download, a failure, a playlist with skipped videos, several at once, all failed, never more saved than downloaded), waiting for a quiet moment to show a batch as one notification, and reporting each finished or failed download once, again after a retry, never a cancelled one. |
| `queue-later.test.ts` | The queue with a fake clock: waiting until the start time, pausing at the stop time and continuing the next night in the same partial folder, Start now, changing or clearing the times, saving a setting just after the start time, saving and restoring a waiting download with how far it got, and the waiting count for the quit question. |
| `queue-saving.test.ts` | Saving unfinished downloads, restoring them, pausing on shutdown and waiting for the last save. |
| `subscription-subscribe.test.ts` | Subscribing without downloading the back catalogue, refusing the same channel twice (also when two requests arrive at once), following only Shorts from the Shorts tab, and never skipping Shorts for playlists. |
| `subscription-new-videos.test.ts` | New videos downloading with the subscription's choices and folder, skipped Shorts and restricted videos, waiting for premieres, giving up after repeated failures or two weeks of waiting, YouTube's dates instead of the computer's clock, and playlist listings that miss videos not causing downloads again. |
| `subscription-check-runs.test.ts` | Errors shown and cleared, saving failures, no work without subscriptions, missing tools, one check at a time, and unsubscribing mid-check. |
| `subscription-schedule.test.ts` | The schedule with fake timers: the start-up check, only at start-up by default, the interval, one retry after a failed check, and a new interval chosen during a check. |
| `subscription-sources.test.ts` | Reading YouTube channel feeds and flat playlists, and reading saved subscriptions. |
| `subscription-targets.test.ts` | What a link subscribes to, recognizing channel links and their tabs, and safe folder names in the output template. |
| `video-availability.test.ts` | Whether a new video can be downloaded yet: premieres, live streams, restricted videos and yt-dlp errors. |
| `partial-folders.test.ts` | Removing partial folders left by a crash, while keeping ones in use or belonging to saved downloads. |
| `request-guard.test.ts` | Refusing cross-site requests and DNS rebinding, allowing the app's own page, and telling a request from this computer from one over the network (for Play). |
| `listen.test.ts` | The test-server helper `listenForFetch` listens again when the system picks a port `fetch` refuses (`bad port`), such as 6000. |
| `access.test.ts` | The access key (cookie, access link, refusals), the Content-Security-Policy, and malformed addresses answering 400. |
| `verified-download.test.ts` | Checksum match and mismatch, stalled downloads, reading checksum files and release tags (against a local test server). |
| `readable-thumbnails.test.ts` | The thumbnail plugin, run by the real yt-dlp on a made-up info file (skipped when yt-dlp isn't installed): an AVIF thumbnail (any case) is skipped for the next best one, others are left alone, and an error inside it keeps the thumbnails instead of failing. Installing adds no arguments before the plugin exists and rewrites it only when it differs. |
| `tool-setup.test.ts` | The setup states with fake tools: missing, installing, ready, a tool lost later, failed installs, and the update-check schedule. |
| `app-update.test.ts` | Comparing app versions and offering a newer release. |
| `app-updater.test.ts` | Update now, its progress, clicking twice, and failed downloads and installs, with fake files (`support/updater-fakes.ts`). |
| `app-updater-automatic.test.ts` | Installing automatically: downloading in the background, installing on closing, staying idle without a new version, and turning it off again. |
| `app-update-files.test.ts` | Swapping the app files while keeping the user's folders, putting every file back when one can't be replaced, and finding the app in a release. |
| `release-notes.test.ts` | Finding a version's section in `CHANGELOG.md` and building the release notes from it. |
| `locale.test.ts` | Turning the system locale into a language tag, passing it to the page, and formatting dates with it. |

Shared fakes and helpers for these live in `test/support/`. A test that starts an HTTP server and calls it with `fetch` uses `listenForFetch` (`test/support/listen.ts`), not `listen(0)`: some machines hand out free ports from 1024 up instead of 49152 (this one: 1024 to 15000), and `fetch` refuses 20 ports in that range ("fetch failed: bad port"), which made such tests fail now and then.

Everything that needs yt-dlp, the network or a window is checked by running the app. A useful end-to-end pass:

1. Start with an empty `tools/` folder and check that the setup dialog appears and installs the tools.
2. Search for a song, preview it (play and seek), edit its tags and download it as MP3.
3. Paste or drop several links and download them all.
4. Download a 1080p MP4.
5. Cancel a 4K download halfway and confirm no `.part` files or yt-dlp/ffmpeg processes are left.
6. Close the window while downloading and confirm the quit question appears.
