import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { changelogSection, releaseNotes } from '@scripts/release-texts.js'

const CHANGELOG = `# Changelog

Intro text.

## Unreleased

- Not yet.

## 1.2.0 - 2026-10-24

### Added

- **Pause and resume.**

## 1.1.0

- Older.
`

describe('changelogSection', () => {
  it('takes the lines between the version heading and the next one', () => {
    assert.equal(changelogSection(CHANGELOG, '1.2.0'), '### Added\n\n- **Pause and resume.**')
    assert.equal(changelogSection(CHANGELOG, '1.1.0'), '- Older.')
  })

  it('reads Windows line endings', () => {
    assert.equal(changelogSection(CHANGELOG.replaceAll('\n', '\r\n'), '1.1.0'), '- Older.')
  })

  it('refuses a missing or empty section', () => {
    assert.throws(() => changelogSection(CHANGELOG, '1.3.0'), /no "## 1.3.0" section/)
    assert.throws(() => changelogSection(CHANGELOG, '1.2'), /no "## 1.2" section/)
    assert.throws(() => changelogSection('## 2.0.0\n\n## 1.0.0\n- x', '2.0.0'), /is empty/)
  })
})

describe('releaseNotes', () => {
  it('starts with the download links for that version', () => {
    const notes = releaseNotes(CHANGELOG, '1.2.0')

    assert.ok(notes.startsWith('## Download'))
    assert.match(notes, /releases\/download\/v1\.2\.0\/yt-downloader-win-x64\.zip/)
  })

  it('ends with the changes of that version, folded away', () => {
    const notes = releaseNotes(CHANGELOG, '1.2.0')

    assert.match(
      notes,
      /## What's new\n\n<details>\n<summary>All changes in 1\.2\.0<\/summary>\n\n### Added\n\n- \*\*Pause and resume\.\*\*\n\n<\/details>\n$/,
    )
    assert.ok(notes.indexOf('## Download') < notes.indexOf('<details>'))
    assert.doesNotMatch(notes, /Not yet|Older/)
  })
})
