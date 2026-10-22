# syntax=docker/dockerfile:1
#
# insurance-markets-api: the free read endpoints and the chain indexer, one container, one volume.
#
# Build context is the REPOSITORY ROOT (the bundle is built from api/ and sdk/ only):
#
#   docker build -f deploy/api/Dockerfile -t insurance-markets-api .
#
# Stage 1 installs from the committed lockfile (nothing is added) and runs deploy/api/build.mjs, which writes the
# single file deploy/api/dist/api.mjs. Stage 2 is node:24-slim plus that one file: no node_modules, no sources, no
# tests. node:sqlite (the chain index) is built into Node 24.

FROM node:24-slim AS build
ENV CI=true
WORKDIR /build
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY sdk ./sdk
COPY api ./api
COPY deploy/api/build.mjs ./deploy/api/build.mjs
RUN node deploy/api/build.mjs

FROM node:24-slim AS runtime
WORKDIR /app
COPY --from=build /build/deploy/api/dist/api.mjs /app/api.mjs
COPY deploy/api/entrypoint.sh /app/entrypoint.sh
RUN chmod 0555 /app/entrypoint.sh && chmod 0444 /app/api.mjs && mkdir -p /data && chown node:node /data

# The chain index (api.sqlite) lives under API_DATA_DIR. No VOLUME instruction: some platforms reject it. Mount the
# persistent disk at /data. Nothing here is a secret: the free tier needs none. Link bundles, CORS origins, extra RPC
# URLs and start blocks are set by the platform (see deploy/api/README.md).
ENV API_DATA_DIR=/data \
    API_HOST=0.0.0.0 \
    API_PORT=8790 \
    NODE_ENV=production
EXPOSE 8790

# The entrypoint starts as root only to make the mounted volume writable, then runs node as the unprivileged user "node".
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["serve"]
