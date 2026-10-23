import { isNewerVersion } from '@shared/versions.js'
import type { AppUpdate } from '@shared/types/app.js'
import { APP_VERSION } from '@server/app-version.js'
import { errorText } from '@server/lib/http/http-error.js'
import { latestReleaseTag } from '@server/lib/github-releases.js'

const APP_REPOSITORY = 'littlenines/youtube-downloader-gui'

let startupCheck: Promise<AppUpdate | null> | null = null

export const appUpdateFromTag = (tag: string, currentVersion: string): AppUpdate | null => {
  if (!isNewerVersion(tag, currentVersion)) return null

  return {
    version: tag.replace(/^v/, ''),
    releaseUrl: `https://github.com/${APP_REPOSITORY}/releases/tag/${encodeURIComponent(tag)}`,
  }
}

const checkLatestRelease = (): Promise<AppUpdate | null> =>
  latestReleaseTag(APP_REPOSITORY).then(
    (tag) => appUpdateFromTag(tag, APP_VERSION),
    (error: unknown) => {
      console.warn(`Checking for a new app version failed: ${errorText(error)}`)

      return null
    },
  )

export const startupAppUpdate = (): Promise<AppUpdate | null> => {
  startupCheck ??= checkLatestRelease()

  return startupCheck
}

export const checkForAppUpdateOnStartup = (): void => {
  void startupAppUpdate()
}
