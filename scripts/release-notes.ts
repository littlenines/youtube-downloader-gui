import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PROJECT_ROOT, readPackageVersion, runScript } from './common.js'
import { releaseNotes } from './release-texts.js'

const writeReleaseNotes = async (): Promise<void> => {
  const [outputFile] = process.argv.slice(2)
  const version = await readPackageVersion(join(PROJECT_ROOT, 'package.json'))
  const notes = releaseNotes(await readFile(join(PROJECT_ROOT, 'CHANGELOG.md'), 'utf8'), version)

  if (!outputFile) {
    console.log(`✓ CHANGELOG.md has notes for ${version}`)

    return
  }

  await writeFile(outputFile, notes)
  console.log(`✓ ${outputFile}`)
}

runScript(writeReleaseNotes)
