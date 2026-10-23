import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBridge } from '@shared/types.js'

const desktopBridge: DesktopBridge = {
  pickFolder: (currentFolder) => ipcRenderer.invoke('pick-folder', currentFolder) as Promise<string | null>,
}

contextBridge.exposeInMainWorld('desktop', desktopBridge)
