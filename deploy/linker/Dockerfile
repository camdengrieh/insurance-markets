# syntax=docker/dockerfile:1
#
# pm-linker: proposes same-question links across venues every two hours; a person approves them.
#
# Build context is the REPOSITORY ROOT (the bundle is built from pm/ and the few src/ files it uses):
#
#   docker build -f deploy/linker/Dockerfile -t pm-linker .
#
# Stage 1 installs from the committed lockfile (nothing is added) and runs deploy/linker/build.mjs,
# which writes the single file deploy/linker/dist/linker.mjs. Stage 2 is node:24-slim plus that one
# file: no node_modules, no sources, no tests.

FROM node:24-slim AS build
ENV CI=true
WORKDIR /build
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
COPY pm ./pm
COPY sdk ./sdk
COPY deploy/linker/build.mjs ./deploy/linker/build.mjs
RUN node deploy/linker/build.mjs

FROM node:24-slim AS runtime
WORKDIR /app
COPY --from=build /build/deploy/linker/dist/linker.mjs /app/linker.mjs
COPY deploy/linker/entrypoint.sh /app/entrypoint.sh
RUN chmod 0555 /app/entrypoint.sh && chmod 0444 /app/linker.mjs && mkdir -p /data && chown node:node /data

# Everything the linker writes lives under DATA_DIR: the working registry it adds candidates to,
# the state file, candidates.bundle.json and its pin, structure-groups.json. Mount a volume here.
# No VOLUME instruction: some platforms reject it. Mount the persistent disk at /data (deploy/aws).
ENV DATA_DIR=/data \
    LINKER_REGISTRY=/data/registry.json \
    LINKER_OUT=/data/out \
    NODE_ENV=production

# The entrypoint starts as root only to make the mounted volume writable, then runs node as the
# unprivileged user "node". Started on a schedule (the systemd timer in deploy/aws), the container runs `once` and exits 0.
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["once"]
