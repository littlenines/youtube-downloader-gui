import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { PARTIAL_FOLDER_NAME, removeStalePartialFolders } from '@server/services/downloads/partial-folders.js'

describe('removeStalePartialFolders', async () => {
  const downloadFolder = await mkdtemp(join(tmpdir(), 'stale-test-'))

  after(() => rm(downloadFolder, { recursive: true, force: true }))

  it('removes folders a crashed app left hours ago and keeps ones still in use', async () => {
    const staleFolder = join(downloadFolder, PARTIAL_FOLDER_NAME, 'crashed-job')
    const activeFolder = join(downloadFolder, PARTIAL_FOLDER_NAME, 'running-job')

    await mkdir(staleFolder, { recursive: true })
    await mkdir(activeFolder, { recursive: true })
    await writeFile(join(staleFolder, 'song.webm.part'), 'old')
    await writeFile(join(activeFolder, 'video.mp4.part'), 'new')

    const yesterday = new Date(Date.now() - 24 * 3600 * 1000)

    await utimes(join(staleFolder, 'song.webm.part'), yesterday, yesterday)
    await utimes(staleFolder, yesterday, yesterday)

    await removeStalePartialFolders(downloadFolder)
    assert.equal(existsSync(staleFolder), false)
    assert.equal(existsSync(join(activeFolder, 'video.mp4.part')), true)
  })

  it('keeps old folders that belong to saved downloads', async () => {
    const pausedFolder = join(downloadFolder, PARTIAL_FOLDER_NAME, 'paused-job')
    const lastWeek = new Date(Date.now() - 7 * 24 * 3600 * 1000)

    await mkdir(pausedFolder, { recursive: true })
    await writeFile(join(pausedFolder, 'song.webm.part'), 'old')
    await utimes(join(pausedFolder, 'song.webm.part'), lastWeek, lastWeek)
    await utimes(pausedFolder, lastWeek, lastWeek)

    await removeStalePartialFolders(downloadFolder, new Set(['paused-job']))
    assert.equal(existsSync(join(pausedFolder, 'song.webm.part')), true)
  })
})
