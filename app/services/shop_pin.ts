/*
|--------------------------------------------------------------------------
| Shop PIN
|--------------------------------------------------------------------------
|
| One PIN protects the intake screens and the catalogue write endpoints. It is
| read from ADMIN_PIN, so it can be changed from the hosting dashboard at any
| time without a new build.
|
| The comparison is timing-safe and failed attempts are slowed down, because a
| four digit PIN would otherwise be quick to guess.
|
*/

import { timingSafeEqual } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'

/** The PIN used when the dashboard has not set one yet. */
export const DEFAULT_SHOP_PIN = '7890'

export function configuredPin(): string {
  const configured = (env.get('ADMIN_PIN') || '').trim()
  return configured === '' ? DEFAULT_SHOP_PIN : configured
}

/**
 * True while the shop is still using the built-in PIN. The intake screen shows
 * a reminder to change it in that case.
 */
export function usingDefaultPin(): boolean {
  return configuredPin() === DEFAULT_SHOP_PIN
}

export function pinMatchesConfigured(supplied?: string | null): boolean {
  const expected = configuredPin()
  const candidate = (supplied ?? '').trim()
  if (!candidate) return false

  const expectedBuffer = Buffer.from(expected)
  const candidateBuffer = Buffer.from(candidate)
  /**
   * Buffers of different lengths cannot be compared in constant time, and the
   * length itself is not a secret worth protecting here.
   */
  if (expectedBuffer.length !== candidateBuffer.length) return false

  return timingSafeEqual(expectedBuffer, candidateBuffer)
}

/**
 * Accepts the PIN as "x-adonai-pin: 7890" or as "Authorization: Bearer 7890",
 * so whichever is easier for a device or script can be used.
 */
export function readSuppliedPin(request: HttpContext['request']): string | undefined {
  const headerPin = request.header('x-adonai-pin')
  if (headerPin) return headerPin

  const authorization = request.header('authorization') || ''
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim())
  return match ? match[1] : undefined
}

/**
 * Failed attempts are remembered per client address. After a few wrong PINs
 * the shop tool waits before answering again, which makes guessing impractical
 * while staying invisible to the owner who types it correctly.
 */
const attempts = new Map<string, { count: number; blockedUntil: number }>()

const MAX_ATTEMPTS = 5
const BLOCK_MS = 60_000

export function pinAttemptDelay(clientKey: string): number {
  const record = attempts.get(clientKey)
  if (!record) return 0
  return Math.max(0, record.blockedUntil - Date.now())
}

export function recordPinFailure(clientKey: string) {
  const record = attempts.get(clientKey) || { count: 0, blockedUntil: 0 }
  record.count += 1
  if (record.count >= MAX_ATTEMPTS) {
    record.blockedUntil = Date.now() + BLOCK_MS
    record.count = 0
  }
  attempts.set(clientKey, record)
}

export function clearPinFailures(clientKey: string) {
  attempts.delete(clientKey)
}
