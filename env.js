import { Env } from '@adonisjs/core/env';
const APP_ROOT = new URL('../', import.meta.url);
export default await Env.create(APP_ROOT, {
    NODE_ENV: Env.schema.enum(['development', 'production', 'test']),
    HOST: Env.schema.string(),
    PORT: Env.schema.number(),
    LOG_LEVEL: Env.schema.string(),
    APP_NAME: Env.schema.string(),
    APP_KEY: Env.schema.secret(),
    APP_URL: Env.schema.string({ format: 'url', tld: false }),
    SITE_URL: Env.schema.string({ format: 'url', tld: false }),
    SESSION_DRIVER: Env.schema.enum(['cookie']),
    FLASK_API_BASE_URL: Env.schema.string({ format: 'url', tld: false }),
    FLASK_INTERNAL_API_TOKEN: Env.schema.string.optional(),
    DB_CONNECTION: Env.schema.enum(['sqlite', 'pg']),
    DATABASE_URL: Env.schema.string.optional(),
    PAYMENT_PUBLIC_KEY: Env.schema.string.optional(),
    PAYMENT_SECRET_KEY: Env.schema.string.optional(),
    ADONAI_MEDIA_DIR: Env.schema.string.optional(),
    ADONAI_MEDIA_MAX_FILE_BYTES: Env.schema.number.optional(),
    ADONAI_MEDIA_QUOTA_BYTES: Env.schema.number.optional(),
    ANALYTICS_PROVIDER: Env.schema.enum(['none', 'plausible', 'ga4']),
    ANALYTICS_DOMAIN: Env.schema.string.optional(),
    GA4_MEASUREMENT_ID: Env.schema.string.optional(),
});
//# sourceMappingURL=env.js.map