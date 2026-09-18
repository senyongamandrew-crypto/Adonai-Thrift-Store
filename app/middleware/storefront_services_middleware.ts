import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { createStorefrontServices, type StorefrontServices } from '#services/storefront_services'

export type StorefrontView = {
  render: (template: string, data?: Record<string, unknown>) => unknown
}

export type StorefrontHttpContext = HttpContext & {
  storefront: StorefrontServices
  view: StorefrontView
  session: { flash: (key: string, value: string) => void }
}

export default class StorefrontServicesMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const storefrontContext = ctx as StorefrontHttpContext
    storefrontContext.storefront = createStorefrontServices(ctx.request.header('cookie'))
    return next()
  }
}
