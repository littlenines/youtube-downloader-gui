import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { JsonFile } from '@server/lib/json-file.js'

describe('JsonFile', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'json-file-test-'))

  after(() => rm(directory, { recursive: true, force: true }))

  const parseNumbers = (content: unknown) =>
    Array.isArray(content) ? content.filter((value): value is number => typeof value === 'number') : []

  it('falls back to the parsed default when the file is missing or broken', async () => {
    assert.deepEqual(await new JsonFile(join(directory, 'missing.json'), parseNumbers).load(), [])
    await writeFile(join(directory, 'broken.json'), '{ not json')
    assert.deepEqual(await new JsonFile(join(directory, 'broken.json'), parseNumbers).load(), [])
  })

  it('validates what it loads', async () => {
    await writeFile(join(directory, 'mixed.json'), JSON.stringify([1, 'two', 3]))
    assert.deepEqual(await new JsonFile(join(directory, 'mixed.json'), parseNumbers).load(), [1, 3])
  })

  it('keeps the last value when many saves run at once', async () => {
    const file = new JsonFile(join(directory, 'concurrent.json'), parseNumbers)

    await Promise.all(Array.from({ length: 20 }, (_, index) => file.save([index])))
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'concurrent.json'), 'utf8')), [19])
  })

  it('keeps a copy of a damaged file before the defaults can overwrite it', async () => {
    const file = join(directory, 'damaged.json')

    await writeFile(file, '[1, 2,')
    assert.deepEqual(await new JsonFile(file, parseNumbers).load(), [])

    const backups = (await readdir(directory)).filter((name) => name.startsWith('damaged.json.broken-'))

    assert.equal(backups.length, 1)
    assert.equal(await readFile(join(directory, backups[0]!), 'utf8'), '[1, 2,')
  })
})
