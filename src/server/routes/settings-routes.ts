import type { AppUpdateResponse, Settings, StatusResponse } from '@shared/types/app.js'
import { readJsonBody } from '@server/lib/http/json.js'
import type { Router } from '@server/lib/http/router.js'
import { APP_VERSION } from '@server/app-version.js'
import { startupAppUpdate } from '@server/services/app-updates/app-update-check.js'
import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import type { RouteDependencies } from './index.js'
import { showInFileManager } from './route-helpers.js'

const ignoreFailure = () => {}

export const registerSettingsRoutes = (router: Router, { settings, queue, subscriptions }: RouteDependencies): void => {
  router.get('/api/status', (): StatusResponse => ({
    ...settings.get(),
    appVersion: APP_VERSION,
    ytdlpVersion: toolSetup.ytdlpVersion,
    platform: `${process.platform}/${process.arch}`,
    setup: toolSetup.status(),
  }))

  router.get('/api/app-update', async (): Promise<AppUpdateResponse> => ({
    currentVersion: APP_VERSION,
    update: await startupAppUpdate(),
  }))

  router.post('/api/setup', () => {
    toolSetup.ensureInstalled().catch(ignoreFailure)

    return toolSetup.status()
  })

  router.post('/api/settings', async ({ request }) => {
    const updatedSettings = await settings.update(await readJsonBody<Settings>(request))

    queue.startQueuedJobs()
    subscriptions.restartSchedule()

    return updatedSettings
  })

  router.post('/api/open-folder', async () => {
    await showInFileManager(undefined, settings.get().downloadFolder)
  })
}
