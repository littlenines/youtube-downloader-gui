# Security

What the app defends against: websites open in your browser, other programs and accounts on the same computer, other machines on the network, untrusted text from the sites it downloads from, and tampered downloads. What it can't defend against is listed at the end.

## The local API

- **Local only.** The API listens on `127.0.0.1`. Only the headless mode can opt into `HOST=0.0.0.0`.
- **Access key.** Other programs and other user accounts can reach `127.0.0.1` too, so every `/api/` request must carry a key in an `HttpOnly`, `SameSite=Strict` cookie, compared in constant time.
  - The key is random, created once and kept in `data/access-key`.
  - The desktop app gives its own window the cookie before loading the page.
  - The browser mode opens, and prints, a link with `?access=<key>`. The server turns it into the cookie and redirects to the clean address, so the key doesn't stay in the address bar and a bookmark keeps working.
  - The page itself (HTML, script, styles) loads without the key; it contains nothing private.
- **No requests from other sites.** A request other than `GET` or `HEAD` that carries an `Origin` from another site is refused, so a website open in your browser can't drive the API.
- **No DNS rebinding.** While the server is local only, every request must name a loopback host (`127.0.0.1`, `localhost`, `[::1]`). Otherwise a website could point its own name at `127.0.0.1` so that its requests look same-origin.
- **Network mode is plain HTTP.** With `HOST=0.0.0.0`, the key and everything else cross the network unencrypted. Use it only on a network you trust, or behind a reverse proxy with HTTPS.
- **The key file is only as private as the app folder.** On Linux the file is created `0600`. On Windows that mode does nothing, so another account that can read the app folder can read the key. Keep the app in your own user folder (Downloads, Documents, Desktop), which other accounts can't open. An account that can *write* to the app folder could replace the app anyway.
  - **Why the file isn't locked to your account on Windows:** an `icacls` lock ties it to the account's ID on that PC. After the folder moves to another PC, for example on a USB drive, or after a Windows reinstall, the app could neither read nor replace its own key and would fail to start. Only an admin could fix that, with `takeown`, and the app is meant to be portable.

## The desktop window

- **Only the app's own page.** The window never loads anything else. Other links open in the system browser, and only `http` and `https` ones, so a link can't start a program or open a file.
- **Locked down.** The page runs sandboxed, with context isolation and no Node. It gets no permissions except reading and writing the clipboard (for the Paste button). The folder picker answers only requests from the app's own page.
- **No debugger.** Release builds have Electron's `EnableNodeCliInspectArguments` and `EnableNodeOptionsEnvironmentVariable` fuses turned off, and a release build started with `--remote-debugging-port` or `--remote-debugging-pipe` exits. `RunAsNode` stays on because yt-dlp uses the app's binary as its JavaScript runtime; that starts a separate, empty Node process.
- **Linux sandbox.** The release launcher keeps Chromium's sandbox when user namespaces or a setuid `chrome-sandbox` are available, and otherwise starts without it. That is acceptable only because the window never loads outside content.

## Text from websites

Titles, channel names, descriptions and thumbnail addresses come from the sites, so the app treats them as untrusted.

- **Text is escaped in the page.** The page builds parts of itself with `innerHTML`, and every website text (titles, names, codecs, addresses) goes through `escapeHtml`.
- **Numbers are checked once, where yt-dlp's output is read.** Lengths, view counts, sizes, heights, frame rates and bitrates are inserted into the page as numbers, without escaping. `ytdlp-json.ts` therefore types them as `unknown`, so the compiler refuses any use that skips `finiteNumberOrNull`, which keeps only real numbers. The page's `formatCount` also shows nothing for a value that isn't a number.
- **Content-Security-Policy as the second line.** The page allows only the app's own scripts and styles, so even an escaping mistake can't run a script. Every response also carries `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
- **Folder names.** A subscription saves into a folder named after its channel or playlist. The name loses `/ \ : * ? " < > |` and control characters, `..` is refused, and Windows device names such as `CON` get a `_`, so a title can't point outside the downloads folder. A playlist's songs save into a folder yt-dlp names after the playlist; a title that is only dots, spaces and path characters is dropped first (yt-dlp would keep `..` as it is), and device names get the same `_`.
- **Links go to yt-dlp after `--`,** so a link can never be read as an option.
- **Opening a link in the browser never goes through a shell.** `cmd /c start` would treat an `&` in the link as another command.

## Downloads and files

- **Tools and app updates are checked** against published SHA-256 checksums before they are used, and a download that stops responding is aborted. See [tools-and-updates.md](tools-and-updates.md) for where each checksum comes from.
- **Installing an update** goes through the same access key. It always installs the newest official release, never a version or address from the request. It never writes into `data/`, `tools/` or `downloads/`.
- **Archives** (zip and tar) are unpacked only inside their target folder: entries and symbolic links that point outside are refused. File permissions are limited to `rwx`, so an archive can never create a setuid file on Linux.
- **Static files** are served only from inside the page's folder. A malformed address answers 400, not 500.
- **Damaged settings.** A settings or history file that can't be parsed is kept as `<name>.broken-<time>` before the defaults are used, so the next save can't destroy it.

## What it can't protect against

- **Anyone who can already run programs as you, or write to the app folder.** They could replace the app itself, so nothing inside it can stop them.
- **A compromised release.** The checksums come from the same GitHub release as the files, so they catch a corrupted or swapped download, not a release published by someone who took over the account or the release workflow. **Update now** and automatic updates install such a release like any other. Releases also carry a build attestation (`gh attestation verify`), which the app doesn't check.
