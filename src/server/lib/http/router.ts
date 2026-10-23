import type { IncomingMessage, ServerResponse } from 'node:http'
import { errorText, HttpError } from './http-error.js'
import { sendJson } from './json.js'

export interface RequestContext {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  parameters: string[]
}

type RouteHandler = (context: RequestContext) => Promise<unknown> | unknown

interface Route {
  method: string
  pattern: RegExp
  handler: RouteHandler
}

const routePattern = (path: string) => new RegExp(`^${path.replace(/:[a-z]+/gi, '([^/]+)')}$`)

export const decodePathSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment)
  } catch {
    throw new HttpError(400, 'The address is malformed.')
  }
}

export class Router {
  private readonly routes: Route[] = []

  get(path: string, handler: RouteHandler): this {
    return this.addRoute('GET', path, handler)
  }

  post(path: string, handler: RouteHandler): this {
    return this.addRoute('POST', path, handler)
  }

  delete(path: string, handler: RouteHandler): this {
    return this.addRoute('DELETE', path, handler)
  }

  async handleIfMatched(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://localhost')

    for (const route of this.routes) {
      if (route.method !== request.method) continue

      const match = route.pattern.exec(url.pathname)

      if (!match) continue

      await this.runHandler(route, { request, response, url }, match.slice(1))

      return true
    }

    return false
  }

  private async runHandler(
    route: Route,
    context: Omit<RequestContext, 'parameters'>,
    encodedParameters: string[],
  ): Promise<void> {
    const { response } = context

    try {
      const result = await route.handler({ ...context, parameters: encodedParameters.map(decodePathSegment) })

      if (!response.headersSent) sendJson(response, 200, result ?? { ok: true })
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500

      if (!response.headersSent) sendJson(response, status, { error: errorText(error) })
    }
  }

  private addRoute(method: string, path: string, handler: RouteHandler): this {
    this.routes.push({ method, pattern: routePattern(path), handler })

    return this
  }
}
