import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_DOWNLOAD_FOLDER } from '../src/server/config.js';
import { parseHistory, parseSettings } from '../src/server/services/stores.js';

describe('parseSettings', () => {
  it('uses defaults for a missing or invalid file', () => {
    assert.deepEqual(parseSettings(undefined), { downloadFolder: DEFAULT_DOWNLOAD_FOLDER, simultaneousDownloads: 2 });
    assert.deepEqual(parseSettings({ downloadFolder: 42, simultaneousDownloads: 9 }), {
      downloadFolder: DEFAULT_DOWNLOAD_FOLDER,
      simultaneousDownloads: 2,
    });
  });

  it('reads settings saved by earlier versions', () => {
    assert.deepEqual(parseSettings({ outDir: '/music', concurrent: 3 }), { downloadFolder: '/music', simultaneousDownloads: 3 });
  });
});

describe('parseHistory', () => {
  it('reads entries saved by earlier versions', () => {
    const [entry] = parseHistory([
      {
        id: 'a',
        title: 'Song',
        thumbnail: 'https://i/1.jpg',
        label: 'MP3',
        files: ['/music/Song.mp3'],
        size: 1000,
        finishedAt: '2026-10-22T00:00:00Z',
        url: 'https://x',
      },
    ]);
    assert.equal(entry?.thumbnailUrl, 'https://i/1.jpg');
    assert.equal(entry?.sizeBytes, 1000);
  });

  it('ignores content that is not a list', () => {
    assert.deepEqual(parseHistory({ not: 'a list' }), []);
  });
});
