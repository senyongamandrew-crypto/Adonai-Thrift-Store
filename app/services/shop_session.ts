/*
|--------------------------------------------------------------------------
| Shop session tokens
|--------------------------------------------------------------------------
|
| The POS app does not send the PIN with every request. It asks once
| (POST /api/pos/admin/session), keeps the answer, and sends that answer back in
| an X-Adonai-Admin-Session header.
|
| The token is signed rather than remembered, so it survives a restart of the
| service: if the shop's phone is holding a valid token, a deploy does not force
| the owner to type the PIN again.
|
*/

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import { pinMatchesConfigured } from '#services/shop_pin'

/** Where the browser session remembers that the PIN was accepted. */
export const PIN_SESSION_KEY = 'adonai_shop_pin_ok'

/**
 * True when the person at the browser already typed the shop PIN. The intake
 * screen uses this, and so does the API, so a signed-in browser can do the same
 * things the phone can.
 */
export function sessionSignedIn(ctx: HttpContext): boolean {
  try {
    return Boolean(ctx.session?.get(PIN_SESSION_KEY))
  } catch {
    return false
  }
}

/** How long a token stays usable. The POS expects about twelve hours. */
const LIFETIME_MS = 12 * 60 * 60 * 1000

function secret(): string {
  /**
   * APP_KEY is already required by the service and is not shown anywhere. Falling
   * back to it keeps one secret to manage rather than two.
   */
  const key = env.get('APP_KEY')
  if (!key) return 'adonai-pos'
  return typeof key === 'string' ? key : key.release()
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

/** True when the PIN the phone sent is the shop's PIN. */
export function pinIsValid(supplied?: string | null): boolean {
  return pinMatchesConfigured(supplied)
}

export type IssuedToken = {
  token: string
  expiresAt: string
  lifetimeSeconds: number
}

export function issueToken(): IssuedToken {
  const issuedAt = Date.now()
  const payload = Buffer.from(JSON.stringify({ iat: issuedAt })).toString('base64url')
  return {
    token: `${payload}.${sign(payload)}`,
    expiresAt: new Date(issuedAt + LIFETIME_MS).toISOString(),
    lifetimeSeconds: Math.floor(LIFETIME_MS / 1000),
  }
}

/**
 * A token is accepted only if the signature matches and it is still inside its
 * lifetime. Anything malformed is simply refused.
 */
export function tokenIsValid(token?: string | null): boolean {
  const candidate = (token ?? '').trim()
  if (!candidate || !candidate.includes('.')) return false

  const [payload, signature] = candidate.split('.')
  if (!payload || !signature) return false

  const expected = sign(payload)
  const givenBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (givenBuffer.length !== expectedBuffer.length) return false
  if (!timingSafeEqual(givenBuffer, expectedBuffer)) return false

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      iat?: number
    }
    if (typeof decoded.iat !== 'number') return false
    return Date.now() - decoded.iat < LIFETIME_MS
  } catch {
    return false
  }
}
