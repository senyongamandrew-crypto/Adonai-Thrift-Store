# Adonai Thrift Store — customer storefront

The public storefront for **Adonai Thrift Store** (Wakiso, Kampala, Uganda):
one-of-one thrift and vintage clothing, prices in **UGX**, Kampala delivery and
Try & Confirm on eligible orders.

The storefront is an [AdonisJS 7](https://adonisjs.com) application that renders
[Edge](https://edgejs.dev) views styled with Tailwind CSS. Catalog, accounts,
orders and storefront events stay in the existing private Flask/POS backend —
this app only presents them and never stores a second copy.

- Business facts (name, location, currency, contacts) live in the Edge views.
- All customer-facing product data comes from the POS API at runtime.
- No password, payment secret or administrator credential is ever rendered into
  a page or a client-side bundle.

---

## Requirements

- Node.js **24+** (`engines` in `package.json`)
- npm 10+
- A reachable Flask/POS API for catalog, accounts, contact and orders

## Getting started

```bash
npm ci
cp .env.example .env           # then set APP_KEY, APP_URL, SITE_URL, FLASK_API_BASE_URL
npm run build                  # compiles TypeScript + Vite/Tailwind assets
node build/bin/server.js       # http://localhost:3333
```

`APP_KEY` must be a base64 encoded 32-byte value:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

### Development

```bash
node ace serve --hmr           # dev server with hot reload (starts Vite too)
npm run build:css              # Tailwind only, without the full build
npm run typecheck              # tsc --noEmit
npm run lint                   # eslint
node ace test                  # Japa smoke tests (no backend required)
```

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | Home + live catalog (`?q=` server-side search) |
| GET | `/products/:id` | Product detail (gallery, sizes, colours) |
| GET | `/account/sign-in`, `/account/sign-up` | Customer account forms |
| POST | `/account/sign-in`, `/account/sign-up` | Submit to the account API |
| GET | `/contact` | Contact page and form |
| POST | `/contact` | Forwards the enquiry to the store API |
| GET | `/checkout` | Delivery and payment preference form |
| POST | `/checkout` | Creates the order through the store API |
| GET | `/privacy`, `/terms` | Legal pages |
| GET | `/sitemap.xml` | Home, legal pages and available products |
| GET | `/healthz` | Hosting health probe (also reports catalog reachability) |

## Project structure

```
app/
  controllers/storefront_controller.ts   HTTP endpoints and view data
  exceptions/handler.ts                  error pages + form validation redirects
  middleware/                            HTTPS, form spam protection, service context
  services/storefront_services.ts        the Flask/POS API gateway
  validators/storefront.ts               VineJS schemas for every public form
config/                                  AdonisJS config (app, session, shield, vite, ...)
resources/
  css/app.css                            Tailwind entry with the brand utilities
  js/app.js                              storefront behaviour (search, bag, gallery)
  views/                                 Edge templates (layout, pages, components)
start/
  env.ts                                 environment schema
  edge.ts                                Edge 6 migration plugin for @layout/@section
  kernel.ts                              middleware registration
  routes.ts                              route table
  validator.ts                           Luxon date transform for VineJS
tests/functional/storefront.spec.ts      smoke tests
public/                                  brand images, icons, robots.txt, built assets
```

## Storefront behaviour notes

- **Edge syntax.** The views use the Edge 5 inheritance syntax
  (`@layout`, `@section`, `@super`). Edge 6 moved to components with slots, so
  `start/edge.ts` registers the official `edge.js/plugins/migrate` plugin. New
  views may use `@component`/`@slot` instead.
- **Graceful degradation.** If the POS API is unreachable the home page still
  renders with a "catalog is momentarily unavailable" notice, product URLs
  answer `503`, and `/healthz` reports `"catalog":"unavailable"`.
- **Forms.** CSRF (Shield), honeypot fields and a per-IP rate limit protect the
  four public POST routes. Validation failures flash the field errors and send
  the customer back to the form instead of showing a raw error page.
- **Search.** `?q=` filters the rendered catalog server side; the small
  JavaScript entry also filters in place and keeps the query in the URL.
- **Cookie notice.** Optional analytics loads only when
  `ANALYTICS_PROVIDER` is configured.

## Media assets

- `public/images/og/adonai-storefront.png` is the default Open Graph preview.
- Product and campaign photos live on the configured media volume, not in Git.
- Run `python3 scripts/optimize_images.py` after adding source images to
  `public/images/source/` to generate WebP (and AVIF when Pillow supports it).

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for Docker, Render
(`render.yaml` is included), Railway, Fly.io and a manual VPS + nginx setup, plus
the full environment variable table.

## Related documents

- `EDGE_STOREFRONT_UPDATE_GUIDE.md` — the original storefront migration guide.
