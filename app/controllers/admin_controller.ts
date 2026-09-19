// @ts-nocheck
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
import { readFileSync } from 'node:fs'
import type { ProductInput, ProductImage, ImageTag } from '#services/catalogue_store'
import {
  isValidImageTag,
  normaliseProductImages,
  validateProductImages,
} from '#services/catalogue_store'
import { maxUploadBytes, resolveImageContentType, saveImage } from '#services/media_store'
import {
  clearPinFailures,
  pinAttemptDelay,
  recordPinFailure,
  pinMatchesConfigured,
  usingDefaultPin,
} from '#services/shop_pin'
import { PIN_SESSION_KEY, sessionSignedIn } from '#services/shop_session'
import { getBuiltInCatalogue } from '#services/storefront_services'

/**
 * The view names a shop chose for its photos, in the order it chose them.
 *
 * A single label arrives as a string and several arrive as an array — a form with
 * one select posts the string, with four it posts the array — so both are folded
 * into a list here rather than at each place that reads them.
 */

/**
 * Parse a structured ProductImage array when the intake sends JSON
 * (React ItemIntakePanel). Accepts either a JSON string or a real array.
 */
function parseStructuredImages(value: unknown): ProductImage[] | undefined {
  if (!value) return undefined
  let raw: unknown = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      return undefined
    }
  }
  if (!Array.isArray(raw)) return undefined
  const images: ProductImage[] = []
  for (let i = 0; i < (raw as unknown[]).length; i++) {
    const entry = (raw as any[])[i]
    if (!entry || typeof entry !== 'object') continue
    const url = typeof entry.url === 'string' ? entry.url.trim() : ''
    if (!url) continue
    const tagRaw = typeof entry.tag === 'string' ? entry.tag.trim().toLowerCase() : 'other'
    const tag: ImageTag = isValidImageTag(tagRaw) ? (tagRaw as ImageTag) : 'other'
    images.push({
      id:
        typeof entry.id === 'string' && entry.id.trim()
          ? entry.id.trim()
          : `img_${Date.now()}_${i}`,
      url,
      isPrimary: Boolean(entry.isPrimary),
      tag,
      order: Number.isFinite(entry.order) ? Math.max(0, Math.floor(entry.order)) : i,
    })
  }
  return images.length ? images : undefined
}

// @ts-ignore
function _stockIndicator(qty?: number, threshold?: number): string {
  const q = qty ?? 0
  const t = threshold ?? 5
  if (q <= 0) return 'out'
  if (q <= t) return 'low'
  return 'ok'
}

function toLabelList(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return entries.map((entry) =>
    String(entry ?? '')
      .trim()
      .slice(0, 40)
  )
}

export default class AdminController {
  private store() {
    return getBuiltInCatalogue()
  }

  private isSignedIn(ctx: HttpContext): boolean {
    return sessionSignedIn(ctx)
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
      /**
       * The photo limit is shown on the screen, so the shop is told what the
       * website will accept before a five-minute upload runs into a refusal.
       * It is read from the same setting the upload itself uses.
       */
      photoLimitMb: Math.round(maxUploadBytes() / (1024 * 1024)),
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

    // Optimized Stock Count Data Entry — bound to core creation workflow
    const stockRaw = request.input('stockQuantity') ?? request.input('quantity')
    if (stockRaw !== undefined && String(stockRaw).trim() !== '') {
      const qty = Number(String(stockRaw).replace(/[^0-9.-]/g, ''))
      if (!Number.isFinite(qty) || qty < 0) {
        session.flash('error', 'Stock quantity cannot be a negative value.')
        return response.redirect().back()
      }
    }

    // Try structured images first (React panel), fall back to file uploads
    const structured = parseStructuredImages(
      request.input('images') ?? request.input('structuredImages')
    )
    if (structured) {
      const err = validateProductImages(structured)
      if (err) {
        session.flash('error', `Image validation: ${err}`)
        return response.redirect().back()
      }
      const normalized = normaliseProductImages(structured)
      if (normalized) {
        payload.images = normalized
        payload.image = normalized.find((i) => i.isPrimary)?.url ?? normalized[0].url
        payload.gallery = normalized.map((i) => i.url)
        const tagToLabel: Record<ImageTag, string> = {
          front: 'Front view',
          back: 'Back view',
          texture: 'Texture close-up',
          label: 'Label or tag',
          other: 'Other',
        }
        payload.galleryLabels = normalized.map((i) => tagToLabel[i.tag])
      }
    } else {
      const photos = this.attachPhotos(request)
      this.applyPhotos(payload, photos)
      // If structured images were provided via file upload tags, also build payload.images
      if (photos.urls.length) {
        const tagMap: Record<string, ImageTag> = {
          'Front view': 'front',
          'Front View': 'front',
          'front': 'front',
          'back': 'back',
          'Back view': 'back',
          'Texture close-up': 'texture',
          'texture': 'texture',
          'Label or tag': 'label',
          'label': 'label',
          'Other': 'other',
          'other': 'other',
        }
        const imgs: ProductImage[] = photos.urls.map((url, idx) => ({
          id: `img_${Date.now()}_${idx}`,
          url,
          isPrimary: idx === 0,
          tag: (tagMap[photos.labels[idx] ?? ''] ?? (idx === 0 ? 'front' : 'other')) as ImageTag,
          order: idx,
        }))
        const normalized = normaliseProductImages(imgs)
        if (normalized) payload.images = normalized
      }
      if (photos.error) session.flash('warning', `${photos.error} The piece was saved without it.`)
    }

    // Final primary enforcement — synthesize if neither path provided images but form demands one
    if (payload.images) {
      const err = validateProductImages(payload.images)
      if (err) {
        session.flash('error', `Image validation: ${err}`)
        return response.redirect().back()
      }
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

    const stockRaw = request.input('stockQuantity') ?? request.input('quantity')
    if (stockRaw !== undefined && String(stockRaw).trim() !== '') {
      const qty = Number(String(stockRaw).replace(/[^0-9.-]/g, ''))
      if (!Number.isFinite(qty) || qty < 0) {
        session.flash('error', 'Stock quantity cannot be a negative value.')
        return response.redirect().back()
      }
    }

    const structured = parseStructuredImages(
      request.input('images') ?? request.input('structuredImages')
    )
    if (structured) {
      const err = validateProductImages(structured)
      if (err) {
        session.flash('error', `Image validation: ${err}`)
        return response.redirect().back()
      }
      const normalized = normaliseProductImages(structured)
      if (normalized) {
        payload.images = normalized
        payload.image = normalized.find((i) => i.isPrimary)?.url ?? normalized[0].url
        payload.gallery = normalized.map((i) => i.url)
        const tagToLabel: Record<ImageTag, string> = {
          front: 'Front view',
          back: 'Back view',
          texture: 'Texture close-up',
          label: 'Label or tag',
          other: 'Other',
        }
        payload.galleryLabels = normalized.map((i) => tagToLabel[i.tag])
      }
    } else {
      const photos = this.attachPhotos(request)
      this.applyPhotos(payload, photos)
      if (photos.urls.length) {
        const tagMap: Record<string, ImageTag> = {
          'Front view': 'front',
          'Front View': 'front',
          'front': 'front',
          'back': 'back',
          'Back view': 'back',
          'Texture close-up': 'texture',
          'texture': 'texture',
          'Label or tag': 'label',
          'label': 'label',
          'Other': 'other',
          'other': 'other',
        }
        const imgs: ProductImage[] = photos.urls.map((url, idx) => ({
          id: `img_${Date.now()}_${idx}`,
          url,
          isPrimary: idx === 0,
          tag: (tagMap[photos.labels[idx] ?? ''] ?? (idx === 0 ? 'front' : 'other')) as ImageTag,
          order: idx,
        }))
        const normalized = normaliseProductImages(imgs)
        if (normalized) payload.images = normalized
      }
      if (photos.error)
        session.flash('warning', `${photos.error} The rest of the change was saved.`)
    }

    if (payload.images) {
      const err = validateProductImages(payload.images)
      if (err) {
        session.flash('error', `Image validation: ${err}`)
        return response.redirect().back()
      }
    }

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
   * The photos chosen from the phone, if any were attached to the form.
   *
   * More than one is the point: someone buying second-hand wants to see the
   * front, the back, the label and the wear. A listing showing one photo of a
   * jacket shows the least convincing part of it. So the first photo chosen is
   * the one the listing leads with, and every photo goes into the gallery the
   * product page pages through.
   *
   * They are saved through the same store the till uses, so photos added here
   * and photos added by the POS app end up in one folder and are served the same
   * way at /media/...
   *
   * One bad file in a batch never costs the shop the good ones: everything that
   * can be saved is saved, and the shop is told about the rest.
   */
  private attachPhotos(request: HttpContext['request']): {
    urls: string[]
    labels: string[]
    error?: string
  } {
    /*
     * No size or format options are handed to the parser here, deliberately. When
     * they are, the parser silently drops a file it does not like and hands back a
     * shorter list, so an oversized photo arrived as "no photo was chosen at all"
     * — the shop was told nothing and simply wondered where the picture went.
     * Deciding here means every rejected photo gets a sentence a shopkeeper can
     * act on. The request as a whole is still capped by the body parser.
     */
    const uploads = request.files('photos')
    if (!uploads.length) return { urls: [], labels: [] }

    /*
     * What each photo shows, in the order the photos were chosen: "Front view",
     * "Tag". A customer buying second-hand wants to know which view they are
     * looking at, and a second-hand shop's photos all look alike without it.
     */
    const labels = toLabelList(request.input('labels'))

    const limit = maxUploadBytes()
    const megabytes = Math.round(limit / (1024 * 1024))
    const urls: string[] = []
    const kept: string[] = []
    let error: string | undefined

    for (const upload of uploads) {
      const temporaryPath = upload.tmpPath
      if (!temporaryPath) {
        error = 'One photo did not arrive. Please try it again.'
        continue
      }

      const bytes = readFileSync(temporaryPath)

      if (bytes.length > limit) {
        error = `One photo was bigger than ${megabytes} MB, which is the most the website can store. Try one under ${megabytes} MB.`
        continue
      }

      if (bytes.length === 0) {
        error = 'One photo was empty. Please try it again.'
        continue
      }

      /*
       * The format is taken from the file itself, not from what the phone said:
       * the multipart parser reports "image" and leaves the rest out, which is not
       * a type a browser will draw.
       */
      const contentType = resolveImageContentType(bytes, upload.type)
      if (!contentType) {
        error = `One file was not a photo the website can store. Photos must be a JPEG, PNG, WebP or GIF, under ${megabytes} MB.`
        continue
      }

      urls.push(saveImage(bytes, contentType).url)
      /*
       * The label belongs to this photo, so it is pushed beside it. A refused
       * photo takes its label with it rather than sliding the label up under
       * somebody else's picture.
       */
      kept.push(labels[urls.length - 1] ?? '')
    }

    return error ? { urls, labels: kept, error } : { urls, labels: kept }
  }

  /**
   * Put the chosen photos on the piece: the first leads, all of them are the
   * gallery. Doing nothing when no photo was chosen is what keeps a piece's
   * existing photos when the shop only comes back to change a price.
   */
  private applyPhotos(payload: ProductInput, photos: { urls: string[]; labels: string[] }): void {
    if (!photos.urls.length) return
    payload.image = photos.urls[0]
    payload.gallery = photos.urls
    payload.galleryLabels = photos.labels
  }

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
    text('sku')
    text('brand')
    text('bin')
    text('details')

    // Core financials — price and costPrice both tracked for margin visibility
    const price = String(input.price ?? '').trim()
    if (price !== '') payload.price = price
    const costPrice = String(input.costPrice ?? input.cost ?? '').trim()
    if (costPrice !== '') payload.costPrice = costPrice
    if (costPrice !== '') payload.cost = costPrice

    // Optimized Stock Count Data Entry — bound to creation workflow
    const stockStr = String(input.stockQuantity ?? input.quantity ?? '').trim()
    if (stockStr !== '') payload.stockQuantity = stockStr
    if (stockStr !== '') payload.quantity = stockStr
    const thresholdStr = String(input.lowStockThreshold ?? '').trim()
    if (thresholdStr !== '') payload.lowStockThreshold = thresholdStr

    // Handle JSON images if posted directly (API callers)
    const imgs = parseStructuredImages(
      input.images ?? (input as any).structuredImages ?? (input as any).imageMeta
    )
    if (imgs) payload.images = imgs

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
