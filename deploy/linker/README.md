# pm-linker container

The link proposer (`pm/linker`) as one container that runs one pass (`once`) and exits 0, started on a
schedule by the platform. It needs no credentials. It sends only `GET` requests with the User-Agent
`insurance-markets-research/0.1` to three public read hosts (XO Data API, Polymarket Gamma, Limitless),
within the recorder's per-host budgets. It trades nothing and approves nothing: every link it writes is a
**candidate** that a person reviews with `tsx pm/links/cli.ts review <id>` and `approve`.

**Where it runs:** on AWS, see `deploy/aws/README.md` (a systemd timer on the recorder's host runs it
every two hours, UTC, with its own directory on the EBS volume). This folder only defines the image. The
full operating guide, the terms table, the scoring formula and the scheduled-routine alternative are in
`docs/linker-runbook.md`.

## What it reads and writes

| Venue | Read | Persisted | Why |
|---|---|---|---|
| XO, Polymarket (international), Limitless | yes (allowlist in code) | ids, hashes, categories, timestamps | public keyless read APIs; registry data policy says `mayPersist` |
| Kalshi | never | never | Developer Agreement bars caching or aggregating |
| Quotient | never fetched by the linker | never | terms restrict redistribution; an operator-supplied paid body is read in memory for the stdout report only when `PM_QUOTIENT=1` |
| every other venue | never | never | terms restrictive or unread (registry: memory-only) |

Under `/data`: `registry.json` (the working link registry the candidates are added to),
`out/linker-state.json`, `out/candidates.bundle.json`, `out/candidates.bundle.pin`,
`out/structure-groups.json`. No title, question or rules text is ever written: the state file holds
token hashes, the bundle holds ids and the two rule hashes per leg.

## The image

Build from the **repository root**:

```sh
docker build -f deploy/linker/Dockerfile -t pm-linker .
docker run --rm -v "$PWD/data:/data" pm-linker            # once (the default command)
docker run --rm -v "$PWD/data:/data" pm-linker dry-run
```

Two stages like the recorder's: install from the lockfile and bundle `pm/linker/main.ts` with `build.mjs`;
then `node:24-slim` plus that one file and the entrypoint. The entrypoint fills in `--registry` and `--out`
from `LINKER_REGISTRY=/data/registry.json` and `LINKER_OUT=/data/out`, makes `/data` writable, drops to the
`node` user and execs node. A failed pass is retried by the next schedule, not by a restart loop: give it
no restart policy and no healthcheck (there is no HTTP port). `PM_QUOTIENT` stays unset: the container has
no paid body to read. Expected log: a `pm-linker once at ...` summary with per-venue counts, the number
proposed, and `quotient: off`.

## Getting the candidates reviewed

The candidates live in `/data/registry.json` wherever the container runs. They reach a person in one of
two ways:

- copy the file out (on the AWS host, through the transfer bucket in `deploy/aws/README.md`) and review it
  locally with `tsx pm/links/cli.ts list --state candidate --registry <copy>` / `review` / `approve`,
  then commit the approved set through the normal `export --write-shipped` path; or
- do not schedule the container at all and run the **scheduled routine** described in
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
| `Dockerfile.dockerignore`, `.dockerignore` | keep the toolchain, dependencies, data and other apps out of the build context |

Build the bundle alone with `node deploy/linker/build.mjs` (project toolchain); `dist/` is git-ignored.

## What was and was not verified

Verified: the bundle builds deterministically (same sha256 twice) and contains no secrets, home paths,
email addresses or the approval function; the image builds for `linux/arm64`; the `once`, `dry-run`,
`report` and `export-app` commands against loopback servers replaying the real captured response shapes;
the lock; the privacy scans.

Not verified: any run against the real venues (the first scheduled run on AWS is due 2026-10-22 06:00
UTC); the real number of XO detail reads per pass.
