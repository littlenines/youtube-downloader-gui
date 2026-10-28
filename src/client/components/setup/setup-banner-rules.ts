import type { SetupStatus } from '@shared/types/app.js'

export const isRoutineToolCheck = ({ installed, state, message }: SetupStatus): boolean =>
  installed && state === 'running' && !message

export const isSetupBannerShown = (status: SetupStatus, isSetupDialogOpen: boolean): boolean => {
  if (isSetupDialogOpen || status.state === 'ready' || isRoutineToolCheck(status)) return false

  return !status.installed || status.state === 'running'
}
