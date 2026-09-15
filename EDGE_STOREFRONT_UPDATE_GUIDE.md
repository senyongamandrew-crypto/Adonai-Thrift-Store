# Step-by-step Adonai storefront update guide

This guide moves the existing Adonai customer storefront into modular AdonisJS
Edge views while preserving its information and backend behaviour.

## 1. Install and configure Tailwind

From the AdonisJS 7 / Node 24+ project root:

```bash
npm install @vinejs/vine@^4.4.0 @adonisjs/shield@^9.0.0
npm install -D tailwindcss postcss autoprefixer
node ace configure @adonisjs/shield
```

Copy `tailwind.config.js` into the project root. Ensure the Vite CSS entry imports
`resources/css/app.css` and the Vite entry imports `resources/js/app.js`.

The primary design tokens are:

- Purple action colour: `#6C5CE7`
- Purple hover: `#5748D2`
- Lavender highlight: `#F3F0FF`
- White/grey canvas: `#F8F8FB`
- Ink: `#16141F`

## 2. Add the Edge views

Copy the `resources/views` directory into the AdonisJS project. Register the
routes in the controller that already serves the storefront:

```ts
router.get('/', async ({ view }) => {
  const products = await catalogService.availableProducts()
  return view.render('pages/shop', {
    pageTitle: 'Adonai Thrift Store · One-of-one vintage',
    products: products.map(toEdgeProduct),
    categories: ['New in', 'Tops', 'Dresses', 'Bottoms', 'Outerwear', 'Shoes', 'Accessories'],
    bagCount: 0,
  })
})

router.get('/products/:id', async ({ params, view, response }) => {
  const product = await catalogService.findAvailableProduct(params.id)
  if (!product) return response.notFound()
  return view.render('pages/product', { pageTitle: `${product.name} · Adonai Thrift Store`, product: toEdgeProduct(product) })
})

router.get('/account/sign-in', ({ view }) => view.render('pages/auth', { mode: 'signin' }))
router.get('/account/sign-up', ({ view }) => view.render('pages/auth', { mode: 'signup' }))
```

Use the supplied `app/controllers/storefront_controller.ts`,
`app/services/storefront_services.ts` and `start/routes.ts` rather than leaving
an unimplemented `request.ctx.*` placeholder. The service adapter calls the
existing Flask/Gunicorn boundary for catalog, product detail, account, contact
and order operations; it forwards browser cookies server-to-server and copies
Flask auth `Set-Cookie` values back to the browser response. Set the private
`FLASK_API_BASE_URL` and optional `FLASK_INTERNAL_API_TOKEN` in server
configuration only.

The supplied `start/kernel.ts` registers production HTTPS enforcement, Shield
and the service context. The four public POST routes use the honeypot/rate-limit
middleware, and `app/validators/storefront.ts` performs VineJS validation with
normalized email/phone values, bounded checkout item arrays and GPS ranges.
Keep the existing session middleware enabled because Shield stores CSRF state in
session. Do not copy a password, payment secret or administrator credential
into any Edge template or JavaScript file.

For the complete environment, legal, SEO, media and deployment checklist, use
`PRODUCTION_READINESS_GUIDE.md`.

## 3. Announcement banner

The global layout includes `components/top_banner.edge`, a static contact notice
above the navigation. It uses a solid background and inline outline icon, with
confirmed Kampala phone and WhatsApp contacts. It has no autoplay, carousel,
or scroll-driven effect.

## 4. Preserve the existing information

Keep these current storefront facts and data paths unchanged:

- Business name: **Adonai Thrift Store**. Use the supplied primary logo artwork with the exact wording “Thrift Store”, not “Thrift Boutique”.
- Location: **Wakiso Kampala Uganda**.
- Currency: **UGX**.
- Contacts: `+256765652403` and `+256748992964`.
- Kampala delivery and Try & Confirm messaging.
- Live POS catalog, one-of-one availability and real product photos only.
- Existing customer account, order tracking, hold, checkout and storefront-event APIs.

The product card and detail component accept mapped catalog data; they do not
invent names, prices, photographs, stock or product attributes.

The global layout also includes `components/search_bar.edge` in desktop and
mobile positions. It submits `q`, filters rendered POS-backed cards by name,
category, brand, size and condition, keeps the query in the URL, and is
progressively compatible with server-side `q` filtering when the controller
passes `searchQuery` back to the view.

## 5. Replace views locally

Replace the existing customer-facing HTML view with `pages/home.edge` (the
legacy `pages/shop.edge` copy is retained for compatibility). Use
`pages/product.edge` for the single-product route and `pages/auth.edge` for
customer authentication. Keep the POS and administrator delivery dashboard as
separate surfaces.

Build the CSS entry and run the actual Adonis app locally:

```bash
npm run build:css
node ace serve --hmr
```

Check:

- mobile width around 360–430px;
- two-column product cards on mobile and four columns on wide screens;
- purple active pills and actions;
- product image fallback when the POS record has no real photo;
- size/colour selection and sticky Add to bag behaviour;
- account and checkout forms;
- order tracking and WhatsApp contact links.

## 6. Test before publishing

```bash
npm run build:css
npm run build:production
node ace test
```

Also run an accessibility pass: keyboard focus, colour contrast, labels,
`aria-label`s, and reduced-motion behaviour. Test the current catalog, empty
catalog, sold item, unavailable product, invalid login, checkout hold conflict,
and order tracking states.

## 7. Commit and push

```bash
git add resources/views resources/css/app.css resources/js/app.js tailwind.config.js
 git commit -m "Redesign Adonai storefront with modular Edge views"
git push origin main
```

## 8. Deploy the live domain

For CI/CD, push to the configured branch and let the host rebuild the Tailwind
assets and AdonisJS application. For a manual VPS deployment:

```bash
npm ci
npm run build:production
npm start
```

Keep the existing production API URL, SQLite/WAL storage, environment secrets,
and domain configuration. The redesign changes presentation only; it does not
change customer/order/catalog information.
