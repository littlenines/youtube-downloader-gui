import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBridge } from '@shared/types/app.js'
import { systemLocaleFromArguments } from './system-locale.js'

const desktopBridge: DesktopBridge = {
  pickFolder: (currentFolder) => ipcRenderer.invoke('pick-folder', currentFolder) as Promise<string | null>,
  systemLocale: systemLocaleFromArguments(process.argv),
}

contextBridge.exposeInMainWorld('desktop', desktopBridge)
