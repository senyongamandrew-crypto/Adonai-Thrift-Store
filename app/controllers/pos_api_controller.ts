/*
|--------------------------------------------------------------------------
| POS API
|--------------------------------------------------------------------------
|
| The catalogue endpoints the storefront, the mobile intake app, the shop's
| Android till (Adonai Thrift Store POS) and any future integration share. They
| live on the same host as the storefront, so the shop needs one service, one
| address and one backup, rather than two systems that silently disagree.
|
| Reads are public: the prices and photos are already on the website.
| Writes need the shop PIN, sent as "x-adonai-pin: <pin>", as a bearer token, or
| as the session token the POS is given after it presents the PIN once.
|
| Two vocabularies meet here. The website talks about "products" being
| "available"; the POS talks about "catalog items" with a "status". The
| translation lives in app/services/pos_sync.ts so this file can stay readable.
|
*/

import type { HttpContext } from '@adonisjs/core/http'
import type { ProductInput } from '#services/catalogue_store'
import { pinMatchesConfigured, readSuppliedPin } from '#services/shop_pin'
import { issueToken, pinIsValid, sessionSignedIn, tokenIsValid } from '#services/shop_session'
import { fromPosProduct, posHealth, toPosProduct } from '#services/pos_sync'
import { getBuiltInCatalogue } from '#services/storefront_services'

function publicProduct(product: Record<string, unknown>) {
  return {
    ...product,
    // Both spellings are provided so older clients keep working.
    available: product.available !== false,
  }
}

export default class PosApiController {
  private store() {
    return getBuiltInCatalogue()
  }

  private unauthorised(response: HttpContext['response']) {
    return response.status(401).send({
      ok: false,
      error: 'A valid shop PIN is required to change the catalogue.',
    })
  }

  /**
   * A write is allowed when the caller proves it knows the shop PIN, either
   * directly or through the token the POS was issued after typing it in.
   */
  private authorised(ctx: HttpContext): boolean {
    const supplied = readSuppliedPin(ctx.request)
    if (pinMatchesConfigured(supplied)) return true

    const token =
      ctx.request.header('x-adonai-admin-session') || ctx.request.header('x-adonai-session')
    if (tokenIsValid(token)) return true

    /** The storefront's own intake screen holds a signed-in browser session. */
    return sessionSignedIn(ctx)
  }

  /* ------------------------------------------------------------------ health */

  /**
   * Liveness probe for the POS API. A device calls this first to confirm it is
   * pointed at the right address before it sends any stock.
   */
  async health({ response }: HttpContext) {
    const counts = this.store().counts()
    return response.status(200).send({
      ...posHealth(),
      ...counts,
      catalog: 'ok',
      counts,
    })
  }

  /* --------------------------------------------------------------- catalogue */

  /** The website's view: only what a customer can buy, unless asked otherwise. */
  async products({ request, response }: HttpContext) {
    const search = String(request.input('search') || '')
    const includeUnavailable = request.input('includeUnavailable') === 'true'

    const products = includeUnavailable
      ? this.store().allProducts()
      : this.store().availableProducts(search)

    return response.status(200).send({
      ok: true,
      count: products.length,
      products: products.map(publicProduct),
    })
  }

  async product({ params, response }: HttpContext) {
    const product = this.store().findProduct(String(params.id || ''))
    if (!product) {
      return response.status(404).send({ ok: false, error: 'That item is not in the catalogue.' })
    }
    return response.status(200).send({ ok: true, product: publicProduct(product) })
  }

  /**
   * The same catalogue in the website's shape, under the path the shared server
   * guide calls the public catalog: {ok: true, items: [...]}.
   */
  async catalog({ request, response }: HttpContext) {
    const includeUnavailable = request.input('includeUnavailable') === 'true'
    const products = includeUnavailable
      ? this.store().allProducts()
      : this.store().availableProducts()

    return response.status(200).send({
      ok: true,
      count: products.length,
      items: products.map(publicProduct),
      products: products.map(publicProduct),
    })
  }

  /** The POS's view, including the fields the phone itself uses. */
  async posCatalog({ request, response }: HttpContext) {
    const includeUnavailable = request.input('includeUnavailable') !== 'false'
    const products = includeUnavailable
      ? this.store().allProducts()
      : this.store().availableProducts()

    return response.status(200).send({
      ok: true,
      count: products.length,
      items: products.map((product) => toPosProduct(product)),
    })
  }

  /**
   * Create or update one item from the POS. The phone sends either shape
   * depending on where in the app it is called from, so both are accepted.
   *
   * An id that already exists is updated rather than refused: the POS retries a
   * queued write after a network drop, and the second attempt must not create a
   * duplicate listing of a one-of-one piece.
   */
  async savePosCatalog(ctx: HttpContext) {
    const { request, response } = ctx
    if (!this.authorised(ctx)) return this.unauthorised(response)

    const body = (request.body() || {}) as Record<string, unknown>
    const item = (body.item || body.product || body) as Record<string, unknown>
    const input = fromPosProduct(item)

    if (!input.name && !input.id) {
      return response.status(400).send({ ok: false, error: 'An item needs a name.' })
    }

    const existing = input.id ? this.store().findProduct(input.id) : null
    const saved = existing
      ? this.store().updateProduct(existing.id, input)
      : this.store().addProduct(input)

    return response.status(existing ? 200 : 201).send({
      ok: true,
      item: toPosProduct(saved!),
      product: publicProduct(saved as unknown as Record<string, unknown>),
    })
  }

  async deletePosCatalog(ctx: HttpContext) {
    const { request, response } = ctx
    if (!this.authorised(ctx)) return this.unauthorised(response)

    const body = (request.body() || {}) as Record<string, unknown>
    const id = String(body.id || body.productId || body.sku || '').trim()
    if (!id) return response.status(400).send({ ok: false, error: 'Which item should go?' })

    const removed = this.store().removeProduct(id)
    if (!removed) {
      return response.status(404).send({ ok: false, error: 'That item is not in the catalogue.' })
    }
    return response.status(200).send({ ok: true, id })
  }

  /* --------------------------------------------------------- website routes */

  async createProduct({ request, response }: HttpContext) {
    if (!pinMatchesConfigured(readSuppliedPin(request))) return this.unauthorised(response)

    const payload = request.body() as ProductInput
    if (!payload || typeof payload !== 'object') {
      return response.status(400).send({ ok: false, error: 'Send the item as a JSON object.' })
    }
    if (!String(payload.name || '').trim()) {
      return response.status(400).send({ ok: false, error: 'An item needs a name.' })
    }

    const product = this.store().addProduct(payload)
    return response.status(201).send({ ok: true, product })
  }

  async updateProduct({ params, request, response }: HttpContext) {
    if (!pinMatchesConfigured(readSuppliedPin(request))) return this.unauthorised(response)

    const updated = this.store().updateProduct(
      String(params.id || ''),
      request.body() as ProductInput
    )
    if (!updated) {
      return response.status(404).send({ ok: false, error: 'That item is not in the catalogue.' })
    }
    return response.status(200).send({ ok: true, product: updated })
  }

  async deleteProduct({ params, request, response }: HttpContext) {
    if (!pinMatchesConfigured(readSuppliedPin(request))) return this.unauthorised(response)

    const removed = this.store().removeProduct(String(params.id || ''))
    if (!removed) {
      return response.status(404).send({ ok: false, error: 'That item is not in the catalogue.' })
    }
    return response.status(200).send({ ok: true })
  }

  /**
   * Orders taken through the storefront checkout. The shop sees them in the
   * intake screen and can follow up on WhatsApp.
   */
  async createOrder({ request, response }: HttpContext) {
    const payload = (request.body() || {}) as Record<string, unknown>
    /**
     * The customer's own details are lifted out of the body so an order can be
     * found later by the phone number that placed it, whether the caller sent
     * them nested under "customer" or alongside the order.
     */
    const customer = {
      name: payload.name ?? payload.customerName ?? null,
      phone: payload.phone ?? payload.customerPhone ?? null,
      email: payload.email ?? null,
      address: payload.address ?? null,
      ...((payload.customer || {}) as Record<string, unknown>),
    }
    this.store().upsertCustomer(customer)
    this.store().addEvent('order_placed', { total: payload.total ?? null })

    const order = this.store().addOrder({ ...payload, customer })
    return response.status(201).send({ ok: true, order: { id: order.id }, id: order.id })
  }

  /** A customer looking up their own order by reference or phone number. */
  async listOrders({ request, response }: HttpContext) {
    const id = String(request.input('id') || request.input('orderId') || '').trim()
    const phone = String(request.input('phone') || '').trim()
    if (!id && !phone) {
      return response
        .status(400)
        .send({ ok: false, error: 'Give an order number or a phone number.' })
    }

    const orders = this.store()
      .allOrders()
      .filter((order) => {
        if (id && order.id.toLowerCase() === id.toLowerCase()) return true
        if (phone) {
          const details = order.customer as Record<string, unknown>
          return String(details?.phone || '').trim() === phone
        }
        return false
      })

    return response.status(200).send({ ok: true, count: orders.length, orders })
  }

  /* ------------------------------------------------------------------ holds */

  /**
   * A one-of-one piece can only be sold once, so checkout can reserve it while
   * the customer pays. The reservation times out on its own, otherwise an
   * abandoned checkout would hide the item from the website for good.
   */
  async holdCatalogItem({ request, response }: HttpContext) {
    const body = (request.body() || {}) as Record<string, unknown>
    const id = String(body.id || body.productId || '').trim()
    const minutes = Math.min(120, Math.max(1, Number(body.minutes) || 30))

    const product = this.store().findProduct(id)
    if (!product) {
      return response.status(404).send({ ok: false, error: 'That item is not in the catalogue.' })
    }
    if (!product.available) {
      return response.status(409).send({ ok: false, error: 'That item is already taken.' })
    }

    const until = new Date(Date.now() + minutes * 60_000).toISOString()
    this.store().updateProduct(product.id, {
      available: false,
      extras: { ...(product.extras ?? {}), hold: { at: new Date().toISOString(), until } },
    })

    return response.status(200).send({ ok: true, id: product.id, heldUntil: until })
  }

  async releaseCatalogItem({ request, response }: HttpContext) {
    const body = (request.body() || {}) as Record<string, unknown>
    const id = String(body.id || body.productId || '').trim()

    const product = this.store().findProduct(id)
    if (!product) {
      return response.status(404).send({ ok: false, error: 'That item is not in the catalogue.' })
    }

    const extras = { ...(product.extras ?? {}) }
    delete extras.hold
    this.store().updateProduct(product.id, { available: true, extras })

    return response.status(200).send({ ok: true, id: product.id })
  }

  /* -------------------------------------------------------------- customers */

  async upsertCustomer({ request, response }: HttpContext) {
    const payload = (request.body() || {}) as Record<string, unknown>
    const customer = this.store().upsertCustomer(payload)
    this.store().addEvent('customer_saved', { id: customer.id })
    return response.status(201).send({ ok: true, customer })
  }

  /**
   * Website activity. Only the event name and the details the site chooses to
   * send are kept, and no attempt is made to identify a visitor.
   */
  async storefrontEvent({ request, response }: HttpContext) {
    const payload = (request.body() || {}) as Record<string, unknown>
    const name = String(payload.name || payload.event || 'view')
    this.store().addEvent(name, {
      path: payload.path ?? null,
      source: payload.source ?? null,
      total: payload.total ?? null,
    })
    return response.status(201).send({ ok: true })
  }

  async customerTracking(ctx: HttpContext) {
    const { request, response } = ctx
    if (!this.authorised(ctx)) return this.unauthorised(response)

    const limit = Number(request.input('limit')) || 100
    return response.status(200).send({
      ok: true,
      customers: this.store().listCustomers(),
      events: this.store().listEvents(limit),
    })
  }

  /* -------------------------------------------------------------- deliveries */

  async activeDeliveries(ctx: HttpContext) {
    const { response } = ctx
    if (!this.authorised(ctx)) return this.unauthorised(response)
    return response.status(200).send({ ok: true, ...this.store().activeDeliveries() })
  }

  async drivers(ctx: HttpContext) {
    const { request, response } = ctx
    if (!this.authorised(ctx)) return this.unauthorised(response)

    if (request.method() === 'POST') {
      const payload = (request.body() || {}) as Record<string, unknown>
      return response.status(201).send({ ok: true, driver: this.store().upsertDriver(payload) })
    }

    return response.status(200).send({ ok: true, drivers: this.store().listDrivers() })
  }

  async driverLocation(ctx: HttpContext) {
    const { request, response } = ctx
    if (!this.authorised(ctx)) return this.unauthorised(response)

    const payload = (request.body() || {}) as Record<string, unknown>
    const driverId = String(payload.id || payload.driverId || '').trim()
    const latitude = payload.latitude ?? payload.lat
    const longitude = payload.longitude ?? payload.lng ?? payload.lon

    const driver = this.store().saveDriverLocation(driverId, latitude, longitude)
    if (!driver) {
      return response.status(400).send({
        ok: false,
        error: 'Send a known driver and a latitude and longitude within range.',
      })
    }
    return response.status(200).send({ ok: true, driver })
  }

  async assignDriver(ctx: HttpContext) {
    const { request, response } = ctx
    if (!this.authorised(ctx)) return this.unauthorised(response)

    const payload = (request.body() || {}) as Record<string, unknown>
    const orderId = String(payload.orderId || payload.id || '').trim()
    const driverId = String(payload.driverId || payload.driver || '').trim()

    const order = this.store().assignDriverToOrder(orderId, driverId)
    if (!order) {
      return response.status(404).send({ ok: false, error: 'That order is not in the queue.' })
    }
    return response.status(200).send({ ok: true, order })
  }

  /* ------------------------------------------------------------ admin reset */

  async resetWorkspace(ctx: HttpContext) {
    const { request, response } = ctx
    if (!this.authorised(ctx)) return this.unauthorised(response)

    const payload = (request.body() || {}) as Record<string, unknown>
    const includeCatalogue = payload.includeCatalogue === true || payload.catalog === true
    this.store().resetWorkspace({ includeCatalogue })
    return response.status(200).send({ ok: true, catalogueCleared: includeCatalogue })
  }

  /* ------------------------------------------------------------------ media */

  /**
   * Photos for the catalogue. The upload is validated by type and size, and the
   * stored file name is generated here, so a crafted name cannot escape the
   * media directory.
   */
  async uploadMedia(ctx: HttpContext) {
    const { request, response } = ctx
    if (!this.authorised(ctx)) return this.unauthorised(response)

    const media = await import('#services/media_store')
    const upload = request.file('file', {
      size: media.maxUploadBytes(),
      extnames: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    })

    let contentType = 'image/jpeg'
    let bytes: Buffer | null = null

    if (upload) {
      if (!upload.isValid) {
        return response
          .status(400)
          .send({ ok: false, error: upload.errors[0]?.message || 'Unsupported image.' })
      }
      bytes = Buffer.alloc(0)
      const tempPath = upload.tmpPath
      if (!tempPath) {
        return response.status(400).send({ ok: false, error: 'The upload did not arrive.' })
      }
      const { readFileSync } = await import('node:fs')
      bytes = readFileSync(tempPath)
      contentType = upload.type || contentType
    } else {
      const payload = (request.body() || {}) as Record<string, unknown>
      const data = String(payload.data || payload.base64 || '').replace(/^data:[^;]+;base64,/, '')
      if (!data) {
        return response
          .status(400)
          .send({ ok: false, error: 'Send the image as a file or as base64 data.' })
      }
      bytes = Buffer.from(data, 'base64')
      contentType = String(payload.contentType || payload.type || 'image/jpeg')
    }

    if (!bytes || bytes.length === 0) {
      return response.status(400).send({ ok: false, error: 'The image was empty.' })
    }
    const limit = media.maxUploadBytes()
    if (bytes.length > limit) {
      return response.status(413).send({
        ok: false,
        error: `Images need to be under ${Math.round(limit / (1024 * 1024))} MB.`,
      })
    }
    /**
     * The bytes decide the format. The multipart parser hands over the group
     * only ("image", with the "png" part kept separately), so a phone uploading
     * a PNG used to be turned away here as "not an image", and a JPEG that got
     * through was stored under a type no browser will draw. Checking the magic
     * number accepts the same four formats and refuses anything else.
     */
    const resolved = media.resolveImageContentType(bytes, contentType)
    if (!resolved) {
      return response
        .status(400)
        .send({ ok: false, error: 'Only JPEG, PNG, WebP and GIF photos can be uploaded.' })
    }

    const entry = media.saveImage(bytes, resolved)
    return response.status(201).send({ ok: true, media: entry, url: entry.url })
  }

  async listMedia(ctx: HttpContext) {
    const { response } = ctx
    if (!this.authorised(ctx)) return this.unauthorised(response)

    const media = await import('#services/media_store')
    const entries = this.store().listMedia()
    return response.status(200).send({
      ok: true,
      count: entries.length,
      bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
      quotaBytes: media.mediaQuotaBytes(),
      media: entries,
    })
  }

  async deleteMedia(ctx: HttpContext) {
    const { request, response } = ctx
    if (!this.authorised(ctx)) return this.unauthorised(response)

    const payload = (request.body() || {}) as Record<string, unknown>
    const key =
      String(payload.key || payload.id || '')
        .split('/')
        .pop() || ''

    const inUse = this.store()
      .allProducts()
      .some(
        (product) =>
          (product.image || '').includes(key) ||
          (product.gallery ?? []).some((entry) => entry.includes(key))
      )
    if (inUse) {
      return response.status(409).send({
        ok: false,
        error: 'That photo is still used by a catalogue item.',
      })
    }

    const media = await import('#services/media_store')
    media.removeImage(key)
    const removed = this.store().removeMedia(key)
    return response.status(removed ? 200 : 404).send({ ok: removed })
  }

  /* --------------------------------------------------------------- sessions */

  /**
   * The POS asks for a token once, after the owner types the PIN, and then sends
   * that token with every change instead of the PIN itself.
   */
  async adminSession({ request, response }: HttpContext) {
    const payload = (request.body() || {}) as Record<string, unknown>
    const supplied = String(payload.pin ?? payload.password ?? readSuppliedPin(request) ?? '')

    if (!pinIsValid(supplied)) {
      return response.status(401).send({ ok: false, error: 'That PIN was not accepted.' })
    }

    const { token, expiresAt, lifetimeSeconds } = issueToken()
    return response.status(200).send({
      ok: true,
      token,
      session: token,
      expiresAt,
      lifetimeSeconds,
      user: { name: 'Shop owner', role: 'admin' },
    })
  }

  /** Serve a stored product photo. Only files the shop itself uploaded are served. */
  async serveMedia({ params, response }: HttpContext) {
    const media = await import('#services/media_store')
    const image = media.readImage(String(params.key || ''))
    if (!image) return response.status(404).send({ ok: false, error: 'No such image.' })

    /**
     * Sniffed rather than taken from the record, so photos stored before the
     * type was read correctly still appear instead of showing as a broken
     * image. "X-Content-Type-Options: nosniff" is set site-wide, which means a
     * wrong type here is not guessed at by the browser, it simply fails.
     */
    const contentType = media.resolveImageContentType(image.bytes, image.contentType)
    response.header('content-type', contentType || 'application/octet-stream')
    response.header('cache-control', 'public, max-age=86400')
    return response.status(200).send(image.bytes)
  }

  async contact({ request, response }: HttpContext) {
    const payload = (request.body() || {}) as Record<string, unknown>
    this.store().addMessage(payload)
    return response.status(201).send({ ok: true })
  }
}
