# syntax=docker/dockerfile:1

#
# Adonai Thrift Store — production image
#
# The build stage compiles the AdonisJS app and the Vite/ Tailwind assets.
# The runtime stage ships only the compiled app plus production dependencies.
#
# The app listens on the port given by the PORT environment variable. Hosting
# platforms set it themselves (Render uses 10000), so the default below is only
# a fallback for a plain "docker run". To publish on another port, pass it in:
#
#   docker run -e PORT=3333 -p 3333:3333 adonai-thrift-store
#

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS build

WORKDIR /app

# Toolchain for native modules that have no prebuilt binary for this platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# Keep only production dependencies for the runtime image.
RUN npm prune --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000

WORKDIR /app

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

RUN mkdir -p storage/media \
  && groupadd --system adonai \
  && useradd --system --gid adonai --home-dir /app adonai \
  && chown -R adonai:adonai /app

USER adonai

EXPOSE 10000

# Must always answer 200, including when the platform probes over plain HTTP.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 10000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "build/bin/server.js"]
