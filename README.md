<p align="center">
  <img src="assets/icon.png" alt="YT Downloader icon" width="112" />
</p>

<h1 align="center">YT Downloader</h1>

<p align="center">
  <b>Download music in high quality and video at the quality you pick, from YouTube and 1000+ other sites, all from one simple window.</b>
</p>

<p align="center">
  <a href="https://github.com/littlenines/youtube-downloader-gui/releases/latest"><img src="https://img.shields.io/github/v/release/littlenines/youtube-downloader-gui?style=for-the-badge&label=latest%20version&color=2ea44f" alt="Latest version" /></a>
  <img src="https://img.shields.io/badge/Windows%20%7C%20Linux-555?style=for-the-badge" alt="Windows and Linux" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-555?style=for-the-badge" alt="MIT license" /></a>
</p>

<h2 align="center">
  ⬇️ <a href="https://github.com/littlenines/youtube-downloader-gui/releases/latest">DOWNLOAD HERE</a> ⬇️
</h2>

<p align="center">
  <a href="https://github.com/littlenines/youtube-downloader-gui/releases/latest/download/yt-downloader-win-x64.zip"><b>Windows 10/11</b></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/littlenines/youtube-downloader-gui/releases/latest/download/yt-downloader-linux-x64.tar.gz"><b>Linux</b></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/littlenines/youtube-downloader-gui/releases/latest/download/yt-downloader-linux-arm64.tar.gz"><b>Raspberry Pi / Linux ARM</b></a>
</p>

<p align="center">Free · No ads · No account · Nothing is uploaded anywhere</p> <br>

![](https://github.com/littlenines/youtube-downloader-gui/blob/fa4cb6d09cf2406712a0e27d6a9b965c9d91c879/demo.png)

---

> *I made this downloader because I was tired of searching for other people's downloaders, or using a terminal. I wanted to see what I was doing, and to be able to do everything from one app.*
>

---

## Features

### Music

- **MP3 320 kbps, original Opus, M4A, FLAC or WAV.** Pick the one that fits where you'll play it.
- **Album art** cut square from the thumbnail and saved in the file.
- **Save the cover image.** Save a video's thumbnail in full size as a JPG, or cropped square to use as album art.
- **Artist, Title and Album filled in for you.** "Daft Punk - Get Lucky (Official Video)" becomes artist *Daft Punk*, title *Get Lucky*, and the file is named `Daft Punk - Get Lucky.mp3`. Change anything before downloading.
- **Cut out the talking.** Intros and non-music parts can be removed automatically when the community has marked them (SponsorBlock).

### Video

- **Every resolution the video really has**, up to 4K and 8K, including HDR and 60 fps.
- **MP4, MKV or WebM.** The estimated file size is shown before you download.
- **Subtitles** in any language the video has, inside MP4 and MKV files or as a `.srt` file next to the video.

### Finding what to download

- **Not just YouTube:** YouTube Music, SoundCloud, Vimeo, TikTok and [1000+ other sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md), everything [yt-dlp](https://github.com/yt-dlp/yt-dlp) supports. Paste a link from any of them.
- **Paste a link,** or press <kbd>Ctrl</kbd>+<kbd>V</kbd> anywhere in the window.
- **Search without a browser:** type a song or video name and press <kbd>Enter</kbd>.
- **Search filters:** search for playlists to find full albums, show only verified channels, or filter videos by length (under 4 minutes for songs, or over 20 for mixes).
- **Drag and drop** a link from your browser onto the window.
- **Preview** a video right in the app, with seeking, before you download it.

### Picking exactly what you want

- **Download only part of a video or song.** Set a start and end time, or pause the preview and click **Use preview time**.
- **Pick videos from a playlist.** Tick the ones you want, or use **Select all** / **Select none**.
- **Every video of a playlist is listed** in the downloads, so you can pause, cancel or retry one without stopping the rest.
- **Many links at once.** Paste a whole list, for example from a chat, choose the format once and click **Download all**.

### Downloading

- **Pause and resume** any download, and it continues from where it stopped.
- **Pause all** and **Resume all** above the downloads list, for when you need the connection back for a moment.
- **Clear progress:** every download shows what it's doing, with sizes, speed and time left, and starts right away when you've just opened the video.
- **Download later,** for example overnight. Click **Later** instead of Download, and it starts at the time set in Settings. Unfinished downloads can pause in the morning and continue the next night.
- **Subscribe to channels and playlists.** Open one, choose the format and click **Subscribe**: every new video then downloads by itself into its own folder. Shorts can be skipped, and premieres wait until they're out. **Subscriptions** at the top shows them. New videos are checked when the app starts, and Settings can add a check every few hours.
- **Nothing gets lost.** Close the app in the middle of a download and it continues the next time you open it.
- **Several downloads at the same time,** as many as you set in Settings.
- **Notifications** when downloads finish while the app is in the background; click one to bring the app back.
- **Progress on the taskbar** (Windows), and the button flashes when a download finishes in the background.
- **Play** a finished download in your default player, or **Show in folder**. Every finished file stays in the download history.
- **Mini mode** (desktop app): a small bar that stays on top of other apps and shows the download progress while you work. Settings can switch to it when you minimize.

### Simple and private

- **Everything happens on your computer.** No account, no ads, and nothing is uploaded.
- **Sets itself up.** On first start it downloads the two free tools it needs and checks that they are genuine.
- **Updates in one click.** When a new version is out, click **Update now**: the app downloads it, checks that it's genuine and restarts. Or let it install updates by itself when you close it (Settings).
- **No installation.** Everything stays in one folder; delete the folder and the app is gone.

---

## Getting started

### 1. Download it

| Your computer | File to download | How to start it |
|---|---|---|
| **Windows 10 / 11** (64-bit) | [`yt-downloader-win-x64.zip`](https://github.com/littlenines/youtube-downloader-gui/releases/latest/download/yt-downloader-win-x64.zip) | Unzip it, open the folder and double-click **`yt-downloader.exe`** |
| **Linux** (64-bit) | [`yt-downloader-linux-x64.tar.gz`](https://github.com/littlenines/youtube-downloader-gui/releases/latest/download/yt-downloader-linux-x64.tar.gz) | `tar xzf yt-downloader-linux-x64.tar.gz && ./yt-downloader/yt-downloader` |
| **Raspberry Pi 4/5, Linux ARM** | [`yt-downloader-linux-arm64.tar.gz`](https://github.com/littlenines/youtube-downloader-gui/releases/latest/download/yt-downloader-linux-arm64.tar.gz) | Same as Linux, with `arm64` in the file name |

> [!IMPORTANT]
> **Unzip it into a normal folder**, such as *Documents*, *Desktop* or *Downloads*, not into *Program Files*. The app keeps its settings and your downloads next to itself, so it needs a folder it is allowed to write to.

> [!WARNING]
> **Windows may say *"Windows protected your PC"*** the first time. That happens because the app isn't signed with a paid certificate, not because something is wrong. Click **More info**, then **Run anyway**. You only need to do this once.

> [!TIP]
> On Linux, run `./yt-downloader --install` once to add the app to your applications menu.

### 2. One-time setup

On first start the app asks to download the two free tools it needs:

- **yt-dlp** downloads the video.
- **ffmpeg** converts and joins the audio and video.

Click **Download tools** and wait until you see **"You're all set"**.

> [!NOTE]
> This is about **75 MB on Windows** and **90 MB on Linux**, downloaded once. The tools come straight from their official pages, and the app checks each file before using it.

### 3. Download something

1. **Paste a link** or **type a search** at the top and press <kbd>Enter</kbd>.
2. **Choose Music or Video,** then the format and quality.
3. Optional: edit the **tags**, tick **Download only part of it**, or pick videos from a playlist.
4. Click **Download**. Your file appears in the **Downloads** list, with **Play** and **Show in folder** when it's done.

> [!TIP]
> Your files go to the **`downloads`** folder next to the app. To save them somewhere else, open **Settings** (the ⚙️ button) and click **Browse…**.

---

## Which music format should I choose?

| Format | Best for |
|---|---|
| **MP3 · 320 kbps** | **Not sure? Pick this one.** Plays on everything: phones, cars, speakers and DJ apps. |
| **Opus · original** | The best quality possible: YouTube's own audio, saved exactly as it is (a clip is re-encoded at 320 kbps, so it can start at the exact time). |
| **M4A (AAC)** | iPhone, iTunes and Apple Music. |
| **FLAC / WAV** | DJ software, music production and editing programs. |

> [!NOTE]
> YouTube streams audio at about 130–160 kbps. No format can sound better than that, so FLAC and WAV keep the sound exactly but can't add quality that isn't there.

## Which video format should I choose?

| Format | Best for |
|---|---|
| **MP4** | **Not sure? Pick this one.** Plays on every phone, TV and computer. |
| **MKV** | The best quality at any resolution, with chapters and subtitles. |
| **WebM** | YouTube's own format, saved without any conversion. |

> [!NOTE]
> YouTube offers MP4's most compatible codec (H.264) only up to 1080p. At 1440p and 4K, MP4 uses VP9 or AV1 instead, which modern phones and players handle fine.

---

## Questions

<details>
<summary><b>How do I update to a new version?</b></summary>

Click **Update now** in the notice. Running downloads pause and continue after the restart, and your settings, history, tools and downloads stay.

To have it done for you, turn on **Install updates automatically** in Settings: new versions then download in the background and are installed when you close the app.

**Coming from version 1.2.0 or older?** Those versions can't update themselves, so update by hand once:

1. Close the app.
2. Download and unzip the new version.
3. Copy everything from the new `yt-downloader-win-x64` folder into your old one, and choose **Replace** when Windows asks.

Your settings, history, tools and downloads are kept, because they live in the `data`, `tools` and `downloads` folders and the new version doesn't include those.

See what changed in the [changelog](CHANGELOG.md).
</details>

<details>
<summary><b>How do I uninstall it?</b></summary>

Delete the app's folder. Nothing is installed anywhere else, so that removes everything. Move your `downloads` folder somewhere else first if you want to keep your files.
</details>

<details>
<summary><b>What happens if I close the app while downloading?</b></summary>

The app asks first. If you quit, the downloads are paused and continue from where they stopped the next time you open the app.
</details>

<details>
<summary><b>Which sites can I download from?</b></summary>

YouTube, YouTube Music, SoundCloud, Vimeo, TikTok and [1000+ other sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md): paste a link from any of them. Search and its filters look on YouTube only, and only YouTube channels can be subscribed to; a playlist from another site can be subscribed to as well.

Some things can't be downloaded:

- **Posts that need an account,** such as private videos, or some Instagram and Facebook posts. The app doesn't log in to sites.
- **Copy-protected streaming,** such as Spotify, Netflix or Apple Music. Their streams are encrypted, so no downloader based on yt-dlp can save them.
- **Region-locked videos,** for example some TV sites that only work from their own country.
</details>

<details>
<summary><b>A download fails. What can I do?</b></summary>

Click **Retry** on the download. If it keeps failing, the site may have changed: the app updates yt-dlp regularly, and an update usually fixes it. Some videos are private, age-restricted or blocked in your country, and those can't be downloaded.
</details>

---

## 📄 License

YT Downloader is free and open source under the [MIT License](LICENSE). Release packages include it as `YT-Downloader-LICENSE.txt`.

The tools the app downloads on first start have their own licenses:

- yt-dlp is in the public domain (Unlicense).
- The ffmpeg builds are GPL-licensed.
- Electron, which the desktop app is built on, is MIT-licensed. Its license and Chromium's ship in the release folder as `LICENSE` and `LICENSES.chromium.html`.

> [!CAUTION]
> Please respect copyright and each site's terms. Only download what you have the right to.
