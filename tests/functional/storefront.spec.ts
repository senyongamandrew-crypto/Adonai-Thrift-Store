import { test } from '@japa/runner'

/**
 * Smoke tests for the public storefront. They must pass even when the private
 * POS/store API is unreachable, because the storefront is expected to degrade
 * gracefully instead of failing.
 */
test.group('Storefront', () => {
  test('renders the home page', async ({ client }) => {
    const response = await client.get('/')

    response.assertStatus(200)
    response.assertTextIncludes('Handpicked Grade-A Thrift and Vintage Clothing in Kampala')
    response.assertTextIncludes('Adonai Thrift Store')
  })

  /**
   * The shop details below are rendered from app/services/site_settings.ts and
   * are the values a shop owner can override from the hosting dashboard. These
   * tests fail loudly if the "site" Edge global is ever dropped, which would
   * leave blank spaces where the phone numbers belong.
   */
  test('renders the contact details from the storefront settings', async ({ client }) => {
    const response = await client.get('/')

    response.assertStatus(200)
    response.assertTextIncludes('https://wa.me/256765652403')
    response.assertTextIncludes('tel:+256748992964')
    response.assertTextIncludes('+256765652403')
    response.assertTextIncludes('Kampala delivery available')
  })

  test('hides the promo strip while no promotion is configured', async ({ client }) => {
    const response = await client.get('/')

    response.assertStatus(200)
    response.assertTextIncludes('adonai-top-banner')
    response.assertBodyNotContains('Store announcement')
  })

  test('renders the legal pages', async ({ client }) => {
    const [privacy, terms] = await Promise.all([client.get('/privacy'), client.get('/terms')])

    privacy.assertStatus(200)
    privacy.assertTextIncludes('Privacy policy')

    terms.assertStatus(200)
    terms.assertTextIncludes('Terms')
  })

  test('renders the account, contact and checkout pages', async ({ client }) => {
    const signIn = await client.get('/account/sign-in')
    signIn.assertStatus(200)
    signIn.assertTextIncludes('Sign in')

    const contact = await client.get('/contact')
    contact.assertStatus(200)

    const checkout = await client.get('/checkout')
    checkout.assertStatus(200)
  })

  test('serves the sitemap as XML', async ({ client }) => {
    const response = await client.get('/sitemap.xml')

    response.assertStatus(200)
    response.assertHeader('content-type', 'application/xml; charset=utf-8')
    response.assertTextIncludes('<urlset')
  })

  test('answers the health probe', async ({ client }) => {
    const response = await client.get('/healthz')

    response.assertStatus(200)
    response.assertBodyContains({ status: 'ok' })
  })

  test('renders a styled 404 page for unknown routes', async ({ client }) => {
    const response = await client.get('/this-page-does-not-exist')

    response.assertStatus(404)
    response.assertTextIncludes('This page is unavailable')
  })

  test('keeps rendering the storefront while the store API is unreachable', async ({ client }) => {
    const response = await client.get('/')

    response.assertStatus(200)
    response.assertTextIncludes('The catalog is momentarily unavailable')
  })

  test('reports the catalog state on the health probe', async ({ client }) => {
    const response = await client.get('/healthz')

    response.assertStatus(200)
    response.assertBodyContains({ status: 'ok', catalog: 'unavailable' })
  })

  /**
   * The platform health probe may arrive over plain HTTP without any forwarded
   * headers. If it were answered with a redirect the deploy would be marked as
   * failed, so /healthz must always be served directly.
   */
  test('never redirects the health probe, even on a plain HTTP request', async ({ client }) => {
    const response = await client.get('/healthz').header('x-forwarded-proto', 'http')

    response.assertStatus(200)
    response.assertBodyContains({ status: 'ok' })
  })

  test('answers 503 instead of 404 for product pages during a catalog outage', async ({
    client,
  }) => {
    const response = await client.get('/products/AD-101')

    response.assertStatus(503)
  })

  test('derives the public site URL from the request when none is configured', async ({
    client,
  }) => {
    const response = await client
      .get('/')
      .header('x-forwarded-proto', 'https')
      .header('x-forwarded-host', 'adonaithrift.example')

    response.assertStatus(200)
    response.assertTextIncludes('<link rel="canonical" href="https://adonaithrift.example/"')
    response.assertTextIncludes('https://adonaithrift.example/images/og/adonai-storefront.png')
  })
})
