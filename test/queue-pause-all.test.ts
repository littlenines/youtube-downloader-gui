import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import type { Settings } from '@shared/types/app.js'
import { DownloadQueue } from '@server/services/downloads/download-queue.js'
import type { SettingsStore } from '@server/services/stores/settings-store.js'
import {
  createFakeEngine,
  createQueueTestSetup,
  createRecordingQueue,
  noSavedQueue,
  waitFor,
  waitUntil,
} from './support/queue-fakes.js'
import { removeFolder } from './support/temporary-folder.js'

const at = (hours: number): Date => new Date(2026, 9, 24, hours)

const HOUR_MILLISECONDS = 60 * 60_000
const LATER_TIMES: Partial<Settings> = { laterStartTime: '02:00', laterStopTime: '07:00' }

describe('DownloadQueue: pause all and resume all', async () => {
  const setup = await createQueueTestSetup('queue-pause-all-test-')
  const { downloadFolder, history, options } = setup

  after(() => removeFolder(downloadFolder))

  const laterSettings = { get: () => ({ ...setup.settings.get(), ...LATER_TIMES }) } as unknown as SettingsStore

  it('pauses running and queued downloads, and leaves waiting and finished ones alone', async (context) => {
    const { engine, runs } = createFakeEngine()

    context.mock.timers.enable({ apis: ['setInterval', 'Date'], now: at(12).getTime() })

    const queue = new DownloadQueue({ settings: laterSettings, history, savedQueue: noSavedQueue, engine })
    const finished = queue.add(options, {})

    await waitUntil(() => runs.length === 1)
    runs[0]?.finish()
    await waitUntil(() => finished.finishedAt !== null)

    const unfinished = [queue.add(options, {}), queue.add(options, {}), queue.add(options, {})]
    const waitingForLater = queue.add(options, {}, { later: true })

    await waitUntil(() => runs.length === 3)
    queue.pauseAll()
    runs.slice(1).forEach((run) => run.fail('killed'))
    await waitFor(30)

    assert.deepEqual(
      unfinished.map((job) => job.status),
      ['paused', 'paused', 'paused'],
    )
    assert.deepEqual([runs[1]?.cancelled, runs[2]?.cancelled, runs.length], [true, true, 3])
    assert.equal(waitingForLater.status, 'scheduled')
    assert.equal(finished.status, 'done')
  })

  it('resumes every paused download, oldest first, as many at once as Settings allow', async () => {
    const { engine, runs } = createFakeEngine()
    const queue = new DownloadQueue({ settings: setup.settings, history, savedQueue: noSavedQueue, engine })
    const jobs = [queue.add(options, {}), queue.add(options, {}), queue.add(options, {})]

    await waitUntil(() => runs.length === 2)
    queue.pauseAll()
    runs.forEach((run) => run.fail('killed'))
    await waitFor(30)

    queue.resumeAll()
    await waitUntil(() => runs.length === 4)
    await waitFor(30)

    assert.deepEqual(
      jobs.map((job) => job.status),
      ['downloading', 'downloading', 'queued'],
    )
  })

  it('pauses Later downloads running in their time too, and gives them back their Later times', async (context) => {
    const { engine, runs } = createFakeEngine()

    context.mock.timers.enable({ apis: ['setInterval', 'Date'], now: at(3).getTime() })

    const queue = new DownloadQueue({ settings: laterSettings, history, savedQueue: noSavedQueue, engine })
    const laterJobs = [queue.add(options, {}, { later: true }), queue.add(options, {}, { later: true })]

    await waitUntil(() => runs.length === 2)
    queue.pauseAll()
    runs.forEach((run) => run.fail('killed'))
    await waitFor(30)
    assert.deepEqual(
      laterJobs.map((job) => job.status),
      ['paused', 'paused'],
    )

    context.mock.timers.tick(5 * HOUR_MILLISECONDS)
    queue.resumeAll()

    assert.deepEqual(
      laterJobs.map((job) => [job.status, job.downloadLater]),
      [
        ['scheduled', true],
        ['scheduled', true],
      ],
      'resumed after the stop time, they wait for the next night',
    )
    assert.equal(runs.length, 2)
  })

  it('pauses, resumes and cancels one playlist, and leaves other downloads alone', async () => {
    const { engine, runs } = createFakeEngine()
    const queue = new DownloadQueue({ settings: setup.settings, history, savedQueue: noSavedQueue, engine })
    const group = { id: 'album', title: 'Album', size: 2, url: 'https://www.youtube.com/playlist?list=PL1' }
    const single = queue.add(options, {})
    const playlist = queue.addAll([
      { options, details: { title: 'Song 1', group } },
      { options, details: { title: 'Song 2', group } },
    ])

    await waitUntil(() => runs.length === 2)
    queue.pauseAll('album')
    assert.deepEqual([single.status, ...playlist.map((job) => job.status)], ['downloading', 'paused', 'paused'])

    queue.resumeAll('album')
    assert.deepEqual(
      playlist.map((job) => job.status),
      ['queued', 'queued'],
    )

    queue.cancelGroup('album')
    runs.slice(1).forEach((run) => run.fail('killed'))
    await waitFor(30)
    assert.deepEqual([single.status, ...playlist.map((job) => job.status)], ['downloading', 'cancelled', 'cancelled'])

    queue.removeFinishedInGroup('album')
    assert.deepEqual(
      queue.list().map((job) => job.id),
      [single.id],
    )
  })

  it('saves nothing when there is nothing to pause or resume', async () => {
    const { engine } = createFakeEngine()
    const { savedQueue, saveCount } = createRecordingQueue()
    const queue = new DownloadQueue({ settings: setup.settings, history, savedQueue, engine })

    queue.pauseAll()
    queue.resumeAll()
    await waitFor(30)

    assert.equal(saveCount(), 0)
  })
})
