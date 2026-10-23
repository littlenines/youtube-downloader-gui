import type { Settings, StatusResponse } from '@shared/types.js'
import { readJsonBody } from '@server/lib/http/json.js'
import type { Router } from '@server/lib/http/router.js'
import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import type { RouteDependencies } from './index.js'
import { showInFileManager } from './route-helpers.js'

const ignoreFailure = () => {}

export const registerSettingsRoutes = (router: Router, { settings, queue }: RouteDependencies): void => {
  router.get('/api/status', (): StatusResponse => ({
    ...settings.get(),
    ytdlpVersion: toolSetup.ytdlpVersion,
    platform: `${process.platform}/${process.arch}`,
    setup: toolSetup.status(),
  }))

  router.post('/api/setup', () => {
    toolSetup.ensureInstalled().catch(ignoreFailure)

    return toolSetup.status()
  })

  router.post('/api/settings', async ({ request }) => {
    const updatedSettings = await settings.update(await readJsonBody<Settings>(request))

    queue.startQueuedJobs()

    return updatedSettings
  })

  router.post('/api/open-folder', async () => {
    await showInFileManager(undefined, settings.get().downloadFolder)
  })
}
