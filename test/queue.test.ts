import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import type { Settings } from '../src/shared/types.js';
import { normalizeRequest } from '../src/server/services/formats.js';
import { DownloadQueue, PARTIAL_FOLDER_NAME, type DownloadEngine } from '../src/server/services/queue.js';
import type { HistoryStore, SettingsStore } from '../src/server/services/stores.js';

interface FakeRun {
  finish(): void;
  fail(message: string): void;
  cancelled: boolean;
}

/** A download engine whose runs end only when the test says so, like a yt-dlp process that takes a while to exit. */
function createFakeEngine() {
  const runs: FakeRun[] = [];
  const engine: DownloadEngine = {
    requireTools: async () => {},
    startDownload: () => {
      let finish!: () => void;
      let fail!: (error: Error) => void;
      const finished = new Promise<void>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
      const run: FakeRun = { finish, fail: (message) => fail(new Error(message)), cancelled: false };
      runs.push(run);
      return { finished, cancel: () => (run.cancelled = true) };
    },
    whenIdle: () => {},
  };
  return { engine, runs };
}

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let waited = 0; waited < 2000; waited += 5) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for the condition.');
}

describe('DownloadQueue', async () => {
  const downloadFolder = await mkdtemp(join(tmpdir(), 'queue-test-'));
  after(() => rm(downloadFolder, { recursive: true, force: true }));
  const settings = { get: (): Settings => ({ downloadFolder, simultaneousDownloads: 2 }) } as unknown as SettingsStore;
  const history = { add: async () => {} } as unknown as HistoryStore;
  const options = normalizeRequest({ url: 'https://example.com/video' });

  it('waits for a cancelled run to exit before retrying, and keeps the new run cancellable', async () => {
    const { engine, runs } = createFakeEngine();
    const queue = new DownloadQueue(settings, history, engine);
    const job = queue.add(options, {});
    await waitUntil(() => runs.length === 1);

    queue.cancel(job.id);
    assert.equal(runs[0]?.cancelled, true);
    queue.retry(job.id);
    assert.equal(job.status, 'queued');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(runs.length, 1, 'the retry must not start while the first process is still running');

    runs[0]?.fail('killed');
    await waitUntil(() => runs.length === 2);
    assert.equal(job.status, 'downloading', 'the first run ending must not mark the retried job as failed');

    queue.cancel(job.id);
    assert.equal(runs[1]?.cancelled, true, 'the retried run must still be cancellable');
    runs[1]?.fail('killed');
    await queue.stopAll();
    assert.equal(job.status, 'cancelled');
  });

  it('marks real failures as errors and removes the partial folder', async () => {
    const { engine, runs } = createFakeEngine();
    const queue = new DownloadQueue(settings, history, engine);
    const job = queue.add(options, {});
    await waitUntil(() => runs.length === 1);
    assert.equal(existsSync(join(downloadFolder, PARTIAL_FOLDER_NAME, job.id)), true);

    runs[0]?.fail('This video is private.');
    await waitUntil(() => job.finishedAt !== null);
    assert.equal(job.status, 'error');
    assert.equal(job.error, 'This video is private.');
    assert.equal(existsSync(join(downloadFolder, PARTIAL_FOLDER_NAME)), false);
  });

  it('finishes a successful download', async () => {
    const { engine, runs } = createFakeEngine();
    const queue = new DownloadQueue(settings, history, engine);
    const job = queue.add(options, {});
    await waitUntil(() => runs.length === 1);
    runs[0]?.finish();
    await waitUntil(() => job.finishedAt !== null);
    assert.equal(job.status, 'done');
    assert.equal(job.progress, 1);
  });
});
