# pm-recorder container

The read-only order-book recorder (`pm/recorder`) as one container with one data directory, for the
30-day evidence window. It needs no credentials and no hand-written market list: on start it discovers
its targets from public XO and Polymarket data, records them, and refreshes the list every six hours.

It sends only `GET` requests with the User-Agent `insurance-markets-research/0.1`, to five public
read hosts, within per-host budgets far below the venues' documented limits. It trades nothing.

**Where it runs:** on AWS, see `deploy/aws/README.md` (one EC2 host, an EBS volume at `/data`, the image
in ECR, systemd keeps it running). This folder only defines the image. It first ran on Railway on
2026-10-20 (388 targets, 386 books and 388 market states, no failures) and moved to AWS on 2026-10-22,
where the first run discovered the same 388 targets with the same result.

## What is recorded, and what is refused

| Venue | Raw recording | Why |
|---|---|---|
| XO, Polymarket (international), Limitless | yes (allowlist in code) | public keyless read APIs; registry data policy says `mayPersist` |
| Kalshi | never, not even derived numbers | Developer Agreement bars caching or aggregating beyond one's own trading |
| Quotient | never | terms restrict redistribution |
| ProphetX, Gemini, and every other venue | never | terms restrictive or unread (registry: memory-only) |

The allowlist is code, not configuration: it cannot be widened by a flag, a variable or a file. Discovery
only ever asks XO and Polymarket (Limitless has no discovery). Stored data is ids, prices, sizes, enums,
timestamps and numbers; third-party text (titles, rules, slugs, creators) is never stored. Read the
venues' current terms once more before the first run; the allowlist reflects the registry as of 2026-10-19
and is not legal advice.

## The image

Build from the **repository root** (the build context must be the root: the bundle is built from `pm/`,
`sdk/` and the few `src/` files it uses):

```sh
docker build -f deploy/recorder/Dockerfile -t pm-recorder .
docker run --rm -v "$PWD/data:/data" pm-recorder              # run --discover (the default command)
docker run --rm -v "$PWD/data:/data" pm-recorder status      # any read command
```

Two stages: install from the committed lockfile and bundle `pm/recorder/main.ts` into one file with
`build.mjs`; then `node:24-slim` plus that one file and the entrypoint. No `node_modules`, no sources, no
tests; `node:sqlite` is built into Node 24. The image declares no `VOLUME`: mount the platform's
persistent disk at `/data` (`DATA_DIR`, `RECORDER_DB=/data/recorder.sqlite`,
`RECORDER_TARGETS=/data/targets.json` are set in the image). There are no secrets and no HTTP port.

The container starts as root only to make the mounted directory writable, then runs node as the
unprivileged `node` user. If it cannot create or write `/data` it refuses to start with exit code 2.
SIGTERM ends the run cleanly, the next start resumes from the database, and a lock left behind by a hard
kill is cleared when the entrypoint is the container's main process.

Every start after the first reuses a targets file younger than six hours; otherwise it rediscovers first.
The first discovery makes roughly 5 listing requests to XO, about a dozen to Gamma, and up to 300 lookup
requests to XO at about one per second, so allow up to ten minutes before the first snapshots. Expected
log lines, in order: `discover: ... targets ...`, `discover: wrote /data/targets.json`, then `tick: due=...`.

## Reading the data

The recorder is the only writer. Read commands are safe to run beside it; run them through the same
entrypoint so files stay owned by the right user (on the AWS host: `pm-recorder-cmd <command>`).

| Command | What it prints |
|---|---|
| `status` | row counts, database size, first and last snapshot, recent runs |
| `verify` | recompute every row checksum + SQLite integrity check |
| `gaps` | gaps in the recorded series |
| `report` | descriptive report (text); add `--format json --out /data/report.json` |

Do not run `run` or `once` from a shell inside the container while the service is running; the lock
refuses a second recorder, and the entrypoint only clears a stale lock when it is the main process.

## Sizing

Estimates from the code's own arithmetic, not measurements; check `status` after a day.

* **Targets.** Up to 30 short-dated (closing within 72 h, sampled every 5 minutes) and 250 other markets
  (hourly) per venue, trimmed further until projected requests fit 60 % of every host budget and projected
  disk use fits 80 % of `maxDbBytes` over the 45-day retention. The run's first log lines print the result.
* **Disk.** About 1.3 KB per snapshot at 20 levels per side: a short-dated market is about 0.4 MB a day,
  an hourly one about 30 KB a day. A full default set is tens of MB a day. The database cap is 2 GiB
  (`maxDbBytes`), after which it pauses collection and logs `disk_cap`; to keep more, write
  `{"maxDbBytes": 4000000000}` to `/data/config.json` and set `RECORDER_CONFIG=/data/config.json`.
  Budgets cannot be raised above their ceilings.
* **Request rates.** Well under the documented public limits of the venues; see `pm/recorder/RUN.md` for
  the per-host budget table. Requests the budget cannot cover are deferred, never sent.
* **Resources.** I/O-bound and mostly idle: on the order of 100 to 200 MB of memory, a small fraction of
  a vCPU, a few GB of egress a month.

## Files in this folder

| File | Purpose |
|---|---|
| `Dockerfile` | two stages: install from the lockfile and bundle; then `node:24-slim` + `recorder.mjs` + entrypoint; a data directory at `/data` (no `VOLUME` line) |
| `entrypoint.sh` | creates and owns `/data`, drops to the `node` user, execs node so SIGTERM reaches it |
| `build.mjs` | bundles `pm/recorder/main.ts` into `dist/recorder.mjs` with the repository's pinned esbuild; deterministic; prints the sha256 |
| `Dockerfile.dockerignore`, `.dockerignore` | keep the toolchain, dependencies, data and other apps out of the build context |

Build the bundle alone with `node deploy/recorder/build.mjs` (needs the project toolchain); `dist/` is
git-ignored.

## What was and was not verified

Verified: the bundle builds deterministically (same sha256 twice) and contains no secrets, home paths or
email addresses; the image builds for `linux/arm64` and `status` runs in it; against loopback servers
replaying real captured responses it discovers targets, records, and exits 0 on SIGTERM with the run
closed, the lock removed and `verify` passing; a root-owned data directory with a stale lock is repaired by
the entrypoint; an unwritable data directory exits 2. On Railway (2026-10-20) and on AWS (2026-10-22) the
first real run discovered 388 targets and recorded 386 books and 388 market states with no failures.

Not verified: behaviour against the real venues over days, and the real group sizes (the capture
covered 9 of 235 XO markets).
