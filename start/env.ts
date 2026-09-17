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
  APP_URL: Env.schema.string.optional({ format: 'url', tld: false }),
  SITE_URL: Env.schema.string.optional({ format: 'url', tld: false }),
  SESSION_DRIVER: Env.schema.enum(['cookie'] as const),

  /**
   * Redirect plain HTTP requests to HTTPS in production. Set to "false" on a
   * local preview, or when the hosting platform terminates TLS without
   * forwarding the original protocol (otherwise the redirect can loop).
   */
  FORCE_HTTPS: Env.schema.boolean.optional(),

  /**
   * Drop the X-Frame-Options: DENY header so the storefront can be embedded in
   * an iframe. Only for preview/sandbox environments — leave it off in
   * production so clickjacking stays blocked.
   */
  ALLOW_FRAME_EMBEDDING: Env.schema.boolean.optional(),

  /*
  |--------------------------------------------------------------------------
  | Storefront wording (editable from the hosting dashboard)
  |--------------------------------------------------------------------------
  |
  | All optional. When a value is missing or blank the storefront falls back to
  | the wording it has always used, so the site never breaks and never blanks
  | out a phone number. See app/services/site_settings.ts for the defaults.
  |
  | These are rendered into public pages, so never put a secret in them.
  */
  WHATSAPP_NUMBER: Env.schema.string.optional(),
  CALL_NUMBER: Env.schema.string.optional(),
  BANNER_TEXT: Env.schema.string.optional(),
  DELIVERY_NOTE: Env.schema.string.optional(),
  HERO_HEADLINE: Env.schema.string.optional(),
  PROMO_BANNER: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Private storefront API boundary (Flask / POS backend)
  |--------------------------------------------------------------------------
  |
  | These values are server side only. They must never be rendered into a
  | page or a client-side JavaScript file.
  */
  /**
   * Shop PIN for the intake screen and catalogue write endpoints. Stored here
   * rather than in code so it can be changed from the hosting dashboard. When
   * unset the shop uses the built-in 7890 and the intake screen asks for it to
   * be changed.
   */
  ADMIN_PIN: Env.schema.string.optional(),

  /**
   * The catalogue that ships with this service answers the storefront when no
   * separate POS API is configured. Set to "false" to switch it off and go back
   * to showing "catalog is being connected" until a POS API is provided.
   */
  ADONAI_BUILTIN_CATALOGUE: Env.schema.boolean.optional(),

  /**
   * Public JSON snapshot of the catalogue. On a cold start with an empty disk,
   * the catalogue is restored from here. See the snapshot workflow.
   */
  CATALOGUE_SNAPSHOT_URL: Env.schema.string.optional(),

  /**
   * Private base URL of the Flask / POS backend. Optional: when it is not set
   * the storefront still runs and explains that the catalog is not connected
   * yet instead of failing. Server side only — never expose it to the browser.
   */
  FLASK_API_BASE_URL: Env.schema.string.optional({ format: 'url', tld: false }),
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
