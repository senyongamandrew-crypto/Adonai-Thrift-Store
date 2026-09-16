import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'

/**
 * Redirects visitors from plain HTTP to HTTPS in production.
 *
 * This is deliberately conservative, because a wrong redirect is worse than no
 * redirect: a platform health check that receives a 308 is treated as a failed
 * deploy, and a proxy that does not forward the original protocol would create
 * an endless redirect loop.
 *
 * The redirect therefore happens only when the request itself proves the
 * visitor arrived over plain HTTP (`x-forwarded-proto: http`), which is what
 * hosting proxies set. Everything else — including platform health probes,
 * which may arrive without that header — is served normally.
 *
 * Set FORCE_HTTPS=false to switch the behaviour off entirely (local previews).
 * The /healthz probe is always answered so the platform never marks the
 * service unhealthy.
 */
export default class ForceHttpsMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    if (env.get('NODE_ENV') !== 'production') return next()
    if (env.get('FORCE_HTTPS') === false) return next()

    const path = request.url(true).split('?')[0]
    if (path === '/healthz') return next()

    // Already secure, or the protocol cannot be determined: serve the request.
    if (request.protocol() === 'https') return next()

    const forwardedProto = request.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
    if (forwardedProto !== 'http') return next()

    const host = request.header('x-forwarded-host')?.split(',')[0]?.trim() || request.host()
    const location = `https://${host}${request.url(true)}`
    return response.redirect(location, false, 308)
  }
}
