/*
|--------------------------------------------------------------------------
| Shop intake screen
|--------------------------------------------------------------------------
|
| The shop owner's own surface: sign in with the shop PIN, add a piece, mark it
| sold, correct a price, and download a backup of the catalogue. It is built for
| a phone browser, because that is what the shop actually uses.
|
| Nothing here is indexed by search engines, and the screen stays closed until
| the correct PIN is entered.
|
*/

import type { HttpContext } from '@adonisjs/core/http'
import type { ProductInput } from '#services/catalogue_store'
import {
  clearPinFailures,
  pinAttemptDelay,
  recordPinFailure,
  pinMatchesConfigured,
  usingDefaultPin,
} from '#services/shop_pin'
import { getBuiltInCatalogue } from '#services/storefront_services'

const PIN_SESSION_KEY = 'adonai_shop_pin_ok'

export default class AdminController {
  private store() {
    return getBuiltInCatalogue()
  }

  private isSignedIn(ctx: HttpContext): boolean {
    return Boolean(ctx.session.get(PIN_SESSION_KEY))
  }

  private markSignedIn(ctx: HttpContext) {
    ctx.session.put(PIN_SESSION_KEY, true)
  }

  private shared(request: HttpContext['request']) {
    return {
      noIndex: true,
      siteUrl: (request.header('x-forwarded-proto') || 'https') + '://' + request.host(),
      usingDefaultPin: usingDefaultPin(),
    }
  }

  private loginView(ctx: HttpContext, message?: string) {
    const { request, response, view } = ctx
    response.status(401)
    return view.render('pages/admin/login', {
      ...this.shared(request),
      pageTitle: 'Shop sign in · Adonai Thrift Store',
      message,
    })
  }

  async show(ctx: HttpContext) {
    const { request, response, view } = ctx
    if (!this.isSignedIn(ctx)) {
      response.status(200)
      return view.render('pages/admin/login', {
        ...this.shared(request),
        pageTitle: 'Shop sign in · Adonai Thrift Store',
      })
    }

    const counts = this.store().counts()
    const editingId = String(request.input('edit') || '')
    const editing = editingId ? this.store().findProduct(editingId) : null

    /**
     * Prices are formatted here rather than in the template, so the shop sees
     * the same UGX wording as the storefront.
     */
    const products = this.store()
      .allProducts()
      .map((product) => ({
        ...product,
        priceLabel:
          product.price === null
            ? 'Price on request'
            : `UGX ${product.price.toLocaleString('en-US')}`,
      }))

    return view.render('pages/admin/products', {
      ...this.shared(request),
      pageTitle: 'Shop intake · Adonai Thrift Store',
      counts,
      products,
      editing,
      added: request.input('added'),
      saved: request.input('saved'),
      removed: request.input('removed'),
      restored: request.input('restored'),
    })
  }

  async signIn(ctx: HttpContext) {
    const { request, response, session } = ctx
    const clientKey = request.ip()
    const delay = pinAttemptDelay(clientKey)
    if (delay > 0) {
      const seconds = Math.ceil(delay / 1000)
      return this.loginView(ctx, `Too many attempts. Try again in ${seconds} seconds.`)
    }

    if (!pinMatchesConfigured(String(request.input('pin') || ''))) {
      recordPinFailure(clientKey)
      return this.loginView(ctx, 'That PIN is not correct.')
    }

    clearPinFailures(clientKey)
    this.markSignedIn(ctx)
    session.flash('success', 'Signed in.')
    return response.redirect().toPath('/shop/intake')
  }

  async signOut(ctx: HttpContext) {
    const { response, session } = ctx
    session.forget(PIN_SESSION_KEY)
    session.clear()
    return response.redirect().toPath('/shop/intake')
  }

  async createProduct(ctx: HttpContext) {
    const { request, response, session } = ctx
    if (!this.isSignedIn(ctx)) return this.loginView(ctx)

    const payload = this.productFrom(request.all() as Record<string, unknown>)
    if (!payload.name) {
      session.flash('error', 'An item needs a name.')
      return response.redirect().back()
    }

    const product = this.store().addProduct(payload)
    return response.redirect().toPath(`/shop/intake?added=${encodeURIComponent(product.id)}`)
  }

  async updateProduct(ctx: HttpContext) {
    const { params, request, response, session } = ctx
    if (!this.isSignedIn(ctx)) return this.loginView(ctx)

    const id = String(params.id || '')
    const action = String(request.input('action') || 'save')

    if (action === 'remove') {
      this.store().removeProduct(id)
      return response.redirect().toPath('/shop/intake?removed=1')
    }

    if (action === 'sold') {
      this.store().updateProduct(id, { available: false })
      return response.redirect().toPath('/shop/intake?saved=1')
    }

    if (action === 'relist') {
      this.store().updateProduct(id, { available: true })
      return response.redirect().toPath('/shop/intake?saved=1')
    }

    const payload = this.productFrom(request.all() as Record<string, unknown>)
    const updated = this.store().updateProduct(id, payload)
    if (!updated) {
      session.flash('error', 'That item is no longer in the catalogue.')
      return response.redirect().back()
    }

    return response.redirect().toPath('/shop/intake?saved=1')
  }

  /**
   * A JSON backup of the catalogue. The shop can keep this in Google Drive or
   * send it on, and restore it at any time.
   */
  async backup(ctx: HttpContext) {
    const { response } = ctx
    if (!this.isSignedIn(ctx)) return this.loginView(ctx)

    const products = this.store().allProducts()
    response.header('Content-Type', 'application/json; charset=utf-8')
    response.header(
      'Content-Disposition',
      `attachment; filename="adonai-catalogue-${new Date().toISOString().slice(0, 10)}.json"`
    )
    return response.send(
      JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), products }, null, 2)
    )
  }

  async restore(ctx: HttpContext) {
    const { request, response, session } = ctx
    if (!this.isSignedIn(ctx)) return this.loginView(ctx)

    const raw = String(request.input('backup') || '').trim()
    if (!raw) {
      session.flash('error', 'Paste a backup file first.')
      return response.redirect().back()
    }

    try {
      const parsed = JSON.parse(raw) as { products?: ProductInput[] } | ProductInput[]
      const products = Array.isArray(parsed) ? parsed : parsed.products
      if (!Array.isArray(products)) throw new Error('no products array')

      const count = this.store().replaceProducts(products)
      return response.redirect().toPath(`/shop/intake?restored=${count}`)
    } catch {
      session.flash('error', 'That does not look like an Adonai catalogue backup.')
      return response.redirect().back()
    }
  }

  /**
   * Turn a submitted form into the fields the store understands. Empty inputs
   * are left out so editing one field never wipes the others.
   */
  private productFrom(input: Record<string, unknown>): ProductInput {
    const payload: ProductInput = {}

    const text = (key: keyof ProductInput) => {
      const value = String(input[key] ?? '').trim()
      if (value !== '') (payload as Record<string, unknown>)[key] = value
    }

    text('name')
    text('category')
    text('condition')
    text('size')
    text('description')
    text('image')
    text('measurementNote')

    const price = String(input.price ?? '').trim()
    if (price !== '') payload.price = price

    const list = (key: 'sizes' | 'colours') => {
      const raw = String(input[key] ?? '').trim()
      if (raw === '') return
      const values = raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
      if (values.length) payload[key] = values
    }
    list('sizes')
    list('colours')
    if (input.newArrival !== undefined) payload.newArrival = Boolean(input.newArrival)

    return payload
  }
}
