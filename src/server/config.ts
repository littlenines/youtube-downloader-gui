import { isSea } from 'node:sea';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IS_ELECTRON = Boolean(process.versions.electron);
export const IS_SINGLE_EXECUTABLE = isSea();
export const IS_PACKAGED = IS_SINGLE_EXECUTABLE || (IS_ELECTRON && !(process as { defaultApp?: boolean }).defaultApp);
export const IS_WINDOWS = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const IS_BUNDLED = import.meta.url.endsWith('.cjs');

export const APP_DIRECTORY = IS_PACKAGED ? dirname(process.execPath) : resolve(moduleDirectory, ...(IS_BUNDLED ? ['..'] : ['..', '..']));

export const DATA_DIRECTORY = join(APP_DIRECTORY, 'data');
export const TOOLS_DIRECTORY = join(APP_DIRECTORY, 'tools');
export const DEFAULT_DOWNLOAD_FOLDER = join(APP_DIRECTORY, 'downloads');
export const PUBLIC_DIRECTORY = IS_BUNDLED ? join(moduleDirectory, 'client') : join(APP_DIRECTORY, 'dist', 'client');

export const PORT = Number(process.env.PORT) || 5190;
export const HOST = process.env.HOST || '127.0.0.1';
