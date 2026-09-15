import router from '@adonisjs/core/services/router';
import server from '@adonisjs/core/services/server';
server.errorHandler(() => import('#exceptions/handler'));
server.use([
    () => import('#middleware/force_https_middleware'),
    () => import('@adonisjs/static/static_middleware'),
    () => import('@adonisjs/vite/vite_middleware'),
]);
router.use([
    () => import('@adonisjs/core/bodyparser_middleware'),
    () => import('@adonisjs/session/session_middleware'),
    () => import('@adonisjs/shield/shield_middleware'),
    () => import('#middleware/storefront_services_middleware'),
]);
export const middleware = router.named({
    formSpam: () => import('#middleware/form_spam_middleware'),
});
//# sourceMappingURL=kernel.js.map