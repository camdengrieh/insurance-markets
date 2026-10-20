# syntax=docker/dockerfile:1
#
# pm-recorder: read-only order-book recorder, one container, one volume.
#
# Build context is the REPOSITORY ROOT (the bundle is built from pm/ and the few src/ files it uses):
#
#   docker build -f deploy/recorder/Dockerfile -t pm-recorder .
#
# Stage 1 installs from the committed lockfile (nothing is added) and runs deploy/recorder/build.mjs,
# which writes the single file deploy/recorder/dist/recorder.mjs. Stage 2 is node:24-slim plus that one
# file: no node_modules, no sources, no tests. node:sqlite is built into Node 24.

FROM node:24-slim AS build
ENV CI=true
WORKDIR /build
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
COPY pm ./pm
COPY deploy/recorder/build.mjs ./deploy/recorder/build.mjs
RUN node deploy/recorder/build.mjs

FROM node:24-slim AS runtime
WORKDIR /app
COPY --from=build /build/deploy/recorder/dist/recorder.mjs /app/recorder.mjs
COPY deploy/recorder/entrypoint.sh /app/entrypoint.sh
RUN chmod 0555 /app/entrypoint.sh && chmod 0444 /app/recorder.mjs && mkdir -p /data && chown node:node /data

# Everything the recorder writes lives under DATA_DIR: the SQLite file, its lock, the discovered
# targets file and the discovery cache. Mount a volume here.
ENV DATA_DIR=/data \
    RECORDER_DB=/data/recorder.sqlite \
    RECORDER_TARGETS=/data/targets.json \
    NODE_ENV=production
VOLUME /data

# The entrypoint starts as root only to make the mounted volume writable (some platforms mount it
# root-owned), then runs node as the unprivileged user "node" (uid 1000). If the platform already
# starts the container as a non-root user, it just runs node. The same entrypoint is the way to run
# the read commands in a running container:  /app/entrypoint.sh status
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["run", "--discover"]
