#!/bin/sh
# Container entrypoint for pm-recorder. Not a shell for anything else: it makes sure the data
# directory exists and belongs to the unprivileged user, then execs node as that user, so SIGTERM
# from the platform reaches node directly (exec, no shell in between).
set -eu

DATA_DIR="${DATA_DIR:-/data}"

# A container killed hard (out of memory, node crash, platform kill) leaves its lock file in the
# volume, and the recorder would refuse to start for two hours. Only one container ever owns the
# volume, so when this script is the container's main process (PID 1) the old lock is removed.
# A shell opened later (railway ssh ... /app/entrypoint.sh status) is not PID 1 and leaves it alone.
if [ "$$" = "1" ] && [ -n "${RECORDER_DB:-}" ]; then
  rm -f "${RECORDER_DB}.lock"
fi

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  # Only the top-level directory: existing files keep their owner (a volume written by an earlier
  # deployment as "node" is already right; chown -R on a large database would be slow).
  chown node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups node /app/recorder.mjs "$@"
fi

exec node /app/recorder.mjs "$@"
