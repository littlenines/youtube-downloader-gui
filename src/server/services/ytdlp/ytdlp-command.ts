import { IS_ELECTRON } from '@server/config.js'
import { NEEDS_DENO, toolPaths } from '@server/services/tools/tool-paths.js'

export const ytdlpEnvironment = (): NodeJS.ProcessEnv =>
  IS_ELECTRON ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env

export const ytdlpCommonArguments = (): string[] => {
  const javaScriptRuntime = NEEDS_DENO ? `deno:${toolPaths.deno}` : `node:${process.execPath}`

  return [
    '--js-runtimes',
    javaScriptRuntime,
    '--remote-components',
    'ejs:github',
    '--ffmpeg-location',
    toolPaths.ffmpegDirectory,
    '--encoding',
    'utf-8',
    '--no-warnings',
  ]
}
