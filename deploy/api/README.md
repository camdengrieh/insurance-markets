# insurance-markets-api container

The markets API (`api/`) as one long-running container with one data directory: the free read endpoints of
`docs/sdk-and-api-design.md` section 4, the paid quote and route prepare endpoints with their metering (subscription keys
and x402), and the chain indexer of section 7, in one Node process. It needs no secret: the payment address and the
prices are public values, keys are stored as hashes, and the facilitator is called without a credential. It holds no
wallet, no signer, no private key and no venue credential, and it submits nothing.

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
| `GET /v1/quote?group=&side=&size=&outcome=` | paid: the engine's depth-walked fill of a size on each leg of a group, after fees, best venue first, each number with its source and age |
| `POST /v1/route/prepare` | paid, and off unless `API_ROUTE_PREPARE` is set: unsigned typed-data orders per leg with the decoded view and what the signer must check |

The contract of the two paid routes, the metering rules and the listing steps are in `api/README.md`.

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
| `API_ROUTE_PREPARE` | `off` | `off` (the route answers `route_prepare_not_enabled`), `free` (no charge) or `paid` (a key of tier `full`, or x402). Section 5 of the design: selling it needs a legal read first |
| `API_PUBLIC_URL` | none | the https origin clients reach the API at (the x402 resource URL); required once any payment variable is set |
| `API_X402_FACILITATOR_URL` | none | the x402 facilitator's base URL (`/verify` and `/settle` are appended); https, no query or credentials; called without a credential |
| `API_X402_PAY_TO` | none, never defaulted | the address that receives payments (20-byte hex, EIP-55 checksum if mixed case, not zero) |
| `API_X402_NETWORK` | none | `eip155:8453` (Base mainnet), the one network whose USDC is pinned |
| `API_X402_PRICE_QUOTE`, `API_X402_PRICE_ROUTE_PREPARE` | none, never defaulted | USDC per call, above 0 and at most 10, at most 6 places (`0.01`); an endpoint with no price is not sold |

Any payment variable needs all of `API_PUBLIC_URL`, `API_X402_FACILITATOR_URL`, `API_X402_PAY_TO` and `API_X402_NETWORK`,
or the API does not start. With none set, the paid routes answer `503 payments_not_configured`, and a subscription key is
the only way in. Payments are taken only after the API has checked on Base (the first `API_RPC_BASE` URL) that the USDC
contract and its implementation are the pinned ones; a payer's signature is checked there too (ECDSA, or ERC-1271 for a
smart account), as USDC will check it.

Operator commands, run in the container (or with the bundle) against the same `API_DATA_DIR`:

```sh
node /app/api.mjs keys issue --label "dApp" --tier quote --per-minute 600 --burst 100 --days 365   # prints the key once
node /app/api.mjs keys list
node /app/api.mjs keys revoke <id>
node /app/api.mjs listing      # the x402 listing manifest of the paid routes, from the environment
```

Limits are compiled in and stated, not configured: per client, the two market routes share a bucket of 20 requests
refilled at 30 a minute, the two paid routes (without a key) a bucket of 30 refilled at 30 a minute, every other route a
bucket of 60 refilled at 60 a minute; a key brings its own limit; over it, `429` with `Retry-After`. URLs over 1,024
characters are `414`; request headers over 16 KiB are refused (a smart account's payment header can be several KiB); a
body on a GET is `413`; `POST /v1/route/prepare` takes `application/json` only (`415`) of at most 16,384 bytes (`413`);
other methods are `405`. Errors are JSON with a fixed code: `{"error":{"code","message"}}`; a `402` body is the x402
PaymentRequired object, also in the `PAYMENT-REQUIRED` header.

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

Verified for step 9 (`test/api/x402.test.ts`, `keys.test.ts`, `quote.test.ts`, `deploy.test.ts`): every paid path with a
fake facilitator and EIP-3009 payloads signed by keys generated in the tests (no payment, bad signature, wrong amount,
asset, network or recipient, expired, not yet valid, replayed, ERC-6492, a fake ERC-1271 wallet accepting and refusing,
valid then settled, failed handler never settled, settlement refused, pending and unanswered, facilitator and RPC down,
USDC code or implementation changed); keys (missing, wrong, malformed, revoked, expired, over their limit, tier); quotes
and route prepare against the served venue in each fake state with the real policy, and Polymarket through a test policy;
the bundle's `keys` and `listing` commands. On 2026-10-22 one local run served `/v1/quote` against the SDK's recorded Trueo
world and paid it end to end over HTTP: 402, a signed payment, the loopback fake facilitator's `/verify` and `/settle`, 200
with `PAYMENT-RESPONSE`, then 402 for the replay.

Not verified: the Docker image build (no Docker run here), any deployment, a long run of the indexer at the head, any real
facilitator, any real payment, and whether PayBox's `use_service` pays a version 2 challenge.
