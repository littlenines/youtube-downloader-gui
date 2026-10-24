import type { Settings } from '@shared/types/app.js'
import { countText } from '@shared/count-text.js'
import { api } from '@client/api.js'
import { announceDownloadsChanged } from '@client/events.js'
import { findElement, showToast } from '@client/utils/dom.js'
import { saveSetting } from './save-setting.js'

type LaterTimes = Pick<Settings, 'laterStartTime' | 'laterStopTime'>

const laterStartInput = () => findElement<HTMLInputElement>('#laterStartInput')
const laterStopInput = () => findElement<HTMLInputElement>('#laterStopInput')

let savedLaterTimes = { start: '', stop: '' }

const rememberLaterTimes = ({ laterStartTime, laterStopTime }: LaterTimes): void => {
  savedLaterTimes = { start: laterStartTime ?? '', stop: laterStopTime ?? '' }
  laterStopInput().disabled = !laterStartTime
}

export const fillLaterTimes = (settings: LaterTimes): void => {
  rememberLaterTimes(settings)
  laterStartInput().value = savedLaterTimes.start
  laterStopInput().value = savedLaterTimes.stop
}

export const focusLaterStartTime = (): void => laterStartInput().focus()

const saveLaterTimes = async (changes: Partial<LaterTimes>): Promise<void> => {
  const settings = await saveSetting(changes)

  if (!settings) return

  rememberLaterTimes(settings)
  announceDownloadsChanged()
}

const saveLaterStartTime = (): void => {
  const startTime = laterStartInput().value

  if (startTime && startTime !== savedLaterTimes.start) return void saveLaterTimes({ laterStartTime: startTime })
  if (startTime || !savedLaterTimes.start) return

  laterStartInput().value = savedLaterTimes.start
  showToast('To stop using “Later” times, click Turn off.')
}

const saveLaterStopTime = (): void => {
  const stopTime = laterStopInput().value

  if (stopTime !== savedLaterTimes.stop) void saveLaterTimes({ laterStopTime: stopTime || null })
}

const waitingDownloadCount = async (): Promise<number> => {
  const { jobs } = await api.downloads()

  return jobs.filter((job) => job.status === 'scheduled').length
}

const turnOffQuestion = (waitingCount: number): string =>
  waitingCount === 1
    ? 'A download is waiting for the “Later” time. Turning it off starts it now. Turn it off?'
    : `${countText(waitingCount, 'download')} are waiting for the “Later” time. Turning it off starts them now. Turn it off?`

const turnOffLaterTimes = async (): Promise<void> => {
  const waitingCount = await waitingDownloadCount().catch(() => 0)

  if (waitingCount && !confirm(turnOffQuestion(waitingCount))) return

  laterStartInput().value = ''
  laterStopInput().value = ''
  await saveLaterTimes({ laterStartTime: null, laterStopTime: null })
}

export const initializeLaterTimes = (): void => {
  laterStartInput().addEventListener('blur', saveLaterStartTime)
  laterStopInput().addEventListener('blur', saveLaterStopTime)
  findElement('#clearLaterTimesButton').addEventListener('click', () => void turnOffLaterTimes())
}
