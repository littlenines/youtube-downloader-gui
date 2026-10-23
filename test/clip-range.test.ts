import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clipFileSuffix, describeClip, formatClipTime, parseClipTime } from '@shared/clip-range.js'
import { normalizeClip } from '@server/services/downloads/download-options.js'

describe('parseClipTime', () => {
  it('reads seconds, minutes and hours', () => {
    assert.equal(parseClipTime('83'), 83)
    assert.equal(parseClipTime('1:23'), 83)
    assert.equal(parseClipTime(' 1:02:03 '), 3723)
    assert.equal(parseClipTime('0:05.5'), 5.5)
  })

  it('refuses text that is not a time', () => {
    assert.equal(parseClipTime(''), null)
    assert.equal(parseClipTime('abc'), null)
    assert.equal(parseClipTime('1:75'), null)
    assert.equal(parseClipTime('1:75:00'), null)
    assert.equal(parseClipTime('-5'), null)
    assert.equal(parseClipTime('1:2:3:4'), null)
  })
})

describe('formatting clip times', () => {
  it('writes times the way they are typed', () => {
    assert.equal(formatClipTime(0), '0:00')
    assert.equal(formatClipTime(83), '1:23')
    assert.equal(formatClipTime(3723), '1:02:03')
    assert.equal(formatClipTime(65.5), '1:05.5')
  })

  it('names files and jobs after the clip', () => {
    assert.equal(clipFileSuffix({ startSeconds: 83, endSeconds: 296 }), ' (1m23s-4m56s)')
    assert.equal(clipFileSuffix({ startSeconds: 5, endSeconds: 3723 }), ' (5s-1h02m03s)')
    assert.equal(clipFileSuffix({ startSeconds: 60.5, endSeconds: 70.5 }), ' (1m00s-1m11s)')
    assert.equal(describeClip({ startSeconds: 83, endSeconds: 296 }), 'clip 1:23–4:56')
  })
})

describe('normalizeClip', () => {
  it('keeps a valid range', () => {
    assert.deepEqual(normalizeClip({ startSeconds: 10, endSeconds: 20.12345 }), {
      startSeconds: 10,
      endSeconds: 20.123,
    })
  })

  it('refuses ranges that are backwards, too short, negative or not numbers', () => {
    assert.equal(normalizeClip({ startSeconds: 20, endSeconds: 10 }), null)
    assert.equal(normalizeClip({ startSeconds: 10, endSeconds: 10.5 }), null)
    assert.equal(normalizeClip({ startSeconds: -1, endSeconds: 10 }), null)
    assert.equal(normalizeClip({ startSeconds: '0', endSeconds: 10 }), null)
    assert.equal(normalizeClip({ startSeconds: 0, endSeconds: Number.POSITIVE_INFINITY }), null)
    assert.equal(normalizeClip(null), null)
  })
})
