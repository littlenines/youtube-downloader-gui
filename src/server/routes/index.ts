import type { Router } from '@server/lib/http/router.js'
import type { DownloadQueue } from '@server/services/downloads/download-queue.js'
import type { HistoryStore } from '@server/services/stores/history-store.js'
import type { SettingsStore } from '@server/services/stores/settings-store.js'
import type { SubscriptionService } from '@server/services/subscriptions/subscription-service.js'
import { registerDownloadRoutes } from './download-routes.js'
import { registerMediaRoutes } from './media-routes.js'
import { registerSettingsRoutes } from './settings-routes.js'
import { registerSubscriptionRoutes } from './subscription-routes.js'

export interface RouteDependencies {
  settings: SettingsStore
  history: HistoryStore
  queue: DownloadQueue
  subscriptions: SubscriptionService
}

export const registerRoutes = (router: Router, dependencies: RouteDependencies): void => {
  registerSettingsRoutes(router, dependencies)
  registerMediaRoutes(router)
  registerDownloadRoutes(router, dependencies)
  registerSubscriptionRoutes(router, dependencies)
}
