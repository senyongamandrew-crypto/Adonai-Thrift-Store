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

  /**
   * Fields the POS application fills in that the website does not show. They are
   * stored so nothing the shop typed is lost when an item travels through this
   * service: the phone sends them, the phone reads them back.
   */
  sku?: string
  brand?: string
  cost?: number | null
  originalPrice?: number | null
  bin?: string
  details?: string
  status?: string
  quantity?: number
  featured?: boolean

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
  measurementNote?: string
  available?: boolean
  newArrival?: boolean
  sku?: string
  brand?: string
  cost?: number | string | null
  originalPrice?: number | string | null
  bin?: string
  details?: string
  status?: string
  quantity?: number | string | null
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

export function normaliseProduct(input: ProductInput, existing?: StoredProduct): StoredProduct {
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
    /**
     * A null is a deliberate instruction to drop the photo, which is how a
     * restart clears references to images that did not survive it. Sending
     * nothing at all leaves whatever is stored untouched.
     */
    image: input.image === null ? undefined : (toCleanString(input.image) ?? existing?.image),
    gallery: input.gallery === null ? undefined : (toCleanList(input.gallery) ?? existing?.gallery),
    measurementNote: toCleanString(input.measurementNote) ?? existing?.measurementNote,
    available: resolveAvailability(input, existing, status),
    /**
     * "Featured" and "new arrival" are the same idea to the storefront, and a POS
     * may only send one of them.
     */
    newArrival: resolveFlag(input.newArrival ?? input.featured, existing?.newArrival),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    sku: toCleanString(input.sku) ?? existing?.sku,
    brand: toCleanString(input.brand) ?? existing?.brand,
    cost: pickNumber(input.cost, existing?.cost),
    originalPrice: pickNumber(input.originalPrice, existing?.originalPrice),
    bin: toCleanString(input.bin) ?? existing?.bin,
    details: toCleanString(input.details) ?? existing?.details,
    status,
    quantity: pickQuantity(input.quantity, existing?.quantity),
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

  if (input.quantity !== undefined && input.quantity !== null) {
    const quantity = toNumberOrNull(input.quantity)
    if (quantity !== null && quantity <= 0) return false
  }

  if (typeof status === 'string') {
    const word = status.trim().toLowerCase()
    if (SOLD_WORDS.includes(word)) return false
    if (AVAILABLE_WORDS.includes(word)) return true
  }

  return existing?.available ?? true
}

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
    this.writeJson(this.recordsPath, this.loadRecords())
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
    return { ...order }
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
