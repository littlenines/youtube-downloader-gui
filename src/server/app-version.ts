import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_DIRECTORY } from './config.js'

declare const __APP_VERSION__: string | undefined

const UNKNOWN_VERSION = 'unknown'

const readSourceVersion = (): string => {
  try {
    const manifest = JSON.parse(readFileSync(join(APP_DIRECTORY, 'package.json'), 'utf8')) as { version?: unknown }

    return typeof manifest.version === 'string' ? manifest.version : UNKNOWN_VERSION
  } catch {
    return UNKNOWN_VERSION
  }
}

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : readSourceVersion()
