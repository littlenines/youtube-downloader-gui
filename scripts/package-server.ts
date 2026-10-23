import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import postject from 'postject'
import { createTarGz } from '@server/lib/archive/tar.js'
import { WEB_ASSETS } from '@server/web-assets.js'
import {
  BUILD_DIRECTORY,
  DIST_DIRECTORY,
  isLinuxTarget,
  LICENSE_FILE_NAME,
  LICENSE_SOURCE,
  RELEASE_DIRECTORY,
  runScript,
  targetsFromCommandLine,
  toMegabytes,
  toWindowsLineEndings,
  type ReleaseTarget,
} from './common.js'
import { nodeBinary } from './node-binary.js'
import { serverReadme } from './release-texts.js'

const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
const REQUIRED_DIST_FILES = ['app.cjs', ...WEB_ASSETS.map((asset) => `client/${asset}`)]

const checkBuildExists = (): void => {
  for (const file of REQUIRED_DIST_FILES) {
    if (!existsSync(join(DIST_DIRECTORY, file))) throw new Error(`dist/${file} is missing. Run "npm run build" first.`)
  }
}

const createApplicationBlob = async (): Promise<Buffer> => {
  const configFile = join(BUILD_DIRECTORY, 'sea-config.json')
  const blobFile = join(BUILD_DIRECTORY, 'app.blob')
  const config = {
    main: join(DIST_DIRECTORY, 'app.cjs'),
    output: blobFile,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets: Object.fromEntries(WEB_ASSETS.map((asset) => [asset, join(DIST_DIRECTORY, 'client', asset)])),
  }

  await writeFile(configFile, JSON.stringify(config, null, 2))
  execFileSync(process.execPath, ['--experimental-sea-config', configFile], { stdio: 'inherit' })

  return readFile(blobFile)
}

const buildExecutable = async (target: ReleaseTarget, executable: string, blob: Buffer): Promise<Buffer> => {
  const workingFile = join(BUILD_DIRECTORY, `${target}-${executable}`)

  await writeFile(workingFile, await nodeBinary(target))
  await postject.inject(workingFile, 'NODE_SEA_BLOB', blob, { sentinelFuse: SEA_FUSE })

  const binary = await readFile(workingFile)

  await rm(workingFile, { force: true })

  return binary
}

const writeLinuxArchive = async (target: ReleaseTarget, executable: string, binary: Buffer): Promise<void> => {
  const archive = join(RELEASE_DIRECTORY, `yt-downloader-server-${target}.tar.gz`)
  const entries = [
    { name: 'yt-downloader/yt-downloader', data: binary, mode: 0o755 },
    { name: 'yt-downloader/README.txt', data: Buffer.from(serverReadme(executable, true)) },
    { name: `yt-downloader/${LICENSE_FILE_NAME}`, data: await readFile(LICENSE_SOURCE) },
  ]

  await writeFile(archive, createTarGz(entries))
  console.log(`✓ ${archive} (${toMegabytes(binary.length)} executable)`)
}

const writeWindowsFolder = async (target: ReleaseTarget, executable: string, binary: Buffer): Promise<void> => {
  const folder = join(RELEASE_DIRECTORY, `yt-downloader-server-${target}`)

  await rm(folder, { recursive: true, force: true })
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, executable), binary)
  await writeFile(join(folder, 'README.txt'), toWindowsLineEndings(serverReadme(executable, false)))
  await writeFile(join(folder, LICENSE_FILE_NAME), toWindowsLineEndings(await readFile(LICENSE_SOURCE, 'utf8')))
  console.log(`✓ ${join(folder, executable)} (${toMegabytes(binary.length)})`)
}

const packageServer = async (): Promise<void> => {
  const targets = targetsFromCommandLine()

  checkBuildExists()
  await mkdir(BUILD_DIRECTORY, { recursive: true })
  await mkdir(RELEASE_DIRECTORY, { recursive: true })

  const blob = await createApplicationBlob()

  for (const target of targets) {
    const isLinux = isLinuxTarget(target)
    const executable = isLinux ? 'yt-downloader' : 'yt-downloader.exe'
    const binary = await buildExecutable(target, executable, blob)

    if (isLinux) await writeLinuxArchive(target, executable, binary)
    else await writeWindowsFolder(target, executable, binary)
  }
}

runScript(packageServer)
