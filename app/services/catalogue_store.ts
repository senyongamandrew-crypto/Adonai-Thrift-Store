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
  measurementNote?: string
  available: boolean
  newArrival: boolean
  createdAt: string
  updatedAt: string
}

export type StoredOrder = {
  id: string
  createdAt: string
  customer: Record<string, unknown>
  status: 'received'
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
  image?: string
  gallery?: string[]
  measurementNote?: string
  available?: boolean
  newArrival?: boolean
}

type CatalogueFile = {
  version: 1
  updatedAt: string
  products: StoredProduct[]
}

type RecordsFile = {
  version: 1
  orders: StoredOrder[]
  messages: StoredMessage[]
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

export function normaliseProduct(input: ProductInput, existing?: StoredProduct): StoredProduct {
  const now = new Date().toISOString()
  const name = toCleanString(input.name) || existing?.name || 'Adonai Thrift Store item'
  const price =
    input.price === undefined || input.price === null
      ? (existing?.price ?? null)
      : toNumberOrNull(input.price)

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
    image: toCleanString(input.image) ?? existing?.image,
    gallery: toCleanList(input.gallery) ?? existing?.gallery,
    measurementNote: toCleanString(input.measurementNote) ?? existing?.measurementNote,
    available:
      input.available === undefined ? (existing?.available ?? true) : Boolean(input.available),
    newArrival:
      input.newArrival === undefined ? (existing?.newArrival ?? false) : Boolean(input.newArrival),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
}

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
    this.writeJson(this.recordsPath, this.loadRecords())
  }

  addOrder(payload: Record<string, unknown>): StoredOrder {
    const records = this.loadRecords()
    const order: StoredOrder = {
      id: `ORD-${String(records.orders.length + 9001)}`,
      createdAt: new Date().toISOString(),
      customer: payload,
      status: 'received',
    }
    records.orders.unshift(order)
    this.saveRecords()
    return order
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
    return {
      products: products.length,
      available: products.filter((product) => product.available).length,
      orders: this.loadRecords().orders.length,
      messages: this.loadRecords().messages.length,
    }
  }
}
