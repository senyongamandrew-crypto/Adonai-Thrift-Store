import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 12
const hits = new Map<string, { count: number; resetAt: number }>()

/**
 * Lightweight first-line protection for public browser forms.
 * Use a shared Redis-backed limiter when running multiple Node instances.
 */
export default class FormSpamMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    if (!['POST', 'PUT', 'PATCH'].includes(request.method())) return next()

    const honeypot = String(request.input('website') || '').trim()
    if (honeypot) return response.status(422).send({ errors: [{ message: 'Form rejected.' }] })

    const key = `${request.ip()}::${request.url()}`
    const now = Date.now()
    const current = hits.get(key)
    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + WINDOW_MS })
      return next()
    }
    if (current.count >= MAX_REQUESTS_PER_WINDOW) {
      return response
        .status(429)
        .send({ errors: [{ message: 'Too many requests. Please try again shortly.' }] })
    }
    current.count += 1
    return next()
  }
}
