import assert from 'node:assert/strict'
import { readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import type { DownloadRequest } from '@shared/types/downloads.js'
import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { nameSpokenSubtitleFiles } from '@server/services/downloads/subtitle-files.js'
import { createTemporaryFolder, removeFolder } from './support/temporary-folder.js'

const VIDEO = 'Song [1080p].mkv'

const filesAfterNaming = async (request: Partial<DownloadRequest>, files: string[]): Promise<string[]> => {
  const folder = await createTemporaryFolder('subtitle-files-test-')

  try {
    await Promise.all([VIDEO, ...files].map((file) => writeFile(join(folder, file), file)))
    await nameSpokenSubtitleFiles(
      normalizeDownloadRequest({ url: 'https://x', kind: 'video', subtitleLanguage: 'ja', ...request }),
      [join(folder, VIDEO)],
    )

    return (await readdir(folder)).sort()
  } finally {
    await removeFolder(folder)
  }
}

describe('nameSpokenSubtitleFiles', () => {
  it('names the spoken language’s .srt file by its language, so players recognise it', async () => {
    assert.deepEqual(
      await filesAfterNaming({ subtitleMatch: 'spoken', subtitleFormat: 'srt' }, ['Song [1080p].ja-orig.srt']),
      ['Song [1080p].ja.srt', VIDEO],
    )
  })

  it('leaves a file that already has that name, and other downloads, alone', async () => {
    const files = ['Song [1080p].ja-orig.srt', 'Song [1080p].ja.srt']

    assert.deepEqual(await filesAfterNaming({ subtitleMatch: 'spoken', subtitleFormat: 'srt' }, files), [
      ...files,
      VIDEO,
    ])
    assert.deepEqual(await filesAfterNaming({ subtitleMatch: 'exact', subtitleFormat: 'srt' }, [files[0]!]), [
      files[0],
      VIDEO,
    ])
  })
})
