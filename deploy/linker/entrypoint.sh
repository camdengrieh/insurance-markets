#!/bin/sh
# Container entrypoint for pm-linker. It makes sure the data directory exists and belongs to the
# unprivileged user, fills in --registry and --out from the environment when the caller gave
# neither, then execs node as that user so SIGTERM from the platform reaches node directly.
set -eu

DATA_DIR="${DATA_DIR:-/data}"
REGISTRY="${LINKER_REGISTRY:-$DATA_DIR/registry.json}"
OUT="${LINKER_OUT:-$DATA_DIR/out}"

# A container killed hard leaves its lock file in the volume. Only one container ever owns the
# volume, so when this script is the container's main process (PID 1) the old lock is removed.
if [ "$$" = "1" ]; then
  rm -f "$OUT/linker.lock"
fi

case " $* " in
  *" --registry "*|*" --out "*) ARGS="$*" ;;
  *) ARGS="$* --registry $REGISTRY --out $OUT" ;;
esac

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR" "$OUT"
  chown node:node "$DATA_DIR" "$OUT"
  # shellcheck disable=SC2086
  exec setpriv --reuid=node --regid=node --init-groups node /app/linker.mjs $ARGS
fi

# shellcheck disable=SC2086
exec node /app/linker.mjs $ARGS
