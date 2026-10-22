# HTTP API

The page talks to the local server through this JSON API. The types are defined in `src/shared/types.ts`.

- **Address:** `http://127.0.0.1:5199` in the desktop app (another free port if 5199 is taken), `http://localhost:5190` in browser mode.
- **Access key:** every `/api/` request needs the `yt-downloader-access` cookie, or it gets `401`. Opening any page address with `?access=<key>` sets the cookie (`303` to the same address without the key). The key is in `data/access-key`, and the browser mode prints the link at start-up. The desktop window has the cookie already.
- **Errors:** every endpoint answers errors as `{ "error": "message" }` with a 4xx or 5xx status.
- **Cross-site requests:** requests that are not `GET` and carry an `Origin` from another site are refused with `403`. So is any request whose `Host` isn't `127.0.0.1`, `localhost` or `[::1]`, unless the headless server was started with a non-local `HOST`.

## Status and setup

### `GET /api/status` → `StatusResponse`

```json
{
  "downloadFolder": "D:\\yt-downloader\\downloads",
  "simultaneousDownloads": 2,
  "lowLatencyRendering": true,
  "ytdlpVersion": "2026.10.21",
  "platform": "win32/x64",
  "setup": { "state": "ready", "installed": true, "message": null, "progress": null, "downloadSizeMegabytes": 0 }
}
```

`setup.state` is one of:

| State | Meaning |
|---|---|
| `missing` | Tools are missing and the user hasn't started the install. |
| `running` | Installing, or checking for a yt-dlp update. `progress` is from 0 to 1 while downloading. |
| `ready` | Everything is installed. |
| `error` | The last attempt failed; `message` says why. |

`downloadSizeMegabytes` is the approximate size of what is still missing.

### `POST /api/setup` → `SetupStatus`

Starts installing the missing tools. Returns immediately; poll `GET /api/status` for progress. Calling it while setup runs is harmless.

## Reading a link

Reading a link and searching stop their yt-dlp process when the client disconnects, so a client that moves on should abort its previous request.

### `POST /api/info` → `MediaInfo`

Request: `{ "url": "https://www.youtube.com/watch?v=…", "playlist": false }`

With `playlist: true`, a link inside a playlist reads the whole playlist.

The response is either a `VideoInfo` or a `PlaylistInfo`:

- **`VideoInfo`** (`kind: "video"`) has:
  - `artist`, `track` and `album` when the site provides them.
  - `preview`: `{ token, kind }` for `GET /api/preview/:token` (`kind` is `video` or `audio`), or `null`.
  - `qualities`: one entry per resolution, best first, each with `resolution` (the short side), `framesPerSecond`, `codecs`, `hdr` and `estimatedBytes`.
  - `audio`: the best audio stream.
  - `subtitleLanguages`.
  - `playlistId`, when the link points into a playlist.
- **`PlaylistInfo`** (`kind: "playlist"`) has `videoCount`, the total duration and up to 500 `entries`.

| Status | When |
|---|---|
| `400` | The link is invalid or yt-dlp failed. The message is a readable sentence, for example "This video is private." |
| `409` | The download tools are not installed yet. |

## Search

### `POST /api/search` → `SearchResult[]`

Request: `{ "query": "daft punk get lucky" }` (up to 200 characters).

Returns up to 12 YouTube results, each with `title`, `url`, `channel`, `durationSeconds`, `viewCount` and `thumbnailUrl`. Answers `409` when the tools are missing.

## Preview

### `GET /api/preview/:token`

Streams the preview chosen when the link was read: picture and sound up to 720p when the site offers them in one stream, otherwise audio only. The `Range` header is passed through, so players can seek; responses are `200` or `206` with the stream's own content type.

| Status | When |
|---|---|
| `404` | The token is unknown or older than an hour. Read the link again for a new one. |
| `502` | The site refused the stream. |

## Downloads

### `POST /api/downloads` → `Job`

Request (`DownloadRequest`):

```json
{
  "url": "https://www.youtube.com/watch?v=…",
  "kind": "video",
  "resolution": 1080,
  "container": "mp4",
  "subtitles": true,
  "title": "Shown in the list until yt-dlp reports the real title",
  "thumbnailUrl": "https://…",
  "videoCount": 1
}
```

| Field | Values | Default |
|---|---|---|
| `kind` | `audio`, `video` | `audio` |
| `format` (audio) | `mp3`, `m4a`, `opus`, `original`, `flac`, `wav` | `mp3` |
| `resolution` (video) | Short side in pixels, or `null` for the best | `null` |
| `container` (video) | `mp4`, `mkv`, `webm` | `mp4` |
| `playlist` | Download the whole playlist into a numbered folder | `false` |
| `coverArt`, `squareCoverArt` | Embed album art, cropped square | `true` |
| `removeNonMusic` | Cut non-music parts using SponsorBlock data | `false` |
| `subtitles` | Embed English subtitles (not for WebM) | `false` |
| `tags` | `{ artist, title, album }` written into the file and used as its name (`Artist - Title.mp3`). Single audio downloads only; empty fields are left as found. | `null` |

Unknown values fall back to the defaults.

### `GET /api/downloads` → `DownloadsResponse`

`{ "jobs": Job[], "history": HistoryEntry[] }`

- `jobs`: this session's downloads, newest first.
- `history`: the 30 most recent finished downloads, kept across restarts.

A `Job` has:

- `status`: `queued`, `downloading`, `done`, `error` or `cancelled`.
- `progress`: from 0 to 1.
- `stage`: a readable step, for example "Downloading video".
- `bytesPerSecond` and `secondsLeft`.
- `files` and `sizeBytes`.
- `error`.
- `warning`: for a playlist that finished but had to skip videos, how many and why.
- `playlistPosition` for playlists.

### Actions on one download

| Request | Effect |
|---|---|
| `POST /api/downloads/:id/cancel` | Stops it and deletes its partial files. |
| `POST /api/downloads/:id/retry` | Queues a failed or cancelled download again. |
| `POST /api/downloads/:id/reveal` | Shows the file in the file manager. Falls back to its folder, or the download folder. |
| `DELETE /api/downloads/:id` | Removes it from the list and history. The file stays. |
| `DELETE /api/downloads` | Clears every finished download and the history. |

`cancel` and `retry` answer `404` for unknown ids.

## Settings

### `POST /api/settings` → `Settings`

Request: any of:

- `downloadFolder`: an absolute path. It is created if missing; answers `400` if that isn't possible.
- `simultaneousDownloads`: 1 to 4.
- `lowLatencyRendering`: `true` or `false`. The desktop app on Windows reads it at start-up (see architecture.md, Smooth rendering).

### `POST /api/open-folder`

Opens the download folder in the file manager.
