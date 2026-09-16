import vine from '@vinejs/vine'

const phoneRule = /^\+?[0-9][0-9\s().-]{6,22}$/
const identifierRule = /^(?:[^\s@]+@[^\s@]+\.[^\s@]+|\+?[0-9][0-9\s().-]{6,22})$/
const blankHoneypot = vine.string().trim().maxLength(0).optional()
const phoneField = () =>
  vine
    .string()
    .trim()
    .maxLength(30)
    .regex(phoneRule)
    .transform((value: string) => value.replace(/[()\s.-]/g, ''))
const emailField = () => vine.string().trim().maxLength(180).email().normalizeEmail()
const orderItemField = vine.object({
  productId: vine.string().trim().minLength(1).maxLength(120),
  quantity: vine.number().min(1).max(10),
})
const latitudeField = vine.number().min(-90).max(90).optional()
const longitudeField = vine.number().min(-180).max(180).optional()

export const signInValidator = vine.compile(
  vine.object({
    identifier: vine
      .string()
      .trim()
      .minLength(3)
      .maxLength(180)
      .regex(identifierRule)
      .transform((value: string) =>
        value.includes('@') ? value.toLowerCase() : value.replace(/[()\s.-]/g, '')
      ),
    password: vine.string().minLength(8).maxLength(128),
    remember: vine.boolean().optional(),
    website: blankHoneypot,
  })
)

export const signUpValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(120),
    email: emailField(),
    phone: phoneField(),
    password: vine.string().minLength(8).maxLength(128),
    marketingConsent: vine.boolean().optional(),
    website: blankHoneypot,
  })
)

export const contactValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(120),
    email: emailField(),
    phone: phoneField(),
    message: vine.string().trim().minLength(10).maxLength(2000),
    website: blankHoneypot,
  })
)

export const checkoutValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(120),
    email: emailField().optional(),
    phone: phoneField(),
    address: vine.string().trim().minLength(5).maxLength(300),
    city: vine.string().trim().minLength(2).maxLength(80),
    note: vine.string().trim().maxLength(300).optional(),
    paymentMethod: vine.enum(['Cash on delivery', 'Mobile money']),
    terms: vine.boolean(),
    items: vine.array(orderItemField).maxLength(100).optional(),
    latitude: latitudeField,
    longitude: longitudeField,
    website: blankHoneypot,
  })
)

/** Use only from the administrator-protected delivery assignment route. */
export const driverAssignmentValidator = vine.compile(
  vine.object({
    deliveryId: vine.string().trim().minLength(1).maxLength(120),
    driverId: vine.string().trim().minLength(1).maxLength(120),
    latitude: vine.number().min(-90).max(90),
    longitude: vine.number().min(-180).max(180),
  })
)
