/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The "Env.create" method reads the ".env" file, validates the values against
| the schema defined below and exposes them to the rest of the application.
|
| Adding a new environment variable? Add it here first, otherwise the value
| will not be readable via "env.get(...)".
|
*/

import { Env } from '@adonisjs/core/env'

const APP_ROOT = new URL('../', import.meta.url)

export default await Env.create(APP_ROOT, {
  /*
  |--------------------------------------------------------------------------
  | Application
  |--------------------------------------------------------------------------
  */
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  HOST: Env.schema.string(),
  PORT: Env.schema.number(),
  LOG_LEVEL: Env.schema.string(),
  APP_NAME: Env.schema.string(),
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),
  SITE_URL: Env.schema.string({ format: 'url', tld: false }),
  SESSION_DRIVER: Env.schema.enum(['cookie'] as const),

  /**
   * Redirect plain HTTP requests to HTTPS in production. Set to "false" on a
   * local preview, or when the hosting platform terminates TLS without
   * forwarding the original protocol (otherwise the redirect can loop).
   */
  FORCE_HTTPS: Env.schema.boolean.optional(),

  /*
  |--------------------------------------------------------------------------
  | Private storefront API boundary (Flask / POS backend)
  |--------------------------------------------------------------------------
  |
  | These values are server side only. They must never be rendered into a
  | page or a client-side JavaScript file.
  */
  FLASK_API_BASE_URL: Env.schema.string({ format: 'url', tld: false }),
  FLASK_INTERNAL_API_TOKEN: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Storage and payments
  |--------------------------------------------------------------------------
  */
  DB_CONNECTION: Env.schema.enum(['sqlite', 'pg'] as const),
  DATABASE_URL: Env.schema.string.optional(),
  PAYMENT_PUBLIC_KEY: Env.schema.string.optional(),
  PAYMENT_SECRET_KEY: Env.schema.string.optional(),
  ADONAI_MEDIA_DIR: Env.schema.string.optional(),
  ADONAI_MEDIA_MAX_FILE_BYTES: Env.schema.number.optional(),
  ADONAI_MEDIA_QUOTA_BYTES: Env.schema.number.optional(),

  /*
  |--------------------------------------------------------------------------
  | Optional analytics (loaded only when configured)
  |--------------------------------------------------------------------------
  */
  ANALYTICS_PROVIDER: Env.schema.enum(['none', 'plausible', 'ga4'] as const),
  ANALYTICS_DOMAIN: Env.schema.string.optional(),
  GA4_MEASUREMENT_ID: Env.schema.string.optional(),
})
