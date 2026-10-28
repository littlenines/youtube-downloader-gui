import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CLIP_REASON,
  commonLanguageOptions,
  pickedTrack,
  trackOptions,
  whyNoSubtitles,
  whyNoVideoSubtitles,
  type SubtitleChoices,
} from '@client/components/choices/subtitle-options.js'

const CLIP = { startSeconds: 60, endSeconds: 70 }

const choices = (changes: Partial<SubtitleChoices> = {}): SubtitleChoices => ({
  container: 'mkv',
  subtitleFormat: 'embedded',
  subtitleLanguage: 'en',
  ...changes,
})

const TRACKS = [
  { language: 'en-US', isAutomatic: false },
  { language: 'ja', isAutomatic: true },
]

describe('subtitle options in the panels', () => {
  it('turns subtitles off for WebM only when they would go in the video', () => {
    assert.match(whyNoSubtitles(choices({ container: 'webm' })) ?? '', /WebM/)
    assert.equal(whyNoSubtitles(choices({ container: 'webm', subtitleFormat: 'srt' })), null)
    assert.equal(whyNoSubtitles(choices()), null)
  })

  it('turns them off for a clip in the video panel only, so a clip left from another video never blocks a batch', () => {
    assert.equal(whyNoVideoSubtitles(choices({ subtitleFormat: 'srt' }), CLIP), CLIP_REASON)
    assert.equal(whyNoSubtitles(choices({ subtitleFormat: 'srt' })), null)
  })

  it('picks the remembered language for a video, but nothing for a clip, WebM in the video, or no language', () => {
    assert.deepEqual(
      [
        pickedTrack(TRACKS, choices(), null)?.language,
        pickedTrack(TRACKS, choices(), CLIP),
        pickedTrack(TRACKS, choices({ container: 'webm' }), null),
        pickedTrack(TRACKS, choices({ subtitleLanguage: null }), null),
      ],
      ['en-US', null, null, null],
    )
  })

  it('names each track, marking the automatic one', () => {
    assert.deepEqual(
      trackOptions(TRACKS).map(({ label }) => label),
      ['English (United States)', 'Japanese (auto-generated)'],
    )
  })

  it('offers common languages by name, plus a remembered one that is not among them', () => {
    const labels = (rememberedLanguage: string | null) =>
      commonLanguageOptions(rememberedLanguage).map(({ label }) => label)

    assert.ok(labels(null).includes('Chinese (Simplified)'))
    assert.deepEqual(
      labels(null),
      [...labels(null)].sort((first, second) => first.localeCompare(second)),
    )
    assert.equal(labels('en').length, labels(null).length)
    assert.ok(labels('fil').includes('Filipino'))
  })
})
