import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDateTimeFormatter, describeStartTime, supportedLocale } from '@client/utils/format.js'
import { normalizeSystemLocale, systemLocaleArguments, systemLocaleFromArguments } from '@desktop/system-locale.js'

const MIDDAY_UTC = '2026-10-23T12:00:00.000Z'

describe('normalizeSystemLocale', () => {
  it('keeps language tags and turns POSIX names into them', () => {
    assert.equal(normalizeSystemLocale('en-GB'), 'en-GB')
    assert.equal(normalizeSystemLocale('de_DE'), 'de-DE')
    assert.equal(normalizeSystemLocale('de_DE.UTF-8'), 'de-DE')
    assert.equal(normalizeSystemLocale('sr_RS@latin'), 'sr-RS')
  })

  it('gives null for the POSIX default, empty and unreadable values', (context) => {
    const warn = context.mock.method(console, 'warn', () => {})

    assert.equal(normalizeSystemLocale('C'), null)
    assert.equal(normalizeSystemLocale('POSIX.UTF-8'), null)
    assert.equal(normalizeSystemLocale(''), null)
    assert.equal(normalizeSystemLocale('not a locale'), null)
    assert.equal(warn.mock.callCount(), 1)
  })
})

describe('passing the system locale to the page', () => {
  it('reads back what the window was given', () => {
    const argumentList = ['electron', ...systemLocaleArguments('de_DE.UTF-8')]

    assert.equal(systemLocaleFromArguments(argumentList), 'de-DE')
  })

  it('gives null when the argument is missing or empty', () => {
    assert.deepEqual(systemLocaleArguments('C'), [])
    assert.equal(systemLocaleFromArguments(['electron']), null)
    assert.equal(systemLocaleFromArguments(['electron', '--system-locale=']), null)
  })
})

describe('formatting dates for the page', () => {
  it('accepts only locales the page can format', () => {
    assert.equal(supportedLocale('en-GB'), 'en-GB')
    assert.equal(supportedLocale(null), undefined)
    assert.equal(supportedLocale('not a locale'), undefined)
  })

  it('formats like toLocaleString in the given locale', () => {
    const formatDateTime = createDateTimeFormatter('en-GB')

    assert.equal(formatDateTime(MIDDAY_UTC), new Date(MIDDAY_UTC).toLocaleString('en-GB'))
    assert.match(formatDateTime(MIDDAY_UTC), /^23\/10\/2026, \d{2}:\d{2}:\d{2}$/)
  })

  it('gives an empty text for a date it cannot read', () => {
    assert.equal(createDateTimeFormatter('en-GB')('not a date'), '')
  })
})

describe('when a waiting download starts', () => {
  const now = new Date(2026, 9, 24, 23, 30)
  const formatTime = (date: Date) => `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
  const formatDate = (date: Date) => `${date.getDate()}.${date.getMonth() + 1}.`

  it('says today or tomorrow, the way people say it', () => {
    assert.equal(describeStartTime(new Date(2026, 9, 24, 23, 45), now, formatTime, formatDate), 'at 23:45')
    assert.equal(describeStartTime(new Date(2026, 9, 25, 2, 0), now, formatTime, formatDate), 'tomorrow at 2:00')
    assert.equal(
      describeStartTime(new Date(2026, 9, 27, 2, 0), now, formatTime, formatDate),
      'on 27.10. at 2:00',
      'other days use the page date format',
    )
  })
})
