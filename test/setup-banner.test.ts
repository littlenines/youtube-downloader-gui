import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SetupStatus } from '@shared/types/app.js'
import { isSetupBannerShown } from '@client/components/setup/setup-banner-rules.js'

const status = (changes: Partial<SetupStatus>): SetupStatus => ({
  state: 'ready',
  installed: true,
  message: null,
  progress: null,
  downloadSizeMegabytes: 0,
  ...changes,
})

describe('isSetupBannerShown', () => {
  it('stays hidden for the quick check of installed tools at every start', () => {
    assert.equal(isSetupBannerShown(status({ state: 'running' }), false), false)
    assert.equal(isSetupBannerShown(status({}), false), false)
  })

  it('shows the weekly yt-dlp update check, since a link pasted meanwhile waits for it', () => {
    assert.equal(
      isSetupBannerShown(status({ state: 'running', message: 'Checking for a yt-dlp update…' }), false),
      true,
    )
  })

  it('shows missing tools, their download and a failed setup, unless the setup dialog is open', () => {
    const missing = status({ state: 'missing', installed: false, downloadSizeMegabytes: 120 })
    const installing = status({ state: 'running', installed: false, message: 'Downloading yt-dlp (1 of 2)…' })
    const failed = status({ state: 'error', installed: false, message: 'Network error.' })

    assert.deepEqual(
      [missing, installing, failed].map((shown) => isSetupBannerShown(shown, false)),
      [true, true, true],
    )
    assert.equal(isSetupBannerShown(missing, true), false)
  })
})
