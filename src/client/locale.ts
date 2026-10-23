import { desktopBridge } from '@client/desktop.js'
import { createDateTimeFormatter, supportedLocale } from '@client/utils/format.js'

export const pageLocale = supportedLocale(desktopBridge?.systemLocale)

export const formatDateTime = createDateTimeFormatter(pageLocale)
