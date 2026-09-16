/*
|--------------------------------------------------------------------------
| Storefront settings you can edit from the hosting dashboard
|--------------------------------------------------------------------------
|
| Every value below is read from an environment variable, and falls back to
| the wording that has always shipped with the storefront. That means the site
| renders exactly the same when nothing is configured, and the shop owner can
| change a phone number or the headline from the Render dashboard (Environment
| tab) without touching a single file.
|
| Anything edited here is plain text only. The phone numbers are turned into
| working "tel:" and WhatsApp links automatically, and a blank value falls back
| to the default below rather than leaving a gap on the page.
|
| Add the matching entry to "start/env.ts" and ".env.example" when you add a
| new setting.
|
*/

import env from '#start/env'

/**
 * The wording used when the corresponding environment variable is not set.
 */
const DEFAULT_WHATSAPP_NUMBER = '+256765652403'
const DEFAULT_CALL_NUMBER = '+256748992964'
const DEFAULT_BANNER_TEXT = 'Shop locally in Kampala.'
const DEFAULT_DELIVERY_NOTE = 'Kampala delivery available'
const DEFAULT_HERO_HEADLINE = 'Handpicked Grade-A Thrift and Vintage Clothing in Kampala'

/**
 * Use the configured value when it holds something, otherwise the default.
 * A value that is missing, empty or only spaces never blanks out the page.
 */
function orDefault(configured: string | undefined, fallback: string): string {
  const trimmed = (configured ?? '').trim()
  return trimmed === '' ? fallback : trimmed
}

/**
 * "+256 765 652 403", "256765652403" and "0752 123 456" all reduce to digits,
 * so the links keep working however the number is typed in the dashboard.
 *
 * A local number written with a leading zero ("0765 652 403") is converted to
 * the international form, the way a phone would dial it.
 */
function digitsOnly(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 10) {
    return `256${digits.slice(1)}`
  }
  return digits
}

/**
 * The compact form used in links: "+256765652403".
 */
function compact(value: string): string {
  return `+${digitsOnly(value)}`
}

/**
 * The readable form used in prose: "+256 765 652 403".
 */
function readable(value: string): string {
  const digits = digitsOnly(value)
  if (digits.startsWith('256') && digits.length === 12) {
    return `+256 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9, 12)}`
  }
  return `+${digits}`
}

const whatsappNumber = orDefault(env.get('WHATSAPP_NUMBER'), DEFAULT_WHATSAPP_NUMBER)
const callNumber = orDefault(env.get('CALL_NUMBER'), DEFAULT_CALL_NUMBER)

/**
 * Shared with every Edge template as the "site" global, see start/edge.ts.
 */
export const siteSettings = Object.freeze({
  /** WhatsApp, e.g. "WhatsApp {{ site.whatsappNumber }}" and href targets. */
  whatsappNumber: compact(whatsappNumber),
  whatsappDisplay: readable(whatsappNumber),
  whatsappLink: `https://wa.me/${digitsOnly(whatsappNumber)}`,

  /** Phone calls: same treatment as WhatsApp. */
  callNumber: compact(callNumber),
  callDisplay: readable(callNumber),
  callLink: `tel:+${digitsOnly(callNumber)}`,

  /** The opening sentence of the strip at the top of every page. */
  bannerText: orDefault(env.get('BANNER_TEXT'), DEFAULT_BANNER_TEXT),

  /** The short delivery promise shown next to the contact banner. */
  deliveryNote: orDefault(env.get('DELIVERY_NOTE'), DEFAULT_DELIVERY_NOTE),

  /** The large headline on the home and shop pages. */
  heroHeadline: orDefault(env.get('HERO_HEADLINE'), DEFAULT_HERO_HEADLINE),

  /** Promo strip. Empty by default, which hides it completely. */
  promoBanner: (env.get('PROMO_BANNER') ?? '').trim(),
})

export default siteSettings
