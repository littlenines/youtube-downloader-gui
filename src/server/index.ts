import { existsSync } from 'node:fs'
import type { Server } from 'node:http'
import { join } from 'node:path'
import { createApp } from './app.js'
import { HOST, IS_SINGLE_EXECUTABLE, PORT, PUBLIC_DIRECTORY } from './config.js'
import { openInBrowser } from './lib/desktop-shell.js'
import { ACCESS_LINK_PARAMETER } from './security/access-cookie.js'
import { loadOrCreateAccessKey } from './security/access-key-file.js'
import { isLoopbackHost } from '@shared/loopback.js'
import { createServices, listen, type Services } from './server.js'
import { checkForAppUpdateOnStartup } from './services/app-updates/app-update-check.js'
import { toolSetup } from './services/tools/app-tool-setup.js'

const EXIT_DELAY_MILLISECONDS = 300
const shouldOpenBrowser = !process.argv.includes('--no-open')

const isAppAlreadyRunning = (url: string): Promise<boolean> =>
  fetch(`${url}api/status`)
    .then((response) => response.ok || response.status === 401)
    .catch(() => false)

const handlePortInUse = async (url: string, accessLink: string): Promise<void> => {
  const alreadyRunning = await isAppAlreadyRunning(url)

  if (alreadyRunning) {
    console.log(`YT Downloader is already running. Open it with: ${accessLink}`)

    if (shouldOpenBrowser) openInBrowser(accessLink)
  } else {
    console.error(`Port ${PORT} is used by another program. Start with a different one, e.g. PORT=5191.`)
  }

  setTimeout(() => process.exit(alreadyRunning ? 0 : 1), EXIT_DELAY_MILLISECONDS)
}

const printStartupMessage = (accessLink: string, loopbackOnly: boolean, services: Services): void => {
  console.log(`YT Downloader is running. Open it with this link (it contains your access key):\n  ${accessLink}`)

  if (!loopbackOnly) console.log('From another computer, replace "localhost" with this computer\'s address.')

  console.log(`Downloads go to: ${services.settings.get().downloadFolder}`)
  console.log('Keep this window open while you use it. Close it (or press Ctrl+C) to stop.')
}

const stopOnSignals = (server: Server, services: Services): void => {
  const stop = () => {
    server.close()
    void services.queue.pauseForShutdown().finally(() => process.exit(0))
  }

  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

const startWebServer = async (): Promise<void> => {
  const services = await createServices()
  const accessKey = await loadOrCreateAccessKey()
  const loopbackOnly = isLoopbackHost(HOST)
  const server = createApp(services, { loopbackOnly, accessKey })
  const url = `http://localhost:${PORT}/`
  const accessLink = `${url}?${ACCESS_LINK_PARAMETER}=${accessKey}`

  if (!IS_SINGLE_EXECUTABLE && !existsSync(join(PUBLIC_DIRECTORY, 'index.html'))) {
    console.warn('The web page is not built yet. Run "npm run build" (or "npm run dev:web").')
  }

  try {
    await listen(server, PORT, HOST)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error

    return handlePortInUse(url, accessLink)
  }

  printStartupMessage(accessLink, loopbackOnly, services)

  if (shouldOpenBrowser) openInBrowser(accessLink)

  toolSetup.initialize()
  checkForAppUpdateOnStartup()
  stopOnSignals(server, services)
}

startWebServer().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
