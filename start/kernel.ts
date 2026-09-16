/*
|--------------------------------------------------------------------------
| HTTP kernel file
|--------------------------------------------------------------------------
|
| The HTTP kernel file is used to register the middleware with the server
| or the router. The server level middleware runs on every request, even
| when there is no route match. The router level middleware runs only
| for the matched routes.
|
*/

import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'

server.errorHandler(() => import('#exceptions/handler'))

server.use([
  () => import('#middleware/force_https_middleware'),
  () => import('@adonisjs/static/static_middleware'),
  () => import('@adonisjs/vite/vite_middleware'),
])

router.use([
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/session/session_middleware'),
  () => import('@adonisjs/shield/shield_middleware'),
  () => import('#middleware/storefront_services_middleware'),
])

/**
 * The named middleware can be applied to individual routes. The public
 * POST routes (account, contact and checkout) use the honeypot and
 * rate-limit protection.
 */
export const middleware = router.named({
  formSpam: () => import('#middleware/form_spam_middleware'),
})
