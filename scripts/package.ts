import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses'
import { packager } from '@electron/packager'
import { createTarGz, type TarEntry } from '@server/lib/archive/tar.js'
import { WEB_ASSETS } from '@server/web-assets.js'
import {
  APP_NAME,
  BUILD_DIRECTORY,
  COPYRIGHT,
  DIST_DIRECTORY,
  isLinuxTarget,
  LICENSE_FILE_NAME,
  LICENSE_SOURCE,
  PROJECT_ROOT,
  readPackageVersion,
  RELEASE_DIRECTORY,
  runScript,
  targetsFromCommandLine,
  toMegabytes,
  toWindowsLineEndings,
  type ReleaseTarget,
} from './common.js'
import { desktopReadme, LINUX_LAUNCHER } from './release-texts.js'

const STAGING_DIRECTORY = join(BUILD_DIRECTORY, 'app')
const PACKAGER_OUTPUT_DIRECTORY = join(BUILD_DIRECTORY, 'desktop')
const APP_FILES = ['desktop.cjs', 'preload.cjs', 'icon.png', ...WEB_ASSETS.map((asset) => `client/${asset}`)]
const USER_DATA_FOLDERS = new Set(['data', 'tools', 'downloads'])
const LINUX_EXECUTABLES = new Set(['yt-downloader', 'yt-downloader.bin', 'chrome-sandbox', 'chrome_crashpad_handler'])
const KEPT_LOCALE_FILE = 'en-US.pak'
const WEBGPU_SHADER_COMPILER_FILES = ['dxcompiler.dll', 'dxil.dll']
const EXECUTABLE_MODE = 0o755
const REGULAR_FILE_MODE = 0o644

const lockDownElectron = async (executable: string): Promise<void> => {
  await flipFuses(executable, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  })
}

const removeUnusedElectronFiles = async (appFolder: string): Promise<void> => {
  const localesFolder = join(appFolder, 'locales')
  const localeFiles = await readdir(localesFolder)

  if (!localeFiles.includes(KEPT_LOCALE_FILE)) throw new Error(`locales/${KEPT_LOCALE_FILE} is missing from Electron.`)

  for (const localeFile of localeFiles) {
    if (localeFile !== KEPT_LOCALE_FILE) await rm(join(localesFolder, localeFile))
  }

  for (const file of WEBGPU_SHADER_COMPILER_FILES) await rm(join(appFolder, file), { force: true })
}

const checkBuildExists = (): void => {
  for (const file of APP_FILES) {
    if (!existsSync(join(DIST_DIRECTORY, file))) throw new Error(`dist/${file} is missing. Run "npm run build" first.`)
  }
}

const stageApp = async (version: string): Promise<void> => {
  await rm(STAGING_DIRECTORY, { recursive: true, force: true })

  for (const file of APP_FILES) await cp(join(DIST_DIRECTORY, file), join(STAGING_DIRECTORY, file))

  const manifest = { name: 'yt-downloader', productName: APP_NAME, version, main: 'desktop.cjs', license: 'MIT' }

  await writeFile(join(STAGING_DIRECTORY, 'package.json'), JSON.stringify(manifest, null, 2))
}

const listFilesRecursively = async function* (directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) yield* listFilesRecursively(path)
    else yield path
  }
}

const isLinuxExecutable = (fileName: string) => LINUX_EXECUTABLES.has(fileName) || /\.so(\.\d+)*$/.test(fileName)

const writeLinuxArchive = async (appFolder: string, target: ReleaseTarget): Promise<void> => {
  await rename(join(appFolder, 'yt-downloader'), join(appFolder, 'yt-downloader.bin'))
  await writeFile(join(appFolder, 'yt-downloader'), LINUX_LAUNCHER)
  await cp(join(PROJECT_ROOT, 'assets', 'icon.png'), join(appFolder, 'icon.png'))
  await writeFile(join(appFolder, 'README.txt'), desktopReadme(true))
  await cp(LICENSE_SOURCE, join(appFolder, LICENSE_FILE_NAME))

  const entries: TarEntry[] = []

  for await (const file of listFilesRecursively(appFolder)) {
    const relativeName = relative(appFolder, file).split(sep).join('/')
    const fileName = relativeName.split('/').pop() ?? relativeName

    entries.push({
      name: `yt-downloader/${relativeName}`,
      data: await readFile(file),
      mode: isLinuxExecutable(fileName) ? EXECUTABLE_MODE : REGULAR_FILE_MODE,
    })
  }

  const archive = join(RELEASE_DIRECTORY, `yt-downloader-${target}.tar.gz`)

  await writeFile(archive, createTarGz(entries))
  console.log(`✓ ${archive} (${toMegabytes((await stat(archive)).size)})`)
}

const writeWindowsFolder = async (appFolder: string, target: ReleaseTarget): Promise<void> => {
  const releaseFolder = join(RELEASE_DIRECTORY, `yt-downloader-${target}`)

  await writeFile(join(appFolder, 'README.txt'), toWindowsLineEndings(desktopReadme(false)))
  await writeFile(join(appFolder, LICENSE_FILE_NAME), toWindowsLineEndings(await readFile(LICENSE_SOURCE, 'utf8')))
  await mkdir(releaseFolder, { recursive: true })

  for (const name of await readdir(releaseFolder)) {
    if (!USER_DATA_FOLDERS.has(name)) await rm(join(releaseFolder, name), { recursive: true, force: true })
  }

  for (const name of await readdir(appFolder)) await rename(join(appFolder, name), join(releaseFolder, name))

  console.log(`✓ ${join(releaseFolder, 'yt-downloader.exe')}`)
}

const packageForTarget = async (target: ReleaseTarget, appVersion: string, electronVersion: string): Promise<void> => {
  const [, architecture] = target.split('-') as [string, 'x64' | 'arm64']
  const isLinux = isLinuxTarget(target)

  console.log(`Packaging ${target} (Electron ${electronVersion})…`)

  const [appFolder] = await packager({
    dir: STAGING_DIRECTORY,
    out: PACKAGER_OUTPUT_DIRECTORY,
    platform: isLinux ? 'linux' : 'win32',
    arch: architecture,
    electronVersion,
    name: APP_NAME,
    executableName: 'yt-downloader',
    appVersion,
    appCopyright: COPYRIGHT,
    icon: join(PROJECT_ROOT, 'assets', isLinux ? 'icon.png' : 'icon.ico'),
    win32metadata: {
      CompanyName: APP_NAME,
      FileDescription: APP_NAME,
      ProductName: APP_NAME,
      OriginalFilename: 'yt-downloader.exe',
    },
    asar: false,
    prune: false,
    overwrite: true,
    quiet: true,
  })

  if (!appFolder) throw new Error(`Packaging ${target} produced nothing.`)

  await lockDownElectron(join(appFolder, isLinux ? 'yt-downloader' : 'yt-downloader.exe'))
  await removeUnusedElectronFiles(appFolder)

  if (isLinux) await writeLinuxArchive(appFolder, target)
  else await writeWindowsFolder(appFolder, target)
}

const packageDesktopApp = async (): Promise<void> => {
  const targets = targetsFromCommandLine()

  checkBuildExists()

  const appVersion = await readPackageVersion(join(PROJECT_ROOT, 'package.json'))
  const electronVersion = await readPackageVersion(join(PROJECT_ROOT, 'node_modules/electron/package.json'))

  await stageApp(appVersion)
  await mkdir(RELEASE_DIRECTORY, { recursive: true })

  for (const target of targets) await packageForTarget(target, appVersion, electronVersion)

  await rm(PACKAGER_OUTPUT_DIRECTORY, { recursive: true, force: true })
}

runScript(packageDesktopApp)
