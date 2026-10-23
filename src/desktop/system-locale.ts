const SYSTEM_LOCALE_ARGUMENT = '--system-locale='
const POSIX_DEFAULT_LOCALES = new Set(['C', 'POSIX'])

const languageTagFrom = (systemLocale: string): string => (systemLocale.split(/[.@]/)[0] ?? '').replaceAll('_', '-')

export const normalizeSystemLocale = (systemLocale: string): string | null => {
  const languageTag = languageTagFrom(systemLocale.trim())

  if (!languageTag || POSIX_DEFAULT_LOCALES.has(languageTag)) return null

  try {
    return Intl.getCanonicalLocales(languageTag)[0] ?? null
  } catch {
    console.warn(`Unrecognized system locale "${systemLocale}". Dates use the default format.`)

    return null
  }
}

export const systemLocaleArguments = (systemLocale: string): string[] => {
  const languageTag = normalizeSystemLocale(systemLocale)

  return languageTag ? [`${SYSTEM_LOCALE_ARGUMENT}${languageTag}`] : []
}

export const systemLocaleFromArguments = (argumentList: string[]): string | null =>
  argumentList.find((argument) => argument.startsWith(SYSTEM_LOCALE_ARGUMENT))?.slice(SYSTEM_LOCALE_ARGUMENT.length) ||
  null
