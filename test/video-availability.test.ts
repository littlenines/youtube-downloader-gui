import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { availabilityFromError, availabilityFromInfo } from '@server/services/subscriptions/video-availability.js'
import { friendlyErrorMessage } from '@server/services/ytdlp/error-messages.js'

describe('whether a new video can be downloaded yet', () => {
  it('waits for premieres and live streams, and skips restricted videos', () => {
    assert.equal(availabilityFromInfo({ live_status: 'is_upcoming' }), 'not-yet')
    assert.equal(availabilityFromInfo({ live_status: 'post_live' }), 'not-yet')
    assert.equal(availabilityFromInfo({ availability: 'subscriber_only' }), 'never')
    assert.equal(availabilityFromInfo({ live_status: 'not_live', availability: 'public' }), 'ready')
  })

  it('reads yt-dlp errors', () => {
    assert.equal(availabilityFromError('Premieres in 3 hours'), 'not-yet')
    assert.equal(availabilityFromError('This live stream has not started yet.'), 'not-yet')
    assert.equal(availabilityFromError('This video is for channel members only.'), 'never')
    assert.equal(availabilityFromError('This video is private.'), 'never')
    assert.equal(availabilityFromError('YouTube is rate-limiting this connection.'), 'unknown')
    assert.equal(availabilityFromError('Join this channel to get access to members-only content'), 'never')
    assert.equal(availabilityFromError('Sign in to confirm your age'), 'never')
  })

  it("treats YouTube's temporary refusal as worth retrying, not as a removed video", () => {
    const refusal = friendlyErrorMessage(
      "ERROR: [youtube] abc: Video unavailable. This content isn't available, try again later.",
    )

    assert.doesNotMatch(refusal, /removed/)
    assert.equal(availabilityFromError(refusal), 'unknown')
    assert.equal(availabilityFromError(friendlyErrorMessage('ERROR: [youtube] abc: Video unavailable')), 'never')
  })
})
