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
| `PORT` | yes | `10000` in Docker/Render (the port the platform routes to); `3333` for `npm run preview` |
| `APP_NAME` | yes | `Adonai Thrift Store` |
| `APP_KEY` | yes | base64 of 32 random bytes — see below |
| `APP_URL` | optional | public URL, e.g. `https://adonaithrift.example`. Leave empty on a host and the address is taken from each request |
| `SITE_URL` | optional | usually the same as `APP_URL`; used for canonical links, `sitemap.xml` and Open Graph images |
| `SESSION_DRIVER` | yes | `cookie` |
| `FLASK_API_BASE_URL` | optional | private base URL of the Flask/POS API. Without it the storefront runs and says the catalog is not connected yet |
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

The application boots with **no `.env` file at all**, which is how hosting
platforms run it. Only `NODE_ENV`, `HOST`, `PORT`, `APP_NAME`, `APP_KEY`,
`SESSION_DRIVER`, `DB_CONNECTION`, `LOG_LEVEL` and `ANALYTICS_PROVIDER` are
required; everything else has a sensible default or degrades gracefully.

To run a production-style instance locally with generated defaults:

```bash
npm run preview          # or: PORT=8080 npm run preview
```

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
docker run -d --name adonai-storefront -p 10000:10000 \
  --env-file .env \
  -v adonai-media:/app/storage \
  adonai-storefront
```

The image listens on the port given by `PORT` (default `10000`, which is what
Render routes to). To publish it on another port, pass both together:
`docker run -e PORT=3333 -p 3333:3333 ...`.

The image runs as a non-root user, and ships a `HEALTHCHECK` that calls
`/healthz`.

---

## 3. Render (blueprint included — nothing to type)

1. Open the deploy link (same as the README):
   **https://render.com/deploy?repo=https://github.com/senyongamandrew-crypto/Adonai-Thrift-Store/tree/arena/01a0aaa3-adonai-thrift-store**
   The `/tree/...` suffix tells Render which branch holds `render.yaml`. After
   PR #1 is merged into `main` you can drop it and use:
   `https://render.com/deploy?repo=https://github.com/senyongamandrew-crypto/Adonai-Thrift-Store`
2. Sign in with GitHub and approve the deployment.

`render.yaml` is pre-filled, so Render never asks for a secret:
`APP_KEY` is generated automatically (`generateValue: true`), the free plan is
selected, `/healthz` is the health check, and `APP_URL` / `SITE_URL` are
deliberately left unset so the site derives its own public URL from each
request (correct canonical links, sitemap and Open Graph tags on the
`*.onrender.com` address or on your own domain).

**Later, when the store API is online** — Render Dashboard → your service →
**Environment** → add:

| Key | Value |
| --- | --- |
| `FLASK_API_BASE_URL` | `https://your-pos-api.example` |
| `FLASK_INTERNAL_API_TOKEN` | your token, if the store API requires one |

Save; Render redeploys and the catalog appears. Adding a custom domain is the
same screen (**Settings → Custom Domain**); no app changes are needed because the
site detects the domain it is served from.

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
- `/healthz` is **never** redirected to HTTPS, so a platform health probe that
  arrives over plain HTTP cannot fail the deploy.
- Account, contact and checkout submissions surface the backend error instead of
  pretending the order was captured.

---

## Troubleshooting a failed deploy

**"Exited with status 1 while building your code" — the build dies at `npm run build`**

First thing to check: `tests/` must stay in the Docker build context. The
TypeScript project compiles every `.ts` file, and `bin/test.ts` imports
`../tests/bootstrap.js`. If `.dockerignore` excludes `tests`, the build fails
with:

```
bin/test.ts(46,53): error TS2307: Cannot find module '../tests/bootstrap.js'
Cannot complete the build process as there are TypeScript errors.
```

The failure only shows up inside Docker — local builds, CI and `node ace test`
all pass, because they always have `tests/` on disk. That is why `.dockerignore`
carries a comment telling you not to ignore it.

Another cause of the same symptom: hosting platforms pass your service's environment variables
into the image build, so `NODE_ENV=production` is visible while `npm ci` runs.
npm then silently omits **devDependencies**, which is where the build toolchain
lives (vite, tailwindcss, TypeScript, the ace CLI). The build fails with
`ERR_MODULE_NOT_FOUND` and a bare `exit code 1`.

The `Dockerfile` guards against this with `ENV NODE_ENV=development` and
`npm ci --include=dev` in the build stage, while the runtime stage still runs as
`NODE_ENV=production`. Keep both flags if you edit that file.

The build stage also installs **no C/C++ toolchain**. The storefront keeps no
database of its own, so `@adonisjs/lucid` and `better-sqlite3` were removed from
`package.json`: nothing imported them, there was no `config/database.ts`, and the
Lucid provider was never registered. Dropping them removed the only step that
compiled C++ during the image build — the slowest, most memory-hungry part, and a
common cause of failures on a 512 MB free instance. `npm ci` now performs zero
`node-gyp` runs.

If a future dependency does need compiling, restore the toolchain in the build
stage (the commented block in the `Dockerfile`) and pass `--nodedir=/usr/local`
to `npm ci`, so node-gyp uses the headers already inside the Node image instead
of downloading them from `nodejs.org`.

**"Create web service ... Failed deploy" with a health-check error**

Check `GET /healthz` first. Render requires a `200` from the health check path;
anything else (including a `3xx` redirect) marks the deploy as failed. The
middleware in `app/middleware/force_https_middleware.ts` therefore always serves
`/healthz` and only redirects when the request proves it arrived over plain HTTP.

**The service logs "started HTTP server on 0.0.0.0:PORT" but Render says it is
unreachable**

The container port must match the port Render routes to. This image listens on
`PORT` (declared as `10000` in both the `Dockerfile` and `render.yaml`). If you
change one, change the other.

**The service deploys, but the site is blank / every page returns 500**

Check the logs for:

```
EdgeError: Missing manifest file. Make sure to first create a build
   at .../resources/views/layouts/app.edge:36
```

`line 36` of the layout is the `@vite([...])` tag. The Vite service reads
`config/vite.ts` -> `manifestFile` with plain `fs` calls, so a **relative** path
is resolved against the process working directory, not the application root.
That works locally (the app is usually started from the project root, where
`public/vite` exists) but fails in the production container, which contains only
the built output.

`manifestFile` therefore uses `app.makePath(...)`, which resolves against the
application root — in production the root is `build/`, where `ace build` copies
`public/**` as a meta file. Keep that call if you edit the config.

**Re-running a failed Blueprint sync**

The Blueprint is linked to a branch. After pushing a fix, open the Blueprint in
the Render Dashboard and click **Manual Sync**, or open the service and click
**Retry deploy**. Both rebuild from the latest commit on that branch.
