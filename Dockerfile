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

#
# Keep this stage in development mode.
#
# Hosting platforms (Render included) pass your service's environment variables
# into the image build. When NODE_ENV=production is visible, "npm ci" silently
# skips devDependencies — and the build toolchain (vite, tailwindcss, tsc, the
# ace CLI) lives there. The build then dies with ERR_MODULE_NOT_FOUND and a
# bare "exit code 1". Declaring development here, plus --include=dev below,
# keeps the toolchain available no matter what the platform injects.
#
ENV NODE_ENV=development

#
# No C/C++ toolchain is installed on purpose: the storefront keeps no database
# and every dependency ships a prebuilt binary, so nothing is compiled during
# the install. That keeps the build fast and independent of apt mirrors.
#
# If a dependency ever needs compiling, add this before "npm ci" and pass
# --nodedir=/usr/local to it (Node's headers live at /usr/local/include/node in
# this image, so node-gyp never has to download them from nodejs.org):
#
#   RUN apt-get update && apt-get install -y --no-install-recommends \
#         python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
#
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

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

# The shop catalogue is written at runtime. Paths are resolved against the
# application root, which is "build" in production, so a relative ADONAI_DATA_DIR
# of "storage/data" lands in build/storage/data. Both are created here because
# the service runs as a non-root user.
RUN mkdir -p storage/media storage/data build/storage/data \
  && groupadd --system adonai \
  && useradd --system --gid adonai --home-dir /app adonai \
  && chown -R adonai:adonai /app

USER adonai

EXPOSE 10000

# Must always answer 200, including when the platform probes over plain HTTP.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 10000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "build/bin/server.js"]
