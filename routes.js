import router from '@adonisjs/core/services/router';
import { middleware } from '#start/kernel';
import StorefrontController from '#controllers/storefront_controller';
router.get('/', [StorefrontController, 'home']).as('shop');
router.get('/products/:id', [StorefrontController, 'product']).as('product');
router.get('/privacy', [StorefrontController, 'privacy']).as('privacy');
router.get('/terms', [StorefrontController, 'terms']).as('terms');
router.get('/sitemap.xml', [StorefrontController, 'sitemap']).as('sitemap');
router.get('/account/sign-in', [StorefrontController, 'auth']).as('account.signIn');
router.post('/account/sign-in', [StorefrontController, 'signIn']).as('account.signIn.submit').use(middleware.formSpam());
router.get('/account/sign-up', [StorefrontController, 'auth']).as('account.signUp');
router.post('/account/sign-up', [StorefrontController, 'signUp']).as('account.signUp.submit').use(middleware.formSpam());
router.get('/contact', [StorefrontController, 'contactPage']);
router.post('/contact', [StorefrontController, 'contact']).use(middleware.formSpam());
router.get('/checkout', [StorefrontController, 'checkoutPage']);
router.post('/checkout', [StorefrontController, 'checkout']).use(middleware.formSpam());
router.any('*', [StorefrontController, 'notFound']);
//# sourceMappingURL=routes.js.map