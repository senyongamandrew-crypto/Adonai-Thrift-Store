import { test } from '@japa/runner'
import env from '#start/env'
import { getBuiltInCatalogue } from '#services/storefront_services'

/**
 * The POS API and the catalogue that ships with the service.
 *
 * The suite runs with an external POS API configured but unreachable (see
 * .env.test), which is what the storefront tests above rely on. These tests
 * cover the other half: the endpoints the mobile intake app and the storefront
 * use, and the built-in catalogue answering the storefront when no external POS
 * API is configured.
 */
const SHOP_PIN = '7890'

test.group('POS API', (group) => {
  group.setup(() => {
    getBuiltInCatalogue().replaceProducts([])
  })

  group.each.teardown(() => {
    getBuiltInCatalogue().replaceProducts([])
  })

  test('answers the device health probe', async ({ client }) => {
    const response = await client.get('/api/health')

    response.assertStatus(200)
    response.assertBodyContains({ ok: true, status: 'ok', catalog: 'ok' })
  })

  test('lists an empty catalogue before anything is added', async ({ client }) => {
    const response = await client.get('/api/products')

    response.assertStatus(200)
    response.assertBodyContains({ ok: true, count: 0, products: [] })
  })

  test('refuses catalogue changes without the shop PIN', async ({ client }) => {
    const response = await client.post('/api/products').json({ name: 'Smuggled jacket' })

    response.assertStatus(401)
    response.assertBodyContains({ ok: false })
  })

  test('refuses catalogue changes with the wrong PIN', async ({ client }) => {
    const response = await client
      .post('/api/products')
      .header('x-adonai-pin', '0000')
      .json({ name: 'Smuggled jacket' })

    response.assertStatus(401)
  })

  test('accepts a new item from the shop device', async ({ client }) => {
    const created = await client.post('/api/products').header('x-adonai-pin', SHOP_PIN).json({
      name: 'Vintage denim jacket',
      price: '45000',
      category: 'Outerwear',
      size: 'M',
      image: 'https://example.com/jacket.jpg',
    })

    created.assertStatus(201)
    created.assertBodyContains({ ok: true })

    const listing = await client.get('/api/products')
    listing.assertStatus(200)
    listing.assertBodyContains({ count: 1 })

    const id = created.body().product.id
    const single = await client.get(`/api/products/${id}`)
    single.assertStatus(200)
    single.assertBodyContains({ ok: true })
    single.assertBodyContains({ product: { name: 'Vintage denim jacket', price: 45000 } })
  })

  test('hides an item from customers once it is marked sold', async ({ client }) => {
    const created = await client
      .post('/api/products')
      .header('x-adonai-pin', SHOP_PIN)
      .json({ name: 'Sold out sneakers', price: 60000 })
    const id = created.body().product.id

    const stored = await client
      .put(`/api/products/${id}`)
      .header('x-adonai-pin', SHOP_PIN)
      .json({ available: false })
    stored.assertStatus(200)

    const publicList = await client.get('/api/products')
    publicList.assertBodyContains({ count: 0 })

    const shopList = await client.get('/api/products?includeUnavailable=true')
    shopList.assertBodyContains({ count: 1 })
  })

  test('removes an item for good', async ({ client }) => {
    const created = await client
      .post('/api/products')
      .header('x-adonai-pin', SHOP_PIN)
      .json({ name: 'Wrongly listed item' })
    const id = created.body().product.id

    const removed = await client.delete(`/api/products/${id}`).header('x-adonai-pin', SHOP_PIN)
    removed.assertStatus(200)

    const single = await client.get(`/api/products/${id}`)
    single.assertStatus(404)
  })

  test('records an order placed through checkout', async ({ client, assert }) => {
    const response = await client.post('/api/orders').json({
      name: 'Amina',
      phone: '+256700000000',
      items: [{ id: 'vintage-denim-jacket' }],
    })

    response.assertStatus(201)
    response.assertBodyContains({ ok: true })
    assert.match(response.body().order.id, /^ORD-\d+$/)
  })

  test('records a contact message', async ({ client }) => {
    const response = await client
      .post('/api/contact')
      .json({ name: 'Amina', phone: '+256700000000', message: 'Do you have denim jackets?' })

    response.assertStatus(201)
    response.assertBodyContains({ ok: true })
  })
})

test.group('Built-in catalogue drives the storefront', (group) => {
  /**
   * The storefront prefers an external POS API. These tests remove it for the
   * duration of the group so the built-in catalogue answers instead, which is
   * how the shop runs when it has no separate POS service.
   */
  const originalGet = env.get.bind(env)

  group.setup(() => {
    env.get = ((key: string) =>
      key === 'FLASK_API_BASE_URL' ? '' : originalGet(key)) as typeof env.get
    getBuiltInCatalogue().replaceProducts([])
  })

  group.teardown(() => {
    env.get = originalGet as typeof env.get
    getBuiltInCatalogue().replaceProducts([])
  })

  test('shows a piece the shop added on the home page', async ({ client }) => {
    getBuiltInCatalogue().addProduct({
      name: 'Handmade leather sandals',
      price: 35000,
      category: 'Shoes',
      size: '42',
    })

    const response = await client.get('/')

    response.assertStatus(200)
    response.assertTextIncludes('Handmade leather sandals')
    response.assertTextIncludes('UGX 35,000')
  })

  test('serves the product page for a listed piece', async ({ client }) => {
    const product = getBuiltInCatalogue().addProduct({ name: 'Linen summer dress', price: 40000 })

    const response = await client.get(`/products/${product.id}`)

    response.assertStatus(200)
    response.assertTextIncludes('Linen summer dress')
  })

  test('answers 404 for a piece that is sold', async ({ client }) => {
    const product = getBuiltInCatalogue().addProduct({ name: 'Reserved coat', price: 90000 })
    getBuiltInCatalogue().updateProduct(product.id, { available: false })

    const response = await client.get(`/products/${product.id}`)

    response.assertStatus(404)
  })

  test('reports the catalogue as healthy without an external POS API', async ({ client }) => {
    const response = await client.get('/healthz')

    response.assertStatus(200)
    response.assertBodyContains({ status: 'ok', catalog: 'ok' })
  })

  test('lists each listed piece in the sitemap', async ({ client }) => {
    const product = getBuiltInCatalogue().addProduct({ name: 'Wool scarf', price: 15000 })

    const response = await client.get('/sitemap.xml')

    response.assertStatus(200)
    response.assertTextIncludes(`/products/${product.id}`)
  })
})
