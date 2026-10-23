import { existsSync } from 'node:fs'
import { chmod, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IS_WINDOWS, TOOLS_DIRECTORY } from '@server/config.js'
import { extractZip, extractZipEntry } from '@server/lib/archive/zip.js'
import { parseSha256 } from '@server/lib/checksums.js'
import { latestReleaseTag, releaseDownloadUrl } from '@server/lib/github-releases.js'
import { downloadText } from '@server/lib/http/download-text.js'
import { downloadVerifiedFile } from '@server/lib/verified-download.js'
import {
  denoReleaseAsset,
  FFMPEG_RELEASE_URL,
  ffmpegReleaseAsset,
  ytdlpReleaseAsset,
  type FfmpegTool,
} from './release-assets.js'
import {
  executableName,
  forgetYtdlpPath,
  NEEDS_DENO,
  toolPaths,
  YTDLP_DIRECTORY,
  YTDLP_UPDATE_CHECK_MARKER,
  ytdlpPath,
} from './tool-paths.js'

const EXECUTABLE_PERMISSIONS = 0o755
const YTDLP_DOWNLOAD_SHARE_OF_PROGRESS = 0.9

type ProgressListener = (fraction: number) => void

export interface InstallStep {
  name: string
  downloadSizeMegabytes: number
  isInstalled(): boolean
  install(onProgress: ProgressListener): Promise<void>
}

const makeExecutable = async (file: string): Promise<void> => {
  if (!IS_WINDOWS) await chmod(file, EXECUTABLE_PERMISSIONS)
}

const installYtdlp = async (onProgress: ProgressListener): Promise<void> => {
  const assetName = ytdlpReleaseAsset()
  const releaseUrl = releaseDownloadUrl('yt-dlp/yt-dlp', await latestReleaseTag('yt-dlp/yt-dlp'))
  const expectedSha256 = parseSha256(await downloadText(`${releaseUrl}/SHA2-256SUMS`), assetName)

  if (!expectedSha256) throw new Error(`The yt-dlp release lists no checksum for ${assetName}.`)

  const zipFile = join(TOOLS_DIRECTORY, 'yt-dlp.zip')
  const temporaryDirectory = `${YTDLP_DIRECTORY}.tmp`

  await downloadVerifiedFile(`${releaseUrl}/${assetName}`, zipFile, {
    label: 'yt-dlp',
    expectedSha256,
    onProgress: (fraction) => onProgress(fraction * YTDLP_DOWNLOAD_SHARE_OF_PROGRESS),
  })
  await rm(temporaryDirectory, { recursive: true, force: true })
  await extractZip(await readFile(zipFile), temporaryDirectory)
  await rm(YTDLP_DIRECTORY, { recursive: true, force: true })
  await rm(join(TOOLS_DIRECTORY, 'yt-dlp.exe'), { force: true })
  await rename(temporaryDirectory, YTDLP_DIRECTORY)
  await rm(zipFile, { force: true })
  forgetYtdlpPath()
  await writeFile(YTDLP_UPDATE_CHECK_MARKER, '')
}

const installFfmpegTool = async (tool: FfmpegTool, onProgress: ProgressListener): Promise<void> => {
  const { assetName, sha256 } = ffmpegReleaseAsset(tool)

  await downloadVerifiedFile(`${FFMPEG_RELEASE_URL}/${assetName}`, toolPaths[tool], {
    label: tool,
    expectedSha256: sha256,
    onProgress,
    gunzip: true,
  })
  await makeExecutable(toolPaths[tool])
}

const installDeno = async (onProgress: ProgressListener): Promise<void> => {
  const assetName = denoReleaseAsset()
  const releaseUrl = releaseDownloadUrl('denoland/deno', await latestReleaseTag('denoland/deno'))
  const expectedSha256 = parseSha256(await downloadText(`${releaseUrl}/${assetName}.sha256sum`))

  if (!expectedSha256) throw new Error(`The Deno release lists no checksum for ${assetName}.`)

  const zipFile = join(TOOLS_DIRECTORY, 'deno.zip')
  const partialFile = `${toolPaths.deno}.part`

  await downloadVerifiedFile(`${releaseUrl}/${assetName}`, zipFile, { label: 'Deno', expectedSha256, onProgress })
  await writeFile(
    partialFile,
    extractZipEntry(await readFile(zipFile), (name) => name === executableName('deno')),
  )
  await makeExecutable(partialFile)
  await rename(partialFile, toolPaths.deno)
  await rm(zipFile, { force: true })
}

const ffmpegInstallStep = (tool: FfmpegTool): InstallStep => ({
  name: tool,
  downloadSizeMegabytes: 28,
  isInstalled: () => existsSync(toolPaths[tool]),
  install: (onProgress) => installFfmpegTool(tool, onProgress),
})

export const INSTALL_STEPS: InstallStep[] = [
  {
    name: 'yt-dlp',
    downloadSizeMegabytes: IS_WINDOWS ? 17 : 38,
    isInstalled: () => existsSync(ytdlpPath()),
    install: installYtdlp,
  },
  ffmpegInstallStep('ffmpeg'),
  ffmpegInstallStep('ffprobe'),
  {
    name: 'Deno',
    downloadSizeMegabytes: 45,
    isInstalled: () => !NEEDS_DENO || existsSync(toolPaths.deno),
    install: installDeno,
  },
]
