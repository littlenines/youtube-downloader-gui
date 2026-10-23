import type { SubscriptionRequest, SubscriptionsResponse } from '@shared/types/subscriptions.js'
import { HttpError } from '@server/lib/http/http-error.js'
import { readJsonBody } from '@server/lib/http/json.js'
import type { Router } from '@server/lib/http/router.js'
import type { RouteDependencies } from './index.js'
import { isLinkValue, toHttpError } from './route-helpers.js'

export const registerSubscriptionRoutes = (router: Router, { subscriptions }: RouteDependencies): void => {
  router.get('/api/subscriptions', (): SubscriptionsResponse => subscriptions.list())

  router.post('/api/subscriptions', async ({ request }) => {
    const body = await readJsonBody<SubscriptionRequest>(request)

    if (!isLinkValue(body.url)) throw new HttpError(400, 'Paste a channel or playlist link to subscribe.')

    try {
      return await subscriptions.subscribe({ ...body, url: body.url.trim() })
    } catch (error) {
      throw toHttpError(error)
    }
  })

  router.post('/api/subscriptions/check', (): SubscriptionsResponse => {
    subscriptions.checkAll().catch(() => {})

    return subscriptions.list()
  })

  router.delete('/api/subscriptions/:id', async ({ parameters: [id = ''] }) => {
    if (!(await subscriptions.unsubscribe(id))) throw new HttpError(404, 'No such subscription.')
  })
}
