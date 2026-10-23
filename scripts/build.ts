import { watch } from 'node:fs'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import * as esbuild from 'esbuild'
import { DIST_DIRECTORY, PROJECT_ROOT, readPackageVersion } from './common.js'

const isWatchMode = process.argv.includes('--watch')
const isDevelopment = process.argv.includes('--dev') || isWatchMode
const STATIC_FILES = ['index.html']
const appVersion = await readPackageVersion(join(PROJECT_ROOT, 'package.json'))

const copyStaticFiles = async (): Promise<void> => {
  await mkdir(join(DIST_DIRECTORY, 'client'), { recursive: true })

  for (const file of STATIC_FILES)
    await copyFile(join(PROJECT_ROOT, 'src/client/static', file), join(DIST_DIRECTORY, 'client', file))

  await copyFile(join(PROJECT_ROOT, 'assets/icon.png'), join(DIST_DIRECTORY, 'icon.png'))
}

const sharedOptions: esbuild.BuildOptions = {
  bundle: true,
  sourcemap: isDevelopment ? 'inline' : false,
  minify: !isDevelopment,
  legalComments: 'none',
  logLevel: 'info',
}

const nodeBundle: esbuild.BuildOptions = {
  ...sharedOptions,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
}

const withModuleUrl: esbuild.BuildOptions = {
  define: { ...nodeBundle.define, 'import.meta.url': '__bundle_url' },
  banner: { js: 'const __bundle_url = require("node:url").pathToFileURL(__filename).href;' },
}

const bundles: esbuild.BuildOptions[] = [
  {
    ...nodeBundle,
    ...withModuleUrl,
    entryPoints: [join(PROJECT_ROOT, 'src/server/index.ts')],
    outfile: join(DIST_DIRECTORY, 'app.cjs'),
  },
  {
    ...nodeBundle,
    ...withModuleUrl,
    entryPoints: [join(PROJECT_ROOT, 'src/desktop/main.ts')],
    outfile: join(DIST_DIRECTORY, 'desktop.cjs'),
  },
  {
    ...nodeBundle,
    entryPoints: [join(PROJECT_ROOT, 'src/desktop/preload.ts')],
    outfile: join(DIST_DIRECTORY, 'preload.cjs'),
  },
  {
    ...sharedOptions,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    entryPoints: [join(PROJECT_ROOT, 'src/client/main.ts')],
    outfile: join(DIST_DIRECTORY, 'client', 'main.js'),
  },
  {
    ...sharedOptions,
    sourcemap: false,
    entryPoints: [join(PROJECT_ROOT, 'src/client/styles/index.css')],
    outfile: join(DIST_DIRECTORY, 'client', 'styles.css'),
  },
]

if (!isWatchMode) await rm(DIST_DIRECTORY, { recursive: true, force: true })

await copyStaticFiles()

if (isWatchMode) {
  const contexts = await Promise.all(bundles.map((options) => esbuild.context(options)))

  await Promise.all(contexts.map((context) => context.watch()))
  watch(join(PROJECT_ROOT, 'src/client/static'), () => void copyStaticFiles().catch(() => {}))
  console.log('Watching for changes…')
} else {
  await Promise.all(bundles.map((options) => esbuild.build(options)))
}
