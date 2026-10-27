# Finding what to download

Everything typed, pasted, or dropped on the window goes through one function, `handleEnteredText` in `src/client/link-input.ts`:

| Input | Result |
|---|---|
| Several links | The batch panel: one set of choices, then **Download all** queues each link. |
| One link | The media panel for that link. |
| Anything else | A YouTube search. |

- **Links in text:** `extractLinks` finds every distinct link in the text, so a pasted list, a chat message or a dropped `text/uri-list` all work.
- **Drag and drop:** the window cancels the browser's default drag handling. Without that, the window would navigate to the dropped link.
- **Reading a link:** runs `yt-dlp -J --flat-playlist` with `--no-playlist` (or `--yes-playlist` for **Open the playlist**). `--flat-playlist` lists a playlist's entries without reading each video, so a 180-video playlist opens in about two seconds instead of timing out; it has no effect on a single video. Some sites list fewer details this way (SoundCloud lists titles but no lengths), so the playlist picker may show no durations for them. A YouTube channel link (`/@name`, `/channel/…`, `/c/…`, `/user/…`, with or without one tab segment like `/videos` or `/shorts`) also gets `--playlist-items 1`, because only the channel's name and picture are needed. Whether a link is a channel is decided from the link alone (`isYoutubeChannelLink`), for both the arguments and the panel, so an album or other playlist page that yt-dlp also tags with its owner's channel stays a playlist: the media panel shows it as a channel, with **Subscribe** as its action instead of a video list and **Download**.
- **Vimeo links:** a Vimeo video page (`vimeo.com/<id>`, or `vimeo.com/<id>/<hash>` for an unlisted video) is handed to yt-dlp as its player link (`player.vimeo.com/video/<id>`, with `?h=<hash>`), by `vimeoPlayerLink`. Every yt-dlp call that takes a link builds it with `linkArguments` (the `--` and the link), so reading, downloading, Save cover, playlists and subscription checks all get it. The panel, the download and history keep the link that was pasted: the player link is only what yt-dlp is given. yt-dlp reads a video page through Vimeo's API, whose web client now refuses without a login ("The web client only works when logged-in", as of yt-dlp 2026.10.21), and its other client, android, only works with tokens saved earlier. The player page needs no login and gives the same formats, up to 1080p for a public video. Other Vimeo links, such as `vimeo.com/channels/<name>/<id>`, already read the player and are left as they are. A video that is only allowed embedded on certain sites, or has a password, still fails. The player gives streams only, not the original file some owners allow downloading, which only the page offers; so once `yt-dlp https://vimeo.com/<id>` works again without a login, the rewrite should go.
- **Search:** runs `yt-dlp -J --flat-playlist "ytsearch30:<query>"`. A flat search lists results without reading each video, so it answers in about two seconds (12 results take about 1.5). Choosing a result opens it in the media panel, which then offers **Back to results**.
- **Searching playlists:** with **📃 Playlists** chosen, the search reads YouTube's own results page with its "Playlists" filter (`https://www.youtube.com/results?search_query=…&sp=EgIQAw%3D%3D`) instead of `ytsearch30:`, with `--playlist-items 1:30` so yt-dlp stops after 30. That's how to find full albums. A playlist result (or any result whose link has `list=`) opens with `playlist: true`, straight into the playlist picker. Flat playlist results have no length, view count or verified flag, so the video filters are hidden for them; a playlist by an artist's Topic channel (an official album) still gets the ✓.
- **Search filters:** chips above the results (`search-filters.ts`), also shown when a search fails, so the other kind is one click away and clicking the chosen one tries again. **🎬 Videos** / **📃 Playlists** searches the same words again. It applies to that search only: a search typed in the link box always looks for videos, so a playlist search for one album doesn't quietly change every later search. The others only redraw the list, keeping the focus on the chip (unless the focus has moved elsewhere, such as into the link box, while a search was loading), since every result already has what they need; that's why the search asks for 30 results, so a filter still leaves enough to choose from:
  - **Length:** **Any length**, **Under 4 min**, **4–20 min**, **Over 20 min**. Results without a duration (live streams) show only under **Any length**.
  - **✓ Verified only:** channels YouTube has verified (`channel_is_verified`), and artists' auto-generated "Name - Topic" channels. Those results also get a ✓ after the channel name. It's named "verified", not "official", because YouTube verifies any large channel, such as movie-clip channels, not only artists.

  The page remembers the length and **Verified only** in `localStorage`. Because a remembered filter can hide results from a new search, the list says "13 of 30 shown" with **Show all** whenever a filter hides something, and the "no results" message has **Show all** too.

## Tags

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

## Saving the cover

**🖼 Save cover** and **Save square** under a video's title save its thumbnail as a JPG in the download folder (`POST /api/covers`, `cover-image.ts`), without downloading the video:

1. **yt-dlp saves the thumbnail** into a work folder inside the hidden partial folder (`.yt-downloader-partial/cover-<id>/`), with `--skip-download --no-playlist --write-thumbnail --convert-thumbnails jpg` and ffmpeg at the best JPG quality. It picks the largest thumbnail (on YouTube usually 1280×720, `maxresdefault`), and converts YouTube's WebP, which some photo viewers and music taggers can't open. It prints the file's path (`%(thumbnails.-1.filepath)s` at the `after_video` stage); there's no `-P temp:`, because with one that path would point at the file before it was moved.
2. **Square:** the app crops it with ffmpeg itself (`crop=min(iw\,ih):min(iw\,ih)`, the middle square). Not through yt-dlp's converter, because yt-dlp skips that when the thumbnail is already a JPG (SoundCloud, many other sites), and the crop with it. Taking the shorter side keeps it working for pictures taller than wide, where the older `crop=ih:ih` failed. ffmpeg is stopped after 30 seconds, so a stuck crop can't leave the button on "Saving…".
3. **Copied into the download folder** as `<title>.jpg` or `<title> (square).jpg`, with the title made safe for file names by yt-dlp. A name that is taken gets a number, `<title> (2).jpg`, so nothing is ever overwritten, not even a different video's cover with the same title. The copy uses `COPYFILE_EXCL`, so two saves at once can't pick the same name.
4. **The work folder is removed** whether the save worked, failed or was cancelled, so no stray WebP or half-written JPG is left in the download folder. After a crash, the start-up cleanup of old partial folders removes it.

- **In the downloads list:** the saved picture becomes a history entry labelled **Cover · JPG** or **Square cover · JPG**, so **Show in folder** and ✕ work as for any finished download, without a route that reveals any path the page sends.

## Preview

When a link is read, `registerPreview` picks a stream the page can play directly:

- **First choice:** a single stream with picture and sound, up to 720p (on YouTube, format 18 at 360p).
- **Otherwise:** a stereo audio stream, preferring M4A.

It remembers the stream's address and request headers under a random token for an hour. The page's `<video>` or `<audio>` element plays `/api/preview/<token>`, which relays the stream and passes the `Range` header through, so seeking works.

YouTube refuses a freshly issued stream address (HTTP 403) for a few seconds. The relay retries refusals for up to about ten seconds, which is why a preview typically starts two to three seconds after clicking ▶.
