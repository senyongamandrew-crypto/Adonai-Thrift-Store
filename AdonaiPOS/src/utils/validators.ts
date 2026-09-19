export const phoneRule = /^\+?[0-9][0-9\s().-]{6,22}$/

export function isValidPhone(v: string): boolean {
  return phoneRule.test(v.trim())
}

export function isValidPin(v: string): boolean {
  return /^\d{4,6}$/.test(v.trim())
}

export function validateIntake(payload: {
  name?: string
  sku?: string
  price?: unknown
  stockQuantity?: unknown
  images?: { isPrimary?: boolean }[]
}): string | null {
  if (!payload.name?.trim() || !payload.sku?.trim() || payload.price === undefined || payload.stockQuantity === undefined)
    return 'Missing required fields: name, sku, price, stockQuantity.'
  const qty = Number(payload.stockQuantity)
  if (Number.isFinite(qty) && qty < 0) return 'Stock quantity cannot be negative.'
  if (!Array.isArray(payload.images) || payload.images.length === 0) return 'At least one image (Front View) required.'
  const primaries = payload.images.filter((i) => i.isPrimary === true)
  if (primaries.length !== 1) return 'Exactly one image must be marked as the primary (Front) view.'
  return null
}
