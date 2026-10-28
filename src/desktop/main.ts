import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import { statSync } from 'node:fs'
import type { Server } from 'node:http'
import { createApp } from '@server/app.js'
import { useDesktopShell } from '@server/lib/desktop-shell.js'
import { ACCESS_COOKIE_NAME } from '@server/security/access-cookie.js'
import { loadOrCreateAccessKey } from '@server/security/access-key-file.js'
import { createServices, listen, type Services } from '@server/server.js'
import { checkForAppUpdateOnStartup } from '@server/services/app-updates/app-update-check.js'
import { appUpdater } from '@server/services/app-updates/app-updater.js'
import { toolSetup } from '@server/services/tools/app-tool-setup.js'
import { APP_NAME } from './app-identity.js'
import { enableAppUpdates } from './app-updates.js'
import { confirmCloseWhileDownloading } from './close-confirmation.js'
import { enableContextMenus } from './context-menu.js'
import { notifyWhenDownloadsFinish } from './download-notifications.js'
import { watchDownloads } from './download-watcher.js'
import { createMainWindow, isFromAppPage, openWebAddressOutside, pickFolder } from './main-window.js'
import { createMiniMode, type MiniMode } from './mini-window.js'
import { stopServing } from './shut-down.js'
import { applyStartUpSwitches } from './start-up-switches.js'
import { showProgressOnTaskbar } from './taskbar-progress.js'

const PREFERRED_PORT = 5199
const LOOPBACK_ADDRESS = '127.0.0.1'
const ALLOWED_PERMISSIONS = new Set(['clipboard-read', 'clipboard-sanitized-write'])
const ACCESS_COOKIE_LIFETIME_SECONDS = 365 * 24 * 3600

let miniMode: MiniMode | null = null

const focusMainWindow = (): void => miniMode?.leave()

const allowOnlyClipboardPermissions = (): void => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) =>
    callback(ALLOWED_PERMISSIONS.has(permission)),
  )
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => ALLOWED_PERMISSIONS.has(permission))
}

const storeAccessCookie = (origin: string, accessKey: string): Promise<void> =>
  session.defaultSession.cookies.set({
    url: origin,
    name: ACCESS_COOKIE_NAME,
    value: accessKey,
    httpOnly: true,
    sameSite: 'strict',
    expirationDate: Date.now() / 1000 + ACCESS_COOKIE_LIFETIME_SECONDS,
  })

const useElectronShell = (): void => {
  useDesktopShell({
    openUrl: openWebAddressOutside,
    reveal: (target) => (statSync(target).isFile() ? shell.showItemInFolder(target) : void shell.openPath(target)),
    openFile: async (file) => {
      const error = await shell.openPath(file)

      if (error) throw new Error(error)
    },
  })
}

const answerFolderPicker = (window: BrowserWindow, origin: string): void => {
  ipcMain.handle('pick-folder', (event, currentFolder: unknown) =>
    isFromAppPage(event, origin) ? pickFolder(window, currentFolder) : null,
  )
}

const quitWhenAllWindowsClose = (server: Server, services: Services): void => {
  app.on('window-all-closed', () => {
    void stopServing(server, services)
      .then(() => appUpdater.installOnQuit())
      .finally(() => app.quit())
  })
}

const startDesktopApp = async (): Promise<void> => {
  Menu.setApplicationMenu(null)

  const services = await createServices()
  const accessKey = await loadOrCreateAccessKey()
  const server = createApp(services, { loopbackOnly: true, accessKey })
  const port = await listen(server, PREFERRED_PORT, LOOPBACK_ADDRESS).catch(() => listen(server, 0, LOOPBACK_ADDRESS))
  const origin = `http://${LOOPBACK_ADDRESS}:${port}`

  allowOnlyClipboardPermissions()
  enableContextMenus()
  await storeAccessCookie(origin, accessKey)
  useElectronShell()

  const window = createMainWindow(origin)

  const windowMiniMode = createMiniMode(window, origin, services)
  const shownWindows = () => [windowMiniMode.shownWindow() ?? window]

  miniMode = windowMiniMode
  answerFolderPicker(window, origin)
  watchDownloads(window, services, [
    showProgressOnTaskbar(window, shownWindows),
    notifyWhenDownloadsFinish(window, services, focusMainWindow),
  ])
  confirmCloseWhileDownloading(window, services)
  quitWhenAllWindowsClose(server, services)
  toolSetup.initialize()
  checkForAppUpdateOnStartup()
  enableAppUpdates(window, server, services)
}

const showStartFailure = (error: unknown): void => {
  dialog.showErrorBox(APP_NAME, `The app could not start:\n\n${error instanceof Error ? error.message : String(error)}`)
  app.exit(1)
}

applyStartUpSwitches()

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', focusMainWindow)
  app.whenReady().then(startDesktopApp).catch(showStartFailure)
} else {
  app.quit()
}
