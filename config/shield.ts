import env from '#start/env'
import { defineConfig } from '@adonisjs/shield'

export default defineConfig({
  csrf: {
    enabled: true,
    exceptRoutes: [],
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
