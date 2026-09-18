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

  /**
   * The till's basket panel asks for the queue with no order number and no phone
   * number. That request used to be answered with 400 "Give an order number or a
   * phone number", so the panel showed an empty basket while the orders sat in the
   * file unread. No filter now means "the whole queue".
   */
  test('the till can read the whole order queue', async ({ client, assert }) => {
    const queue = await client.get('/api/orders').header('x-adonai-pin', SHOP_PIN)

    queue.assertStatus(200)
    queue.assertBodyContains({ ok: true })
    assert.isArray(queue.body().orders, 'the panel needs a list it can count')
    assert.isAtLeast(queue.body().orders.length, 1, 'the order placed above must be in it')
    assert.properties(queue.body().counts, ['received', 'dispatched', 'delivered'])
  })

  test('the queue can be filtered down to the orders still needing a rider', async ({
    client,
    assert,
  }) => {
    const open = await client.get('/api/orders?status=open').header('x-adonai-pin', SHOP_PIN)

    open.assertStatus(200)
    for (const order of open.body().orders) {
      assert.include(['received', 'dispatched'], order.status)
    }
  })

  /**
   * The tracking screen reads GET /api/customers and GET /api/storefront-events.
   * Only the POST side of /api/customers was ever served, so the GET fell through
   * to the website's HTML 404 page and the screen showed zeroes.
   */
  test('the tracking screen can read its customers and events back', async ({ client, assert }) => {
    const tracked = await client.get('/api/customers').header('x-adonai-pin', SHOP_PIN)
    tracked.assertStatus(200)
    tracked.assertBodyContains({ ok: true })
    assert.isArray(tracked.body().customers)
    assert.isNumber(tracked.body().count)

    const events = await client.get('/api/storefront-events').header('x-adonai-pin', SHOP_PIN)
    events.assertStatus(200)
    assert.isArray(events.body().events)
  })

  /**
   * A cashier ringing the dispatch needs to read the rider's name off the order,
   * not look an id up somewhere else. Assigning a driver used to store only the
   * id, so a panel that did not join the two showed a bare DRV-1 or nothing.
   */
  test('an assigned order carries the name of the rider bringing it', async ({
    client,
    assert,
  }) => {
    const created = await client.post('/api/orders').json({
      name: 'Sarah Nabwire',
      phone: '+256701234567',
      items: [{ productId: 'canvas-sneakers', quantity: 1 }],
    })

    const driver = await client
      .post('/api/drivers')
      .header('x-adonai-pin', SHOP_PIN)
      .json({ name: 'Moses Kigozi', phone: '+256772111222' })

    const assigned = await client
      .post('/api/orders/assign-driver')
      .header('x-adonai-pin', SHOP_PIN)
      .json({ orderId: created.body().order.id, driverId: driver.body().driver.id })

    assigned.assertStatus(200)
    assert.equal(assigned.body().order.driver.name, 'Moses Kigozi')
    assert.equal(assigned.body().order.driver.phone, '+256772111222')
    assert.equal(assigned.body().order.status, 'dispatched')

    const queue = await client.get(`/api/orders?status=open`).header('x-adonai-pin', SHOP_PIN)
    const listed = queue
      .body()
      .orders.find((order: { id: string }) => order.id === created.body().order.id)
    assert.equal(listed.driver.name, 'Moses Kigozi', 'the queue must name the rider')
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

  test('keeps the name of each view beside the photo it describes', async ({ client }) => {
    const product = getBuiltInCatalogue().addProduct({
      name: 'Corduroy overshirt',
      price: 52000,
      gallery: ['/media/front.jpg', '/media/tag.jpg', '/media/wear.jpg'],
      galleryLabels: ['Front view', 'Label or tag', 'Texture close-up'],
    })

    const response = await client.get(`/api/products/${product.id}`)

    response.assertStatus(200)
    response.assertBodyContains({
      product: { galleryLabels: ['Front view', 'Label or tag', 'Texture close-up'] },
    })

    const page = await client.get(`/products/${product.id}`)

    page.assertStatus(200)
    page.assertTextIncludes('Front view')
    page.assertTextIncludes('Label or tag')
    page.assertTextIncludes('Texture close-up')
    // The alternative text names the view too, for anyone using a screen reader.
    page.assertTextIncludes('Corduroy overshirt — Label or tag')
  })

  test('an edit that never mentions the photos leaves their names alone', async ({ client }) => {
    const product = getBuiltInCatalogue().addProduct({
      name: 'Wool overcoat',
      price: 120000,
      gallery: ['/media/coat-front.jpg', '/media/coat-lining.jpg'],
      galleryLabels: ['Front view', 'Texture close-up'],
    })

    const changed = await client
      .put(`/api/products/${product.id}`)
      .header('x-adonai-pin', SHOP_PIN)
      .json({ price: 110000 })

    changed.assertStatus(200)
    changed.assertBodyContains({ product: { price: 110000 } })

    const listing = await client.get(`/api/products/${product.id}`)

    listing.assertBodyContains({
      product: { galleryLabels: ['Front view', 'Texture close-up'], gallery: product.gallery },
    })
  })

  test('a piece whose photos are not named looks exactly as it did before', async ({
    client,
    assert,
  }) => {
    const product = getBuiltInCatalogue().addProduct({
      name: 'Plain linen shirt',
      price: 30000,
      gallery: ['/media/shirt-a.jpg', '/media/shirt-b.jpg'],
    })

    const page = await client.get(`/products/${product.id}`)

    page.assertStatus(200)
    // No "Photo 1 of 2" caption and no empty badge unless the shop named the views.
    assert.notInclude(page.text(), 'Photo 1 of 2')
    assert.notInclude(page.text(), 'pointer-events-none absolute')
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
