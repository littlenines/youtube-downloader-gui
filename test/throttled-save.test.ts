import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { throttleSaves } from '@server/lib/throttled-save.js'

describe('throttleSaves', () => {
  it('writes the first change at once, then only the latest one per quiet time', (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] })

    const written: string[] = []
    const save = throttleSaves(async (value: string) => void written.push(value), 30_000)

    void save('added')
    void save('started')
    void save('finished')
    assert.deepEqual(written, ['added'])

    context.mock.timers.tick(30_000)
    assert.deepEqual(written, ['added', 'finished'])

    context.mock.timers.tick(30_000)
    assert.deepEqual(written, ['added', 'finished'], 'nothing new, nothing written')
  })

  it('writes at once when asked, for example when the app quits', (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] })

    const written: string[] = []
    const save = throttleSaves(async (value: string) => void written.push(value), 30_000)

    void save('added')
    void save('started')
    void save('paused for quitting', { immediately: true })
    context.mock.timers.tick(30_000)

    assert.deepEqual(written, ['added', 'paused for quitting'])
  })
})
