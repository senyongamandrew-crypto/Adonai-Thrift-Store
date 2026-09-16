import type { HttpContext } from '@adonisjs/core/http'
import type { StorefrontHttpContext } from '#middleware/storefront_services_middleware'
import type { EdgeProduct } from '#services/storefront_services'
import env from '#start/env'
import {
  checkoutValidator,
  contactValidator,
  signInValidator,
  signUpValidator,
} from '#validators/storefront'

const categories = ['New in', 'Tops', 'Dresses', 'Bottoms', 'Outerwear', 'Shoes', 'Accessories']

export default class StorefrontController {
  private sharedViewData(request: HttpContext['request'], canonicalPath?: string) {
    const siteUrl = env.get('SITE_URL').replace(/\/$/, '')
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

    /**
     * The catalog belongs to the private POS backend. When that service cannot
     * be reached, the storefront still renders — with an honest notice instead
     * of an incomplete "sold out" catalog.
     */
    let products: EdgeProduct[] = []
    let catalogUnavailable = false
    try {
      const catalog = await storefront.catalogService.availableProducts({ searchQuery })
      products = catalog.map(storefront.catalogService.toEdgeProduct)
    } catch {
      catalogUnavailable = true
    }

    return view.render('pages/home', {
      ...shared,
      pageTitle: 'Adonai Thrift Store | Kampala thrift and vintage clothing',
      metaDescription:
        'Handpicked Grade-A thrift and vintage clothing in Kampala, with clear UGX prices and local delivery.',
      products,
      searchQuery,
      catalogUnavailable,
      bagCount: 0,
    })
  }

  /**
   * Liveness and readiness probe for the hosting platform. Always answers 200
   * so a POS catalog outage does not take the storefront container down.
   */
  async health(ctx: HttpContext) {
    const { response, storefront } = ctx as StorefrontHttpContext
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
    const { request, response, storefront } = ctx as StorefrontHttpContext
    const payload = await signInValidator.validate(request.all())
    // Never log the password; the adapter forwards it only over the private server boundary.
    await storefront.accountService.signIn(
      payload.identifier,
      payload.password,
      Boolean(payload.remember)
    )
    storefront.forwardSessionCookies(response)
    return response.redirect().toPath('/account')
  }

  async signUp(ctx: HttpContext) {
    const { request, response, storefront } = ctx as StorefrontHttpContext
    const payload = await signUpValidator.validate(request.all())
    await storefront.accountService.register({ ...payload, website: undefined })
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
    const { response, storefront } = ctx as StorefrontHttpContext
    const siteUrl = env.get('SITE_URL').replace(/\/$/, '')
    const routes = ['/', '/privacy', '/terms', '/contact']
    let productRoutes: string[] = []
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
