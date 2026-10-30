import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import type { HistoryEntry } from '@shared/types/downloads.js'
import { DownloadQueue } from '@server/services/downloads/download-queue.js'
import type { HistoryStore } from '@server/services/stores/history-store.js'
import { createFakeEngine, createQueueTestSetup, createRecordingQueue, waitUntil } from './support/queue-fakes.js'
import { removeFolder } from './support/temporary-folder.js'

const group = { id: 'album', title: 'Example Album', size: 2, url: 'https://www.youtube.com/playlist?list=PL1' }

describe('DownloadQueue: playlists', async () => {
  const { downloadFolder, settings, options } = await createQueueTestSetup('queue-playlists-test-')

  after(() => removeFolder(downloadFolder))

  const createPlaylistQueue = () => {
    const historyEntries: HistoryEntry[] = []
    const history = { add: async (entry: HistoryEntry) => void historyEntries.push(entry) } as unknown as HistoryStore
    const { engine, runs } = createFakeEngine()
    const { savedQueue, lastSavedJobs } = createRecordingQueue()
    const queue = new DownloadQueue({ settings, history, savedQueue, engine })
    const [first, second] = queue.addAll([
      { options: { ...options, playlistNumber: 1 }, details: { title: 'First Track', group } },
      { options: { ...options, playlistNumber: 2 }, details: { title: 'Second Track', group } },
    ])

    const runFor = (job: typeof first) => runs.find((run) => job && run.partialFolder.endsWith(job.id))

    return { queue, runs, runFor, first, second, historyEntries, lastSavedJobs }
  }

  it('keeps a finished song saved until the whole playlist is finished', async () => {
    const { runs, runFor, first, second, lastSavedJobs } = createPlaylistQueue()

    await waitUntil(() => runs.length === 2)
    runFor(first)?.emit({ type: 'file', file: '/music/First Track.mp3' })
    runFor(first)?.finish()
    await waitUntil(() => first?.status === 'done')
    await waitUntil(() => lastSavedJobs()?.some((savedJob) => savedJob.finished?.status === 'done') === true)

    runFor(second)?.finish()
    await waitUntil(() => second?.status === 'done')
    await waitUntil(() => lastSavedJobs()?.length === 0)
  })

  it('writes one history entry for the playlist once it is finished, not one per song', async () => {
    const { runs, runFor, first, second, historyEntries } = createPlaylistQueue()

    await waitUntil(() => runs.length === 2)
    runFor(first)?.emit({ type: 'file', file: '/music/First Track.mp3' })
    runFor(first)?.finish()
    await waitUntil(() => first?.status === 'done')
    assert.equal(historyEntries.length, 0, 'nothing while the playlist is still downloading')

    runFor(second)?.emit({ type: 'file', file: '/music/Second Track.mp3' })
    runFor(second)?.finish()
    await waitUntil(() => second?.status === 'done' && historyEntries.length === 1)

    assert.deepEqual(
      historyEntries.map((entry) => [entry.id, entry.title, entry.files, entry.url]),
      [['album', 'Example Album', ['/music/First Track.mp3', '/music/Second Track.mp3'], group.url]],
    )
  })

  it('keeps a finished song in the list, by any way of removing it, while its playlist downloads', async () => {
    const { queue, runs, runFor, first } = createPlaylistQueue()

    await waitUntil(() => runs.length === 2)
    runFor(first)?.finish()
    await waitUntil(() => first?.status === 'done')

    queue.clearFinished()
    queue.remove(first?.id ?? '')
    queue.removeFinishedInGroup('album')

    assert.ok(queue.find(first?.id ?? ''), 'the playlist would otherwise count one song less')
  })
})
