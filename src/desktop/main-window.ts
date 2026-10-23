import { BrowserWindow, dialog, nativeTheme, shell } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_NAME } from './app-identity.js'
import { isOnScreen, loadWindowState } from './window-state.js'

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const MINIMUM_WINDOW_SIZE = { width: 520, height: 560 }
const BACKGROUND_COLORS = { dark: '#111110', light: '#f6f6f4' }

const openWebAddressOutside = (url: string): void => {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
}

const keepNavigationInsideApp = (window: BrowserWindow, origin: string): void => {
  window.webContents.setWindowOpenHandler(({ url }) => {
    openWebAddressOutside(url)

    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${origin}/`)) return

    event.preventDefault()
    openWebAddressOutside(url)
  })
}

export const createMainWindow = (origin: string): BrowserWindow => {
  const savedState = loadWindowState()
  const window = new BrowserWindow({
    width: savedState.width,
    height: savedState.height,
    ...(isOnScreen(savedState) ? { x: savedState.x, y: savedState.y } : {}),
    minWidth: MINIMUM_WINDOW_SIZE.width,
    minHeight: MINIMUM_WINDOW_SIZE.height,
    title: APP_NAME,
    icon: join(moduleDirectory, 'icon.png'),
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? BACKGROUND_COLORS.dark : BACKGROUND_COLORS.light,
    webPreferences: {
      preload: join(moduleDirectory, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  if (savedState.maximized) window.maximize()

  window.once('ready-to-show', () => window.show())
  keepNavigationInsideApp(window, origin)
  void window.loadURL(`${origin}/`)

  return window
}

export const pickFolder = async (window: BrowserWindow, currentFolder: unknown): Promise<string | null> => {
  const result = await dialog.showOpenDialog(window, {
    title: 'Save downloads to',
    defaultPath: typeof currentFolder === 'string' && existsSync(currentFolder) ? currentFolder : undefined,
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
  })

  return result.canceled ? null : (result.filePaths[0] ?? null)
}
