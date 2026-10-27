import { app, BrowserWindow, clipboard, Menu } from 'electron'
import { contextMenuItems } from './context-menu-items.js'

export const enableContextMenus = (): void => {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('context-menu', (_menuEvent, spot) => {
      const window = BrowserWindow.fromWebContents(contents)
      const items = contextMenuItems(spot, (text) => clipboard.writeText(text))

      if (window && items.length) Menu.buildFromTemplate(items).popup({ window })
    })
  })
}
