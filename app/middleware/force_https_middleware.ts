import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'

export default class ForceHttpsMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    if (env.get('NODE_ENV') !== 'production') return next()

    /**
     * Local previews and platforms that terminate TLS without forwarding the
     * original protocol can set FORCE_HTTPS=false to avoid a redirect loop.
     * Every other production deployment leaves it enabled.
     */
    if (env.get('FORCE_HTTPS') === false) return next()

    const forwardedProto = request.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
    const isHttps = request.protocol() === 'https' || forwardedProto === 'https'
    if (!isHttps) {
      const host = request.header('x-forwarded-host') || request.host()
      const currentPath = request.url(true)
      const location = `https://${host}${currentPath.startsWith('/') ? currentPath : `/${currentPath}`}`
      return response.redirect(location, false, 308)
    }

    return next()
  }
}
