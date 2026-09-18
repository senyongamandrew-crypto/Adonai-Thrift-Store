import { test } from '@japa/runner'
import env from '#start/env'
import { getBuiltInCatalogue } from '#services/storefront_services'

/**
 * The contract the shop's Android till (Adonai Thrift Store POS) expects.
 *
 * These tests speak the phone's language on purpose: the field names, the
 * headers and the status words come from the POS application's own guide, not
 * from this service's preferences. They exist because the shop's complaint was
 * that a piece entered on the phone never appeared on the website, and nothing
 * here should ever be able to break that again.
 */
const SHOP_PIN = '7890'

/** The phone asks for a token once, then sends it instead of the PIN. */
async function signIn(client: { post: (url: string) => any }) {
  const response = await client.post('/api/pos/admin/session').json({ pin: SHOP_PIN })
  response.assertStatus(200)
  return response.body().token as string
}

test.group('POS application contract', (group) => {
  group.each.setup(() => {
    getBuiltInCatalogue().replaceProducts([])
    getBuiltInCatalogue().resetWorkspace({ includeCatalogue: false })
  })

  group.each.teardown(() => {
    getBuiltInCatalogue().replaceProducts([])
    getBuiltInCatalogue().resetWorkspace({ includeCatalogue: false })
  })

  test('the connection test answers with what the phone looks for', async ({ client }) => {
    const response = await client.get('/api/health')

    response.assertStatus(200)
    response.assertBodyContains({ ok: true, status: 'ok', catalog: 'ok' })
  })

  test('the PIN buys a session token, and a wrong PIN buys nothing', async ({ client }) => {
    const good = await client.post('/api/pos/admin/session').json({ pin: SHOP_PIN })
    good.assertStatus(200)
    good.assertBodyContains({ ok: true })
    if (!good.body().token) throw new Error('the phone needs a token to continue')

    const bad = await client.post('/api/pos/admin/session').json({ pin: '1111' })
    bad.assertStatus(401)
    bad.assertBodyContains({ ok: false })
  })

  test('the PIN works as a header too, for callers that skip the token step', async ({
    client,
  }) => {
    const response = await client.post('/api/pos/catalog').header('x-adonai-pin', SHOP_PIN).json({
      name: 'Header jacket',
      price: 12000,
    })

    response.assertStatus(201)
  })

  test('an item added by the phone appears on the website', async ({ client }) => {
    const token = await signIn(client)

    const created = await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({
        sku: 'JKT-001',
        title: 'Vintage denim jacket',
        price: '45000',
        cost: '20000',
        category: 'Outerwear',
        size: 'M',
        condition: 'Grade A',
        bin: 'B12',
        quantity: 1,
        status: 'available',
        description: 'Stone-washed denim, no marks.',
      })

    created.assertStatus(201)
    created.assertBodyContains({ ok: true })

    const publicCatalogue = await client.get('/api/catalog')
    publicCatalogue.assertStatus(200)
    publicCatalogue.assertBodyContains({ ok: true, count: 1 })
    if (publicCatalogue.body().items.length !== 1) throw new Error('the website sees nothing')
    if (publicCatalogue.body().items[0].name !== 'Vintage denim jacket') {
      throw new Error('the item arrived under an unexpected name')
    }
  })

  test('the till reads its own fields back, so its list looks unchanged', async ({ client }) => {
    const token = await signIn(client)

    await client.post('/api/pos/catalog').header('x-adonai-admin-session', token).json({
      sku: 'BAG-7',
      title: 'Canvas tote bag',
      price: '25000',
      cost: '9000',
      bin: 'C3',
      quantity: 2,
      condition: 'Grade B',
    })

    const list = await client.get('/api/pos/catalog').header('x-adonai-admin-session', token)
    list.assertStatus(200)

    const item = list.body().items[0]
    if (item.sku !== 'BAG-7') throw new Error('the stock code was lost')
    if (item.bin !== 'C3') throw new Error('the bin location was lost')
    if (item.cost !== 9000) throw new Error('the cost price was lost')
    if (item.name !== 'Canvas tote bag') throw new Error('the title was not read as the name')
    if (item.price !== 25000) throw new Error('a price sent as text was not read as a number')
  })

  test('a queued write that is sent twice updates the piece instead of duplicating it', async ({
    client,
  }) => {
    const token = await signIn(client)
    const body = { sku: 'ONE-1', title: 'One of one jacket', price: 30000 }

    await client.post('/api/pos/catalog').header('x-adonai-admin-session', token).json(body)
    const again = await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({ ...body, price: 28000 })

    again.assertStatus(200)
    const list = await client.get('/api/pos/catalog').header('x-adonai-admin-session', token)
    if (list.body().count !== 1) throw new Error('the retry created a second listing of a one-off')
    if (list.body().items[0].price !== 28000) throw new Error('the changed price was not applied')
  })

  test('marking a piece sold hides it from customers but not from the shop', async ({ client }) => {
    const token = await signIn(client)
    await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({ sku: 'SOL-1', title: 'Sold jacket', price: 20000, status: 'available' })

    await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({ sku: 'SOL-1', status: 'sold', quantity: 0 })

    const publicCatalogue = await client.get('/api/catalog')
    if (publicCatalogue.body().count !== 0) throw new Error('a sold piece is still offered')

    const tillList = await client.get('/api/pos/catalog').header('x-adonai-admin-session', token)
    if (tillList.body().count !== 1) throw new Error('the shop lost sight of its own sold piece')
    if (tillList.body().items[0].status !== 'sold') throw new Error('the status word was lost')
  })

  test('a piece with no stock left is treated as sold', async ({ client }) => {
    const token = await signIn(client)
    await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({ sku: 'EMP-1', title: 'Last one', price: 15000, quantity: 1 })

    await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({ sku: 'EMP-1', quantity: 0 })

    const publicCatalogue = await client.get('/api/catalog')
    if (publicCatalogue.body().count !== 0) {
      throw new Error('an item with no stock left is still offered to customers')
    }
  })

  test('the phone can remove a piece for good', async ({ client }) => {
    const token = await signIn(client)
    await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({ sku: 'DEL-1', title: 'Gone tomorrow', price: 10000 })

    const removed = await client
      .post('/api/pos/catalog/delete')
      .header('x-adonai-admin-session', token)
      .json({ id: 'DEL-1' })

    removed.assertStatus(200)
    const publicCatalogue = await client.get('/api/catalog')
    if (publicCatalogue.body().count !== 0) throw new Error('a deleted piece is still on the site')
  })

  test('writes are refused without the PIN or a token', async ({ client }) => {
    const noProof = await client.post('/api/pos/catalog').json({ title: 'Smuggled jacket' })
    noProof.assertStatus(401)

    const wrongToken = await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', 'not-a-real-token')
      .json({ title: 'Smuggled jacket' })
    wrongToken.assertStatus(401)

    const deleteWithout = await client.post('/api/pos/catalog/delete').json({ id: 'anything' })
    deleteWithout.assertStatus(401)
  })

  test('a phone answering with no origin is allowed to reach the API', async ({ client }) => {
    /**
     * An Android WebView loads its screens from file://, and the browser labels
     * that origin as the literal string "null". Without these headers the phone
     * discards every reply and shows "Failed to fetch".
     */
    const preflight = await client
      .options('/api/pos/catalog')
      .header('origin', 'null')
      .header('access-control-request-method', 'POST')

    preflight.assertStatus(204)
    for (const header of [
      'access-control-allow-origin',
      'access-control-allow-methods',
      'access-control-allow-headers',
    ]) {
      if (!preflight.header(header)) throw new Error(`the phone needs the ${header} header`)
    }

    if (!/\bx-adonai-admin-session\b/i.test(preflight.header('access-control-allow-headers')!)) {
      throw new Error('the phone sends its session token in a header that must be allowed')
    }
  })

  test('a driver position keeps its decimals', async ({ client }) => {
    const token = await signIn(client)
    await client.post('/api/drivers').header('x-adonai-admin-session', token).json({
      id: 'DRV-1',
      name: 'Moses',
      phone: '+256700000002',
    })

    const saved = await client
      .post('/api/driver/location')
      .header('x-adonai-admin-session', token)
      .json({ driverId: 'DRV-1', latitude: 0.3476, longitude: 32.5825 })

    saved.assertStatus(200)
    /**
     * Prices are whole shillings, but a coordinate is not a price: rounding
     * 0.3476 to 0 would put a delivery in the sea.
     */
    if (saved.body().driver.latitude !== 0.3476) throw new Error('the latitude was rounded')
    if (saved.body().driver.longitude !== 32.5825) throw new Error('the longitude was rounded')
  })

  test('an impossible driver position is refused', async ({ client }) => {
    const token = await signIn(client)
    await client
      .post('/api/drivers')
      .header('x-adonai-admin-session', token)
      .json({ id: 'DRV-2', name: 'Peter' })

    const response = await client
      .post('/api/driver/location')
      .header('x-adonai-admin-session', token)
      .json({ driverId: 'DRV-2', latitude: 999, longitude: 32 })

    response.assertStatus(400)
  })

  test('the delivery dashboard is closed to anyone without the PIN', async ({ client }) => {
    const response = await client.get('/api/deliveries/active')

    response.assertStatus(401)
  })

  test('an order is recorded, assigned and found again by phone number', async ({ client }) => {
    const token = await signIn(client)
    await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({ sku: 'ORD-ITEM', title: 'Ordered jacket', price: 30000 })

    const placed = await client.post('/api/orders').json({
      name: 'Grace Nakato',
      phone: '+256700000001',
      address: 'Plot 12 Kampala Road',
      city: 'Kampala',
      paymentMethod: 'Cash on delivery',
      items: [{ productId: 'ORD-ITEM', quantity: 1 }],
    })

    placed.assertStatus(201)
    const orderId = placed.body().id as string

    const byPhone = await client.get('/api/orders').qs({ phone: '+256700000001' })
    byPhone.assertStatus(200)
    if (byPhone.body().count !== 1) throw new Error('the shop cannot find the order by phone')
    if (byPhone.body().orders[0].customer.name !== 'Grace Nakato') {
      throw new Error('the customer name was not kept with the order')
    }

    await client
      .post('/api/drivers')
      .header('x-adonai-admin-session', token)
      .json({ id: 'DRV-3', name: 'Sarah' })
    const assigned = await client
      .post('/api/orders/assign-driver')
      .header('x-adonai-admin-session', token)
      .json({ orderId, driverId: 'DRV-3' })

    assigned.assertStatus(200)
    assigned.assertBodyContains({ ok: true })

    const deliveries = await client
      .get('/api/deliveries/active')
      .header('x-adonai-admin-session', token)
    if (deliveries.body().orders.length !== 1) throw new Error('the delivery queue lost the order')
    if (deliveries.body().orders[0].driverId !== 'DRV-3') throw new Error('the driver was not kept')
  })

  test('a customer checking out lands on a confirmation page, not an error', async ({ client }) => {
    const token = await signIn(client)
    await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({ sku: 'CONF-1', title: 'Confirmed jacket', price: 42000 })

    const placed = await client.post('/api/orders').json({
      name: 'Peter Okello',
      phone: '+256700000003',
      address: 'Ntinda',
      city: 'Kampala',
      paymentMethod: 'Cash on delivery',
      items: [{ productId: 'CONF-1', quantity: 1 }],
    })

    const page = await client.get(`/orders/${placed.body().id}`)

    page.assertStatus(200)
  })

  test('holding a one-off piece takes it off the website until it is released', async ({
    client,
  }) => {
    const token = await signIn(client)
    await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({ id: 'HOLD-1', title: 'Reserved jacket', price: 30000 })

    const held = await client.post('/api/catalog/hold').json({ id: 'HOLD-1' })
    held.assertStatus(200)

    const whileHeld = await client.get('/api/catalog')
    if (whileHeld.body().count !== 0) throw new Error('a reserved piece is still for sale')

    const released = await client.post('/api/catalog/release').json({ id: 'HOLD-1' })
    released.assertStatus(200)

    const afterRelease = await client.get('/api/catalog')
    if (afterRelease.body().count !== 1) throw new Error('the piece never came back')
  })

  test('taking a piece that is already reserved is refused', async ({ client }) => {
    const token = await signIn(client)
    await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({ id: 'HOLD-2', title: 'Only one', price: 30000, status: 'sold' })

    const response = await client.post('/api/catalog/hold').json({ id: 'HOLD-2' })

    response.assertStatus(409)
  })

  test('the shop can upload a photo and the website serves it back', async ({ client }) => {
    const token = await signIn(client)

    /** A one pixel PNG: the smallest thing that is genuinely an image. */
    const pixel =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

    const uploaded = await client
      .post('/api/media/upload')
      .header('x-adonai-admin-session', token)
      .json({ data: pixel, contentType: 'image/png' })

    uploaded.assertStatus(201)
    const url = uploaded.body().url as string

    const served = await client.get(url)
    served.assertStatus(200)
    if (!/image\/png/.test(served.header('content-type') || '')) {
      throw new Error('the photo came back as the wrong kind of file')
    }
  })

  test('something that is not an image cannot be uploaded', async ({ client }) => {
    const token = await signIn(client)

    const response = await client
      .post('/api/media/upload')
      .header('x-adonai-admin-session', token)
      .json({ data: Buffer.from('rm -rf /').toString('base64'), contentType: 'text/plain' })

    response.assertStatus(400)
  })

  test('the media list is closed to anyone without the PIN', async ({ client }) => {
    const response = await client.get('/api/media')

    response.assertStatus(401)
  })

  test('the shop can clear its trading records without losing the catalogue', async ({
    client,
  }) => {
    const token = await signIn(client)
    await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({ title: 'Kept jacket', price: 20000 })
    await client.post('/api/orders').json({ name: 'Someone', phone: '+256700000004' })

    const reset = await client
      .post('/api/pos/reset')
      .header('x-adonai-admin-session', token)
      .json({})

    reset.assertStatus(200)
    const health = await client.get('/api/health')
    if (health.body().counts.orders !== 0) throw new Error('the records were not cleared')
    if (health.body().counts.products !== 1) throw new Error('the catalogue should have been kept')
  })
})

test.group('The phone and the website read one catalogue', (group) => {
  /**
   * The storefront prefers an external POS API when one is configured. These
   * tests remove it so the built-in catalogue answers, which is how the shop
   * runs with no second service.
   */
  const originalGet = env.get.bind(env)

  group.each.setup(() => {
    env.get = ((key: string) =>
      key === 'FLASK_API_BASE_URL' ? '' : originalGet(key)) as typeof env.get
    getBuiltInCatalogue().replaceProducts([])
  })

  group.each.teardown(() => {
    env.get = originalGet as typeof env.get
    getBuiltInCatalogue().replaceProducts([])
  })

  test('a piece entered on the phone is on the shop page with its price', async ({ client }) => {
    const token = await signIn(client)
    await client.post('/api/pos/catalog').header('x-adonai-admin-session', token).json({
      sku: 'WEB-1',
      title: 'Handmade leather sandals',
      price: '35000',
      size: '42',
      status: 'available',
    })

    const home = await client.get('/')
    home.assertStatus(200)
    if (!home.text().includes('Handmade leather sandals')) {
      throw new Error('the piece the shop just entered is not on the website')
    }
    if (!home.text().includes('UGX 35,000')) {
      throw new Error("the price is not shown in the shop's own currency format")
    }
  })

  test('marking it sold takes it off the shop page', async ({ client }) => {
    const token = await signIn(client)
    await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({ sku: 'WEB-2', title: 'Sold out boots', price: 60000 })

    await client
      .post('/api/pos/catalog')
      .header('x-adonai-admin-session', token)
      .json({ sku: 'WEB-2', status: 'sold' })

    const home = await client.get('/')
    if (home.text().includes('Sold out boots')) {
      throw new Error('a sold piece is still being offered to customers')
    }
  })
})
