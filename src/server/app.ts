import { createServer, type Server } from 'node:http'
import { IS_SINGLE_EXECUTABLE, PUBLIC_DIRECTORY } from './config.js'
import { errorText } from './lib/http/http-error.js'
import { sendJson } from './lib/http/json.js'
import { Router } from './lib/http/router.js'
import { directorySource, embeddedSource, serveStaticFile } from './lib/static.js'
import { registerRoutes, type RouteDependencies } from './routes/index.js'
import { handleAccessLink, hasAccessCookie } from './security/access-cookie.js'
import { isForbiddenRequest, type RequestGuardOptions } from './security/request-guard.js'
import { WEB_ASSETS } from './web-assets.js'

export interface AppOptions extends RequestGuardOptions {
  accessKey: string
}

export const createApp = (dependencies: RouteDependencies, options: AppOptions): Server => {
  const router = new Router()
  const webPageSource = IS_SINGLE_EXECUTABLE ? embeddedSource(WEB_ASSETS) : directorySource(PUBLIC_DIRECTORY)

  registerRoutes(router, dependencies)

  return createServer(async (request, response) => {
    try {
      response.setHeader('x-content-type-options', 'nosniff')
      response.setHeader('referrer-policy', 'no-referrer')

      if (isForbiddenRequest(request, options)) return sendJson(response, 403, { error: 'Forbidden' })

      const url = new URL(request.url ?? '/', 'http://localhost')
      const isApiRequest = url.pathname.startsWith('/api/')

      if (request.method === 'GET' && handleAccessLink(url, options.accessKey, response)) return

      if (isApiRequest && !hasAccessCookie(request.headers.cookie, options.accessKey)) {
        return sendJson(response, 401, { error: 'Open the app with the link shown when it started.' })
      }

      if (await router.handleIfMatched(request, response)) return
      if (request.method === 'GET' && (await serveStaticFile(response, webPageSource, url.pathname))) return

      sendJson(response, 404, { error: 'Not found' })
    } catch (error) {
      if (!response.headersSent) sendJson(response, 500, { error: errorText(error) })
    }
  })
}
