# Adonai Thrift Store — customer storefront

The public storefront for **Adonai Thrift Store** (Wakiso, Kampala, Uganda):
one-of-one thrift and vintage clothing, prices in **UGX**, Kampala delivery and
Try & Confirm on eligible orders.

---

## Publish it (3 clicks, no technical setup)

The site is ready to go online as-is. You do **not** need to install anything,
set up a database, or type any secret values.

1. Click this link:
   **[Deploy Adonai Thrift Store →](https://render.com/deploy?repo=https://github.com/senyongamandrew-crypto/Adonai-Thrift-Store/tree/arena/01a0aaa3-adonai-thrift-store)**

   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/senyongamandrew-crypto/Adonai-Thrift-Store/tree/arena/01a0aaa3-adonai-thrift-store)

   > The link ends in `/tree/arena/01a0aaa3-adonai-thrift-store` on purpose: that
   > is the branch holding `render.yaml`. Once PR #1 is merged into `main`, the
   > plain link below works instead:
   > `https://render.com/deploy?repo=https://github.com/senyongamandrew-crypto/Adonai-Thrift-Store`
2. Sign in with GitHub if Render asks (free account, no card required for the
   free plan).
3. Press **Apply** / **Deploy**.

Render builds the site, generates the secret key for you automatically, and gives
you a live address such as `https://adonai-thrift-store.onrender.com`. Open it —
that is your store.

**Before you announce it**, one optional task: on that live page the catalog says
*"Our online catalog is being connected"*. When your POS / store API is online,
paste its address into Render (Dashboard → your service → **Environment** →
`FLASK_API_BASE_URL`) and the products appear on their own. Until then the page
invites visitors to WhatsApp or call the store, which is the honest state for a
launch.

Everything else — prices in UGX, Kampala delivery, Try & Confirm, the two phone
numbers, the logo, the legal pages — is already in the site.

### Prefer to keep it 100% free / on another host?

- **Render free plan** is already configured (`plan: free` in `render.yaml`).
- **Railway / Fly.io / any VPS:** see [DEPLOYMENT.md](./DEPLOYMENT.md) — every
  option uses the same one `Dockerfile`.

### Try it on your own computer first

```bash
npm ci
npm run build
npm run preview     # opens on http://localhost:3333
```

`npm run preview` works with no configuration file at all.

---

## What you get

- **Home** with the live catalog from your POS inventory, or a friendly notice
  when the catalog is not connected yet.
- **Product pages** with gallery, sizes, colours and UGX prices.
- **Customer accounts**, **contact form** and **checkout** wired to your store
  API, with spam and duplicate-submission protection.
- **Privacy** and **terms** pages, `robots.txt`, `sitemap.xml` for Google, and
  Open Graph images so links look right when shared on WhatsApp or Facebook.
- **Kampala details** throughout: `+256748992964`, WhatsApp `+256765652403`,
  UGX pricing, delivery and Try & Confirm.

## How it is built

The storefront is an [AdonisJS 7](https://adonisjs.com) application that renders
[Edge](https://edgejs.dev) views styled with Tailwind CSS. Catalog, accounts,
orders and storefront events stay in the existing private Flask/POS backend —
this app only presents them and never stores a second copy.

- Business facts (name, location, currency, contacts) live in the Edge views.
- All customer-facing product data comes from the POS API at runtime.
- No password, payment secret or administrator credential is ever rendered into
  a page or a client-side bundle.
- The storefront itself stores nothing: it has no database and ships no SQLite
  driver, which keeps its Docker build free of native compilation.


---

## Requirements

- Node.js **24+** (`engines` in `package.json`)
- npm 10+
- A reachable Flask/POS API for catalog, accounts, contact and orders

## Getting started

```bash
npm ci
npm run preview                # http://localhost:3333 — no config needed
```

With no `.env` at all, the site runs and reports the catalog as "not connected
yet". Add a `.env` (copied from `.env.example`) when you want to point it at a
store API:

```bash
cp .env.example .env           # then set FLASK_API_BASE_URL (and APP_KEY in production)
npm run build
node build/bin/server.js
```

`APP_KEY` must be a base64 encoded 32-byte value. It is only required for real
deployments — `npm run preview` generates a throwaway one:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

`APP_URL`, `SITE_URL` and `FLASK_API_BASE_URL` are all optional. When the site
URL is unset the address is taken from each request, so canonical links,
`sitemap.xml` and Open Graph tags are correct on any domain automatically.

### Development

```bash
node ace serve --hmr           # dev server with hot reload (starts Vite too)
npm run build:css              # Tailwind only, without the full build
npm run typecheck              # tsc --noEmit
npm run lint                   # eslint
node ace test                  # Japa smoke tests (no backend required)
```

## The shop's Android till

The Adonai Thrift Store POS (package `com.adonai.pos`) was built to talk to a
shared API. That API is this service, so the till points straight at the site and
needs nothing else running.

- **Address** — the site address, e.g. `https://adonai-thrift-store-hqg3.onrender.com`
  (Admin Suite → Workspace & team → Shared server connection). Never `localhost`,
  which would mean the phone itself.
- **PIN** — the same shop PIN as the intake screen (`ADMIN_PIN`, default `7890`).
  The phone trades it for a twelve-hour session token.
- **Where the routes come from** — the phone's own expectations are documented in
  its technical guide; the ones it calls are `/api/health`, `/api/pos/catalog`,
  `/api/pos/catalog/delete`, `/api/pos/admin/session`, `/api/orders`, the delivery
  routes and `/api/media/upload`. They are all served here, next to the website.
- **Field names** — the till says "title", "sku", "bin", "status"; the website
  says "name", "size", "available". `app/services/pos_sync.ts` translates between
  the two, and keeps any field it does not recognise so nothing the shop typed is
  lost on the way through.
- **CORS** — a WebView reports its origin as the literal string `null`, so
  `app/middleware/api_cors_middleware.ts` answers the permission request the
  browser makes before it will send anything. Without it the phone reports
  "Failed to fetch" even when the server is answering correctly.

## Listing pieces without a second system

The storefront reads its catalogue from the POS API. That API now ships inside
this same service, so the shop runs on **one** deployment:

- **Add pieces** at `/shop/intake`, protected by the shop PIN (`ADMIN_PIN`,
  default `7890`). Anything added there appears on the storefront immediately;
  marking a piece sold hides it.
- **The API** — `/api/health`, `/api/products`, `/api/products/:id`,
  `/api/orders`, `/api/contact`. Reads are public, writes need the PIN in an
  `x-adonai-pin` header.
- **One catalogue, one backup** — the catalogue is snapshotted into the
  `data/catalogue` branch every fifteen minutes by `.github/workflows/catalogue-snapshot.yml`
  and restored automatically on a cold start, because free hosting hands the
  service a fresh disk when it restarts. Orders and contact messages are never
  snapshotted: they stay on the server.

Pointing the shop at a separate POS API again is a single setting:
`FLASK_API_BASE_URL` takes precedence over the built-in catalogue when it is set.
See [DEPLOYMENT.md](DEPLOYMENT.md#listing-pieces-the-shop-intake-screen).

## Changing the shop details

Phone numbers, the headline, the delivery promise and a promotion strip are
environment variables, not hardcoded text, so they can be changed from the
hosting dashboard without editing a file. See
[Changing the shop details](DEPLOYMENT.md#changing-the-shop-details-without-touching-code).

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

## Three catalog states

The storefront never pretends. `GET /healthz` reports which one you are in:

| State | When | What visitors see | `/healthz` |
| --- | --- | --- | --- |
| `not_configured` | `FLASK_API_BASE_URL` is empty | "Our online catalog is being connected" + WhatsApp/call buttons | `{"status":"ok","catalog":"not_configured"}` |
| `ok` | Store API answers | The live POS catalog | `{"status":"ok","catalog":"ok"}` |
| `unavailable` | Store API is down | "The catalog is momentarily unavailable", product URLs answer `503` | `{"status":"ok","catalog":"unavailable"}` |

The process stays up and the rest of the site (contact, legal pages, account
forms) keeps working in every state.

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
