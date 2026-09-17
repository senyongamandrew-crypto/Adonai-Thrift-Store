/*
|--------------------------------------------------------------------------
| Catalogue photos
|--------------------------------------------------------------------------
|
| Product photos saved from a phone. The bytes live in a folder beside the
| catalogue so they travel with it, and the file name is generated here rather
| than taken from the upload — a name sent by a device must never decide where a
| file is written.
|
*/

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import env from '#start/env'
import type { StoredMedia } from '#services/catalogue_store'
import { getBuiltInCatalogue } from '#services/storefront_services'

/** Well under the hosting allowance, and enough for a shop's whole catalogue. */
const DEFAULT_QUOTA_BYTES = 200 * 1024 * 1024

/** The largest single photo. A photo taken on a phone is rarely bigger. */
export function maxUploadBytes(): number {
  const configured = Number(env.get('ADONAI_MEDIA_MAX_FILE_BYTES'))
  return Number.isFinite(configured) && configured > 0 ? configured : 5 * 1024 * 1024
}

/** The shop's total allowance for photos. */
export function mediaQuotaBytes(): number {
  const configured = Number(env.get('ADONAI_MEDIA_QUOTA_BYTES'))
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_QUOTA_BYTES
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function mediaDirectory(): string {
  const configured = (env.get('ADONAI_MEDIA_DIR') || 'storage/media').trim()
  /**
   * Resolved against the application root, exactly like the catalogue folder: in
   * production the running code lives in "build", so a folder named by a relative
   * path would otherwise be recreated empty on every deploy.
   */
  return configured.startsWith('/') ? configured : app.makePath(configured)
}

function ensureDirectory() {
  const directory = mediaDirectory()
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
  return directory
}

/**
 * Save an image and return the record describing it. The public address is
 * relative, so it keeps working behind any host name.
 */
export function saveImage(bytes: Buffer, contentType: string): StoredMedia {
  const directory = ensureDirectory()
  const extension = EXTENSIONS[contentType.toLowerCase()] || 'jpg'
  const key = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${extension}`

  writeFileSync(join(directory, key), bytes)

  const entry: StoredMedia = {
    key,
    url: `/media/${key}`,
    contentType: contentType.toLowerCase(),
    bytes: bytes.length,
    createdAt: new Date().toISOString(),
  }

  getBuiltInCatalogue().addMedia(entry)
  return entry
}

/** Read an image back for serving. Returns null when it is not a known file. */
export function readImage(key: string): { bytes: Buffer; contentType: string } | null {
  const record = getBuiltInCatalogue().findMedia(key)
  if (!record) return null

  const path = join(mediaDirectory(), record.key)
  if (!existsSync(path)) return null

  return { bytes: readFileSync(path), contentType: record.contentType }
}

/**
 * Whether the photo itself is still on disk, regardless of what the records say.
 * The records and the files can disagree after a restart on hosting that hands
 * back an empty disk, and it is the file the browser asks for.
 */
export function imageFileExists(key: string): boolean {
  const safe = (key || '').split('/').pop() || ''
  if (!safe) return false
  return existsSync(join(mediaDirectory(), safe))
}

export function removeImage(key: string): boolean {
  const record = getBuiltInCatalogue().findMedia(key)
  if (!record) return false

  try {
    const path = join(mediaDirectory(), record.key)
    if (existsSync(path)) unlinkSync(path)
  } catch {
    /** Losing the file is not worth failing the request over; the record still goes. */
  }
  return true
}
