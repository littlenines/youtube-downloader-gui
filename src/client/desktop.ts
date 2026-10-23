import type { DesktopBridge } from '@shared/types/app.js'

export const desktopBridge: DesktopBridge | null = (window as { desktop?: DesktopBridge }).desktop ?? null
