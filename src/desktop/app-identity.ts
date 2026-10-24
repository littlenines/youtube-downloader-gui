import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP_NAME = 'YT Downloader'
export const APP_ICON_PATH = join(dirname(fileURLToPath(import.meta.url)), 'icon.png')
