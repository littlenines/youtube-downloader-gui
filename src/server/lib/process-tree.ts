import { spawnSync } from 'node:child_process'
import { IS_WINDOWS } from '@server/config.js'

const sendTerminateSignal = (processId: number): boolean => {
  try {
    process.kill(processId, 'SIGTERM')

    return true
  } catch {
    return false
  }
}

export const killProcessTree = (processId: number | undefined): void => {
  if (!processId) return

  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/PID', String(processId), '/T', '/F'], { windowsHide: true })

    return
  }

  if (!sendTerminateSignal(-processId)) sendTerminateSignal(processId)
}
