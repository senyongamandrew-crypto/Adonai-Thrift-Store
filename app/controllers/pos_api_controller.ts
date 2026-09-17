/*
|--------------------------------------------------------------------------
| POS API
|--------------------------------------------------------------------------
|
| The catalogue endpoints the storefront, the mobile intake app and any future
| integration can share. They live on the same host as the storefront, so the
| shop needs one service, one address and one backup, rather than two systems
| that silently disagree with each other.
|
| Reads are public: the prices and photos are already on the website.
| Writes need the shop PIN, sent either as "x-adonai-pin: <pin>" or as a
| bearer token, so only the shop's own devices can change the catalogue.
|
*/

import type { HttpContext } from '@adonisjs/core/http'
import type { ProductInput } from '#services/catalogue_store'
import { pinMatchesConfigured, readSuppliedPin } from '#services/shop_pin'
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
   * Liveness probe for the POS API itself. A device can call this first to
   * confirm it is pointed at the right address before sending any data.
   */
  async health({ response }: HttpContext) {
    const counts = this.store().counts()
    return response.status(200).send({
      ok: true,
      status: 'ok',
      catalog: 'ok',
      counts,
    })
  }

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
    const order = this.store().addOrder(payload)
    return response.status(201).send({ ok: true, order: { id: order.id }, id: order.id })
  }

  async contact({ request, response }: HttpContext) {
    const payload = (request.body() || {}) as Record<string, unknown>
    this.store().addMessage(payload)
    return response.status(201).send({ ok: true })
  }
}
