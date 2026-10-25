import { IS_ELECTRON, IS_PACKAGED } from '@server/config.js'
import { startupAppUpdate } from './app-update-check.js'
import { downloadAppUpdate, installAppUpdate, removeLeftoverUpdate } from './app-update-files.js'
import { releasePackageFor } from './release-package.js'
import { AppUpdater } from './updater.js'

const releasePackage = releasePackageFor(process.platform, process.arch)

export const appUpdater = new AppUpdater({
  isSupported: IS_PACKAGED && IS_ELECTRON && releasePackage !== null,
  findUpdate: startupAppUpdate,
  downloadUpdate: async (update, onProgress) => {
    if (!releasePackage) throw new Error(`There is no release for ${process.platform}/${process.arch}.`)

    return downloadAppUpdate(update, releasePackage, onProgress)
  },
  installUpdate: installAppUpdate,
  removeLeftovers: removeLeftoverUpdate,
})
