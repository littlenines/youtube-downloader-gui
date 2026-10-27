import { BrowserWindow, ipcMain, screen } from 'electron'
import type { Services } from '@server/server.js'
import { APP_ICON_PATH, APP_NAME } from './app-identity.js'
import { backgroundColor, isFromAppPage, keepNavigationInsideApp, pageWebPreferences } from './main-window.js'
import { readWindowFile, writeWindowFile } from './window-state.js'

const MINI_WINDOW_SIZE = { width: 360, height: 84 }
const SCREEN_EDGE_MARGIN = 16
const MINI_POSITION_FILE_NAME = 'mini-window.json'
const ABORTED_LOAD_ERROR = -3

interface Position {
  x: number
  y: number
}

export interface MiniMode {
  enter(): void
  leave(): void
  shownWindow(): BrowserWindow | null
}

const isFullyOnScreen = ({ x, y }: Position): boolean =>
  screen
    .getAllDisplays()
    .some(
      ({ workArea }) =>
        x >= workArea.x &&
        y >= workArea.y &&
        x + MINI_WINDOW_SIZE.width <= workArea.x + workArea.width &&
        y + MINI_WINDOW_SIZE.height <= workArea.y + workArea.height,
    )

const bottomRightCorner = (): Position => {
  const { workArea } = screen.getPrimaryDisplay()

  return {
    x: workArea.x + workArea.width - MINI_WINDOW_SIZE.width - SCREEN_EDGE_MARGIN,
    y: workArea.y + workArea.height - MINI_WINDOW_SIZE.height - SCREEN_EDGE_MARGIN,
  }
}

const loadMiniPosition = (): Position => {
  const { x, y } = (readWindowFile(MINI_POSITION_FILE_NAME) ?? {}) as Partial<Position>

  return typeof x === 'number' && typeof y === 'number' && isFullyOnScreen({ x, y }) ? { x, y } : bottomRightCorner()
}

const saveMiniPosition = (window: BrowserWindow): void => {
  const [x, y] = window.getPosition()

  writeWindowFile(MINI_POSITION_FILE_NAME, { x, y })
}

export const createMiniMode = (mainWindow: BrowserWindow, origin: string, { settings }: Services): MiniMode => {
  let miniWindow: BrowserWindow | null = null
  let isMiniWindowShown = false

  const showMainWindow = (): void => {
    if (mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()

    mainWindow.show()
    mainWindow.focus()
  }

  const showMiniWindow = (window: BrowserWindow): void => {
    window.showInactive()
    isMiniWindowShown = true

    if (!mainWindow.isDestroyed()) mainWindow.hide()
  }

  const createMiniWindow = (): BrowserWindow => {
    const window = new BrowserWindow({
      ...MINI_WINDOW_SIZE,
      ...loadMiniPosition(),
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      title: APP_NAME,
      icon: APP_ICON_PATH,
      show: false,
      backgroundColor: backgroundColor(),
      webPreferences: pageWebPreferences(),
    })

    keepNavigationInsideApp(window, origin)
    window.once('ready-to-show', () => showMiniWindow(window))
    window.on('moved', () => saveMiniPosition(window))
    window.on('close', () => saveMiniPosition(window))
    window.on('closed', () => {
      miniWindow = null
      isMiniWindowShown = false
      showMainWindow()
    })
    window.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
      if (isMainFrame && errorCode !== ABORTED_LOAD_ERROR) window.close()
    })
    window.loadURL(`${origin}/mini.html`).catch(() => {
      if (!window.isDestroyed()) window.close()
    })

    return window
  }

  const enter = (): void => {
    if (!miniWindow) miniWindow = createMiniWindow()
    else if (isMiniWindowShown) showMiniWindow(miniWindow)
  }

  const leave = (): void => {
    if (miniWindow) miniWindow.close()
    else showMainWindow()
  }

  ipcMain.handle('enter-mini-mode', (event) => (isFromAppPage(event, origin) ? enter() : undefined))
  ipcMain.handle('leave-mini-mode', (event) => (isFromAppPage(event, origin) ? leave() : undefined))
  mainWindow.on('minimize', () => {
    if (settings.get().miniModeWhenMinimizing) enter()
  })
  mainWindow.on('closed', () => miniWindow?.destroy())

  return { enter, leave, shownWindow: () => (isMiniWindowShown ? miniWindow : null) }
}
