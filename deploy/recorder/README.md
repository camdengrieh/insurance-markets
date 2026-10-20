# pm-recorder on Railway

Runs the read-only order-book recorder (`pm/recorder`) continuously in one container with one volume,
for the 30-day evidence window. It needs no credentials and no hand-written market list: on start it
discovers its targets from public XO and Polymarket data, records them, and refreshes the list daily.

It sends only `GET` requests with the User-Agent `insurance-markets-research/0.1`, to five public
read hosts, within per-host budgets far below the venues' documented limits. It trades nothing.

First deployed to Railway on 2026-10-20 with `railway up` (a project with one service and a volume at
`/data`). Its first pass discovered 388 targets and recorded 386 order books and 388 market states with no
failures. Railway rejects a `VOLUME` line in a Dockerfile, so the image declares none; the volume is attached
in Railway. The bundle and the runtime image were also tested locally (see "What was and was not verified"
at the end).

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

## Deploy, step by step

You need a Railway account on the Hobby plan or above (the free and trial plans have a 0.5 GB volume,
too small for 30 days), and this repository on GitHub (or the Railway CLI to upload it).

1. **Create the service.** In the Railway dashboard: New Project, Deploy from GitHub repo, pick this
   repository and branch. With the CLI instead: `railway login`, `railway init`, then `railway up` from the
   repository root. Do not set a root directory: the build context must be the repository root.
2. **Point it at the Dockerfile.** Service, Variables, add
   `RAILWAY_DOCKERFILE_PATH=deploy/recorder/Dockerfile`.
   `railway.json` in this folder says the same thing, but Railway has deprecated Config as Code (new
   services cannot opt into it; existing files stop being read on 2026-12-01), and Railway only reads it
   from the repository root unless a config file path is set in the service settings. Use the variable.
3. **Mount the volume.** Service, Settings, Volumes (or right-click the service on the canvas, Attach
   Volume), mount path **`/data`**. Hobby volumes are 5 GB by default. The recorder's own database cap is
   2 GiB (`maxDbBytes`), after which it pauses collection and logs `disk_cap`; see "Sizing" to raise it.
4. **Restart policy.** Service, Settings, Deploy, Restart Policy: **On Failure** (max retries 10).
   Leave the **healthcheck empty**: the recorder has no HTTP port, so do not set `PORT`, a domain or a
   healthcheck path.
5. **No other variables are needed.** There are no secrets. The image already sets
   `DATA_DIR=/data`, `RECORDER_DB=/data/recorder.sqlite` and `RECORDER_TARGETS=/data/targets.json`.
6. **Deploy.** The build installs from the committed lockfile and builds one bundle
   (`deploy/recorder/build.mjs`) inside Docker; nothing needs building on your machine. Builds are free on
   Railway; the image is `node:24-slim` plus that one file.
7. **Watch the first minutes** in the service logs. Expected, in order: a `discover: ... targets ...`
   summary with per-host projected load, `discover: wrote /data/targets.json`, then `tick: due=...` lines.
   The first discovery makes roughly 5 listing requests to XO, about a dozen to Gamma, and up to 300
   lookup requests to XO at about one per second, so allow up to ten minutes before the first snapshots.

Every start after the first reuses a targets file younger than 24 hours; otherwise it rediscovers first.
Redeploys are safe: SIGTERM ends the run cleanly, the next start resumes from the database, and a lock
left behind by a hard kill is cleared at container start. A redeploy of a service with a volume has a short
gap in recording (Railway stops the old deployment before mounting the volume in the new one); `gaps`
shows it.

The container starts as root only to make the volume writable (some platforms mount it root-owned), then
runs node as the unprivileged `node` user. If it cannot create or write `/data` it refuses to start with
exit code 2 and says so.

## Reading the data

The recorder is the only writer. Read commands are safe to run beside it; run them through the same
entrypoint so files stay owned by the right user.

```sh
railway ssh -- /app/entrypoint.sh status     # row counts, database size, last snapshot, recent runs
railway ssh -- /app/entrypoint.sh verify     # recompute every row checksum + SQLite integrity check
railway ssh -- /app/entrypoint.sh gaps       # gaps in the recorded series
railway ssh -- /app/entrypoint.sh report     # descriptive report (text); add --format json --out /data/report.json
railway logs -n 200                          # what the recorder printed
```

`railway ssh` needs the Railway CLI and an SSH key registered with your account (the CLI offers to
register one the first time). Note that `railway run` is not a substitute: it runs a command **on your own
machine** with the service's variables, so it cannot see the volume. To copy a file out, use `scp` or
`sftp` through `ssh.railway.com` (the CLI's `railway ssh` documentation shows the target for your
service) or `railway volume browse`. Write a report inside the container first
(`... report --format json --out /data/report.json`), then copy it. To copy the database itself, stop the
service first (or copy `recorder.sqlite`, `-wal` and `-shm` together) and run `verify` on the copy.

Do not run `run` or `once` from a shell inside the container while the service is running; the lock
refuses a second recorder, and the entrypoint only clears a stale lock when it is the container's main
process.

## Stopping

* Pause recording but keep the data: dashboard, the active deployment, the three-dot menu, **Remove**
  (or `railway down`). The container gets SIGTERM, finishes the step, closes the run and exits 0.
  The volume and its data stay and keep billing storage.
* End the study: copy the data out first (`report`, `verify`, then the database), then delete the
  service and, separately, the volume. A deleted volume can be restored within 48 hours, then it is gone.
* A day after the 30-day window you may also set the retention lower or run `prune`; retention
  (default 45 days) is applied by the loop once a day.

## Sizing and cost notes

Estimates from the code's own arithmetic, not measurements; check `status` and the dashboard after a day.

* **Targets.** Up to 30 short-dated (closing within 72 h, sampled every 5 minutes) and 250 other markets
  (hourly) per venue, trimmed further until projected requests fit 60 % of every host budget and projected
  disk use fits 80 % of `maxDbBytes` over the 45-day retention. The run's first log lines print the result.
* **Disk.** About 1.3 KB per snapshot at 20 levels per side: a short-dated market is about 0.4 MB a day,
  an hourly one about 30 KB a day. A full default set is tens of MB a day, so the 2 GiB cap trims it
  slightly below the maximum; to keep more, use a bigger volume and raise the cap with a config file:
  write `{"maxDbBytes": 4000000000}` to `/data/config.json` (for example with `scp`) and add the variable
  `RECORDER_CONFIG=/data/config.json`. Budgets cannot be raised above their ceilings.
* **Railway prices** (docs.railway.com/pricing/plans, read 2026-10-20): Hobby $5 a month including $5 of
  usage; memory $10 per GB-month, CPU $20 per vCPU-month, volume $0.15 per GB-month, egress $0.05 per GB.
  The recorder is I/O-bound and mostly idle, so expect on the order of 100 to 200 MB of memory, a small
  fraction of a vCPU, 1 to 2 GB of volume, and a few GB of egress a month: roughly the $5 plan fee, with
  usage inside the included $5. Unmeasured.
* **Request rates.** Well under the documented public limits of the venues; see `pm/recorder/RUN.md` for
  the per-host budget table. Requests the budget cannot cover are deferred, never sent.

## Files in this folder

| File | Purpose |
|---|---|
| `Dockerfile` | two stages: install from the lockfile and bundle; then `node:24-slim` + `recorder.mjs` + entrypoint; a data directory at `/data` (no `VOLUME` line: Railway rejects it) |
| `entrypoint.sh` | creates and owns `/data`, drops to the `node` user, execs node so SIGTERM reaches it |
| `build.mjs` | bundles `pm/recorder/main.ts` into `dist/recorder.mjs` with the repository's pinned esbuild; deterministic; prints the sha256 |
| `railway.json` | the same builder and restart settings as Config as Code (deprecated by Railway; see step 2) |
| `Dockerfile.dockerignore`, `.dockerignore` | keep the toolchain, dependencies, data and other apps out of the build context |

Build the bundle yourself with `node deploy/recorder/build.mjs` (needs the project toolchain); `dist/` is
git-ignored. Build the image yourself with `docker build -f deploy/recorder/Dockerfile -t pm-recorder .`
from the repository root.

## What was and was not verified

Verified locally: the bundle builds deterministically (same sha256 twice); it runs under Node 24.21.0 and
under the `node:24-slim` image (Node 24.22.0), where `node:sqlite` loads; against loopback servers
replaying real captured responses it discovers targets, records, and exits 0 on SIGTERM with the run
closed, the lock removed and `verify` passing; a root-owned volume with a stale lock is repaired by the
entrypoint; an unwritable data directory exits 2. The bundle contains no secrets, home paths or email addresses.

Not verified: `docker build` of the two-stage Dockerfile (the `pnpm install` stage was not run);
anything on Railway itself (the volume mount, restart policy behaviour, `railway ssh`, scp, the dashboard
menu names, the Config as Code deprecation timing); behaviour against the real venues over days (the
recorder was only ever run against loopback replays); the real number of XO lookups and the real group
sizes (the capture covered 9 of 235 XO markets).
