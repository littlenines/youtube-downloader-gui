import { ExpiringMap } from '@server/lib/expiring-map.js'

export const videoInfoCache = new ExpiringMap<unknown>({ lifetimeMilliseconds: 30 * 60_000, maximumEntries: 20 })
