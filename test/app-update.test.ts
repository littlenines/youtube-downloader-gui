import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { APP_VERSION } from '@server/app-version.js'
import { appUpdateFromTag } from '@server/services/app-updates/app-update-check.js'
import { isNewerVersion, parseVersion } from '@shared/versions.js'

describe('comparing app versions', () => {
  it('reads release tags with or without a leading v', () => {
    assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3])
    assert.deepEqual(parseVersion('10.0.12'), [10, 0, 12])
    assert.equal(parseVersion('v1.2'), null)
    assert.equal(parseVersion('v1.2.3-beta.1'), null)
  })

  it('compares each part as a number', () => {
    assert.equal(isNewerVersion('v1.0.1', '1.0.0'), true)
    assert.equal(isNewerVersion('v1.10.0', '1.9.9'), true)
    assert.equal(isNewerVersion('v2.0.0', '1.99.99'), true)
    assert.equal(isNewerVersion('v1.0.0', '1.0.0'), false)
    assert.equal(isNewerVersion('v0.9.0', '1.0.0'), false)
    assert.equal(isNewerVersion('nightly', '1.0.0'), false)
  })
})

describe('appUpdateFromTag', () => {
  it('offers a newer release with a link to its page', () => {
    assert.deepEqual(appUpdateFromTag('v1.1.0', '1.0.0'), {
      version: '1.1.0',
      releaseUrl: 'https://github.com/littlenines/youtube-downloader-gui/releases/tag/v1.1.0',
    })
  })

  it('offers nothing when the app is up to date or newer', () => {
    assert.equal(appUpdateFromTag('v1.0.0', '1.0.0'), null)
    assert.equal(appUpdateFromTag('v1.0.0', '1.2.0'), null)
  })

  it('offers nothing when the app does not know its own version', () => {
    assert.equal(appUpdateFromTag('v9.0.0', 'unknown'), null)
  })

  it('reads its own version from package.json when running from source', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

    assert.equal(APP_VERSION, manifest.version)
  })
})
