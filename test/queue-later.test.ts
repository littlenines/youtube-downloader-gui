import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, it, type TestContext } from 'node:test'
import type { Settings } from '@shared/types/app.js'
import { DownloadQueue } from '@server/services/downloads/download-queue.js'
import { jobFromSavedJob, savedJobFromJob } from '@server/services/downloads/saved-jobs.js'
import type { SettingsStore } from '@server/services/stores/settings-store.js'
import { createFakeEngine, createQueueTestSetup, noSavedQueue, waitFor, waitUntil } from './support/queue-fakes.js'
import { removeFolder } from './support/temporary-folder.js'

const at = (hours: number, minutes = 0, day = 24): Date => new Date(2026, 9, day, hours, minutes)

const HOUR_MILLISECONDS = 60 * 60_000

describe('DownloadQueue: download later', async () => {
  const setup = await createQueueTestSetup('queue-later-test-')
  const { downloadFolder, history, options } = setup

  after(() => removeFolder(downloadFolder))

  const createQueue = (context: TestContext, window: Partial<Settings>, startAt: Date) => {
    const laterTimes: Partial<Settings> = { laterStartTime: '02:00', laterStopTime: '07:00', ...window }
    const settings = { get: () => ({ ...setup.settings.get(), ...laterTimes }) } as unknown as SettingsStore
    const { engine, runs } = createFakeEngine()

    context.mock.timers.enable({ apis: ['setInterval', 'Date'], now: startAt.getTime() })

    const queue = new DownloadQueue({ settings, history, savedQueue: noSavedQueue, engine })

    return { queue, runs, laterTimes }
  }

  it('waits until the start time, then downloads', async (context) => {
    const { queue, runs } = createQueue(context, {}, at(1))
    const job = queue.add(options, {}, { later: true })

    assert.equal(job.status, 'scheduled')
    assert.equal(job.startsAt, at(2).toISOString())
    await waitFor(20)
    assert.equal(runs.length, 0)

    context.mock.timers.tick(HOUR_MILLISECONDS)
    await waitUntil(() => runs.length === 1)
    runs[0]?.finish()
    await waitUntil(() => job.finishedAt !== null)
    assert.equal(job.status, 'done')
  })

  it('pauses at the stop time, keeps the partial files, and continues the next night', async (context) => {
    const { queue, runs } = createQueue(context, {}, at(3))
    const job = queue.add(options, {}, { later: true })

    await waitUntil(() => runs.length === 1)
    await writeFile(join(runs[0]?.partialFolder ?? '', 'song.part'), 'half')

    context.mock.timers.tick(4 * HOUR_MILLISECONDS)
    assert.equal(job.status, 'scheduled')
    assert.equal(job.startsAt, at(2, 0, 25).toISOString())
    assert.equal(runs[0]?.cancelled, true)
    runs[0]?.fail('stopped')
    await waitFor(30)
    assert.equal(existsSync(join(runs[0]?.partialFolder ?? '', 'song.part')), true)

    context.mock.timers.tick(19 * HOUR_MILLISECONDS)
    await waitUntil(() => runs.length === 2)
    assert.equal(runs[1]?.partialFolder, runs[0]?.partialFolder)
  })

  it('starts right away with Start now, and then keeps going past the stop time', async (context) => {
    const { queue, runs } = createQueue(context, {}, at(12))
    const job = queue.add(options, {}, { later: true })

    queue.startNow(job.id)
    await waitUntil(() => runs.length === 1)
    context.mock.timers.tick(HOUR_MILLISECONDS)
    assert.equal(job.status, 'downloading')
  })

  it('starts waiting downloads when the start time is cleared, and moves them when it changes', async (context) => {
    const { queue, runs, laterTimes } = createQueue(context, {}, at(12))
    const job = queue.add(options, {}, { later: true })

    laterTimes.laterStartTime = '23:00'
    laterTimes.laterStopTime = null
    queue.downloadWindowChanged()
    assert.equal(job.startsAt, at(23).toISOString())

    laterTimes.laterStartTime = null
    queue.downloadWindowChanged()
    await waitUntil(() => runs.length === 1)
  })

  it('does not skip a night when a setting is saved just after the start time', async (context) => {
    const { queue, runs } = createQueue(context, { laterStopTime: null }, at(1))
    const job = queue.add(options, {}, { later: true })

    context.mock.timers.setTime(new Date(2026, 9, 24, 2, 0, 5).getTime())
    assert.equal(job.status, 'scheduled', 'the 30-second check has not run since 02:00 yet')

    queue.downloadWindowChanged()
    await waitUntil(() => runs.length === 1)
  })

  it('treats the same start and stop time as no stop time', async (context) => {
    const { queue, runs } = createQueue(context, { laterStopTime: '02:00' }, at(12))
    const job = queue.add(options, {}, { later: true })

    assert.equal(job.status, 'scheduled')
    assert.equal(job.startsAt, at(2, 0, 25).toISOString())
    await waitFor(20)
    assert.equal(runs.length, 0)
  })

  it('is saved and restored as waiting, with its start time and how far it got', async (context) => {
    const { queue } = createQueue(context, {}, at(12))
    const job = queue.add(options, {}, { later: true })

    job.progress = 0.6

    const restored = jobFromSavedJob(savedJobFromJob(job, null))

    assert.equal(restored.status, 'scheduled')
    assert.equal(restored.downloadLater, true)
    assert.equal(restored.startsAt, job.startsAt)
    assert.equal(restored.progress, 0.6, 'so it shows “Continues … 60%” after a restart')
  })

  it('reports how many downloads are waiting, for the quit question', async (context) => {
    const { queue } = createQueue(context, {}, at(12))

    queue.add(options, {}, { later: true })
    queue.add(options, {}, { later: true })

    assert.equal(queue.waitingCount(), 2)
  })
})
