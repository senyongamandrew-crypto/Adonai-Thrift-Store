import env from '#start/env'
import { defineConfig } from '@adonisjs/shield'

export default defineConfig({
  csrf: {
    enabled: true,
    /**
     * The POS API is called by the mobile intake app and by scripts, which have
     * no browser session and therefore no CSRF token. Those routes are guarded
     * by the shop PIN instead (see app/services/shop_pin.ts), which a hostile
     * website cannot read out of a cookie jar.
     *
     * This is a callback rather than a list on purpose: the list form compares
     * each entry against the route pattern with an exact match, so an entry
     * like "/api/*" would silently never match anything.
     */
    exceptRoutes: (ctx) =>
      ctx.request.url().startsWith('/api/') || ctx.request.url().startsWith('/media/'),
    enableXsrfCookie: true,
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  },
  hsts: {
    enabled: true,
    maxAge: '180 days',
    includeSubDomains: true,
  },
  xFrame: {
    /**
     * Clickjacking protection is on by default. Preview environments (which
     * render the app inside an iframe) can opt out with
     * ALLOW_FRAME_EMBEDDING=true — never enable that on the public domain.
     */
    enabled: env.get('ALLOW_FRAME_EMBEDDING') !== true,
    action: 'DENY',
  },
  contentTypeSniffing: {
    enabled: true,
  },
})
