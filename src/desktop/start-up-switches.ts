import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from '@shared/types/app.js'
import { DATA_DIRECTORY, IS_PACKAGED, IS_WINDOWS } from '@server/config.js'
import { parseSettings } from '@server/services/stores/settings-store.js'
import { APP_NAME } from './app-identity.js'

const DISK_CACHE_BYTES = 10 * 1024 * 1024

const readStoredSettings = (): Settings => {
  try {
    return parseSettings(JSON.parse(readFileSync(join(DATA_DIRECTORY, 'settings.json'), 'utf8')))
  } catch {
    return parseSettings(undefined)
  }
}

const hasRemoteDebuggingSwitch = (): boolean =>
  app.commandLine.hasSwitch('remote-debugging-port') || app.commandLine.hasSwitch('remote-debugging-pipe')

export const applyStartUpSwitches = (): void => {
  app.setPath('userData', join(DATA_DIRECTORY, 'window'))
  app.setName(APP_NAME)
  app.setAppUserModelId(APP_NAME)
  app.commandLine.appendSwitch('disk-cache-size', String(DISK_CACHE_BYTES))

  if (IS_WINDOWS && readStoredSettings().lowLatencyRendering) app.commandLine.appendSwitch('disable-direct-composition')

  if (IS_PACKAGED && hasRemoteDebuggingSwitch()) app.exit(1)
}
