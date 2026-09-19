/*
|--------------------------------------------------------------------------
| Built-in POS catalogue
|--------------------------------------------------------------------------
|
| The storefront is designed to read its catalogue from a private POS API. When
| no external API is configured (FLASK_API_BASE_URL), this store answers the
| same questions, so the shop can list pieces without running a second service.
|
| Storage is two JSON files under ADONAI_DATA_DIR:
|
|   catalogue.json  the products. Safe to publish, snapshotted to the repo.
|   records.json    orders and contact messages. Never leaves the server.
|
| Only the catalogue is snapshotted, because orders and messages contain the
| personal details of customers.
|
| Writes are atomic (write a temporary file, then rename) so a crash mid-write
| cannot leave a half-written catalogue behind.
|
*/

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// ---------------------------------------------------------------------------
// Multi-Angle Asset Pipeline — Step 1: Strict Type Definitions
// ---------------------------------------------------------------------------

/**
 * Dedicated tags for the structured multi-angle gallery.
 * Each photo declares what angle it captures; the storefront uses the tag
 * to label the view and the POS uses `front` as the primary grid image.
 */
export type ImageTag = 'front' | 'back' | 'texture' | 'label' | 'other'

/**
 * One entry in the structured multi-angle gallery.
 * `isPrimary` must be true for exactly one entry per product — the front view
 * that represents the item on the inventory grid.
 */
export interface ProductImage {
  id: string
  url: string
  isPrimary: boolean
  tag: ImageTag
  order: number
}

/**
 * Strict shape for the intake form payload as it arrives from the POS
 * (React intake panel, shop web intake, or mobile API). Extends the legacy
 * `ProductInput` fields with the optimized stock-count entries.
 */
export interface ItemIntakeFormData {
  name: string
  sku: string
  price: number
  costPrice: number
  stockQuantity: number
  lowStockThreshold: number
  category: string
  description?: string
  images: ProductImage[]
}

export type StoredProduct = {
  id: string
  name: string
  price: number | null
  category?: string
  condition?: string
  size?: string
  sizes?: string[]
  colours?: string[]
  description?: string
  image?: string
  gallery?: string[]
  /**
   * What each photo in the gallery shows — "Front view", "Tag", "Texture" —
   * position for position with `gallery`. A customer buying second-hand wants to
   * know which view they are looking at, and a caption costs nothing to carry.
   */
  galleryLabels?: string[]
  measurementNote?: string
  available: boolean
  newArrival: boolean
  createdAt: string
  updatedAt: string

  /**
   * Fields the POS application fills in that the website does not show. They are
   * stored so nothing the shop typed is lost when an item travels through this
   * service: the phone sends them, the phone reads them back.
   */
  sku?: string
  brand?: string
  cost?: number | null
  costPrice?: number | null
  originalPrice?: number | null
  bin?: string
  details?: string
  status?: string
  quantity?: number
  stockQuantity?: number
  lowStockThreshold?: number
  featured?: boolean

  /**
   * Structured multi-angle gallery. When present it is the canonical source of
   * truth for images; `image`/`gallery`/`galleryLabels` are derived from it for
   * backward compatibility with older clients.
   */
  images?: ProductImage[]

  /** Anything else the POS sends, kept verbatim so a re-read is lossless. */
  extras?: Record<string, unknown>
}

export type StoredOrder = {
  id: string
  createdAt: string
  customer: Record<string, unknown>
  status: 'received' | 'dispatched' | 'delivered' | 'cancelled'
  /** What was ordered, and how it is being paid for. */
  details?: Record<string, unknown>
  driverId?: string
  /**
   * The rider this order is promised to, filled in on the way out to a screen.
   * Only the id is written to the file; the name and number are joined on at read
   * time so a renamed driver never leaves a stale name on an old order.
   */
  driver?: StoredDriver | null
  assignedAt?: string
  updatedAt?: string
}

export type StoredCustomer = {
  id: string
  name?: string
  phone?: string
  email?: string
  address?: string
  createdAt: string
  updatedAt: string
  totalOrders: number
}

/** A visit, sign-in or install the storefront reported. */
export type StoredEvent = {
  id: string
  name: string
  createdAt: string
  details: Record<string, unknown>
}

export type StoredDriver = {
  id: string
  name: string
  phone?: string
  vehicle?: string
  active: boolean
  latitude?: number
  longitude?: number
  locatedAt?: string
  createdAt: string
  updatedAt: string
}

/**
 * An uploaded product photo. The bytes live on disk under the media directory;
 * this is the record that says which file is safe to serve.
 */
export type StoredMedia = {
  key: string
  url: string
  contentType: string
  bytes: number
  createdAt: string
}

export type StoredMessage = {
  id: string
  createdAt: string
  name?: string
  phone?: string
  email?: string
  message?: string
}

export type ProductInput = {
  id?: string
  name?: string
  price?: number | string | null
  category?: string
  condition?: string
  size?: string
  sizes?: string[]
  colours?: string[]
  description?: string
  image?: string | null
  gallery?: string[] | null
  galleryLabels?: string[] | null
  /**
   * Structured gallery for the multi-angle pipeline. When supplied it is
   * validated so exactly one entry is primary and tags are constrained.
   */
  images?: ProductImage[] | null
  imageTags?: string[] | null
  measurementNote?: string
  available?: boolean
  newArrival?: boolean
  sku?: string
  brand?: string
  cost?: number | string | null
  costPrice?: number | string | null
  originalPrice?: number | string | null
  bin?: string
  details?: string
  status?: string
  quantity?: number | string | null
  stockQuantity?: number | string | null
  lowStockThreshold?: number | string | null
  featured?: boolean
  extras?: Record<string, unknown>
}

type CatalogueFile = {
  version: 1
  updatedAt: string
  products: StoredProduct[]
}

type RecordsFile = {
  version: 1
  /**
   * Bumped on every write to this file.
   *
   * The till's basket panel runs on a phone over a shop's mobile data, so it can
   * neither hold a socket open nor afford to re-download the whole queue every few
   * seconds. Asking "has anything changed since revision 12?" costs one number on
   * the wire and answers honestly.
   */
  revision?: number
  orders: StoredOrder[]
  messages: StoredMessage[]
  /** Added for the POS integration; older files simply do not have them yet. */
  customers?: StoredCustomer[]
  events?: StoredEvent[]
  drivers?: StoredDriver[]
  media?: StoredMedia[]
}

/**
 * Turn anything the shop types into a stable identifier for product URLs.
 * "Vintage denim jacket" becomes "vintage-denim-jacket-4f2a" so links stay
 * readable while remaining unique.
 */
function makeProductId(name: string, provided?: string): string {
  const candidate = (provided || '').trim()
  if (candidate) return candidate

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

  return `${slug || 'item'}-${randomUUID().slice(0, 4)}`
}

/**
 * Coordinates need their decimal places kept. Prices do not, since the shop
 * trades in whole shillings, so the two are parsed separately on purpose.
 */
function toCoordinate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.trim()
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string') {
    const digits = value.replace(/[^0-9.]/g, '')
    if (!digits) return null
    const parsed = Number(digits)
    return Number.isFinite(parsed) ? Math.round(parsed) : null
  }
  return null
}

function toCleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function toCleanList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const list = value.map((entry) => String(entry).trim()).filter(Boolean)
    return list.length ? list : undefined
  }
  if (typeof value === 'string') {
    const list = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    return list.length ? list : undefined
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Multi-angle pipeline helpers
// ---------------------------------------------------------------------------

export const VALID_IMAGE_TAGS: readonly ImageTag[] = [
  'front',
  'back',
  'texture',
  'label',
  'other',
] as const

export function isValidImageTag(tag: unknown): tag is ImageTag {
  return typeof tag === 'string' && (VALID_IMAGE_TAGS as readonly string[]).includes(tag)
}

/**
 * Normalise a structured ProductImage array.
 *
 * Guarantees:
 * - Tags are constrained to the allowed set (defaults to `other`).
 * - Orders are sequential integers.
 * - Exactly one image is primary; if none is marked, the first becomes primary
 *   with tag `front`. If several are marked, only the first keeps it.
 * - Legacy `gallery`/`galleryLabels`/`image` are mirrored from the structured array.
 *
 * Returns undefined when input is null/undefined or empty and no existing images
 * exist, so callers can distinguish "no change" from "clear".
 */
export function normaliseProductImages(
  input: ProductImage[] | null | undefined,
  existing?: StoredProduct
): ProductImage[] | undefined {
  if (input === null) return undefined // explicit clear is handled by gallery path
  if (!Array.isArray(input) || input.length === 0) {
    // No new images supplied — keep existing if present
    return existing?.images ? [...existing.images] : undefined
  }

  const cleaned: ProductImage[] = input
    .map((raw, idx) => {
      const id =
        typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `img_${Date.now()}_${idx}`
      const url = typeof raw.url === 'string' ? raw.url.trim() : ''
      if (!url) return null
      const tag: ImageTag = isValidImageTag(raw.tag) ? raw.tag : 'other'
      const order = Number.isFinite(raw.order) ? Math.max(0, Math.floor(raw.order)) : idx
      return {
        id,
        url,
        isPrimary: Boolean(raw.isPrimary),
        tag,
        order,
      } as ProductImage
    })
    .filter((x): x is ProductImage => x !== null)
    .sort((a, b) => a.order - b.order)
    .map((img, idx) => ({ ...img, order: idx }))

  if (cleaned.length === 0) return existing?.images ? [...existing.images] : undefined

  // Enforce exactly one primary — default to first, demote extras
  const primaryCount = cleaned.filter((i) => i.isPrimary).length
  if (primaryCount === 0) {
    cleaned[0].isPrimary = true
    if (cleaned[0].tag !== 'front') cleaned[0].tag = 'front'
  } else if (primaryCount > 1) {
    let kept = false
    for (const img of cleaned) {
      if (img.isPrimary) {
        if (!kept) kept = true
        else img.isPrimary = false
      }
    }
  }

  // Primary must be `front` tag — enforce consistency
  for (const img of cleaned) {
    if (img.isPrimary && img.tag !== 'front') img.tag = 'front'
    // Ensure only the primary holds `front` — others with `front` that are not primary become `other`
    if (!img.isPrimary && img.tag === 'front') {
      // keep tag as front only if it's the primary; otherwise normalize — but we already demoted extras
      // For backward compatibility, allow a secondary to be `front` only if no primary exists (handled above)
    }
  }
  // If primary is front, ensure no other image claims `front`
  const primary = cleaned.find((i) => i.isPrimary)
  if (primary) {
    for (const img of cleaned) {
      if (img.id !== primary.id && img.tag === 'front') img.tag = 'other'
    }
  }

  return cleaned
}

export function validateProductImages(images: ProductImage[] | undefined): string | null {
  if (!images || images.length === 0) return null // legacy path may supply gallery instead
  const primaries = images.filter((i) => i.isPrimary)
  if (primaries.length === 0) return 'Exactly one image must be marked as the primary (Front) view.'
  if (primaries.length > 1) return 'Exactly one image must be marked as the primary (Front) view.'
  // tag validation already normalized; check url presence
  for (const img of images) {
    if (!img.url) return 'Each product image must have a url.'
    if (!isValidImageTag(img.tag)) return `Invalid image tag: ${img.tag}`
  }
  return null
}

function pickStockQuantity(
  value: number | string | null | undefined,
  stored: number | undefined
): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return stored
  const parsed = toNumberOrNull(value)
  if (parsed === null) return stored
  return Math.max(0, Math.floor(parsed))
}

function pickLowStockThreshold(
  value: number | string | null | undefined,
  stored: number | undefined
): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return stored
  const parsed = toNumberOrNull(value)
  if (parsed === null) return stored
  return Math.max(1, Math.floor(parsed))
}

function normaliseStockFields(
  input: ProductInput,
  existing?: StoredProduct
): { stockQuantity?: number; lowStockThreshold?: number; quantity?: number } {
  // stockQuantity is canonical; quantity is legacy alias
  const rawStock = input.stockQuantity ?? input.quantity
  const rawThreshold = input.lowStockThreshold
  const stockQuantity = pickStockQuantity(rawStock, existing?.stockQuantity ?? existing?.quantity)
  const lowStockThreshold = pickLowStockThreshold(rawThreshold, existing?.lowStockThreshold)
  const quantity = stockQuantity // keep legacy quantity in sync
  return { stockQuantity, lowStockThreshold, quantity }
}

export /**
 * The labels for a piece's photos, kept exactly as long as the photo list.
 *
 * A shop may label two of four photos and leave the rest blank; the blanks stay
 * blank rather than sliding the later labels up under the wrong pictures.
 */
function normaliseGalleryLabels(
  input: ProductInput,
  existing?: StoredProduct
): string[] | undefined {
  if (input.gallery === null) return undefined

  const photos = toCleanList(input.gallery) ?? existing?.gallery
  if (!photos?.length) return undefined

  const labels = toCleanList(input.galleryLabels)

  /*
   * No labels sent means "leave them alone" — an edit that only changes a price
   * must not wipe the angles on the photos it never mentioned.
   */
  if (!labels) return existing?.galleryLabels?.slice(0, photos.length)

  return photos.map((_, index) => labels[index] ?? '')
}

function normaliseProduct(input: ProductInput, existing?: StoredProduct): StoredProduct {
  const now = new Date().toISOString()
  const name = toCleanString(input.name) || existing?.name || 'Adonai Thrift Store item'
  const price =
    input.price === undefined || input.price === null
      ? (existing?.price ?? null)
      : toNumberOrNull(input.price)

  /**
   * A POS can describe availability in its own vocabulary. "available", "sold",
   * "reserved" and a quantity of zero all mean the same thing to a customer
   * browsing the website, so they are folded into one flag here rather than
   * being left for each caller to interpret.
   */
  const status = toCleanString(input.status) ?? existing?.status

  // ---- Stock Count Data Entry (optimized binding) ----
  const stockFields = normaliseStockFields(input, existing)

  // ---- Multi-angle gallery handling ----
  let structuredImages: ProductImage[] | undefined
  let derivedGallery: string[] | undefined
  let derivedLabels: string[] | undefined
  let derivedImage: string | undefined

  // If structured images are supplied, they are canonical
  if (input.images !== undefined) {
    if (input.images === null) {
      structuredImages = undefined
      derivedGallery = undefined
      derivedImage = undefined
      derivedLabels = undefined
    } else {
      structuredImages = normaliseProductImages(input.images, existing)
      if (structuredImages) {
        const sorted = [...structuredImages].sort((a, b) => a.order - b.order)
        derivedGallery = sorted.map((i) => i.url)
        // Map tag to human label for legacy galleryLabels
        const tagToLabel: Record<ImageTag, string> = {
          front: 'Front view',
          back: 'Back view',
          texture: 'Texture close-up',
          label: 'Label or tag',
          other: 'Other',
        }
        derivedLabels = sorted.map((i) => tagToLabel[i.tag] ?? 'Other')
        derivedImage = sorted.find((i) => i.isPrimary)?.url ?? sorted[0]?.url
      }
    }
  }

  // Fallback to legacy gallery when no structured images were supplied
  const gallery =
    derivedGallery ??
    (input.gallery === null ? undefined : (toCleanList(input.gallery) ?? existing?.gallery))
  const galleryLabels = derivedLabels ?? normaliseGalleryLabels(input, existing)
  const image =
    derivedImage ??
    (input.image === null ? undefined : (toCleanString(input.image) ?? existing?.image))

  // If inventory was derived from images (legacy path without structured images) we keep existing images
  if (!structuredImages && existing?.images) {
    structuredImages = existing.images
  }

  // When legacy gallery was used without structured images, synthesize structured images for consistency
  if (!structuredImages && gallery && gallery.length > 0) {
    structuredImages = gallery.map((url, idx) => ({
      id: `img_${existing?.id ?? 'new'}_${idx}_${Date.now()}`,
      url,
      isPrimary: idx === 0,
      tag: (idx === 0
        ? 'front'
        : galleryLabels?.[idx]?.toLowerCase().includes('back')
          ? 'back'
          : galleryLabels?.[idx]?.toLowerCase().includes('label')
            ? 'label'
            : galleryLabels?.[idx]?.toLowerCase().includes('texture')
              ? 'texture'
              : 'other') as ImageTag,
      order: idx,
    }))
  }

  return {
    id: existing?.id || makeProductId(name, input.id),
    name,
    price,
    category: toCleanString(input.category) ?? existing?.category,
    condition: toCleanString(input.condition) ?? existing?.condition,
    size: toCleanString(input.size) ?? existing?.size,
    sizes: toCleanList(input.sizes) ?? existing?.sizes,
    colours: toCleanList(input.colours) ?? existing?.colours,
    description: toCleanString(input.description) ?? existing?.description,
    image: image ?? existing?.image,
    gallery: gallery ?? existing?.gallery,
    galleryLabels: galleryLabels ?? existing?.galleryLabels,
    images: structuredImages,
    measurementNote: toCleanString(input.measurementNote) ?? existing?.measurementNote,
    available: resolveAvailability(input, existing, status),
    newArrival: resolveFlag(input.newArrival ?? input.featured, existing?.newArrival),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    sku: toCleanString(input.sku) ?? existing?.sku,
    brand: toCleanString(input.brand) ?? existing?.brand,
    cost: pickNumber(input.cost ?? input.costPrice, existing?.cost),
    costPrice: pickNumber(input.costPrice ?? input.cost, existing?.costPrice ?? existing?.cost),
    originalPrice: pickNumber(input.originalPrice, existing?.originalPrice),
    bin: toCleanString(input.bin) ?? existing?.bin,
    details: toCleanString(input.details) ?? existing?.details,
    status,
    quantity: stockFields.quantity,
    stockQuantity: stockFields.stockQuantity,
    lowStockThreshold: stockFields.lowStockThreshold,
    featured: resolveFlag(input.featured ?? input.newArrival, existing?.featured),
    extras: input.extras ?? existing?.extras,
  }
}

/** An untouched number keeps its stored value; a sent one replaces it. */
function pickNumber(value: number | string | null | undefined, stored: number | null | undefined) {
  if (value === undefined || value === null) return stored ?? null
  return toNumberOrNull(value)
}

function pickQuantity(value: number | string | null | undefined, stored: number | undefined) {
  if (value === undefined || value === null) return stored
  const parsed = toNumberOrNull(value)
  return parsed === null ? stored : Math.max(0, Math.floor(parsed))
}

/** An explicit true/false from the POS wins; otherwise the stored value stands. */
function resolveFlag(value: unknown, stored: boolean | undefined): boolean {
  return typeof value === 'boolean' ? value : (stored ?? false)
}

/**
 * Whether a customer can buy the piece right now. A POS can say this in its own
 * vocabulary, so an explicit flag wins first, then a status word, then a
 * quantity of zero — and only then the previously stored answer.
 */
function resolveAvailability(
  input: ProductInput,
  existing: StoredProduct | undefined,
  status: string | undefined
): boolean {
  if (typeof input.available === 'boolean') return input.available

  const rawQty = input.stockQuantity ?? input.quantity
  if (rawQty !== undefined && rawQty !== null) {
    const quantity = toNumberOrNull(rawQty)
    if (quantity !== null && quantity <= 0) return false
  }
  // If existing stock is zero and no new quantity is supplied, keep sold state
  const existingQty = existing?.stockQuantity ?? existing?.quantity
  if (
    existingQty !== undefined &&
    existingQty <= 0 &&
    rawQty === undefined &&
    input.quantity === undefined &&
    input.stockQuantity === undefined
  ) {
    // do not automatically relist; let explicit availability or status decide
  }

  if (typeof status === 'string') {
    const word = status.trim().toLowerCase()
    if (SOLD_WORDS.includes(word)) return false
    if (AVAILABLE_WORDS.includes(word)) return true
  }

  return existing?.available ?? true
}

// @ts-ignore
void pickQuantity
const SOLD_WORDS = ['sold', 'unavailable', 'out of stock', 'out-of-stock', 'reserved', 'hidden']
const AVAILABLE_WORDS = ['available', 'in stock', 'in-stock', 'active', 'live', 'published']

export default class CatalogueStore {
  private readonly dataDir: string
  private catalogue: CatalogueFile | null = null
  private records: RecordsFile | null = null

  constructor(dataDir: string) {
    this.dataDir = dataDir
  }

  /* ------------------------------------------------------------------ paths */

  private get cataloguePath() {
    return join(this.dataDir, 'catalogue.json')
  }

  private get recordsPath() {
    return join(this.dataDir, 'records.json')
  }

  private ensureDirectory() {
    const directory = dirname(this.cataloguePath)
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
  }

  private readJson<T>(path: string, fallback: T): T {
    if (!existsSync(path)) return fallback
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as T
    } catch {
      /**
       * A corrupt file must not take the shop offline. Keep the damaged file
       * for inspection and start from the fallback instead.
       */
      try {
        renameSync(path, `${path}.corrupt-${Date.now()}`)
      } catch {
        // nothing more we can do; carry on with the fallback
      }
      return fallback
    }
  }

  private writeJson(path: string, value: unknown) {
    this.ensureDirectory()
    const temporary = `${path}.tmp-${process.pid}`
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    renameSync(temporary, path)
  }

  /* ------------------------------------------------------------- catalogue */

  private loadCatalogue(): CatalogueFile {
    if (!this.catalogue) {
      const file = this.readJson<CatalogueFile>(this.cataloguePath, {
        version: 1,
        updatedAt: new Date().toISOString(),
        products: [],
      })
      this.catalogue = Array.isArray(file.products)
        ? file
        : { version: 1, updatedAt: '', products: [] }
    }
    return this.catalogue
  }

  private saveCatalogue() {
    const catalogue = this.loadCatalogue()
    catalogue.updatedAt = new Date().toISOString()
    this.writeJson(this.cataloguePath, catalogue)
  }

  allProducts(): StoredProduct[] {
    return [...this.loadCatalogue().products]
  }

  availableProducts(searchQuery?: string): StoredProduct[] {
    const query = (searchQuery || '').trim().toLowerCase()
    return this.loadCatalogue()
      .products.filter((product) => {
        if (!product.available) return false
        if (!query) return true
        const haystack = [
          product.name,
          product.category,
          product.condition,
          product.size,
          ...(product.sizes || []),
          ...(product.colours || []),
          product.description,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(query)
      })
      .map((product) => ({ ...product }))
  }

  findProduct(id: string): StoredProduct | null {
    const needle = (id || '').trim()
    if (!needle) return null
    const found = this.loadCatalogue().products.find(
      (product) => product.id === needle || product.id.toLowerCase() === needle.toLowerCase()
    )
    return found ? { ...found } : null
  }

  addProduct(input: ProductInput): StoredProduct {
    const catalogue = this.loadCatalogue()
    const product = normaliseProduct(input)

    /**
     * The same id twice would silently hide the older listing, so make it unique.
     */
    if (catalogue.products.some((existing) => existing.id === product.id)) {
      product.id = makeProductId(product.name)
    }

    catalogue.products.unshift(product)
    this.saveCatalogue()
    return product
  }

  updateProduct(id: string, input: ProductInput): StoredProduct | null {
    const catalogue = this.loadCatalogue()
    const index = catalogue.products.findIndex((product) => product.id === id)
    if (index === -1) return null

    const updated = normaliseProduct(input, catalogue.products[index])
    catalogue.products[index] = updated
    this.saveCatalogue()
    return updated
  }

  removeProduct(id: string): boolean {
    const catalogue = this.loadCatalogue()
    const index = catalogue.products.findIndex((product) => product.id === id)
    if (index === -1) return false

    catalogue.products.splice(index, 1)
    this.saveCatalogue()
    return true
  }

  /**
   * Replace the whole catalogue, used when restoring a backup.
   */
  replaceProducts(products: ProductInput[]): number {
    const catalogue = this.loadCatalogue()
    catalogue.products = products.map((input) => normaliseProduct(input))
    this.saveCatalogue()
    return catalogue.products.length
  }

  /**
   * Seed an empty catalogue from a published snapshot. Used on a cold start
   * when the hosting platform gave the service a fresh, empty disk.
   */
  async seedFromSnapshot(url: string): Promise<number> {
    if (!url) return 0
    if (this.loadCatalogue().products.length > 0) return 0

    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } })
      if (!response.ok) return 0

      const payload = (await response.json()) as CatalogueFile | ProductInput[]
      const products = Array.isArray(payload) ? payload : payload?.products
      if (!Array.isArray(products) || products.length === 0) return 0

      const catalogue = this.loadCatalogue()
      catalogue.products = products.map((input) => normaliseProduct(input))
      this.saveCatalogue()
      return catalogue.products.length
    } catch {
      /** Offline or the snapshot does not exist yet: start empty. */
      return 0
    }
  }

  /* --------------------------------------------------------------- records */

  private loadRecords(): RecordsFile {
    if (!this.records) {
      this.records = this.readJson<RecordsFile>(this.recordsPath, {
        version: 1,
        orders: [],
        messages: [],
      })
    }
    return this.records
  }

  private saveRecords() {
    const records = this.loadRecords()
    records.revision = (records.revision ?? 0) + 1
    this.writeJson(this.recordsPath, records)
  }

  /** The number the till quotes back to ask "anything new since?" */
  ordersRevision(): number {
    return this.loadRecords().revision ?? 0
  }

  /**
   * Record an order. The customer's name, phone and address are lifted to the
   * top so an order can be found again by the person who placed it, while the
   * rest of the request (the items, the total) is kept beside them.
   */
  addOrder(payload: Record<string, unknown>): StoredOrder {
    const records = this.loadRecords()
    const nested = (payload.customer || {}) as Record<string, unknown>

    const order: StoredOrder = {
      id: `ORD-${String(records.orders.length + 9001)}`,
      createdAt: new Date().toISOString(),
      customer: {
        name: toCleanString(nested.name) ?? toCleanString(payload.name),
        phone: toCleanString(nested.phone) ?? toCleanString(payload.phone),
        email: toCleanString(nested.email) ?? toCleanString(payload.email),
        address: toCleanString(nested.address) ?? toCleanString(payload.address),
        city: toCleanString(nested.city) ?? toCleanString(payload.city),
      },
      details: {
        items: payload.items ?? null,
        total: payload.total ?? null,
        paymentMethod: payload.paymentMethod ?? null,
        note: payload.note ?? null,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
      },
      status: 'received',
    }
    records.orders.unshift(order)
    this.saveRecords()

    /**
     * Registering the customer here rather than in each caller means the website
     * and the phone app build the same customer list, without either having to
     * remember to do it.
     */
    this.upsertCustomer(order.customer)

    return order
  }

  findOrder(id: string): StoredOrder | null {
    const needle = (id || '').trim()
    if (!needle) return null
    const found = this.loadRecords().orders.find(
      (order) => order.id.toLowerCase() === needle.toLowerCase()
    )
    return found ? { ...found } : null
  }

  allOrders(): StoredOrder[] {
    return this.loadRecords().orders.map((order) => ({ ...order }))
  }

  /**
   * Every order, with the rider it was promised to written into it.
   *
   * Assigning a driver only ever stored the driver's id, so a screen showing the
   * order had to look the name up itself — and a screen that did not showed a
   * bare DRV-1, or nothing at all. The name and the number are what a cashier
   * ringing the dispatch actually needs.
   */
  allOrdersWithDriver(): StoredOrder[] {
    const drivers = this.listDrivers()
    return this.allOrders().map((order) => ({
      ...order,
      driver: drivers.find((driver) => driver.id === order.driverId) ?? null,
    }))
  }

  addMessage(payload: Record<string, unknown>): StoredMessage {
    const records = this.loadRecords()
    const message: StoredMessage = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      name: toCleanString(payload.name),
      phone: toCleanString(payload.phone),
      email: toCleanString(payload.email),
      message: toCleanString(payload.message),
    }
    records.messages.unshift(message)
    this.saveRecords()
    return message
  }

  counts() {
    const products = this.loadCatalogue().products
    const records = this.loadRecords()
    return {
      products: products.length,
      available: products.filter((product) => product.available).length,
      orders: records.orders.length,
      messages: records.messages.length,
      customers: (records.customers ?? []).length,
      drivers: (records.drivers ?? []).length,
    }
  }

  /* ------------------------------------------------------------- collections */

  private collection<T>(name: 'customers' | 'events' | 'drivers' | 'media'): T[] {
    const records = this.loadRecords()
    if (!Array.isArray(records[name])) records[name] = [] as never
    return records[name] as unknown as T[]
  }

  /* --------------------------------------------------------------- customers */

  /**
   * A customer is matched on phone or email so repeated checkouts update one
   * record rather than filling the list with duplicates.
   */
  upsertCustomer(payload: Record<string, unknown>): StoredCustomer {
    const customers = this.collection<StoredCustomer>('customers')
    const phone = toCleanString(payload.phone)
    const email = toCleanString(payload.email)?.toLowerCase()

    const existing = customers.find(
      (customer) =>
        (phone && customer.phone === phone) || (email && customer.email?.toLowerCase() === email)
    )

    if (existing) {
      existing.name = toCleanString(payload.name) ?? existing.name
      existing.phone = phone ?? existing.phone
      existing.email = email ?? existing.email
      existing.address = toCleanString(payload.address) ?? existing.address
      existing.updatedAt = new Date().toISOString()
      this.saveRecords()
      return { ...existing }
    }

    const now = new Date().toISOString()
    const customer: StoredCustomer = {
      id: `CUS-${customers.length + 1}`,
      name: toCleanString(payload.name),
      phone,
      email,
      address: toCleanString(payload.address),
      createdAt: now,
      updatedAt: now,
      totalOrders: 0,
    }
    customers.unshift(customer)
    this.saveRecords()
    return { ...customer }
  }

  listCustomers(): StoredCustomer[] {
    return this.collection<StoredCustomer>('customers').map((customer) => ({ ...customer }))
  }

  /* ------------------------------------------------------------------ events */

  addEvent(name: string, details: Record<string, unknown> = {}): StoredEvent {
    const events = this.collection<StoredEvent>('events')
    const event: StoredEvent = {
      id: randomUUID(),
      name: name || 'event',
      createdAt: new Date().toISOString(),
      details,
    }
    events.unshift(event)
    /**
     * The log is for spotting trends, not for keeping forever; a file that grows
     * without limit would eventually slow the whole shop down.
     */
    if (events.length > 500) events.length = 500
    this.saveRecords()
    return event
  }

  listEvents(limit = 100): StoredEvent[] {
    return this.collection<StoredEvent>('events')
      .slice(0, Math.max(1, limit))
      .map((event) => ({ ...event }))
  }

  /* ----------------------------------------------------------------- drivers */

  listDrivers(): StoredDriver[] {
    return this.collection<StoredDriver>('drivers').map((driver) => ({ ...driver }))
  }

  upsertDriver(payload: Record<string, unknown>): StoredDriver {
    const drivers = this.collection<StoredDriver>('drivers')
    const id = toCleanString(payload.id)
    const name = toCleanString(payload.name) || 'Driver'
    const existing = id ? drivers.find((driver) => driver.id === id) : undefined

    if (existing) {
      existing.name = name
      existing.phone = toCleanString(payload.phone) ?? existing.phone
      existing.vehicle = toCleanString(payload.vehicle) ?? existing.vehicle
      if (typeof payload.active === 'boolean') existing.active = payload.active
      existing.updatedAt = new Date().toISOString()
      this.saveRecords()
      return { ...existing }
    }

    const now = new Date().toISOString()
    const driver: StoredDriver = {
      id: id || `DRV-${drivers.length + 1}`,
      name,
      phone: toCleanString(payload.phone),
      vehicle: toCleanString(payload.vehicle),
      active: payload.active === undefined ? true : Boolean(payload.active),
      createdAt: now,
      updatedAt: now,
    }
    drivers.unshift(driver)
    this.saveRecords()
    return { ...driver }
  }

  /**
   * Save a driver's last known position. Coordinates outside the possible range
   * are refused rather than written, because a bad fix would put a delivery on
   * the map in the wrong place.
   */
  saveDriverLocation(driverId: string, latitude: unknown, longitude: unknown): StoredDriver | null {
    const lat = toCoordinate(latitude)
    const lng = toCoordinate(longitude)
    if (lat === null || lng === null) return null
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null

    const drivers = this.collection<StoredDriver>('drivers')
    const driver = drivers.find((entry) => entry.id === driverId)
    if (!driver) return null

    driver.latitude = lat
    driver.longitude = lng
    driver.locatedAt = new Date().toISOString()
    driver.updatedAt = driver.locatedAt
    this.saveRecords()
    return { ...driver }
  }

  assignDriverToOrder(orderId: string, driverId: string): StoredOrder | null {
    const records = this.loadRecords()
    const order = records.orders.find((entry) => entry.id === orderId)
    if (!order) return null

    order.driverId = driverId
    order.status = 'dispatched'
    order.assignedAt = new Date().toISOString()
    order.updatedAt = order.assignedAt
    this.saveRecords()

    /*
     * The reply carries the rider, not just their id: this is the answer the till
     * paints the row from, and "dispatched" with no name beside it tells a cashier
     * nothing about who is coming.
     */
    const driver = this.collection<StoredDriver>('drivers').find((entry) => entry.id === driverId)
    return { ...order, driver: driver ? { ...driver } : null }
  }

  /** Everything the delivery dashboard needs in one answer. */
  activeDeliveries() {
    const records = this.loadRecords()
    const orders = records.orders.filter(
      (order) => order.status === 'received' || order.status === 'dispatched'
    )
    return {
      orders: orders.map((order) => ({ ...order })),
      drivers: this.listDrivers(),
    }
  }

  /** The dispatch queue with each order's rider written in — see allOrdersWithDriver. */
  activeDeliveriesWithDriver() {
    const { orders, drivers } = this.activeDeliveries()
    return {
      orders: orders.map((order) => ({
        ...order,
        driver: drivers.find((driver) => driver.id === order.driverId) ?? null,
      })),
      drivers,
    }
  }

  /* ------------------------------------------------------------------- media */

  listMedia(): StoredMedia[] {
    return this.collection<StoredMedia>('media').map((entry) => ({ ...entry }))
  }

  addMedia(entry: StoredMedia): StoredMedia {
    const media = this.collection<StoredMedia>('media')
    media.unshift(entry)
    this.saveRecords()
    return entry
  }

  findMedia(key: string): StoredMedia | null {
    const safe = (key || '').split('/').pop() || ''
    const found = this.collection<StoredMedia>('media').find((entry) => entry.key === safe)
    return found ? { ...found } : null
  }

  removeMedia(key: string): boolean {
    const media = this.collection<StoredMedia>('media')
    const index = media.findIndex((entry) => entry.key === key)
    if (index === -1) return false
    media.splice(index, 1)
    this.saveRecords()
    return true
  }

  /* ------------------------------------------------------------------- reset */

  /**
   * Clear the trading records while keeping the catalogue, unless the caller asks
   * for everything to go. Used by the POS "fresh workspace" control.
   */
  resetWorkspace(options: { includeCatalogue?: boolean } = {}) {
    const records = this.loadRecords()
    records.orders = []
    records.messages = []
    records.customers = []
    records.events = []
    records.media = []
    if (options.includeCatalogue) this.loadCatalogue().products = []
    this.saveRecords()
    if (options.includeCatalogue) this.saveCatalogue()
  }
}
