# Changelog

Everything that changed in YT Downloader, newest first. Download any version from the [releases page](https://github.com/littlenines/youtube-downloader-gui/releases).

## Unreleased

### Added

- **Playlists list their videos.** A playlist now downloads as one download per video, shown under the playlist's name in the downloads list. Each video can be paused, cancelled or retried on its own, and the playlist's own **Pause**, **Resume** and **Cancel** act on all of its videos, with an arrow to fold its videos away. Videos download as many at once as Settings allows, instead of one by one. Songs are now saved by their name only, without a playlist number in front, still in a folder named after the playlist. You still get one notification and one history entry for the whole playlist. Long playlists start folded and show 100 videos at a time, so they stay quick on slower computers.

### Fixed

- **Vimeo videos download again.** Vimeo links failed with "The web client only works when logged-in". They now download without an account.
- **Audio clips start at the right time.** With **Download only part of it**, an audio clip could start several seconds before the start time (one set to 1:00 started at 0:50). It now starts exactly there, like video clips. Video clips also get better sound: 320 kbps instead of about 128.
- **Downloads from some sites no longer fail** with "Error opening output files: Invalid argument", and neither does Save cover. The cover uses another of the site's thumbnails.

## 1.3.0

### Added

- **Subscriptions.** Open a channel or playlist and click **Subscribe**: its new videos then download automatically, with the format you chose, into a folder named after it. Videos already there are skipped, Shorts can be skipped, and premieres and live streams wait until they can be downloaded. The app checks when it starts; in Settings it can also check every 1 to 24 hours while it's open. **Check now** checks at once. The **Subscriptions** button in the header lists them, each with a button to unsubscribe.
- **Search filters.** Chips above the search results:
  - **Playlists** searches for playlists instead of videos, the easy way to find and download a full album.
  - **Length:** only videos under 4 minutes for songs, 4 to 20, or over 20.
  - **Verified only** hides re-uploads and fan channels, keeping the artist's own and other channels YouTube has verified. Their results show a check mark.

  Searches now find 30 results instead of 12. The app remembers the length and Verified filters, and shows "13 of 30 shown · **Show all**" when they hide something.
- **Save the cover image.** **Save cover** under a video's title saves its thumbnail in full size as a JPG, and **Save square** crops it like album art. They go to the downloads folder and show in the downloads list.
- **Download later.** **Later** next to Download waits for the time you set in Settings, for example overnight. Optionally, unfinished downloads pause at a stop time and continue the next night where they stopped. Waiting downloads show when they start, and **Start now** starts one anyway. They survive closing the app.
- **Clearer download progress.** The list now says what a download is doing at every step: "Getting the video info…", "Converting to MP3…" or "Merging picture and sound…", with a moving bar while there's no percent to show. While downloading it shows the sizes ("41 of 246 MB") next to the percent, speed and time left, and a finished download shows how long it took.
- **Downloads start sooner.** A video opened in the app is no longer read a second time when you click Download: the download starts right away instead of after a few seconds of "Getting the video info".
- **Notifications when downloads finish.** With the app in the background, a system notification says when a download is done or failed, and clicking it brings the app back. A playlist gets one notification, not one per video, and downloads that finish one after another, like several links or new subscription videos, are summed up in one. Settings → **Notify me when downloads finish** turns it off.
- **Update in one click.** When a new version is out, **Update now** in the notice downloads it, checks it against the release's checksums, installs it and restarts the app. Settings, history, tools and downloads stay, and running downloads continue after the restart. If anything goes wrong, the current version keeps running. Settings → **Install updates automatically** downloads new versions in the background and installs them when you close the app. Windows and Linux.
- **Pause all and Resume all** above the downloads list, shown when two or more downloads can be paused or resumed. Pause all also holds queued downloads, and **Later** downloads running in their time, but downloads still waiting for their **Later** time keep waiting. **Later** downloads keep their times when resumed this way.

### Fixed

- **Playlist progress.** The bar no longer starts over for every video of a playlist, and picked videos are counted among themselves: "Video 2 of 2", not "Video 3 of 2" when videos 1 and 3 were picked.
- **Less space on disk.** The app keeps its own cache under 10 MB; it used to grow past 17 MB.
- **No more out-of-date speed while converting.** After the download, the list kept showing the last download speed during the conversion.
- **Playlist and channel links open in seconds.** Pasting a playlist or channel link used to read every video in it and gave up after two minutes. Channels now get their own panel with **Subscribe**.
- **Search results and the video panel can be closed.** A close button closes them, and so do <kbd>Esc</kbd> and clearing the link box. Closing also stops a search or link that is still loading.
- **No more jumping panels.** Searching while a link is still loading, or opening a link while a search is still loading, used to swap the screen back when the older one finished.
- **Square album art from tall thumbnails.** Cropping a thumbnail that is taller than wide failed with the old crop. It now takes the middle square of any shape.
- **The preview stops when you leave it.** Going back to the results or starting a new search used to leave the preview playing out of sight.
- **Linux: the app starts when another tool opens it.** Started by a VS Code extension or task, or by another app built on Electron, it used to close at once without opening a window.
- **Linux: the menu entry works from any folder.** `./yt-downloader --install` made a menu entry that did nothing when the app's folder had `%`, `$`, `"` or a backslash in its name. The entry is also listed only under Multimedia now, not under Internet too; run `--install` again to update an existing one.

## 1.2.0

### Added

- **Pause and resume.** Pause a download and continue it later from where it stopped, without starting over.
- **Downloads survive a restart.** Unfinished and paused downloads are still in the list when you open the app again. Quitting while something is downloading pauses it, and it continues the next time you start the app.

### Changed

- **Smaller download.** The Windows zip is about 22 MB smaller. The app no longer ships Chromium's 54 unused interface translations or the WebGPU shader compiler.
- **Dates follow your system settings.** The time a download finished now uses your computer's date and time format, for example `23/10/2026, 17:00:00` instead of `10/23/2026, 5:00:00 PM`.

## 1.1.0

### Added

- **Pick videos from a playlist.** Choose exactly which videos to download instead of the whole playlist, with **Select all** and **Select none**.
- **Download only part of a video.** Set a start and end time to save just a clip. While the preview is paused, **Use preview time** fills in the time where it stopped. The file name shows which part it is, for example `Song (1m05s-2m30s).mp3`.
- **New version notice.** When a newer version is out, the app says so once when it starts, with a link to download it. **Not now** hides the notice until the next version comes out.

### Changed

- Release pages are shorter: they no longer list every commit.

## 1.0.0

The first release.

- **Music:** MP3 320 kbps, original Opus, M4A, FLAC and WAV, with album art and tags.
- **Video:** every resolution the video has, up to 4K/8K and HDR, as MP4, MKV or WebM.
- **Finding things:** paste a link, search by typing, or drag and drop a link onto the window.
- **Several links at once:** paste a list of links and download them all with one click.
- **Preview** a video right in the app before downloading it.
- **Tags:** Artist and Title filled in from the video title, editable before downloading.
- **Cut out non-music parts** (intros, talking) using SponsorBlock data.
- **Playlists,** each saved in its own numbered folder.
- **One-time setup** that downloads yt-dlp and ffmpeg for you and checks them before use.
- **Taskbar progress** on Windows, and a warning before closing while downloads are running.
- **Browser mode** for servers without a screen, protected by an access key.
- **Checksums** (`SHA256SUMS.txt`) and build provenance with every release, so you can check that a file wasn't changed.
