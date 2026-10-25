import { app, type BrowserWindow } from 'electron'
import type { Server } from 'node:http'
import { join } from 'node:path'
import { APP_DIRECTORY, IS_WINDOWS } from '@server/config.js'
import type { Services } from '@server/server.js'
import { appUpdater } from '@server/services/app-updates/app-updater.js'
import { stopServing } from './shut-down.js'
import { saveWindowState } from './window-state.js'

const LINUX_LAUNCHER = 'yt-downloader'

const restartExecutable = (): string => (IS_WINDOWS ? process.execPath : join(APP_DIRECTORY, LINUX_LAUNCHER))

export const enableAppUpdates = (window: BrowserWindow, server: Server, services: Services): void => {
  appUpdater.enable({
    installsAutomatically: () => services.settings.get().installUpdatesAutomatically,
    restart: async () => {
      if (!window.isDestroyed()) saveWindowState(window)

      await stopServing(server, services)
      app.relaunch({ execPath: restartExecutable(), args: [] })
      app.exit(0)
    },
  })
}
