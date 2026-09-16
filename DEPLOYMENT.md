# Deploying the Adonai Thrift Store storefront

The storefront is an AdonisJS 7 application that renders Edge views and talks to
the existing Flask/POS backend over the private server-to-server API. It never
ships POS credentials, payment secrets or administrator data to the browser.

- Runtime: Node.js 24 (see `engines` in `package.json`)
- Build output: `build/` (compiled server) and `public/vite/` (compiled CSS/JS)
- Start command: `node build/bin/server.js`
- Health probe: `GET /healthz` → `{"status":"ok","catalog":"ok"|"unavailable"}`

Nothing below needs a database: the storefront keeps no catalog of its own.

---

## 1. Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` on every real deployment |
| `HOST` | yes | `0.0.0.0` |
| `PORT` | yes | `3333` locally; most hosts inject their own |
| `APP_NAME` | yes | `Adonai Thrift Store` |
| `APP_KEY` | yes | base64 of 32 random bytes — see below |
| `APP_URL` | yes | public URL, e.g. `https://adonaithrift.example` |
| `SITE_URL` | yes | usually the same as `APP_URL`; used for canonical links, `sitemap.xml` and Open Graph images |
| `SESSION_DRIVER` | yes | `cookie` |
| `FLASK_API_BASE_URL` | yes | private base URL of the Flask/POS API |
| `FLASK_INTERNAL_API_TOKEN` | optional | bearer token for the private boundary |
| `DB_CONNECTION` | yes | `sqlite` (validated for compatibility; unused by the storefront) |
| `ADONAI_MEDIA_*` | optional | media volume settings |
| `ANALYTICS_PROVIDER` | yes | `none`, `plausible` or `ga4` |
| `ANALYTICS_DOMAIN`, `GA4_MEASUREMENT_ID` | optional | only for the chosen provider |
| `FORCE_HTTPS` | optional | defaults to enabled. Set to `false` only when TLS terminates somewhere that does not forward `x-forwarded-proto` |

Generate an `APP_KEY`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

`.env` is gitignored — set these values in the hosting dashboard, not in Git.
`.env.test` is committed on purpose: it contains only dummy values used by
`npm test`.

> Warning: keep `FLASK_API_BASE_URL` and `FLASK_INTERNAL_API_TOKEN` server side
> only. They must never appear in a view, a JavaScript file or a public URL.

---

## 2. Docker (any VPS, Fly.io, Railway, Kubernetes)

```bash
cp .env.example .env          # fill in the real values
docker compose up --build -d  # serves on http://localhost:3333
```

Or with plain Docker:

```bash
docker build -t adonai-storefront .
docker run -d --name adonai-storefront -p 3333:3333 \
  --env-file .env \
  -v adonai-media:/app/storage \
  adonai-storefront
```

The image runs as a non-root user, and ships a `HEALTHCHECK` that calls
`/healthz`.

---

## 3. Render (blueprint included)

1. Push this repository to GitHub.
2. In Render choose **New + → Blueprint** and select the repository.
   Render reads `render.yaml`.
3. Fill in the values marked `sync: false` (`APP_KEY`, `APP_URL`, `SITE_URL`,
   `FLASK_API_BASE_URL`, `FLASK_INTERNAL_API_TOKEN`).
4. Deploy. Render builds the `Dockerfile`, waits for `/healthz`, and keeps
   HTTPS redirects enabled (`FORCE_HTTPS=true`).

## 4. Railway / Fly.io

Both can build the same `Dockerfile`:

```bash
# Railway
railway init && railway up

# Fly.io
fly launch --no-deploy      # accept the existing Dockerfile
fly secrets set APP_KEY=... APP_URL=https://your-domain FLASK_API_BASE_URL=...
fly deploy
```

## 5. Manual VPS deployment (systemd + nginx)

```bash
git clone git@github.com:senyongamandrew-crypto/Adonai-Thrift-Store.git
cd Adonai-Thrift-Store
npm ci
npm run build
cp .env.example .env && nano .env      # production values
```

`/etc/systemd/system/adonai-storefront.service`:

```ini
[Unit]
Description=Adonai Thrift Store storefront
After=network.target

[Service]
WorkingDirectory=/var/www/Adonai-Thrift-Store
ExecStart=/usr/bin/node build/bin/server.js
EnvironmentFile=/var/www/Adonai-Thrift-Store/.env
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

nginx reverse proxy (keep `X-Forwarded-Proto` so the HTTPS redirect and cookies
behave):

```nginx
server {
  listen 443 ssl http2;
  server_name adonaithrift.example;

  location / {
    proxy_pass http://127.0.0.1:3333;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

Finally:

```bash
sudo systemctl enable --now adonai-storefront
```

---

## 6. Rebuilds and cache busting

CSS and JavaScript are hashed by Vite. Run `npm run build` (or rebuild the
Docker image) whenever `resources/`, `app/`, `config/` or the views change —
`webmanifest`/`manifest` references are read from `public/vite/.vite/manifest.json`
at boot, so a build is required before the server starts in production.

## 7. Operating the storefront while the POS API is down

- `/` keeps rendering and shows an honest "catalog is momentarily unavailable"
  notice instead of an empty catalog.
- Product URLs answer `503` (temporary) rather than `404`, so search engines do
  not drop indexed products during an outage.
- `/healthz` still answers `200` with `"catalog":"unavailable"`, so the platform
  does not kill the container because of a backend issue.
- Account, contact and checkout submissions surface the backend error instead of
  pretending the order was captured.
