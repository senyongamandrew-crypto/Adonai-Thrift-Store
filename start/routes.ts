/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes of the customer
| storefront, the shop intake screen and the POS API. The intake screen is
| protected by a shop PIN; the catalogue endpoints are public to read and need
| the PIN to change anything.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const StorefrontController = () => import('#controllers/storefront_controller')
const AdminController = () => import('#controllers/admin_controller')
const PosApiController = () => import('#controllers/pos_api_controller')

router.get('/', [StorefrontController, 'home']).as('shop')
router.get('/products/:id', [StorefrontController, 'product']).as('product')
/* Where a customer lands after checking out. */
router.get('/orders/:id', [StorefrontController, 'order']).as('order')
router.get('/privacy', [StorefrontController, 'privacy']).as('privacy')
router.get('/terms', [StorefrontController, 'terms']).as('terms')
router.get('/sitemap.xml', [StorefrontController, 'sitemap']).as('sitemap')
router.get('/healthz', [StorefrontController, 'health']).as('health')

router.get('/account/sign-in', [StorefrontController, 'auth']).as('account.signIn')
router
  .post('/account/sign-in', [StorefrontController, 'signIn'])
  .as('account.signIn.submit')
  .use(middleware.formSpam())
router.get('/account/sign-up', [StorefrontController, 'auth']).as('account.signUp')
router
  .post('/account/sign-up', [StorefrontController, 'signUp'])
  .as('account.signUp.submit')
  .use(middleware.formSpam())

router.get('/contact', [StorefrontController, 'contactPage'])
router.post('/contact', [StorefrontController, 'contact']).use(middleware.formSpam())
router.get('/checkout', [StorefrontController, 'checkoutPage'])
router.post('/checkout', [StorefrontController, 'checkout']).use(middleware.formSpam())

/*
|--------------------------------------------------------------------------
| Shop intake (protected by the shop PIN)
|--------------------------------------------------------------------------
*/
router.get('/shop/intake', [AdminController, 'show']).as('intake')
router.post('/shop/intake/session', [AdminController, 'signIn']).as('intake.signIn')
router.post('/shop/intake/sign-out', [AdminController, 'signOut']).as('intake.signOut')
router.post('/shop/intake/products', [AdminController, 'createProduct']).as('intake.create')
router.post('/shop/intake/products/:id', [AdminController, 'updateProduct']).as('intake.update')
router.get('/shop/intake/backup', [AdminController, 'backup']).as('intake.backup')
router.post('/shop/intake/restore', [AdminController, 'restore']).as('intake.restore')

/*
|--------------------------------------------------------------------------
| POS API — the same catalogue, readable by the storefront, the mobile intake
| app or any future integration. Reads are public, writes need the shop PIN.
|--------------------------------------------------------------------------
*/
router.get('/api/health', [PosApiController, 'health'])

/* The catalogue, in both vocabularies: the website's and the POS's. */
router.get('/api/products', [PosApiController, 'products'])
router.get('/api/products/:id', [PosApiController, 'product'])
router.post('/api/products', [PosApiController, 'createProduct'])
router.put('/api/products/:id', [PosApiController, 'updateProduct'])
router.delete('/api/products/:id', [PosApiController, 'deleteProduct'])

router.get('/api/catalog', [PosApiController, 'catalog'])
router.get('/api/pos/catalog', [PosApiController, 'posCatalog'])
router.post('/api/pos/catalog', [PosApiController, 'savePosCatalog'])
router.post('/api/pos/intake', [PosApiController, 'createPosItem']).as('pos.intake')
router.post('/api/intake', [PosApiController, 'createPosItem']).as('api.intake')
router.post('/api/pos/catalog/delete', [PosApiController, 'deletePosCatalog'])

/*
  |--------------------------------------------------------------------------
  | The routes the shop's Android till calls
  |--------------------------------------------------------------------------
  | These names come from the POS application itself. Keeping them means the
  | phone works against this service unchanged, instead of the shop having to
  | run a second server.
  */
router.post('/api/pos/admin/session', [PosApiController, 'adminSession'])
router.post('/api/pos/orders', [PosApiController, 'createOrder']).as('pos.orders.create')
router.post('/api/pos/reset', [PosApiController, 'resetWorkspace'])

router.get('/api/orders', [PosApiController, 'listOrders']).as('orders.list')
router.post('/api/orders', [PosApiController, 'createOrder']).as('orders.create')
router.post('/api/orders/assign-driver', [PosApiController, 'assignDriver'])

router.post('/api/catalog/hold', [PosApiController, 'holdCatalogItem'])
router.post('/api/catalog/release', [PosApiController, 'releaseCatalogItem'])

router.post('/api/customers', [PosApiController, 'upsertCustomer'])
/** The till's tracking screen reads this address; only a POST used to answer. */
router
  .get('/api/customers', [PosApiController, 'customerTrackingPlain'])
  .as('pos.customers.tracking')
router
  .get('/api/pos/customers', [PosApiController, 'customerTrackingPlain'])
  .as('pos.customers.alias')
router.post('/api/storefront-events', [PosApiController, 'storefrontEvent'])
router.get('/api/storefront-events', [PosApiController, 'storefrontEvents'])
router.get('/api/admin/customer-tracking', [PosApiController, 'customerTracking'])

router.get('/api/deliveries/active', [PosApiController, 'activeDeliveries'])
router.get('/api/drivers', [PosApiController, 'drivers']).as('drivers.list')
router.post('/api/drivers', [PosApiController, 'drivers']).as('drivers.create')
router.post('/api/driver/location', [PosApiController, 'driverLocation'])

router.post('/api/media/upload', [PosApiController, 'uploadMedia'])
router.get('/api/media', [PosApiController, 'listMedia'])
router.post('/api/media/delete', [PosApiController, 'deleteMedia'])
router.get('/media/:key', [PosApiController, 'serveMedia'])

router.post('/api/contact', [PosApiController, 'contact'])

router.any('*', [StorefrontController, 'notFound'])
