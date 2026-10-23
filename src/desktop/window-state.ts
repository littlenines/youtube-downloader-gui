import { screen, type BrowserWindow } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIRECTORY } from '@server/config.js'

const WINDOW_STATE_FILE = join(DATA_DIRECTORY, 'window.json')
const DEFAULT_WINDOW_SIZE = { width: 1120, height: 860 }
const VISIBLE_MARGIN_PIXELS = { left: 40, top: 40, right: 100, bottom: 100 }

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized?: boolean
}

export const loadWindowState = (): WindowState => {
  try {
    const state = JSON.parse(readFileSync(WINDOW_STATE_FILE, 'utf8')) as WindowState

    if (state.width > 0 && state.height > 0) return state
  } catch {}

  return { ...DEFAULT_WINDOW_SIZE }
}

export const saveWindowState = (window: BrowserWindow): void => {
  try {
    mkdirSync(DATA_DIRECTORY, { recursive: true })
    writeFileSync(WINDOW_STATE_FILE, JSON.stringify({ ...window.getNormalBounds(), maximized: window.isMaximized() }))
  } catch {}
}

export const isOnScreen = ({ x: left, y: top }: WindowState): boolean => {
  if (left === undefined || top === undefined) return false

  return screen
    .getAllDisplays()
    .some(
      ({ workArea }) =>
        left >= workArea.x - VISIBLE_MARGIN_PIXELS.left &&
        top >= workArea.y - VISIBLE_MARGIN_PIXELS.top &&
        left < workArea.x + workArea.width - VISIBLE_MARGIN_PIXELS.right &&
        top < workArea.y + workArea.height - VISIBLE_MARGIN_PIXELS.bottom,
    )
}
