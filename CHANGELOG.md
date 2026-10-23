# Changelog

Everything that changed in YT Downloader, newest first. Download any version from the [releases page](https://github.com/littlenines/youtube-downloader-gui/releases).

## Unreleased

### Added

- **Subscriptions.** Open a channel or playlist and click **🔔 Subscribe**: its new videos then download automatically, with the format you chose, into a folder named after it. Videos already there are skipped, Shorts can be skipped, and premieres and live streams wait until they can be downloaded. The app checks when it starts; in Settings it can also check every 1 to 24 hours while it's open. **Check now** checks at once. The **🔔 Subscriptions** button in the header lists them, with ✕ to unsubscribe.
- **Search filters.** Chips above the search results:
  - **📃 Playlists** searches for playlists instead of videos, the easy way to find and download a full album.
  - **Length:** only videos under 4 minutes for songs, 4 to 20, or over 20.
  - **✓ Verified only** hides re-uploads and fan channels, keeping the artist's own and other channels YouTube has verified. Their results show a ✓.

  Searches now find 30 results instead of 12. The app remembers the length and Verified filters, and shows "13 of 30 shown · **Show all**" when they hide something.

### Fixed

- **Playlist and channel links open in seconds.** Pasting a playlist or channel link used to read every video in it and gave up after two minutes. Channels now get their own panel with **Subscribe**.
- **Search results and the video panel can be closed.** A **✕** button closes them, and so do <kbd>Esc</kbd> and clearing the link box. Closing also stops a search or link that is still loading.
- **No more jumping panels.** Searching while a link is still loading, or opening a link while a search is still loading, used to swap the screen back when the older one finished.
- **The preview stops when you leave it.** Going back to the results or starting a new search used to leave the preview playing out of sight.

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
