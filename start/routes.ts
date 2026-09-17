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
router.get('/api/products', [PosApiController, 'products'])
router.get('/api/products/:id', [PosApiController, 'product'])
router.post('/api/products', [PosApiController, 'createProduct'])
router.put('/api/products/:id', [PosApiController, 'updateProduct'])
router.delete('/api/products/:id', [PosApiController, 'deleteProduct'])
router.post('/api/orders', [PosApiController, 'createOrder'])
router.post('/api/contact', [PosApiController, 'contact'])

router.any('*', [StorefrontController, 'notFound'])
