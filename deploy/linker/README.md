# pm-linker on Railway (cron)

Runs the link proposer (`pm/linker`) once every two hours as a Railway **cron service**: one container
with one volume, started on the schedule, exits 0 when the pass is done. It needs no credentials. It
sends only `GET` requests with the User-Agent `insurance-markets-research/0.1` to three public read
hosts (XO Data API, Polymarket Gamma, Limitless), within the recorder's per-host budgets. It trades
nothing and approves nothing: every link it writes is a **candidate** that a person reviews with
`tsx pm/links/cli.ts review <id>` and `approve`.

No run against the real venues has happened. Everything below was exercised against loopback
replays and the synthetic world in `pm/test/linker`; the Railway steps are written from the
recorder's deployment (`deploy/recorder/README.md`) and are not verified for this service.

The full operating guide, the terms table, the scoring formula and the scheduled-routine
alternative are in `docs/linker-runbook.md`. This file covers the container only.

## What it reads and writes

| Venue | Read | Persisted | Why |
|---|---|---|---|
| XO, Polymarket (international), Limitless | yes (allowlist in code) | ids, hashes, categories, timestamps | public keyless read APIs; registry data policy says `mayPersist` |
| Kalshi | never | never | Developer Agreement bars caching or aggregating |
| Quotient | never fetched by the linker | never | terms restrict redistribution; an operator-supplied paid body is read in memory for the stdout report only when `PM_QUOTIENT=1` |
| every other venue | never | never | terms restrictive or unread (registry: memory-only) |

Under `/data` (the volume): `registry.json` (the working link registry the candidates are added to),
`out/linker-state.json`, `out/candidates.bundle.json`, `out/candidates.bundle.pin`,
`out/structure-groups.json`. No title, question or rules text is ever written: the state file holds
token hashes, the bundle holds ids and the two rule hashes per leg.

## Deploy, step by step

1. **Create the service** from this repository (dashboard: New Project, Deploy from GitHub repo; or
   `railway init` then `railway up` from the repository root). Do not set a root directory.
2. **Point it at the Dockerfile**: variable `RAILWAY_DOCKERFILE_PATH=deploy/linker/Dockerfile`.
   `railway.json` here says the same, but Railway only reads it from the repository root.
3. **Make it a cron service**: Service, Settings, Cron Schedule: `0 */2 * * *` (every two hours, UTC).
   Railway starts the container on the schedule and expects it to exit; `CMD ["once"]` does that.
4. **Mount the volume** at `/data` (a few MB is plenty: the registry and bundle are small JSON files).
5. **Restart policy**: Never (a failed pass is retried by the next schedule, not by a restart loop).
   Leave the healthcheck empty; there is no HTTP port.
6. **No other variables are needed.** `PM_QUOTIENT` stays unset: the container has no paid body to read.
7. **Watch the first run** in the logs: a `pm-linker once at ...` summary with per-venue counts, the
   number proposed, and `quotient: off`.

## Getting the candidates reviewed

The candidates live in `/data/registry.json` on the volume. They reach a person in one of two ways:

- copy the file out (`railway volume` download, or `railway ssh -- cat /data/registry.json`) and review it
  locally with `tsx pm/links/cli.ts list --state candidate --registry <copy>` / `review` / `approve`,
  then commit the approved set through the normal `export --write-shipped` path; or
- do not use the Railway service at all and run the **scheduled routine** described in
  `docs/linker-runbook.md`, which runs `once` inside the repository and commits
  `pm/links/data/registry.json`, the bundle and the pin for review as a pull request. That path keeps a
  single registry in git and is the recommended one.

Running both at once gives two diverging registries; pick one.

## Files in this folder

| File | Purpose |
|---|---|
| `Dockerfile` | two stages: install from the lockfile and bundle; then `node:24-slim` + `linker.mjs` + entrypoint; data directory at `/data` |
| `entrypoint.sh` | creates and owns `/data`, fills in `--registry` and `--out` from the environment, drops to the `node` user, execs node |
| `build.mjs` | bundles `pm/linker/main.ts` into `dist/linker.mjs` with the repository's pinned esbuild; deterministic; prints the sha256 |
| `railway.json` | builder, cron schedule and restart policy (Config as Code is deprecated by Railway; use the service settings) |
| `Dockerfile.dockerignore`, `.dockerignore` | keep the toolchain, dependencies, data and other apps out of the build context |

Build the bundle yourself with `node deploy/linker/build.mjs` (project toolchain); `dist/` is git-ignored.
Build the image with `docker build -f deploy/linker/Dockerfile -t pm-linker .` from the repository root.

## What was and was not verified

Verified locally: the bundle builds deterministically (same sha256 twice) and contains no secrets, home
paths, email addresses or the approval function; the `once`, `dry-run`, `report` and `export-app`
commands against loopback servers replaying the real captured response shapes; the lock; the privacy
scans.

Not verified: `docker build` of the two-stage Dockerfile; anything on Railway (cron service behaviour,
the volume, `railway ssh`); any run against the real venues; the real number of XO detail reads per pass.
