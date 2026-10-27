# HTTP API

The page talks to the local server through this JSON API. The types are defined in `src/shared/types/`.

- **Address:** `http://127.0.0.1:5199` in the desktop app (another free port if 5199 is taken), `http://localhost:5190` in browser mode.
- **Access key:** every `/api/` request needs the `yt-downloader-access` cookie, or it gets `401`. Opening any page address with `?access=<key>` sets the cookie (`303` to the same address without the key). The key is in `data/access-key`, and the browser mode prints the link at start-up. The desktop window has the cookie already.
- **Errors:** every endpoint answers errors as `{ "error": "message" }` with a 4xx or 5xx status.
- **Cross-site requests:** requests that are not `GET` and carry an `Origin` from another site are refused with `403`. So is any request whose `Host` isn't `127.0.0.1`, `localhost` or `[::1]`, unless the headless server was started with a non-local `HOST`.

## Status and setup

### `GET /api/app-update` → `AppUpdateResponse`

```json
{
  "currentVersion": "1.2.0",
  "update": {
    "version": "1.3.0",
    "tag": "v1.3.0",
    "releaseUrl": "https://github.com/littlenines/youtube-downloader-gui/releases/tag/v1.3.0"
  },
  "installation": { "canInstall": true, "installsOnQuit": false, "state": "downloading", "progress": 0.42, "message": null }
}
```

`update` is `null` when the app is up to date, its own version is unknown, or GitHub couldn't be reached. The server checks once per run, starting at start-up; a request made before that check finishes waits for it.

`installation` is how far installing it is (see *Update now* in [tools-and-updates.md](tools-and-updates.md)). `canInstall` is `true` only in the desktop release. `state` is `idle`, `downloading` (`progress` from 0 to 1), `ready` (downloaded in the background), `installing` (the app restarts in a moment) or `error` (`message` says why). `installsOnQuit` is `true` when a ready update will be installed when the app closes.

### `POST /api/app-update/install` → `AppUpdateInstallation`

Downloads the new version unless it is ready already, installs it and restarts the app. Returns immediately; poll `GET /api/app-update` until the server goes away for the restart. Calling it again while it runs is harmless. Answers `400` where the app can't update itself (`canInstall` is `false`).

### `GET /api/status` → `StatusResponse`

```json
{
  "downloadFolder": "D:\\yt-downloader\\downloads",
  "simultaneousDownloads": 2,
  "lowLatencyRendering": true,
  "notifyWhenFinished": true,
  "installUpdatesAutomatically": false,
  "subscriptionCheckHours": 0,
  "laterStartTime": "02:00",
  "laterStopTime": null,
  "appVersion": "1.0.0",
  "ytdlpVersion": "2026.10.21",
  "platform": "win32/x64",
  "canInstallUpdates": true,
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
- **`PlaylistInfo`** (`kind: "playlist"`) has `videoCount`, the total duration and up to 500 `entries`. Each entry has its `position` in the playlist (counting from 1), `title`, `durationSeconds` and `url`. `isChannel` is `true` for a YouTube channel link; then `entries` is empty and `videoCount` is `0`, because only the channel's name and picture are read.

| Status | When |
|---|---|
| `400` | The link is invalid or yt-dlp failed. The message is a readable sentence, for example "This video is private." |
| `409` | The download tools are not installed yet. |

## Search

### `POST /api/search` → `SearchResult[]`

Request: `{ "query": "daft punk get lucky", "kind": "video" }`. The query is up to 200 characters; `kind` is `video` (the default) or `playlist`.

Returns up to 30 YouTube results, each with `kind` (`video` or `playlist`), `title`, `url`, `channel`, `durationSeconds`, `viewCount`, `thumbnailUrl` and `isVerified` (a verified or Topic channel). Playlists have no duration or view count. Answers `409` when the tools are missing.

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
| `playlist` | Download a playlist: one download per video, numbered, in a folder named after the playlist (see *Playlists* below) | `false` |
| `playlistItems` (playlist) | Positions of the videos to download, from the entries' `position`. `null` downloads every video; an empty list is refused with `400`. | `null` |
| `clip` (single video) | `{ startSeconds, endSeconds }`: download only that part. At least 1 second long; ignored for playlists. | `null` |
| `coverArt`, `squareCoverArt` | Embed album art, cropped square | `true` |
| `removeNonMusic` | Cut non-music parts using SponsorBlock data | `false` |
| `subtitles` | Embed English subtitles (not for WebM) | `false` |
| `tags` | `{ artist, title, album }` written into the file and used as its name (`Artist - Title.mp3`). Single audio downloads only; empty fields are left as found. | `null` |
| `folder` | A folder inside the download folder to save into. Reduced to one safe folder name; `null` saves directly in the download folder. Subscriptions use it for their channel or playlist folder. | `null` |
| `playlistNumber`, `playlistTitle` | Set by the server for each video of a playlist: its position (only shown in the list, for the order) and the playlist's name (its folder, named by yt-dlp). Ignored with `playlist`. | `null` |
| `later` | Wait for the "Later" time in Settings instead of starting now (the job is `scheduled`). Answers `400` when no start time is set. | `false` |

Unknown values fall back to the defaults.

**Playlists.** With `playlist: true`, the server lists the playlist's videos (reusing the media panel's read from the last 30 minutes, otherwise reading it again; leaving the request stops that read) and adds one job per picked video, sharing one `group`. The answer is the job of the first video. If a picked entry is a playlist itself or has no web link, the playlist is queued as one job instead, as before.

### `GET /api/downloads` → `DownloadsResponse`

`{ "jobs": Job[], "history": HistoryEntry[] }`

- `jobs`: this session's downloads, newest first, including unfinished ones restored from the last run.
- `history`: the 30 most recent finished downloads, kept across restarts.

A `Job` has:

- `status`: `scheduled` (waiting for the "Later" time), `queued`, `downloading`, `paused`, `done`, `error` or `cancelled`.
- `downloadLater`: it belongs to the "Later" time, so it pauses at the stop time. `startsAt`: when a `scheduled` job starts, otherwise `null`.
- `progress`: from 0 to 1.
- `stage`: a readable step, for example "Downloading video" or "Converting to MP3".
- `activity`: `preparing`, `downloading` or `processing` while it runs (only `downloading` has a meaningful percent), otherwise `null`.
- `downloadedBytes` and `totalBytes` of the stream being downloaded, `bytesPerSecond` and `secondsLeft`.
- `runStartedAt`: when the current run started, or `null`. `activeSeconds`: the time spent running so far, added up across pauses and restarts (shown as "took …" when done).
- `files` and `sizeBytes`.
- `error`.
- `warning`: for a playlist that finished but had to skip videos, how many and why.
- `playlistPosition`: the video being downloaded, for a whole playlist queued as one job by an earlier version.
- `group`: `{ id, title, size, url }` for a video of a playlist, shared by all its videos; `size` is how many were picked, `url` the playlist's link. Otherwise `null`. A playlist's finished videos stay in `jobs`, also across restarts, until the whole playlist is finished; `DELETE /api/downloads/:id` and `DELETE /api/downloads` leave them until then.

### Actions on one download

| Request | Effect |
|---|---|
| `POST /api/downloads/:id/pause` | Stops a waiting or running download and keeps its partial files. |
| `POST /api/downloads/:id/resume` | Queues a paused download again; it continues where it stopped. |
| `POST /api/downloads/pause-all` | Pauses every queued or running download, **Later** ones in their time included. `scheduled` downloads stay as they are. |
| `POST /api/downloads/resume-all` | Queues every paused download again, oldest first. **Later** downloads keep their times, unlike with a single resume. |
| `POST /api/download-groups/:id/pause` | Like `pause-all`, for the videos of one playlist. |
| `POST /api/download-groups/:id/resume` | Like `resume-all`, for the videos of one playlist. |
| `POST /api/download-groups/:id/cancel` | Cancels every unfinished video of one playlist. |
| `DELETE /api/download-groups/:id` | Removes the finished videos of one playlist from the list, and the playlist's history entry. The files stay. |
| `POST /api/downloads/:id/start-now` | Starts a `scheduled` download now. It then runs until it finishes, ignoring the stop time. |
| `POST /api/downloads/:id/cancel` | Stops it (running, waiting or paused) and deletes its partial files. |
| `POST /api/downloads/:id/retry` | Queues a failed or cancelled download again. |
| `POST /api/downloads/:id/reveal` | Shows the file in the file manager. Falls back to its folder, or the download folder. |
| `DELETE /api/downloads/:id` | Removes a finished download from the list and history. The file stays. |
| `DELETE /api/downloads` | Clears every finished download and the history. |

`pause`, `resume`, `start-now`, `cancel` and `retry` answer `404` for unknown ids.

### `POST /api/covers` → `HistoryEntry`

Saves a video's thumbnail as a JPG in the download folder, without downloading the video, and adds it to the history.

Request: `{ "url": "https://www.youtube.com/watch?v=…", "square": false, "title": "…", "thumbnailUrl": "…" }`. `square` crops it to the middle square; `title` and `thumbnailUrl` are what the downloads list shows (other types are ignored). The file is named after the video, with a number added when the name is taken; an existing file is never overwritten. Answers `400` when the link is missing or has no thumbnail, and `409` when the tools are missing. If only the history can't be saved, the cover is still saved and the answer is still `200`.

## Subscriptions

### `GET /api/subscriptions` → `SubscriptionsResponse`

`{ subscriptions, isChecking, checkIntervalHours }`. Each `Subscription` has:

- `source` (`channel` or `playlist`), `url`, `channelId`, `title` and `thumbnailUrl`.
- `options`: the download choices for its new videos, with `folder` set to its title.
- `label`, for example `MP3 · 320 kbps · no Shorts`, `skipShorts`, and `onlyShorts` (subscribed from a channel's Shorts tab).
- `createdAt`, `lastCheckedAt`, `lastError` (the last check's failure, or `null`) and `downloadedCount`.

### `POST /api/subscriptions` → `Subscription`

Request: the same fields as `POST /api/downloads`, with a channel or playlist `url`, plus `skipShorts` (channels only, default `true`; ignored when subscribing from a Shorts tab, which follows only Shorts). Playlist, clip and tag fields are ignored.

| Status | When |
|---|---|
| `400` | The link is a single video, it is already followed, or yt-dlp failed. |
| `409` | The download tools are not installed yet. |

### `POST /api/subscriptions/check` → `SubscriptionsResponse`

Starts checking every subscription now and answers right away with `isChecking: true`. New videos appear in `GET /api/downloads` as they are queued.

### `DELETE /api/subscriptions/:id`

Unsubscribes. Files already downloaded stay. Answers `404` for unknown ids.

## Settings

### `POST /api/settings` → `Settings`

Request: any of:

- `downloadFolder`: an absolute path. It is created if missing; answers `400` if that isn't possible.
- `simultaneousDownloads`: 1 to 4.
- `lowLatencyRendering`: `true` or `false`. The desktop app on Windows reads it at start-up (see *Smooth rendering* in [architecture.md](architecture.md#smooth-rendering)).
- `notifyWhenFinished`: `true` (the default) or `false`. The desktop app shows a system notification when downloads finish while its window isn't focused.
- `subscriptionCheckHours`: 0, 1, 2, 3, 6, 12 or 24. How often subscriptions are checked after the start-up check; `0` (the default) means only at start-up. The next check moves at once.
- `laterStartTime`, `laterStopTime`: local clock times like `"02:00"`, or `null`. When "Later" downloads start, and when unfinished ones pause (`null`: they run until done; the same as the start time counts as `null`). Clearing the start time starts every waiting download now. Waiting downloads move to the new time at once.

### `POST /api/open-folder`

Opens the download folder in the file manager.
