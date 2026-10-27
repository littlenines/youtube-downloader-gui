import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'

export type ClickedSpot = Pick<ContextMenuParams, 'isEditable' | 'editFlags' | 'selectionText' | 'linkURL'>

const SEPARATOR: MenuItemConstructorOptions = { type: 'separator' }

const textFieldItems = ({ editFlags }: ClickedSpot): MenuItemConstructorOptions[] => [
  { role: 'undo', enabled: editFlags.canUndo },
  { role: 'redo', enabled: editFlags.canRedo },
  SEPARATOR,
  { role: 'cut', enabled: editFlags.canCut },
  { role: 'copy', enabled: editFlags.canCopy },
  { role: 'paste', enabled: editFlags.canPaste },
  SEPARATOR,
  { role: 'selectAll', enabled: editFlags.canSelectAll },
]

export const contextMenuItems = (spot: ClickedSpot, copyText: (text: string) => void): MenuItemConstructorOptions[] => {
  if (spot.isEditable) return textFieldItems(spot)

  const items: MenuItemConstructorOptions[] = []

  if (spot.selectionText.trim()) items.push({ role: 'copy' })
  if (spot.linkURL) items.push({ label: 'Copy link', click: () => copyText(spot.linkURL) })

  return items
}
