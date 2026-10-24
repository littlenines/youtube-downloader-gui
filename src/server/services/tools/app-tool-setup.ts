import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { videoInfoCache } from '@server/services/ytdlp/video-info-cache.js'
import { ytdlpEnvironment } from '@server/services/ytdlp/ytdlp-command.js'
import { INSTALL_STEPS } from './install-steps.js'
import { toolPaths, YTDLP_UPDATE_CHECK_MARKER, ytdlpPath } from './tool-paths.js'
import { ToolSetup } from './tool-setup.js'

const UPDATE_TIMEOUT_MILLISECONDS = 120_000

const updateYtdlp = (): Promise<boolean> =>
  new Promise((resolve) => {
    execFile(
      ytdlpPath(),
      ['-U'],
      { windowsHide: true, env: ytdlpEnvironment(), timeout: UPDATE_TIMEOUT_MILLISECONDS },
      (error) => {
        if (!error) videoInfoCache.clear()

        resolve(!error)
      },
    )
  })

const readYtdlpVersion = (): Promise<string | null> =>
  new Promise((resolve) => {
    execFile(ytdlpPath(), ['--version'], { windowsHide: true, encoding: 'utf8' }, (error, output) =>
      resolve(error ? null : output.trim()),
    )
  })

const lastSuccessfulUpdateCheck = (): number =>
  existsSync(YTDLP_UPDATE_CHECK_MARKER) ? statSync(YTDLP_UPDATE_CHECK_MARKER).mtimeMs : 0

export const toolSetup = new ToolSetup({
  steps: INSTALL_STEPS,
  prepareFolders: async () => {
    await mkdir(toolPaths.ffmpegDirectory, { recursive: true })
  },
  updateYtdlp,
  readYtdlpVersion,
  lastSuccessfulUpdateCheck,
  recordSuccessfulUpdateCheck: () => writeFile(YTDLP_UPDATE_CHECK_MARKER, ''),
  now: () => Date.now(),
})
