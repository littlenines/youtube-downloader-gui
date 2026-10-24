# Security

- The API listens on `127.0.0.1` only (the headless mode can opt into `HOST=0.0.0.0`).
- **An access key guards the API.** Other programs and other user accounts on the same computer can reach `127.0.0.1` too, so every `/api/` request must carry the key in an `HttpOnly`, `SameSite=Strict` cookie.
  - The key is random, created once and kept in `data/access-key`.
  - The desktop app gives its own window the cookie before loading the page.
  - The browser mode opens, and prints, a link with `?access=<key>`. The server turns that into the cookie and redirects to the clean address, so a bookmark keeps working afterwards.
  - The page itself (HTML, script, styles) loads without the key; it contains nothing private.
- Requests with an `Origin` from another site are refused, so a website open in the user's browser can't drive the local API.
- While the server is local only, every request must name a loopback host (`127.0.0.1`, `localhost`, `[::1]`). This stops DNS rebinding, where a website points its own name at `127.0.0.1` so that its requests look same-origin.
- Links are passed to yt-dlp after `--`.
- The page is served with a Content-Security-Policy that allows only the app's own scripts and styles. The page builds parts of itself from website text with `innerHTML`; escaping handles that, and the policy is the second line of defense. Every response also carries `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
- Static files are served only from inside the page's folder. A malformed address answers 400, not 500.
- Opening a link in the browser never goes through a shell: `cmd /c start` would treat an `&` in the link as another command.
- Zip extraction refuses entries, and symbolic links, that would point outside the target folder.
- A settings or history file that can't be parsed is kept as `<name>.broken-<time>` before the defaults are used, so the next save can't destroy it.
- The desktop window loads only the app's own page. Other links open in the system browser, and the renderer runs sandboxed with context isolation.
- The desktop window gets no permissions except reading and writing the clipboard (for the Paste button). The folder picker answers only requests from the app's own page.
- Release builds have Electron's `EnableNodeCliInspectArguments` and `EnableNodeOptionsEnvironmentVariable` fuses turned off, so the running app can't be opened to a debugger. A release build started with `--remote-debugging-port` exits. `RunAsNode` stays on because yt-dlp uses the binary as its JavaScript runtime; that mode starts a separate, empty Node process.
- On Linux, the release launcher keeps Chromium's sandbox when user namespaces or a setuid `chrome-sandbox` are available, and otherwise starts without it. That is acceptable only because the window never loads outside content.
