/*
|--------------------------------------------------------------------------
| CORS for the shop API
|--------------------------------------------------------------------------
|
| The till runs inside an Android WebView, which loads its screens from
| file:///android_asset/... . When a page is loaded that way the browser sends
| "Origin: null", and a reply without a matching header is thrown away before
| the app ever sees it — which is what makes the phone report "Failed to fetch"
| even though the server answered correctly.
|
| Only reading and writing the catalogue is opened up here, and only to callers
| that already hold the shop PIN. The storefront's own pages are unaffected.
|
*/

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * A WebView sends the literal string "null" as its origin, so it cannot be
 * echoed back as a host name. Answering with a wildcard is what browsers accept
 * in that case, and it does not weaken anything here: the API's writes are
 * guarded by the PIN, not by the browser's same-origin rule.
 */
function allowedOrigin(origin: string | undefined): string {
  if (!origin || origin === 'null') return '*'
  return origin
}

export default class ApiCorsMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response } = ctx

    if (!request.url().startsWith('/api/') && !request.url().startsWith('/media/')) {
      return next()
    }

    const origin = allowedOrigin(request.header('origin'))

    response.header('access-control-allow-origin', origin)
    response.header('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    response.header(
      'access-control-allow-headers',
      'content-type, x-adonai-pin, x-adonai-admin-session, x-adonai-session, authorization, accept'
    )
    response.header('access-control-max-age', '86400')
    response.header('vary', 'origin')

    /**
     * The browser asks permission before it sends a write. Answering here means
     * the real request is never attempted if the answer would be refused.
     */
    if (request.method() === 'OPTIONS') {
      return response.status(204).send('')
    }

    return next()
  }
}
