import { screen, type BrowserWindow } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIRECTORY } from '@server/config.js'

const WINDOW_STATE_FILE_NAME = 'window.json'
const DEFAULT_WINDOW_SIZE = { width: 1120, height: 860 }
const VISIBLE_MARGIN_PIXELS = { left: 40, top: 40, right: 100, bottom: 100 }

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized?: boolean
}

export const readWindowFile = (fileName: string): unknown => {
  try {
    return JSON.parse(readFileSync(join(DATA_DIRECTORY, fileName), 'utf8'))
  } catch {
    return null
  }
}

export const writeWindowFile = (fileName: string, content: unknown): void => {
  try {
    mkdirSync(DATA_DIRECTORY, { recursive: true })
    writeFileSync(join(DATA_DIRECTORY, fileName), JSON.stringify(content))
  } catch {}
}

export const loadWindowState = (): WindowState => {
  const state = readWindowFile(WINDOW_STATE_FILE_NAME) as WindowState | null

  return state && state.width > 0 && state.height > 0 ? state : { ...DEFAULT_WINDOW_SIZE }
}

export const saveWindowState = (window: BrowserWindow): void =>
  writeWindowFile(WINDOW_STATE_FILE_NAME, { ...window.getNormalBounds(), maximized: window.isMaximized() })

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
