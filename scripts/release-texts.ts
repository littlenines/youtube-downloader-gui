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

const REPOSITORY_URL = 'https://github.com/littlenines/youtube-downloader-gui'

const isVersionHeading = (line: string, version: string): boolean =>
  new RegExp(`^## \\[?${version.replaceAll('.', '\\.')}\\]?(\\s|$)`).test(line)

export const changelogSection = (changelog: string, version: string): string => {
  const lines = changelog.split(/\r?\n/)
  const headingIndex = lines.findIndex((line) => isVersionHeading(line, version))

  if (headingIndex === -1) throw new Error(`CHANGELOG.md has no "## ${version}" section. Add one before releasing.`)

  const linesAfterHeading = lines.slice(headingIndex + 1)
  const nextHeadingIndex = linesAfterHeading.findIndex((line) => line.startsWith('## '))
  const section = linesAfterHeading
    .slice(0, nextHeadingIndex === -1 ? undefined : nextHeadingIndex)
    .join('\n')
    .trim()

  if (!section) throw new Error(`The "## ${version}" section in CHANGELOG.md is empty.`)

  return section
}

export const releaseNotes = (changelog: string, version: string): string => {
  const downloadLink = (file: string) => `[\`${file}\`](${REPOSITORY_URL}/releases/download/v${version}/${file})`

  return `## What's new

${changelogSection(changelog, version)}

## Download

| System | File | Start it |
|---|---|---|
| Windows 10/11 (64-bit) | ${downloadLink('yt-downloader-win-x64.zip')} | Unzip it, then double-click \`yt-downloader.exe\` |
| Linux (64-bit) | ${downloadLink('yt-downloader-linux-x64.tar.gz')} | \`tar xzf yt-downloader-linux-x64.tar.gz && ./yt-downloader/yt-downloader\` |
| Linux ARM64 (e.g. Raspberry Pi 4/5) | ${downloadLink('yt-downloader-linux-arm64.tar.gz')} | same as above |

On the first start the app offers to download yt-dlp and ffmpeg (about 75–90 MB).

Windows may say "Windows protected your PC" because the app isn't code-signed yet: click **More info**, then **Run anyway**.

\`SHA256SUMS.txt\` lists the checksums of the files. Every version is in the [changelog](${REPOSITORY_URL}/blob/master/CHANGELOG.md).
`
}

export const LINUX_LAUNCHER = `#!/bin/sh
# Starts ${APP_NAME}.   ./yt-downloader --install   adds it to the applications menu.
DIR=$(dirname "$(readlink -f "$0")")
if [ "$1" = "--install" ]; then
  APPS="\${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$APPS"
  # Desktop entries read \\ " \` $ and % in Exec specially, so a folder name with them needs escaping.
  EXEC=$(printf '%s' "$DIR/yt-downloader" | sed -e 's/\\\\/\\\\\\\\\\\\\\\\/g' -e 's/["\`$]/\\\\\\\\&/g' -e 's/%/%%/g')
  # GNOME looks for the program before decoding %%, so a path with % is passed to sh instead.
  case "$DIR" in *%*) RUN='/bin/sh ' ;; *) RUN='' ;; esac
  cat > "$APPS/yt-downloader.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=${APP_NAME}
Comment=Download music and video in high quality
Exec=$RUN"$EXEC"
Icon=$DIR/icon.png
Terminal=false
Categories=AudioVideo;
EOF
  echo "Added ${APP_NAME} to the applications menu."
  exit 0
fi
# VS Code and other Electron apps export this, which would start the app as plain Node.
unset ELECTRON_RUN_AS_NODE
if [ -u "$DIR/chrome-sandbox" ] || unshare -Ur true 2>/dev/null; then
  exec "$DIR/yt-downloader.bin" "$@"
fi
exec "$DIR/yt-downloader.bin" --no-sandbox "$@"
`
