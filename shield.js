import { defineConfig } from '@adonisjs/shield';
export default defineConfig({
    csrf: {
        enabled: true,
        exceptRoutes: [],
        enableXsrfCookie: true,
        methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    },
    hsts: {
        enabled: true,
        maxAge: '180 days',
        includeSubDomains: true,
    },
    xFrame: {
        enabled: true,
        action: 'DENY',
    },
    contentTypeSniffing: {
        enabled: true,
    },
});
//# sourceMappingURL=shield.js.map