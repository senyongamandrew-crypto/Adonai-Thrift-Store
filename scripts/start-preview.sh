#!/usr/bin/env bash
#
# Start the storefront the way a hosting platform does: no ".env" file, all
# configuration supplied as environment variables.
#
#   npm run preview          # http://0.0.0.0:3333
#   PORT=8080 npm run preview
#
# This is also handy for trying the site on your own machine before deploying.
# Anything you need to keep secret (a real APP_KEY, the store API token) should
# come from the platform's environment, not from this script.
#
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f build/bin/server.js ]; then
  echo "No build found. Running 'npm run build' first..." >&2
  npm run build
fi

# A throwaway key keeps sessions and CSRF working for a preview. It changes on
# every restart, which only means visitors get a fresh session.
export APP_KEY="${APP_KEY:-$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))")}"

export NODE_ENV="${NODE_ENV:-production}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3333}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export APP_NAME="${APP_NAME:-Adonai Thrift Store}"
export SESSION_DRIVER="${SESSION_DRIVER:-cookie}"
export DB_CONNECTION="${DB_CONNECTION:-sqlite}"
export ANALYTICS_PROVIDER="${ANALYTICS_PROVIDER:-none}"

# Preview environments usually sit behind a proxy that terminates TLS and
# render inside an iframe. Both are enabled again on a real deployment.
export FORCE_HTTPS="${FORCE_HTTPS:-false}"
export ALLOW_FRAME_EMBEDDING="${ALLOW_FRAME_EMBEDDING:-true}"

# APP_URL, SITE_URL and FLASK_API_BASE_URL are intentionally left unset: the
# storefront detects its own public URL per request, and reports the catalog as
# "not configured yet" until a store API URL is provided.
echo "Starting Adonai Thrift Store on ${HOST}:${PORT} (catalog: ${FLASK_API_BASE_URL:-not configured})"
exec node build/bin/server.js
