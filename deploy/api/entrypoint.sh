#!/bin/sh
# Container entrypoint for insurance-markets-api. It makes sure the data directory exists and belongs to the
# unprivileged user, then execs node as that user, so SIGTERM from the platform reaches node directly (exec, no shell
# in between). The index database's WAL makes a hard kill safe: the next start resumes from the stored cursors.
set -eu

DATA_DIR="${API_DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  # Only the top-level directory: an existing database keeps its owner.
  chown node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups node /app/api.mjs "$@"
fi

exec node /app/api.mjs "$@"
