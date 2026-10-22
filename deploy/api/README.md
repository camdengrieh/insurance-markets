# insurance-markets-api container

The markets API (`api/`) as one long-running container with one data directory: the free read endpoints of
`docs/sdk-and-api-design.md` section 4 and the chain indexer of section 7, in one Node process. It needs no secret.
It holds no wallet, no signer and no venue credential, and it submits nothing.

**Where it runs:** nowhere yet; nothing has been deployed. The image follows `deploy/recorder` and `deploy/linker`. The
AWS layout in `deploy/aws` (one EC2 host, the image in ECR, an EBS volume at `/data`, systemd) can host it beside them;
`deploy/aws` is not changed here. Before the first deployment, put a TLS-terminating proxy in front (the API speaks
plain HTTP) and set `API_TRUST_PROXY_HOPS` to match it.

## What it serves, and what it never serves

| Route | Returns |
|---|---|
| `GET /v1/health` | version, uptime, the served venues, each chain indexer's state and lag, the stated limits |
| `GET /v1/venues` | every venue: licence class, data terms, served or not and why, reader capabilities, read state (`ok`, `throttled`, `blocked`, `chain_only`, or `not_read` for a venue that is never asked), the chain it settles on and the indexer's progress |
| `GET /v1/markets?venue=&category=&q=&limit=&cursor=` | normalised markets of the served venues, each field with its source (`venue_api`, `chain`, `cache`) and age |
| `GET /v1/markets/:venue/:id` | one market, its rules fingerprint (`rules-v2`), its books, each with its source and age |
| `GET /v1/groups` | approved links (approved by a person) and linker candidates, always labelled `proposed` with their score band |

Section 5 of the design is enforced in one place, `api/serving.ts`, over `sdk/venues/licence.ts`: a venue is served only
when a licence class (`open` or `attribution`) is recorded for it, its terms are not restricted and the platform
registry found no restrictive clause. As recorded on 2026-10-22 that is **Trueo alone**. The six `own_use_only` venues
(Kalshi, Novig, OG, Gemini, Underdog Exchange, ProphetX) are never read, cached or served; XO, Polymarket, Limitless and
every other venue without a licence class are not served until a person records one; Quotient is never read or served.
A venue that is not served is never asked. No variable or file can widen this.

## Running it

Build from the **repository root**:

```sh
docker build -f deploy/api/Dockerfile -t insurance-markets-api .
docker run --rm -p 127.0.0.1:8790:8790 -v "$PWD/data:/data" insurance-markets-api
curl -s http://127.0.0.1:8790/v1/health
```

Two stages like the recorder's: install from the committed lockfile and bundle `api/main.ts` (built from `api/` and
`sdk/` only) with `build.mjs`; then `node:24-slim` plus that one file and the entrypoint. No `node_modules`, no
sources, no tests; `node:sqlite` is built into Node 24. The image declares no `VOLUME`: mount the persistent disk at
`/data`. The entrypoint starts as root only to make `/data` writable, then runs node as the `node` user. SIGTERM closes
the listener, lets requests in flight finish for up to 5 s and closes the database; the next start resumes each chain
from its stored cursor. Give it a restart policy (it is a server) and use `GET /v1/health` as the health check.

Without Docker: `node deploy/api/build.mjs && API_DATA_DIR=./data node deploy/api/dist/api.mjs`, or from the sources
`API_DATA_DIR=./data pnpm api` (the project toolchain).

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `API_DATA_DIR` | required (the image sets `/data`) | directory of the chain index, `api.sqlite` |
| `API_HOST` | `127.0.0.1` (the image sets `0.0.0.0`) | an IPv4 address, `::` or `::1` |
| `API_PORT` | `8790` | `0` picks a free port |
| `API_CORS_ORIGINS` | none | comma-separated exact https origins of the dApp (or `http://localhost:<port>`); only these get CORS headers |
| `API_TRUST_PROXY_HOPS` | `0` | proxies in front that append to `X-Forwarded-For`; the per-client limit uses the address the outermost one saw |
| `API_INDEXER` | `on` | `off` serves venue rows without chain fields and runs no indexer |
| `API_CHAINS` | `polygon,base,xo` | which chains to index |
| `API_RPC_POLYGON`, `API_RPC_BASE`, `API_RPC_XO` | the SDK's public RPCs (publicnode for Polygon and Base, XO's own) | 1 to 4 comma-separated https URLs per chain, tried in order with failover; never printed (a provider key may sit in the path); query strings and credentials are refused |
| `API_START_BLOCK_<CHAIN>` | the safe head on first start | first block to index on a chain with no cursor yet |
| `API_CONFIRMATIONS_<CHAIN>` | `64` | blocks behind the head before a block is indexed (12 to 5,000) |
| `API_FILL_RETENTION_DAYS` | `7` | fills older than this (by index time) are pruned hourly; resolutions and preparations are kept |
| `API_LINKS_BUNDLE`, `API_LINKS_PIN` | none | the shipped link bundle (`pm/links/data/links.bundle.json`) and its pin file |
| `API_CANDIDATES_BUNDLE`, `API_CANDIDATES_PIN` | none | the linker's `candidates.bundle.json` and `candidates.bundle.pin` (on the AWS host, the linker's `/data/out`) |

Limits are compiled in and stated, not configured: per client, the two market routes share a bucket of 20 requests
refilled at 30 a minute, every other route a bucket of 60 refilled at 60 a minute; over it, `429` with `Retry-After`.
URLs over 1,024 characters are `414`; a request with a body is `413`; methods other than GET, HEAD and OPTIONS are `405`.
Errors are JSON with a fixed code: `{"error":{"code","message"}}`.

## Upstream behaviour

Every outbound request names the service with the fixed User-Agent `insurance-markets-api/0.1`, sends no Origin,
cookie or credential, follows no redirect and uses no proxy. Venue reads go through the SDK readers behind the shared
state rule (`sdk/venues/state.ts`): a 429 with Retry-After cools the venue down, a 403, three 401s or a web page served
where JSON was expected blocks it for ten minutes, and nothing retries around either. A venue's list is read at most
once a minute and at most three pages of 50 rows; answers are kept in memory only, labelled `cache` with their age.

The indexer reads only pinned contracts (code hash checked before the first log), one bounded `eth_getLogs` per range
(never open, never more than 10,000 blocks; the span halves when a node refuses its size), up to 10 ranges per pass,
a pass every 6 s on Polygon and 10 s on Base and the XO chain, and only blocks at least the confirmation depth below the
head. A failing RPC endpoint is set aside for 30 s to 10 minutes and the next is asked.

## Files in this folder

| File | Purpose |
|---|---|
| `Dockerfile` | two stages: install from the lockfile and bundle; then `node:24-slim` + `api.mjs` + entrypoint; data at `/data`, port 8790 |
| `entrypoint.sh` | creates and owns `/data`, drops to the `node` user, execs node so SIGTERM reaches it |
| `build.mjs` | bundles `api/main.ts` into `dist/api.mjs` with the repository's pinned esbuild; deterministic; prints the sha256 |
| `Dockerfile.dockerignore`, `.dockerignore` | keep the toolchain, dependencies, data and other apps out of the build context |

`dist/` is git-ignored.

## What was and was not verified

Verified (`test/api/`): the bundle builds deterministically, starts with no secret, answers `/v1/health` and
`/v1/venues` and stops cleanly on SIGTERM; every endpoint against every venue class with the real serving policy and
the served venue in each read state; the indexer against one recorded pass per chain (real public RPC answers of
2026-10-22: 80 Polygon fills in 3 blocks, 5 Limitless fills, 5 resolutions and 6 condition preparations in 200 Base
blocks, 96 XO fills in 20 blocks), failover, range halving, reorg rewind and a pin failure. On 2026-10-22 one local run
against the real public upstreams answered `/v1/venues` with no venue request, refused `/v1/markets?venue=polymarket`
with `venue_not_served` (licence unknown) without contacting Polymarket, and read Trueo's list over Base (25 JSON-RPC
POSTs): the three pages it read then (60 of Trueo's 1,376 active markets, at 20 a page; the page size is now 50) were
all conditional markets, which the SDK's Trueo reader skips, so the list was empty.

Not verified: the Docker image build (no Docker run here), any deployment, and a long run of the indexer at the head.
