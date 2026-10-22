import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ACCESS_PARAMETER, createApp, isLoopbackHost } from './app.js';
import { HOST, IS_SINGLE_EXECUTABLE, PORT, PUBLIC_DIRECTORY } from './config.js';
import { openInBrowser } from './lib/os.js';
import { createServices, listen, loadAccessKey } from './server.js';
import { toolSetup } from './services/tools.js';

/** Another copy answers 401 here, because this request has no access cookie. */
async function isAppAlreadyRunning(url: string): Promise<boolean> {
  return fetch(`${url}api/status`)
    .then((response) => response.ok || response.status === 401)
    .catch(() => false);
}

async function main(): Promise<void> {
  const services = await createServices();
  const accessKey = await loadAccessKey();
  const loopbackOnly = isLoopbackHost(HOST);
  const server = createApp(services, { loopbackOnly, accessKey });
  const url = `http://localhost:${PORT}/`;
  const accessLink = `${url}?${ACCESS_PARAMETER}=${accessKey}`;
  const shouldOpenBrowser = !process.argv.includes('--no-open');

  if (!IS_SINGLE_EXECUTABLE && !existsSync(join(PUBLIC_DIRECTORY, 'index.html'))) {
    console.warn('The web page is not built yet. Run "npm run build" (or "npm run dev:web").');
  }

  try {
    await listen(server, PORT, HOST);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
    const alreadyRunning = await isAppAlreadyRunning(url);
    if (alreadyRunning) {
      console.log(`YT Downloader is already running. Open it with: ${accessLink}`);
      if (shouldOpenBrowser) openInBrowser(accessLink);
    } else {
      console.error(`Port ${PORT} is used by another program. Start with a different one, e.g. PORT=5191.`);
    }
    setTimeout(() => process.exit(alreadyRunning ? 0 : 1), 300);
    return;
  }

  console.log(`YT Downloader is running. Open it with this link (it contains your access key):\n  ${accessLink}`);
  if (!loopbackOnly) console.log('From another computer, replace "localhost" with this computer\'s address.');
  console.log(`Downloads go to: ${services.settings.get().downloadFolder}`);
  console.log('Keep this window open while you use it. Close it (or press Ctrl+C) to stop.');
  if (shouldOpenBrowser) openInBrowser(accessLink);
  toolSetup.initialize();

  const stop = () => {
    server.close();
    void services.queue.stopAll().finally(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
