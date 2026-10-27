import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MenuItemConstructorOptions } from 'electron'
import { contextMenuItems, type ClickedSpot } from '@desktop/context-menu-items.js'

const editFlags = {
  canUndo: false,
  canRedo: false,
  canCut: false,
  canCopy: false,
  canPaste: true,
  canDelete: false,
  canSelectAll: true,
  canEditRichly: false,
}

const spot = (changes: Partial<ClickedSpot> = {}): ClickedSpot => ({
  isEditable: false,
  editFlags,
  selectionText: '',
  linkURL: '',
  ...changes,
})

const shown = (items: MenuItemConstructorOptions[]) =>
  items.map((item) =>
    item.type === 'separator' ? '—' : `${item.role ?? item.label}${item.enabled === false ? ' (off)' : ''}`,
  )

describe('contextMenuItems', () => {
  it('offers the usual editing menu in a text field, with what can not be done greyed out', () => {
    assert.deepEqual(shown(contextMenuItems(spot({ isEditable: true }), () => {})), [
      'undo (off)',
      'redo (off)',
      '—',
      'cut (off)',
      'copy (off)',
      'paste',
      '—',
      'selectAll',
    ])
  })

  it('offers Copy for selected text and Copy link for a link', () => {
    const copied: string[] = []
    const items = contextMenuItems(spot({ selectionText: 'Download failed', linkURL: 'https://example.com' }), (text) =>
      copied.push(text),
    )

    const copyLink = items.find((item) => item.label === 'Copy link')?.click as (() => void) | undefined

    copyLink?.()

    assert.deepEqual([shown(items), copied], [['copy', 'Copy link'], ['https://example.com']])
  })

  it('opens no menu anywhere else', () => {
    assert.deepEqual(
      contextMenuItems(spot({ selectionText: '   ' }), () => {}),
      [],
    )
  })
})
