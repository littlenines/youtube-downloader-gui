import type { AppUpdateResponse, Settings, StatusResponse } from '@shared/types/app.js'
import { HttpError } from '@server/lib/http/http-error.js'
import { readJsonBody } from '@server/lib/http/json.js'
import type { Router } from '@server/lib/http/router.js'
import { ignoreFailure } from '@server/lib/ignore-failure.js'
import { APP_VERSION } from '@server/app-version.js'
import { startupAppUpdate } from '@server/services/app-updates/app-update-check.js'
import { appUpdater } from '@server/services/app-updates/app-updater.js'
import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import type { RouteDependencies } from './index.js'
import { showInFileManager } from './route-helpers.js'

export const registerSettingsRoutes = (router: Router, { settings, queue, subscriptions }: RouteDependencies): void => {
  router.get('/api/status', (): StatusResponse => ({
    ...settings.get(),
    appVersion: APP_VERSION,
    ytdlpVersion: toolSetup.ytdlpVersion,
    platform: `${process.platform}/${process.arch}`,
    canInstallUpdates: appUpdater.status().canInstall,
    setup: toolSetup.status(),
  }))

  router.get('/api/app-update', async (): Promise<AppUpdateResponse> => ({
    currentVersion: APP_VERSION,
    update: await startupAppUpdate(),
    installation: appUpdater.status(),
  }))

  router.post('/api/app-update/install', () => {
    if (!appUpdater.status().canInstall) {
      throw new HttpError(
        400,
        "This copy of the app can't update itself. Download the new version from the release page.",
      )
    }

    appUpdater.installNow().catch(ignoreFailure)

    return appUpdater.status()
  })

  router.post('/api/setup', () => {
    toolSetup.ensureInstalled().catch(ignoreFailure)

    return toolSetup.status()
  })

  router.post('/api/settings', async ({ request }) => {
    const changes = await readJsonBody<Settings>(request)
    const updatedSettings = await settings.update(changes)

    queue.downloadWindowChanged()
    subscriptions.restartSchedule()

    if (changes.installUpdatesAutomatically === true) appUpdater.prepareIfAutomatic()

    return updatedSettings
  })

  router.post('/api/open-folder', async () => {
    await showInFileManager(undefined, settings.get().downloadFolder)
  })
}
