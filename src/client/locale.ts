import { desktopBridge } from '@client/desktop.js'
import { createDateTimeFormatter, describeStartTime, supportedLocale } from '@client/utils/format.js'

export const pageLocale = supportedLocale(desktopBridge?.systemLocale)

export const formatDateTime = createDateTimeFormatter(pageLocale)

const clockTimeFormat = new Intl.DateTimeFormat(pageLocale, { hour: '2-digit', minute: '2-digit' })
const shortDateFormat = new Intl.DateTimeFormat(pageLocale, { dateStyle: 'short' })

export const formatStartTime = (isoDate: string | null): string =>
  isoDate
    ? describeStartTime(
        new Date(isoDate),
        new Date(),
        (date) => clockTimeFormat.format(date),
        (date) => shortDateFormat.format(date),
      )
    : 'at the set time'
