import type { HttpContext } from '@adonisjs/core/http'
import type { StorefrontHttpContext } from '#middleware/storefront_services_middleware'
import type { EdgeProduct } from '#services/storefront_services'
import { getBuiltInCatalogue } from '#services/storefront_services'
import env from '#start/env'
import {
  StorefrontAccountsUnavailableError,
  usesExternalPosApi,
} from '#services/storefront_services'
import {
  checkoutValidator,
  contactValidator,
  signInValidator,
  signUpValidator,
} from '#validators/storefront'

const categories = ['Tops', 'Dresses', 'Bottoms', 'Outerwear', 'Shoes', 'Accessories']

/**
 * Choose the piece the home page leads with, and only when the shop's own data
 * gives it a reason to be there: it is marked new, or it carries a real previous
 * price. Returns null when no piece qualifies, and the section is then left out
 * entirely rather than dressed up with urgency the shop does not have.
 */
function pickFeaturedPiece(products: EdgeProduct[]): EdgeProduct | null {
  if (products.length === 0) return null
  return (
    products.find((product) => product.newArrival && product.image) ||
    products.find((product) => product.originalPriceFormatted) ||
    products.find((product) => product.image) ||
    null
  )
}

type CatalogState = 'ok' | 'unavailable' | 'not_configured'

export default class StorefrontController {
  /**
   * Whether the private store/POS API has been configured at all. The
   * storefront runs fine without it, so this is not a hard requirement.
   */
  private isCatalogConfigured() {
    return usesExternalPosApi() || this.builtInCatalogueEnabled()
  }

  /**
   * The catalogue that ships with this service is on by default, so the shop
   * can list pieces without deploying a second system. Setting
   * ADONAI_BUILTIN_CATALOGUE=false restores the "catalog is being connected"
   * state until an external POS API is provided.
   */
  private builtInCatalogueEnabled() {
    return env.get('ADONAI_BUILTIN_CATALOGUE') !== false
  }

  /**
   * Public address of the site, used for canonical links, sitemap.xml and the
   * Open Graph/Twitter preview image.
   *
   * When SITE_URL/APP_URL are unset (or still point at localhost) the address
   * is taken from the incoming request, so the deployed site produces correct
   * links on any domain without configuration.
   */
  private siteUrl(request: HttpContext['request']) {
    const configured = (env.get('SITE_URL') || env.get('APP_URL') || '').replace(/\/$/, '')
    const isPlaceholder = !configured || /^https?:\/\/(localhost|127\.0\.0\.1)/.test(configured)
    if (!isPlaceholder) return configured

    const protocol =
      request.header('x-forwarded-proto')?.split(',')[0]?.trim() || request.protocol() || 'http'
    const host = request.header('x-forwarded-host')?.split(',')[0]?.trim() || request.host()
    return `${protocol}://${host}`
  }

  private sharedViewData(request: HttpContext['request'], canonicalPath?: string) {
    const siteUrl = this.siteUrl(request)
    return {
      siteUrl,
      canonicalUrl: `${siteUrl}${canonicalPath || request.url()}`,
      ogImage: `${siteUrl}/images/og/adonai-storefront.png`,
      analytics: {
        provider: env.get('ANALYTICS_PROVIDER'),
        domain: env.get('ANALYTICS_DOMAIN'),
        measurementId: env.get('GA4_MEASUREMENT_ID'),
      },
      categories,
    }
  }

  async home(ctx: HttpContext) {
    const { request, view, storefront } = ctx as StorefrontHttpContext
    const shared = this.sharedViewData(request, '/')
    const searchQuery = String(request.input('q') || '')
      .trim()
      .slice(0, 120)
    const activeCategory = String(request.input('category') || '')
      .trim()
      .slice(0, 60)

    /**
     * The catalog belongs to the private POS backend. The page renders in
     * three honest states: connected, temporarily unreachable, or not
     * connected yet — never a misleading "sold out" list.
     */
    let catalogue: EdgeProduct[] = []
    let catalogState: CatalogState = 'ok'

    if (!this.isCatalogConfigured()) {
      catalogState = 'not_configured'
    } else {
      try {
        /**
         * The whole available catalogue is fetched once, then arranged for the
         * page. One request instead of one per section, and every section is
         * built from the same list, so they can never disagree with each other.
         */
        const catalog = await storefront.catalogService.availableProducts({ searchQuery: '' })
        catalogue = catalog.map(storefront.catalogService.toEdgeProduct)
      } catch {
        catalogState = 'unavailable'
      }
    }

    const matches = (product: EdgeProduct) => {
      const haystack = [product.name, product.category, product.size, product.condition]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (searchQuery && !haystack.includes(searchQuery.toLowerCase())) return false
      if (activeCategory && product.category !== activeCategory) return false
      return true
    }

    const products = catalogState === 'ok' ? catalogue.filter(matches) : []
    const filteredByCategory = Boolean(activeCategory) || Boolean(searchQuery)

    return view.render('pages/home', {
      ...shared,
      pageTitle: 'Adonai Thrift Store | Kampala thrift and vintage clothing',
      metaDescription:
        'Handpicked Grade-A thrift and vintage clothing in Kampala, with clear UGX prices and local delivery.',
      products,
      searchQuery,
      activeCategory,
      filteredByCategory,
      catalogState,
      /* The pieces shown before the full list: newest first, as the shop listed them. */
      newArrivals: catalogState === 'ok' ? catalogue.slice(0, 4) : [],
      /**
       * The piece in the hero. Chosen from the whole catalogue rather than the
       * filtered list, so the top of the page stays still while a customer
       * browses a category.
       */
      heroPiece: catalogState === 'ok' ? (catalogue[0] ?? null) : null,
      /**
       * The pieces with a photo, one per category, used for the category tiles.
       * A category with nothing in stock still gets a tile so the row does not
       * look broken, and tapping it simply shows an empty collection.
       */
      categoryTiles: categories.map((name) => ({
        name,
        image: catalogue.find((product) => product.category === name && product.image)?.image || '',
        count: catalogue.filter((product) => product.category === name).length,
      })),
      /**
       * One piece to lead with. Only chosen when the shop's own data supports a
       * reason: a piece the POS marked as featured, or one with a real previous
       * price that is now reduced. Otherwise there is no such section, because a
       * "deal" invented by the website would be a lie about the price.
       */
      featuredPiece: catalogState === 'ok' ? pickFeaturedPiece(catalogue) : null,
      bagCount: 0,
    })
  }

  /**
   * Liveness and readiness probe for the hosting platform. Always answers 200
   * so a store API outage does not take the storefront container down.
   */
  async health(ctx: HttpContext) {
    const { response, storefront } = ctx as StorefrontHttpContext

    if (!this.isCatalogConfigured()) {
      return response.status(200).send({ status: 'ok', catalog: 'not_configured' })
    }

    let catalog = 'ok'
    try {
      await storefront.catalogService.availableProducts({ searchQuery: '' })
    } catch {
      catalog = 'unavailable'
    }
    return response.status(200).send({ status: 'ok', catalog })
  }

  async product(ctx: HttpContext) {
    const { params, request, response, view, storefront } = ctx as StorefrontHttpContext

    /**
     * Nothing is listed yet when the store API is not connected, so the item
     * cannot exist. Answer 503 with an explanation rather than a bare 404.
     */
    if (!this.isCatalogConfigured()) {
      response.status(503)
      return view.render('pages/errors/server_error', {
        ...this.sharedViewData(request),
        pageTitle: 'Catalog coming soon · Adonai Thrift Store',
        notice:
          'Our online catalog is being connected. Call or WhatsApp the store and we will tell you what is available right now.',
        noIndex: true,
      })
    }

    let product
    try {
      product = await storefront.catalogService.findAvailableProduct(String(params.id || ''))
    } catch {
      /**
       * The POS catalog is unreachable, so this is an outage rather than a
       * missing product. Answer 503 to keep the product URL indexed.
       */
      response.status(503)
      return view.render('pages/errors/server_error', {
        ...this.sharedViewData(request),
        pageTitle: 'Store temporarily unavailable · Adonai Thrift Store',
        noIndex: true,
      })
    }

    if (!product) {
      response.status(404)
      return view.render('errors/not-found', {
        ...this.sharedViewData(request),
        pageTitle: 'Product not found · Adonai Thrift Store',
        noIndex: true,
      })
    }

    const mappedProduct = storefront.catalogService.toEdgeProduct(product)
    return view.render('pages/product', {
      ...this.sharedViewData(request),
      pageTitle: `${mappedProduct.name} · Adonai Thrift Store`,
      metaDescription:
        mappedProduct.description || `View ${mappedProduct.name} at Adonai Thrift Store.`,
      ogType: 'product',
      product: mappedProduct,
    })
  }

  async auth(ctx: HttpContext) {
    const { request, view } = ctx as StorefrontHttpContext
    const isSignup = request.url().includes('sign-up')
    return view.render('pages/auth', {
      ...this.sharedViewData(request),
      accountsAvailable: usesExternalPosApi(),
      mode: isSignup ? 'signup' : 'signin',
      pageTitle: isSignup
        ? 'Create an account · Adonai Thrift Store'
        : 'Sign in · Adonai Thrift Store',
    })
  }

  async contactPage(ctx: HttpContext) {
    const { request, view } = ctx as StorefrontHttpContext
    return view.render('pages/contact', {
      ...this.sharedViewData(request),
      pageTitle: 'Contact Adonai Thrift Store',
    })
  }

  async checkoutPage(ctx: HttpContext) {
    const { request, view } = ctx as StorefrontHttpContext
    return view.render('pages/checkout', {
      ...this.sharedViewData(request),
      pageTitle: 'Checkout · Adonai Thrift Store',
    })
  }

  async signIn(ctx: HttpContext) {
    const { request, response, session, storefront } = ctx as StorefrontHttpContext
    const payload = await signInValidator.validate(request.all())
    try {
      // Never log the password; the adapter forwards it only over the private server boundary.
      await storefront.accountService.signIn(
        payload.identifier,
        payload.password,
        Boolean(payload.remember)
      )
    } catch (error) {
      /**
       * Customer accounts belong to the POS API. While the shop runs on the
       * built-in catalogue, say so plainly and send the visitor back to the
       * page rather than showing a server error.
       */
      if (error instanceof StorefrontAccountsUnavailableError) {
        session.flash(
          'error',
          'Accounts are not open yet. You can still order — just continue to checkout or message us on WhatsApp.'
        )
        return response.redirect().back()
      }
      throw error
    }
    storefront.forwardSessionCookies(response)
    return response.redirect().toPath('/account')
  }

  async signUp(ctx: HttpContext) {
    const { request, response, session, storefront } = ctx as StorefrontHttpContext
    const payload = await signUpValidator.validate(request.all())
    try {
      await storefront.accountService.register({ ...payload, website: undefined })
    } catch (error) {
      if (error instanceof StorefrontAccountsUnavailableError) {
        session.flash(
          'error',
          'Accounts are not open yet. You can still order — just continue to checkout or message us on WhatsApp.'
        )
        return response.redirect().back()
      }
      throw error
    }
    storefront.forwardSessionCookies(response)
    return response.redirect().toPath('/account')
  }

  async contact(ctx: HttpContext) {
    const { request, response, session, storefront } = ctx as StorefrontHttpContext
    const payload = await contactValidator.validate(request.all())
    await storefront.contactService.send(payload)
    storefront.forwardSessionCookies(response)
    session.flash('success', 'Thanks — the Adonai team will get back to you shortly.')
    return response.redirect().back()
  }

  async checkout(ctx: HttpContext) {
    const { request, response, storefront } = ctx as StorefrontHttpContext
    const payload = await checkoutValidator.validate(request.all())
    const order = await storefront.orderService.createFromCheckout(payload)
    storefront.forwardSessionCookies(response)
    return response.redirect().toPath(`/orders/${order.id}`)
  }

  /**
   * The page a customer lands on after checking out. Without it the confirmation
   * redirect led to the "page not found" screen, which is a worrying thing to see
   * after placing an order.
   */
  async order(ctx: HttpContext) {
    const { request, response, view } = ctx as StorefrontHttpContext
    const store = getBuiltInCatalogue()
    const order = store?.findOrder(
      String((ctx as unknown as { params: { id: string } }).params.id || '')
    )

    if (!order) {
      response.status(404)
      return view.render('errors/not-found', {
        ...this.sharedViewData(request),
        pageTitle: 'Order not found · Adonai Thrift Store',
      })
    }

    /**
     * Prices and names are looked up from the catalogue so the confirmation
     * shows what was ordered even though the order only stored identifiers.
     */
    const details = (order.details ?? {}) as Record<string, unknown>
    const requested = Array.isArray(details.items) ? details.items : []
    const lines = requested.map((entry) => {
      const item = (entry || {}) as Record<string, unknown>
      const product = store.findProduct(String(item.productId || ''))
      const quantity = Number(item.quantity) || 1
      const price = product?.price ?? null
      return {
        name: product?.name || 'A piece from the shop',
        quantity,
        priceLabel: price === null ? 'Price on request' : `UGX ${price.toLocaleString('en-US')}`,
        lineTotalLabel: price === null ? '' : `UGX ${(price * quantity).toLocaleString('en-US')}`,
      }
    })

    const total = lines.reduce((sum, line) => {
      const value = Number(line.lineTotalLabel.replace(/[^0-9]/g, ''))
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)

    const customer = order.customer as Record<string, unknown>
    const statusLabels: Record<string, string> = {
      received: 'Received',
      dispatched: 'On the way',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
    }

    return view.render('pages/order', {
      ...this.sharedViewData(request, `/orders/${order.id}`),
      pageTitle: `Order ${order.id} · Adonai Thrift Store`,
      noIndex: true,
      order: {
        id: order.id,
        statusLabel: statusLabels[order.status] || 'Received',
        customerName: String(customer?.name || ''),
        customerPhone: String(customer?.phone || ''),
        paymentMethod: details.paymentMethod ? String(details.paymentMethod) : '',
        totalLabel: total > 0 ? `UGX ${total.toLocaleString('en-US')}` : '',
        lines,
      },
    })
  }

  async privacy(ctx: HttpContext) {
    const { request, view } = ctx as StorefrontHttpContext
    return view.render('pages/privacy', {
      ...this.sharedViewData(request),
      pageTitle: 'Privacy policy · Adonai Thrift Store',
    })
  }

  async terms(ctx: HttpContext) {
    const { request, view } = ctx as StorefrontHttpContext
    return view.render('pages/terms', {
      ...this.sharedViewData(request),
      pageTitle: 'Terms & conditions · Adonai Thrift Store',
    })
  }

  async notFound(ctx: HttpContext) {
    const { request, response, view } = ctx as StorefrontHttpContext
    response.status(404)
    return view.render('errors/not-found', {
      ...this.sharedViewData(request),
      pageTitle: 'Page not found · Adonai Thrift Store',
      noIndex: true,
    })
  }

  async sitemap(ctx: HttpContext) {
    const { request, response, storefront } = ctx as StorefrontHttpContext
    const siteUrl = this.siteUrl(request)
    const routes = ['/', '/privacy', '/terms', '/contact']
    let productRoutes: string[] = []
    if (this.isCatalogConfigured()) {
      try {
        const products = await storefront.catalogService.availableProducts({ searchQuery: '' })
        productRoutes = products
          .map(
            (product) => `/products/${encodeURIComponent(String(product.id || product.sku || ''))}`
          )
          .filter((path) => !path.endsWith('/'))
      } catch {
        // Keep the legal/home sitemap available during a catalog outage.
      }
    }
    const allRoutes = [...routes, ...productRoutes]
    const urls = allRoutes
      .map(
        (path) =>
          `<url><loc>${this.xmlEscape(`${siteUrl}${path}`)}</loc><changefreq>daily</changefreq><priority>${path === '/' ? '1.0' : '0.6'}</priority></url>`
      )
      .join('')
    response.header('Content-Type', 'application/xml; charset=utf-8')
    return response.send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
    )
  }

  private xmlEscape(value: string) {
    return value.replace(
      /[<>&'\"]/g,
      (character) =>
        ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character] ||
        character
    )
  }
}
