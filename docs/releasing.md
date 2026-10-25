# Releasing and packaging

## Releasing

Releases are built and published by `.github/workflows/release.yml` when a version tag is pushed.

1. In `CHANGELOG.md`, rename `## Unreleased` to the new version (for example `## 1.2.0`), and commit it.
2. Tag and push:

```sh
npm version 1.2.0          # checks CHANGELOG.md, sets the version in package.json, commits it and creates the tag v1.2.0
git push --follow-tags     # pushes the commit and the tag; the workflow does the rest
```

`npm version` runs `scripts/release-notes.ts` before it commits, so it stops if `CHANGELOG.md` has no section for the new version. In that case `package.json` is already changed: undo it with `git checkout package.json package-lock.json`, add the section, and run `npm version` again.

The workflow (on a Windows runner):

1. Stops if the tag doesn't match the version in `package.json`.
2. Writes the release notes (`releaseNotes` in `scripts/release-texts.ts`): first a download table linking to this release's files, then that version's section of `CHANGELOG.md` under **What's new**, folded into a collapsed "All changes in 1.2.0" dropdown (`<details>`) so the page stays short. It stops if the section is missing or empty.
3. Runs the typecheck and tests.
4. Builds all three packages and zips the Windows folder.
5. Writes `SHA256SUMS.txt` and a build attestation for each file, so anyone can verify where a file came from with `gh attestation verify <file> --repo littlenines/youtube-downloader-gui`.
6. Publishes the release with those notes.

If a release run fails, delete the tag (`git push --delete origin v1.1.0` and `git tag -d v1.1.0`), fix the problem, and tag again.

## Packaging

### Desktop releases (`npm run package`)

`scripts/package.ts` stages `dist/` into `build/app/` with a minimal `package.json`, then runs `@electron/packager` for each target:

| Target | Output |
|---|---|
| `win-x64` | `release/yt-downloader-win-x64/` with `yt-downloader.exe` (icon and version info set) and `README.txt`. Rebuilding keeps any `data/`, `tools/` and `downloads/` folders already there. |
| `linux-x64`, `linux-arm64` | `release/yt-downloader-<target>.tar.gz`. The archive is written by the app's own tar writer so the executable bits are right even when built on Windows. |

The Linux archive contains:

- `yt-downloader`: a launcher script (`LINUX_LAUNCHER` in `scripts/release-texts.ts`, tested by `linux-launcher.test.ts`):
  - **Sandbox:** it keeps Chromium's sandbox when the system allows it (a setuid `chrome-sandbox`, or unprivileged user namespaces), and starts with `--no-sandbox` otherwise.
  - **`ELECTRON_RUN_AS_NODE`:** it clears this first. VS Code, its tasks and extensions, and other apps built on Electron export it, and with it set Electron starts as plain Node and closes without a window.
  - **`--install`** writes a menu entry to `~/.local/share/applications` (or `$XDG_DATA_HOME/applications`), listed under Multimedia. The entry has to escape the app's folder, so it works wherever the app is unpacked:
    - `Exec` reads `\`, `"`, `` ` ``, `$` and `%` specially. A backslash becomes four backslashes, and `"`, `` ` `` and `$` get two before them: one escape for the quoted argument, then one for the entry's string value. `%` becomes `%%`, since `%` starts a field code.
    - GNOME looks for the program before it turns `%%` back into `%`, so it can't find a launcher whose folder has a `%`. Then the entry runs `/bin/sh "<launcher>"` instead.
    - `Icon` is a plain string value, so only its backslashes are doubled.
- `yt-downloader.bin`: Electron itself.
- `icon.png` and `README.txt`.

To keep the download small, every package leaves out two parts of Electron that the app doesn't use. Together they are about 22 MB of a 154 MB zip.

- **All of Chromium's interface translations except `en-US.pak`.** The page is English only. Without the other files Chromium's own locale is always `en-US`, so the page formats dates with the system's locale instead (see *Dates* in [architecture.md](architecture.md)). Packaging stops if `en-US.pak` is missing, rather than shipping an app without any.
- **The WebGPU shader compiler (`dxcompiler.dll`, `dxil.dll`).** The page uses no WebGPU. Chromium draws through ANGLE on Direct3D 11, which uses `d3dcompiler_47.dll` (kept). If anything in Chromium does use Dawn's Direct3D 12 backend, Dawn uses that same compiler when these files are missing. After an Electron upgrade, start the packaged app once and check that the window and preview still draw.

Electron downloads for other platforms are cached by Electron in its own cache folder (on Windows, `%LOCALAPPDATA%\electron\Cache`).

### Single-executable server (`npm run package:server`)

`scripts/package-server.ts` builds a Node single executable application from `dist/app.cjs`, with the page embedded as assets:

1. Creates the application blob with `node --experimental-sea-config`, without a code cache, so one blob fits every platform.
2. Downloads the matching official Node binary for each target from nodejs.org (cached in `build/cache/`).
3. Injects the blob with `postject`.

The blob only works in the exact Node version that created it, which is why the script downloads that same version.

### Code signing

Releases are not signed. Windows SmartScreen asks once ("More info" → "Run anyway"). macOS builds are not produced because they would require signing and notarization; macOS works from source.
