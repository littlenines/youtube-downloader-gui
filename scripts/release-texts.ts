import { APP_NAME } from './common.js'

export const desktopReadme = (isLinux: boolean): string => {
  const startInstructions = isLinux
    ? './yt-downloader            (once: ./yt-downloader --install adds it to the applications menu)'
    : 'Double-click yt-downloader.exe'
  const platformNotes = isLinux
    ? 'If the files are not executable after copying: chmod +x yt-downloader yt-downloader.bin'
    : 'Windows may show "Windows protected your PC" because the app is not code-signed:\nclick "More info", then "Run anyway".'

  return `${APP_NAME}
=============

Start it:
  ${startInstructions}

The first time, the app asks to download yt-dlp and ffmpeg (about ${isLinux ? 90 : 75} MB) into a "tools"
folder next to this file. Downloads are saved to the "downloads" folder here (change it in Settings,
the gear button). Everything stays in this folder: delete the folder to remove the app.

${platformNotes}
`
}

export const serverReadme = (executable: string, isLinux: boolean): string => {
  const startInstructions = isLinux
    ? `./${executable}    (from a terminal in this folder)`
    : `Double-click ${executable}`
  const platformNotes = isLinux
    ? `If the file is not executable after copying: chmod +x ${executable}
On a server without a desktop, set HOST=0.0.0.0 to reach it from another machine, and start it with --no-open.`
    : `Windows may show "Windows protected your PC" because the file is not code-signed:
click "More info", then "Run anyway".`

  return `${APP_NAME} (server edition)
=============================

Start it:
  ${startInstructions}

Your browser opens the app at http://localhost:5190. Keep the ${isLinux ? 'terminal' : 'console'} window open while
you use it; closing it stops the app.

The first time, the page offers to download yt-dlp, ffmpeg and Deno (about 130 MB) into a "tools"
folder next to this file. Downloads are saved to the "downloads" folder here (change it in Settings).
Everything stays in this folder: delete the folder to remove it completely.

${platformNotes}
`
}

export const LINUX_LAUNCHER = `#!/bin/sh
# Starts ${APP_NAME}.   ./yt-downloader --install   adds it to the applications menu.
DIR=$(dirname "$(readlink -f "$0")")
if [ "$1" = "--install" ]; then
  APPS="\${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$APPS"
  cat > "$APPS/yt-downloader.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=${APP_NAME}
Comment=Download music and video in high quality
Exec="$DIR/yt-downloader"
Icon=$DIR/icon.png
Terminal=false
Categories=AudioVideo;Network;
EOF
  echo "Added ${APP_NAME} to the applications menu."
  exit 0
fi
if [ -u "$DIR/chrome-sandbox" ] || unshare -Ur true 2>/dev/null; then
  exec "$DIR/yt-downloader.bin" "$@"
fi
exec "$DIR/yt-downloader.bin" --no-sandbox "$@"
`
