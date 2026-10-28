import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import type { Job } from '@shared/types/downloads.js'
import type { HistoryStore } from '@server/services/stores/history-store.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import type { JobFolders } from '@server/services/downloads/job-folders.js'
import { runDownloadJob } from '@server/services/downloads/job-runner.js'
import { createQueuedJob } from '@server/services/downloads/jobs.js'
import { createFakeEngine, waitFor, waitUntil } from './support/queue-fakes.js'
import { createTemporaryFolder, removeFolder } from './support/temporary-folder.js'

describe('runDownloadJob: deleting the partial folder', async () => {
  const downloadFolder = await createTemporaryFolder('partial-cleanup-test-')

  after(() => removeFolder(downloadFolder))

  const runJob = () => {
    const { engine, runs } = createFakeEngine()
    const discarded: string[] = []
    const jobFolders = {
      folderFor: () => downloadFolder,
      discardPartialFiles: (jobId: string) => {
        discarded.push(jobId)

        return new Promise<void>(() => {})
      },
    } as unknown as JobFolders
    const history = { add: async () => {} } as unknown as HistoryStore
    const job: Job = {
      ...createQueuedJob(`job-${Date.now()}`, normalizeDownloadRequest({ url: 'https://x' }), {}),
      status: 'downloading',
    }
    let hasReturned = false

    void runDownloadJob(job, { stopReason: null, stopProcess: null }, { engine, history, jobFolders }).then(
      () => (hasReturned = true),
    )

    return { job, runs, discarded, hasReturned: () => hasReturned }
  }

  it('does not hold up a finished download while Windows keeps the folder busy', async () => {
    const { job, runs, discarded, hasReturned } = runJob()

    await waitUntil(() => runs.length === 1)
    runs[0]?.finish()
    await waitUntil(() => hasReturned())

    assert.deepEqual([job.status, discarded], ['done', [job.id]])
  })

  it('still waits for it after a failure, so a quick Retry into the same folder is safe', async () => {
    const { job, runs, discarded, hasReturned } = runJob()

    await waitUntil(() => runs.length === 1)
    runs[0]?.fail('This video is unavailable.')
    await waitUntil(() => discarded.length === 1)
    await waitFor(50)

    assert.deepEqual([job.status, hasReturned()], ['error', false])
  })
})
