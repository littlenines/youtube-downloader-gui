import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBridge } from '@shared/types/app.js'

const desktopBridge: DesktopBridge = {
  pickFolder: (currentFolder) => ipcRenderer.invoke('pick-folder', currentFolder) as Promise<string | null>,
}

contextBridge.exposeInMainWorld('desktop', desktopBridge)
