import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  languageName,
  languageWithScript,
  matchingSubtitleTrack,
  savedSubtitleLanguage,
  subtitleChoiceFor,
} from '@shared/subtitle-languages.js'

describe('languageName', () => {
  it('names a language code in English, and keeps a code it cannot name', () => {
    assert.deepEqual(['sr', 'pt-BR', 'zh-Hans', 'en_US'].map(languageName), [
      'Serbian',
      'Portuguese (Brazil)',
      'Chinese (Simplified)',
      'en_US',
    ])
  })

  it('finds the language and script a code stands for, also when only the region says it', () => {
    assert.deepEqual(
      ['en-GB', 'pt_BR', 'zh-CN', 'zh-TW', 'zh', 'zh-Hant-TW', 'sr', 'sr-Latn', 'iw', 'en_US_x'].map(
        languageWithScript,
      ),
      ['en-latn', 'pt-latn', 'zh-hans', 'zh-hant', 'zh-hans', 'zh-hant', 'sr-cyrl', 'sr-latn', 'he-hebr', 'en'],
    )
  })
})

describe('savedSubtitleLanguage', () => {
  it('reads "subtitles: true" from earlier versions as English, and drops codes yt-dlp would read as a pattern', () => {
    assert.deepEqual(
      [
        savedSubtitleLanguage({ subtitles: true }),
        savedSubtitleLanguage({ subtitleLanguage: null, subtitles: true }),
        savedSubtitleLanguage({ subtitleLanguage: 'sr' }),
        savedSubtitleLanguage({ subtitleLanguage: 'en.*' }),
      ],
      ['en', null, 'sr', null],
    )
  })
})

describe('matchingSubtitleTrack', () => {
  const pick = (wantedLanguage: string, languages: string[]) =>
    matchingSubtitleTrack(
      languages.map((language) => ({ language, isAutomatic: false })),
      wantedLanguage,
    )?.language ?? null

  it('picks the remembered language, or the same language from another region', () => {
    assert.equal(pick('en-GB', ['de', 'en-US', 'en-GB']), 'en-GB')
    assert.equal(pick('en', ['de', 'en-US']), 'en-US')
  })

  it('prefers the plain language to another region of it', () => {
    assert.equal(pick('pt-BR', ['pt-PT', 'pt']), 'pt')
  })

  it('never picks another script of the language, but knows the script a region or plain code stands for', () => {
    assert.deepEqual(
      [
        pick('zh-Hans', ['zh-Hant']),
        pick('sr-Latn', ['sr-Cyrl']),
        pick('zh-Hans', ['zh-TW', 'zh-CN']),
        pick('zh-Hant', ['zh-CN', 'zh-TW']),
        pick('zh-Hans', ['zh-TW', 'zh']),
        pick('zh', ['zh-Hant', 'zh-Hans']),
        pick('sr', ['sr-Latn', 'sr-Cyrl']),
      ],
      [null, null, 'zh-CN', 'zh-TW', 'zh', 'zh-Hans', 'sr-Cyrl'],
    )
  })

  it('picks nothing when the video lacks the language', () => {
    assert.equal(pick('sr', ['de', 'en']), null)
  })
})

describe('subtitleChoiceFor', () => {
  it('asks for an uploaded track exactly and for an automatic one as the spoken language, never a translation', () => {
    assert.deepEqual(
      [
        subtitleChoiceFor({ language: 'de', isAutomatic: false }),
        subtitleChoiceFor({ language: 'ja', isAutomatic: true }),
        subtitleChoiceFor(null),
      ],
      [
        { subtitleLanguage: 'de', subtitleMatch: 'exact' },
        { subtitleLanguage: 'ja', subtitleMatch: 'spoken' },
        { subtitleLanguage: null, subtitleMatch: 'language' },
      ],
    )
  })
})
