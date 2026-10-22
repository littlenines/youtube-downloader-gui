# YT Downloader

A desktop app for downloading **music in high quality** and **video at the quality you pick**.

- **Music:** MP3 320 kbps, original Opus, M4A, FLAC or WAV, with album art and tags.
- **Video:** every resolution the video offers, up to 4K/8K and HDR, as MP4, MKV or WebM.

It works with YouTube, YouTube Music and 1000+ other sites supported by [yt-dlp](https://github.com/yt-dlp/yt-dlp). Everything runs on your computer in its own window; nothing is uploaded anywhere.

## Getting started

Get the build for your system from `release/`, or build it yourself (see [Development](docs/development.md)):

| System | Get | Start it |
|---|---|---|
| Windows x64 | the `yt-downloader-win-x64` folder | Double-click `yt-downloader.exe` |
| Linux x64 | `yt-downloader-linux-x64.tar.gz` | `tar xzf yt-downloader-linux-x64.tar.gz && ./yt-downloader/yt-downloader` |
| Linux ARM64 (e.g. Raspberry Pi 4/5) | `yt-downloader-linux-arm64.tar.gz` | same as above |

On Linux, `./yt-downloader --install` adds the app to the applications menu.

**First start:** the app asks to download the two free tools it needs: yt-dlp, which downloads the video, and ffmpeg, which converts and merges it. That's about 75 MB on Windows and 90 MB on Linux. Click **Download**, wait for "You're all set", and the app is ready.

Downloads go to the `downloads` folder next to the app. To change it, open Settings (the gear button) and click **Browse…**. Everything the app uses stays in its own folder, so deleting the folder removes it completely.

## Finding what to download

- **Paste a link,** or press Ctrl+V anywhere in the window.
- **Search:** type something like `daft punk get lucky` and press Enter, then pick a result. **Back to results** returns to the list.
- **Drag and drop:** drag a link, or the icon next to a browser's address bar, onto the window.
- **Several at once:** paste or drop text that contains several links, for example a list from a chat. They all appear in one panel. Pick the format once and click **Download all**.
- **Preview:** click ▶ on the thumbnail to play the video right in the app, with seeking, before you download.

- **Windows:** the app isn't code-signed, so the first time Windows may say *"Windows protected your PC"*. Click **More info**, then **Run anyway**.
- **While downloading:** the taskbar button shows the progress and flashes when a download finishes in the background. Closing the window asks first if downloads are still running.

## Music: which format?

| Format | When to use it |
|---|---|
| **MP3 · 320 kbps** | Plays on everything: phones, cars, DJ apps. The highest-bitrate MP3, so nothing is lost on top of the source. |
| **Opus · original** | The best possible quality: YouTube's own audio stream, saved without re-encoding. |
| **M4A (AAC)** | Apple and iTunes. Kept as-is when YouTube has an AAC stream. |
| **FLAC / WAV** | For DJ software, DAWs and editors. They keep the source exactly but can't add quality YouTube doesn't have. |

YouTube's audio is at most about 130–160 kbps Opus or AAC, so no format can sound better than that source.

- **Album art:** downloads include album art, cropped square from the thumbnail.
- **Tags and file names:** for a single song, the Artist, Title and Album fields are filled in for you; for example, "Daft Punk - Get Lucky (Official Video)" becomes artist "Daft Punk", title "Get Lucky". Correct them if needed. They are written into the file and name it `Artist - Title.mp3`.
- **Non-music parts:** an option cuts intros and talking, using SponsorBlock community data when the video has it.

## Video

The quality list shows each resolution the video really has, with frame rate, codecs, HDR and estimated size.

- **MP4** prefers H.264, which plays everywhere. YouTube offers H.264 only up to 1080p; 1440p and 4K come as VP9 or AV1, which modern players and phones handle.
- **MKV** gives the best quality with any codec, plus chapters and subtitles.
- **WebM** is YouTube's native VP9 + Opus, with no conversion.

Playlists work too: paste a playlist link, or choose "Download the whole playlist" on a video that's part of one. Each playlist goes into its own numbered folder.

## Without a desktop

For a server without a screen, `npm run package:server` builds a version that runs as a small web server:

1. Start it with `HOST=0.0.0.0 ./yt-downloader --no-open`.
2. Open `http://<server-ip>:5190` from another computer.

Only do this on a network you trust: there is no login.

## Documentation

- [Architecture](docs/architecture.md): how the app is put together, the first-run setup, a download step by step, and security.
- [HTTP API](docs/http-api.md): the local API between the page and the engine.
- [Development](docs/development.md): commands, code conventions, tests and packaging.

Please respect copyright and the sites' terms. Download only what you have the right to.
