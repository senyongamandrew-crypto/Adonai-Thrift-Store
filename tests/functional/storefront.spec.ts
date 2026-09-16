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
})
