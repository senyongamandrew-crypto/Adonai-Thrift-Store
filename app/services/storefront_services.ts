import env from '#start/env'

export type EdgeGalleryImage = {
  index: number
  src: string
  webp?: string
  avif?: string
  alt: string
}

export type EdgeProduct = {
  id: string
  name: string
  category: string
  condition?: string
  size?: string
  image: string
  imageWebp?: string
  imageAvif?: string
  description?: string
  priceFormatted: string
  originalPriceFormatted?: string
  newArrival?: boolean
  gallery?: EdgeGalleryImage[]
  sizes?: string[]
  colours?: Array<{ name: string; hex?: string }>
}

type CatalogProduct = Record<string, unknown>

type FlaskResponse = {
  products?: CatalogProduct[]
  product?: CatalogProduct
  order?: { id?: string | number }
  id?: string | number
  [key: string]: unknown
}

type AdonisResponseHeaders = {
  header: (key: string, value: string | string[]) => unknown
}

/**
 * Raised when the private POS/store API cannot be reached at all (connection
 * refused, DNS failure or timeout). It is distinct from a 404 so the
 * storefront can answer 503 instead of telling search engines that a product
 * has been removed.
 */
export class StorefrontUnavailableError extends Error {
  static status = 503

  readonly code = 'E_STOREFRONT_UNAVAILABLE'

  constructor(cause?: unknown) {
    super('The store catalog service is not reachable right now.')
    this.cause = cause
  }
}

export type StorefrontServices = {
  forwardSessionCookies: (response: AdonisResponseHeaders) => void
  catalogService: {
    availableProducts: (options: { searchQuery: string }) => Promise<CatalogProduct[]>
    findAvailableProduct: (id: string) => Promise<CatalogProduct | null>
    toEdgeProduct: (product: CatalogProduct) => EdgeProduct
  }
  accountService: {
    signIn: (identifier: string, password: string, remember: boolean) => Promise<FlaskResponse>
    register: (payload: Record<string, unknown>) => Promise<FlaskResponse>
  }
  contactService: { send: (payload: Record<string, unknown>) => Promise<FlaskResponse> }
  orderService: {
    createFromCheckout: (payload: Record<string, unknown>) => Promise<{ id: string }>
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string'
    ? value
    : value === null || value === undefined
      ? fallback
      : String(value)
}

function asOptionalString(value: unknown): string | undefined {
  const result = asString(value).trim()
  return result || undefined
}

function asNumber(value: unknown, fallback = 0): number {
  const result = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(result) ? result : fallback
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return undefined
}

function formatUgx(value: unknown): string {
  const amount = asNumber(value)
  return `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount)}`
}

function normalizeColours(value: unknown): Array<{ name: string; hex?: string }> | undefined {
  if (!Array.isArray(value)) return undefined
  const colours = value
    .map((colour) => {
      if (typeof colour === 'string') return { name: colour }
      const item = colour && typeof colour === 'object' ? (colour as Record<string, unknown>) : {}
      return { name: asString(item.name || item.label), hex: asOptionalString(item.hex) }
    })
    .filter((colour) => colour.name)
  return colours.length ? colours : undefined
}

function normalizeGallery(
  value: unknown,
  fallbackImage: string,
  productName: string
): EdgeGalleryImage[] {
  if (!Array.isArray(value)) {
    return fallbackImage
      ? [{ index: 0, src: fallbackImage, alt: `${productName} at Adonai Thrift Store` }]
      : []
  }

  return value
    .map((image, index) => {
      const item = typeof image === 'string' ? { src: image } : (image as Record<string, unknown>)
      const src = asString(item.src || item.image || item.url || fallbackImage)
      return {
        index,
        src,
        webp: asOptionalString(item.webp || item.imageWebp),
        avif: asOptionalString(item.avif || item.imageAvif),
        alt: asString(item.alt, `${productName} detail view at Adonai Thrift Store`),
      }
    })
    .filter((image) => image.src)
}

export function toEdgeProduct(product: CatalogProduct): EdgeProduct {
  const name = asString(product.name || product.title, 'Adonai Thrift Store item')
  const image = asString(product.image || product.imageUrl || product.thumbnail)
  const price = product.priceFormatted || product.formattedPrice || formatUgx(product.price)
  const originalPrice =
    product.originalPriceFormatted ||
    product.compareAtPriceFormatted ||
    (product.originalPrice || product.compareAtPrice
      ? formatUgx(product.originalPrice || product.compareAtPrice)
      : undefined)

  const colours = normalizeColours(product.colours || product.colors)

  return {
    id: asString(product.id || product.sku),
    name,
    category: asString(product.category, 'Vintage clothing'),
    condition: asOptionalString(product.condition),
    size: asOptionalString(product.size),
    image,
    imageWebp: asOptionalString(product.imageWebp || product.webp),
    imageAvif: asOptionalString(product.imageAvif || product.avif),
    description: asOptionalString(product.description),
    priceFormatted: asString(price, 'Price on request'),
    originalPriceFormatted: asOptionalString(originalPrice),
    newArrival: asBoolean(product.newArrival || product.isNew),
    gallery: normalizeGallery(product.gallery || product.images, image, name),
    sizes: Array.isArray(product.sizes)
      ? product.sizes.map((size) => asString(size)).filter(Boolean)
      : undefined,
    colours,
  }
}

class FlaskStorefrontGateway {
  private readonly baseUrl: string
  private readonly internalToken?: string
  private readonly incomingCookie?: string
  private readonly setCookies: string[] = []

  constructor(incomingCookie?: string) {
    this.baseUrl = (env.get('FLASK_API_BASE_URL') || '').replace(/\/$/, '')
    this.internalToken = env.get('FLASK_INTERNAL_API_TOKEN')
    this.incomingCookie = incomingCookie
  }

  forwardSessionCookies(response: AdonisResponseHeaders) {
    if (this.setCookies.length) response.header('Set-Cookie', [...this.setCookies])
    this.setCookies.length = 0
  }

  async json<T extends FlaskResponse | CatalogProduct[] = FlaskResponse>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    /**
     * The store API is optional. Without it the storefront stays up and simply
     * reports the catalog as unavailable, so callers can handle this the same
     * way they handle an outage.
     */
    if (!this.baseUrl) {
      throw new StorefrontUnavailableError(new Error('FLASK_API_BASE_URL is not configured'))
    }

    const headers = new Headers(options.headers)
    headers.set('Accept', 'application/json')
    if (options.body && !headers.has('Content-Type'))
      headers.set('Content-Type', 'application/json')
    if (this.internalToken) headers.set('Authorization', `Bearer ${this.internalToken}`)
    if (this.incomingCookie) headers.set('Cookie', this.incomingCookie)

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        signal: AbortSignal.timeout(10_000),
      })
    } catch (error) {
      /**
       * A transport failure means the store API is down or unreachable. HTTP
       * error statuses (like 404) keep flowing through the normal error path.
       */
      throw new StorefrontUnavailableError(error)
    }

    const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] })
      .getSetCookie
    if (typeof getSetCookie === 'function') {
      this.setCookies.push(...getSetCookie.call(response.headers))
    } else {
      const setCookie = response.headers.get('set-cookie')
      if (setCookie) this.setCookies.push(setCookie)
    }

    const body = await response.text()
    let parsed: unknown = {}
    try {
      parsed = body ? JSON.parse(body) : {}
    } catch {
      parsed = { message: body.slice(0, 300) }
    }

    if (!response.ok) {
      const message =
        typeof parsed === 'object' && parsed && 'message' in parsed
          ? String(parsed.message)
          : `Flask storefront returned ${response.status}`
      throw new Error(message)
    }

    return parsed as T
  }
}

export function createStorefrontServices(incomingCookie?: string): StorefrontServices {
  const gateway = new FlaskStorefrontGateway(incomingCookie)

  return {
    forwardSessionCookies: (response) => gateway.forwardSessionCookies(response),
    catalogService: {
      async availableProducts({ searchQuery }) {
        const query = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''
        const data = await gateway.json<FlaskResponse | CatalogProduct[]>(`/api/products${query}`)
        return Array.isArray(data) ? data : Array.isArray(data.products) ? data.products : []
      },
      async findAvailableProduct(id) {
        try {
          const data = await gateway.json<FlaskResponse | CatalogProduct>(
            `/api/products/${encodeURIComponent(id)}`
          )
          if (Array.isArray(data)) return null
          const payload = data as FlaskResponse
          if (payload.product) return payload.product
          return data as CatalogProduct
        } catch (error) {
          /**
           * Let an unreachable store API bubble up (the controller answers
           * 503). Any other failure means the item is not in the catalog.
           */
          if (error instanceof StorefrontUnavailableError) throw error
          return null
        }
      },
      toEdgeProduct,
    },
    accountService: {
      signIn: (identifier, password, remember) =>
        gateway.json('/api/account/sign-in', {
          method: 'POST',
          body: JSON.stringify({ identifier, password, remember }),
        }),
      register: (payload) =>
        gateway.json('/api/account/sign-up', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
    },
    contactService: {
      send: (payload) =>
        gateway.json('/api/contact', { method: 'POST', body: JSON.stringify(payload) }),
    },
    orderService: {
      async createFromCheckout(payload) {
        const data = await gateway.json('/api/orders', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        const id = data.order?.id || data.id
        if (id === undefined || id === null)
          throw new Error('The order service did not return an order id')
        return { id: String(id) }
      },
    },
  }
}
