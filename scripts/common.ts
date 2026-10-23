import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const PROJECT_ROOT = join(import.meta.dirname, '..')
export const DIST_DIRECTORY = join(PROJECT_ROOT, 'dist')
export const BUILD_DIRECTORY = join(PROJECT_ROOT, 'build')
export const RELEASE_DIRECTORY = join(PROJECT_ROOT, 'release')
export const APP_NAME = 'YT Downloader'
export const COPYRIGHT = 'Copyright (c) 2026 littlenines'
export const LICENSE_FILE_NAME = 'YT-Downloader-LICENSE.txt'
export const LICENSE_SOURCE = join(PROJECT_ROOT, 'LICENSE')

export type ReleaseTarget = 'win-x64' | 'linux-x64' | 'linux-arm64'
export const ALL_TARGETS: ReleaseTarget[] = ['win-x64', 'linux-x64', 'linux-arm64']

export const targetsFromCommandLine = (): ReleaseTarget[] => {
  const flagIndex = process.argv.indexOf('--targets')
  const requested = flagIndex > 0 ? (process.argv[flagIndex + 1] ?? '').split(',') : ALL_TARGETS
  const targets = requested.filter((target): target is ReleaseTarget => ALL_TARGETS.includes(target as ReleaseTarget))

  if (!targets.length) throw new Error(`No valid targets. Use: ${ALL_TARGETS.join(', ')}`)
  return targets
}

export const isLinuxTarget = (target: ReleaseTarget): boolean => target.startsWith('linux')

export const toMegabytes = (bytes: number): string => `${(bytes / 1048576).toFixed(0)} MB`

export const toWindowsLineEndings = (text: string): string => text.replace(/\n/g, '\r\n')

export const readPackageVersion = async (packageFile: string): Promise<string> =>
  (JSON.parse(await readFile(packageFile, 'utf8')) as { version: string }).version

export const runScript = (main: () => Promise<void>): void => {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
