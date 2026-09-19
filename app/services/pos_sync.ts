/*
|--------------------------------------------------------------------------
| POS compatibility
|--------------------------------------------------------------------------
|
| The shop's Android till (Adonai Thrift Store POS 8.2.3, package com.adonai.pos)
| talks to a specific set of routes and expects a specific set of field names.
| Those do not match the ones the website uses, so this module translates
| between the two.
|
| Nothing here changes what a customer sees. It exists so a piece entered on the
| phone arrives on the website with its price, size, photo and description
| intact, and so the phone can read the same catalogue back again.
|
*/

import type { StoredProduct, ProductInput, ProductImage, ImageTag } from '#services/catalogue_store'
import { isValidImageTag } from '#services/catalogue_store'

/**
 * The POS stores lists its own way and sends strings for numbers, so everything
 * arrives here untyped on purpose.
 */
type Payload = Record<string, unknown>

function text(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '')
    if (cleaned === '') return undefined
    const parsed = Number(cleaned)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * Fields the translator has already understood. Everything else the phone sends
 * is kept as-is, so a future version of the app that adds a column still gets it
 * back on the next read.
 */
const UNDERSTOOD = new Set([
  'id',
  'sku',
  'name',
  'title',
  'itemName',
  'price',
  'cost',
  'costPrice',
  'cost_price',
  'originalPrice',
  'original_price',
  'comparePrice',
  'category',
  'condition',
  'size',
  'sizes',
  'colour',
  'color',
  'colours',
  'colors',
  'description',
  'details',
  'notes',
  'measurementNote',
  'measurement_note',
  'image',
  'imageUrl',
  'image_url',
  'photo',
  'thumbnail',
  'gallery',
  'images',
  'imageTags',
  'image_tags',
  'galleryLabels',
  'gallery_labels',
  'imageLabels',
  'bin',
  'status',
  'state',
  'quantity',
  'qty',
  'stock',
  'stockQty',
  'stockQuantity',
  'stock_quantity',
  'lowStockThreshold',
  'low_stock_threshold',
  'lowStock',
  'available',
  'isAvailable',
  'inStock',
  'sold',
  'active',
  'newArrival',
  'new_arrival',
  'isNewArrival',
  'featured',
  'isFeatured',
])

/**
 * Turn one item as the phone sends it into the shape this service stores.
 */
export function fromPosProduct(payload: Payload): ProductInput {
  const extras: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (!UNDERSTOOD.has(key)) extras[key] = value
  }

  const quantity = numeric(
    payload.quantity ??
      payload.qty ??
      payload.stock ??
      payload.stockQty ??
      payload.stockQuantity ??
      payload.stock_quantity
  )
  const lowStockThreshold = numeric(
    payload.lowStockThreshold ?? payload.low_stock_threshold ?? payload.lowStock
  )
  const sold = booleanish(payload.sold)
  const available = firstBooleanish(
    payload.available,
    payload.isAvailable,
    payload.inStock,
    payload.active
  )

  // Prefer structured ProductImage array when supplied
  const structuredImages = imagesOf(payload.images ?? payload.gallery)
  const galleryFallback = galleryOf(payload.gallery ?? payload.images)

  const input: ProductInput = {
    id: text(payload.id ?? payload.sku),
    sku: text(payload.sku),
    name: text(payload.name ?? payload.title ?? payload.itemName),
    price: numeric(payload.price),
    cost: numeric(payload.cost),
    costPrice: numeric(payload.costPrice ?? payload.cost_price ?? payload.cost),
    originalPrice: numeric(payload.originalPrice ?? payload.original_price ?? payload.comparePrice),
    category: text(payload.category),
    condition: text(payload.condition),
    size: text(payload.size),
    sizes: listOf(payload.sizes),
    colours: listOf(payload.colour ?? payload.color ?? payload.colours ?? payload.colors),
    description: text(payload.description),
    details: text(payload.details ?? payload.notes),
    measurementNote: text(payload.measurementNote ?? payload.measurement_note),
    image: text(
      payload.image ?? payload.imageUrl ?? payload.image_url ?? payload.photo ?? payload.thumbnail
    ),
    gallery: structuredImages ? undefined : galleryFallback,
    images: structuredImages,
    /*
     * Which view each photo shows. Sent as its own list because the gallery may
     * arrive either as plain links or as objects, and pairing the two by position
     * keeps the labels attached to the photos they describe.
     */
    galleryLabels: textListOf(
      payload.galleryLabels ?? payload.gallery_labels ?? payload.imageLabels
    ),
    bin: text(payload.bin),
    status: text(payload.status ?? payload.state),
    quantity,
    stockQuantity: quantity,
    lowStockThreshold,
    newArrival: firstBooleanish(payload.newArrival, payload.new_arrival, payload.isNewArrival),
    featured: firstBooleanish(payload.featured, payload.isFeatured),
  }

  /**
   * When the phone says "sold", that beats everything else. A quantity of zero
   * means the same thing.
   */
  if (sold === true) input.available = false
  else if (available !== undefined) input.available = available
  else if (quantity !== undefined && quantity <= 0) input.available = false

  if (Object.keys(extras).length > 0) input.extras = extras

  return input
}

/**
 * Turn a stored item back into what the phone expects to read, so the till's own
 * list looks exactly as it did when the piece was entered.
 */
export function toPosProduct(product: StoredProduct): Record<string, unknown> {
  return {
    id: product.id,
    sku: product.sku ?? product.id,
    name: product.name,
    price: product.price ?? 0,
    cost: product.cost ?? product.costPrice ?? null,
    costPrice: product.costPrice ?? product.cost ?? null,
    originalPrice: product.originalPrice ?? null,
    category: product.category ?? '',
    condition: product.condition ?? '',
    size: product.size ?? '',
    sizes: product.sizes ?? [],
    colour: (product.colours ?? []).join(', '),
    description: product.description ?? '',
    details: product.details ?? '',
    measurementNote: product.measurementNote ?? '',
    image: product.image ?? '',
    gallery: product.gallery ?? [],
    galleryLabels: product.galleryLabels ?? [],
    images:
      product.images ??
      (product.gallery ?? []).map((url, idx) => ({
        id: `img_${product.id}_${idx}`,
        url,
        isPrimary: idx === 0,
        tag: (idx === 0 ? 'front' : 'other') as ImageTag,
        order: idx,
      })),
    bin: product.bin ?? '',
    status: product.status ?? (product.available ? 'available' : 'sold'),
    quantity: product.quantity ?? product.stockQuantity ?? (product.available ? 1 : 0),
    stockQuantity: product.stockQuantity ?? product.quantity ?? (product.available ? 1 : 0),
    lowStockThreshold: product.lowStockThreshold ?? 5,
    available: product.available,
    newArrival: product.newArrival,
    featured: product.featured ?? product.newArrival,
    updatedAt: product.updatedAt,
    ...(product.extras ?? {}),
  }
}

function booleanish(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const word = value.trim().toLowerCase()
    if (['true', 'yes', '1', 'sold'].includes(word)) return true
    if (['false', 'no', '0', 'available'].includes(word)) return false
  }
  return undefined
}

function firstBooleanish(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    const parsed = booleanish(value)
    if (parsed !== undefined) return parsed
  }
  return undefined
}

function listOf(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.map((entry) => text(entry)).filter((entry): entry is string => !!entry)
    return items.length > 0 ? items : undefined
  }
  const single = text(value)
  if (!single) return undefined
  const items = single
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return items.length > 0 ? items : undefined
}

function textListOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    const single = text(value)
    return single ? [single] : undefined
  }

  const entries = value
    .map((entry) => text(entry))
    .filter((entry): entry is string => Boolean(entry))
  return entries.length > 0 ? entries : undefined
}

function galleryOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    const single = text(value)
    return single ? [single] : undefined
  }

  const items: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      const url = text(entry)
      if (url) items.push(url)
      continue
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Payload
      // Structured ProductImage objects are handled by imagesOf; skip them here
      if ('isPrimary' in record || 'tag' in record) continue
      const url = text(record.src ?? record.url ?? record.image ?? record.href)
      if (url) items.push(url)
    }
  }

  return items.length > 0 ? items : undefined
}

function imagesOf(value: unknown): ProductImage[] | undefined {
  if (!Array.isArray(value)) return undefined

  const images: ProductImage[] = []
  let idx = 0
  for (const entry of value as unknown[]) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    // Must look like ProductImage: needs url/src and tag/isPrimary/order
    const hasImageShape =
      'url' in record || 'src' in record || 'tag' in record || 'isPrimary' in record
    if (!hasImageShape) continue
    const url = text(record.url ?? record.src ?? record.image ?? record.href)
    if (!url) continue
    const rawTag = String(record.tag ?? 'other')
      .trim()
      .toLowerCase()
    const tag: ImageTag = isValidImageTag(rawTag) ? (rawTag as ImageTag) : 'other'
    const isPrimary = Boolean(record.isPrimary)
    const order = Number.isFinite(record.order)
      ? Math.max(0, Math.floor(Number(record.order)))
      : idx
    const id = text(record.id) ?? `img_${Date.now()}_${idx}`
    images.push({ id, url, isPrimary, tag, order })
    idx += 1
  }

  if (images.length === 0) return undefined

  // Normalize: ensure exactly one primary, same logic as catalogue_store
  images.sort((a, b) => a.order - b.order)
  images.forEach((img, i) => (img.order = i))
  const primaryCount = images.filter((i) => i.isPrimary).length
  if (primaryCount === 0) {
    images[0].isPrimary = true
    images[0].tag = 'front'
  } else if (primaryCount > 1) {
    let kept = false
    for (const img of images) {
      if (img.isPrimary) {
        if (!kept) kept = true
        else img.isPrimary = false
      }
    }
  }
  const primary = images.find((i) => i.isPrimary)
  if (primary && primary.tag !== 'front') primary.tag = 'front'
  if (primary) {
    for (const img of images) {
      if (img.id !== primary.id && img.tag === 'front') img.tag = 'other'
    }
  }

  return images
}

/**
 * The health answer the phone's connection test expects. It checks `ok` first,
 * then shows whatever else it recognises.
 */
export function posHealth() {
  return {
    ok: true,
    status: 'ok',
    service: 'adonai-thrift-store',
    version: '8.2.3',
    catalog: 'ok',
    database: 'json',
    time: new Date().toISOString(),
  }
}
