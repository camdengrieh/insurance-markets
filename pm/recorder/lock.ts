// The recorder's advisory lock and data-directory check, shared with the linker (pm/linker/main.ts). Kept apart from
// main.ts so that importing them never pulls in the recorder's command line, whose run-as-script guard would also fire
// inside a bundle that is not the recorder (the linker bundle shares one import.meta.url for all its modules).

import { closeSync, existsSync, mkdirSync, openSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Advisory lock so two copies (an overlapping cron run, a double start) cannot write one database.
// File times are real wall-clock times, so staleness uses Date.now(), not the injected clock. A
// running loop touches the file every tick; a lock untouched for two hours belongs to a dead process.
export const LOCK_STALE_MS = 2 * 3600_000;

export interface Lock {
  readonly release: () => void;
  readonly touch: () => void;
}

export function acquireLock(dbPath: string): Lock | string {
  if (dbPath === ":memory:") return { release: () => undefined, touch: () => undefined };
  const lock = `${dbPath}.lock`;
  try {
    if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) unlinkSync(lock);
    const fd = openSync(lock, "wx");
    writeFileSync(fd, `${process.pid}\n`);
    closeSync(fd);
  } catch {
    return `another recorder holds ${lock} (remove it only if no recorder is running)`;
  }
  return {
    release: () => {
      try {
        unlinkSync(lock);
      } catch {
        /* already gone */
      }
    },
    touch: () => {
      try {
        const now = new Date();
        utimesSync(lock, now, now);
      } catch {
        /* the lock was removed by hand; the next start will recreate it */
      }
    },
  };
}

// Creates the directory if needed and proves it can be written; returns an error message or null.
export function ensureWritableDir(dir: string): string | null {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, `.write-test-${process.pid}`);
    writeFileSync(probe, "ok");
    unlinkSync(probe);
    return null;
  } catch {
    return "the data directory cannot be created or written; refusing to start (check that the volume is mounted and writable by the user running the recorder)";
  }
}
