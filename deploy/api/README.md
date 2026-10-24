# insurance-markets-api container

The markets API (`api/`) as one long-running container with one data directory: the free read endpoints of
`docs/sdk-and-api-design.md` section 4, the paid quote and route prepare endpoints with their metering (subscription keys
and x402), and the chain indexer of section 7, in one Node process. The free tier needs no secret: the payment address and
the prices are public values, keys are stored as hashes, and the facilitator is called without a credential. The
unified-account routes (`api/README.md` "Unified account routes") use the operator's own credentials, read from the
environment and never printed; each feature answers 503 `not_configured` without its own. It holds no wallet, no private
key and no visitor credential.

**Where it runs:** nowhere yet; nothing has been deployed. The image follows `deploy/recorder` and `deploy/linker`.
`deploy/aws` is ready to host it beside them on the same EC2 host (`pm-api` under systemd, data at `/data/api`, the image
in ECR) behind CloudFront for HTTPS (the API speaks plain HTTP), with `API_XO_RELAY=on`, `API_LIMITLESS_RELAY=on`, `API_PAYMASTER=on`,
`API_POLYMARKET_RELAY=on`, `API_ACCOUNT_BACKUP=on`, the operator credentials from SSM in an env file, `API_TRUST_PROXY_HOPS=1`,
`API_CORS_ORIGINS=https://xo-markets-explorer.vercel.app` and `API_INDEXER=off`; the steps are in
`deploy/aws/README.md` ("Deploy the markets API and the XO relay").

## What it serves

| Route | Returns |
|---|---|
| `GET /v1/health` | version, uptime, the venues read (`readers`), each chain indexer's state and lag, the stated limits |
| `GET /v1/venues` | every venue: whether the API has a reader for it, the reader's capabilities, read state (`ok`, `throttled`, `blocked`, `chain_only`, or `not_read` for a venue with no reader), its kept list's size and age, the chain it settles on, and the indexer's progress |
| `GET /v1/markets?venue=&category=&q=&limit=&cursor=` | normalised markets of every venue read (or one), each field with its source (`venue_api`, `chain`, `cache`) and age |
| `GET /v1/markets/:venue/:id` | one market, its rules fingerprint (`rules-v2`), its books, each with its source and age |
| `GET /v1/groups` | approved links (approved by a person) and linker candidates, always labelled `proposed` with their score band |
| `GET /v1/quote?group=&side=&size=&outcome=` | paid: the engine's depth-walked fill of a size on each leg of a group, after fees, best venue first, each number with its source and age |
| `POST /v1/route/prepare` | paid, and off unless `API_ROUTE_PREPARE` is set: unsigned typed-data orders per leg with the decoded view and what the signer must check |
| `/v1/relay/xo/clob/...`, `/v1/relay/xo/bundler` | free, and off unless `API_XO_RELAY=on`: the XO order relay, eight allowlisted order-book calls the dApp's browser signed, and five allowlisted JSON-RPC methods of XO's bundler (the visitor's own account setup, one signed user operation), forwarded unchanged (`api/README.md`) |
| `/v1/relay/limitless/...` | free, and off unless `API_LIMITLESS_RELAY=on`: the Limitless partner relay (signing message, register, orders, cancel and open orders with the operator's partner token, the market record) (`api/README.md`) |
| `POST /v1/paymaster/:chainId`, `POST /v1/relay/polymarket-bridge/deposit` | free, and off unless `API_PAYMASTER=on`: the gas sponsor for the trading key on 137, 8453 and 56 (Pimlico, with a call allowlist), and the bridge deposit address of the sender's own Polymarket wallet |
| `/v1/relay/polymarket/...` | free, and off unless `API_POLYMARKET_RELAY=on`: Polymarket's relayer for Deposit Wallets with the operator's Builder HMAC |
| `PUT`, `GET /v1/account-backup/<credentialIdHex>` | free, and off unless `API_ACCOUNT_BACKUP=on`: write-once encrypted key backups, `PUT` with the account's ownership proof |

The contract of the two paid routes, the metering rules and the listing steps are in `api/README.md`.

Every venue the SDK has a keyless reader for is read and served on every endpoint: XO, Polymarket, Kalshi, Limitless,
Trueo, Hyperliquid, Pascal, Novig, Gemini and Manifold (`api/markets.ts`). Any other venue is never asked and answers
`no_reader` (404). The API does not filter venues by licence class or data terms. Links are served as approved only when
a person approved them; every candidate is served as `proposed`. Quotient is not read: it is a signal service a user's own
agent pays for per call, not a venue.

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
| `API_ROUTE_PREPARE` | `off` | `off` (the route answers `route_prepare_not_enabled`), `free` (no charge) or `paid` (a key of tier `full`, or x402) |
| `API_XO_RELAY` | `off` | `on` serves the XO order relay under `/v1/relay/xo/clob/` and its bundler route `/v1/relay/xo/bundler` (`api/README.md`); off, every relay path answers `403 relay_not_enabled` and nothing is forwarded. Its CORS origins are compiled in (the dApp and localhost dev servers), not taken from `API_CORS_ORIGINS` |
| `API_LIMITLESS_RELAY` | `off` | `on` serves the Limitless partner relay under `/v1/relay/limitless/` (`api/README.md`); off, every path under it answers `403 relay_not_enabled` and nothing is forwarded. Independent of `API_XO_RELAY`; the same compiled-in CORS origins |
| `API_PUBLIC_URL` | none | the https origin clients reach the API at (the x402 resource URL); required once any payment variable is set |
| `API_X402_FACILITATOR_URL` | none | the x402 facilitator's base URL (`/verify` and `/settle` are appended); https, no query or credentials; called without a credential |
| `API_X402_PAY_TO` | none, never defaulted | the address that receives payments (20-byte hex, EIP-55 checksum if mixed case, not zero) |
| `API_PAYMASTER` | `off` | `on` serves `/v1/paymaster/:chainId` and `/v1/relay/polymarket-bridge/deposit` (`api/README.md`); off, both answer `403 relay_not_enabled` |
| `API_POLYMARKET_RELAY` | `off` | `on` serves `/v1/relay/polymarket/...`; off, `403 relay_not_enabled` |
| `API_ACCOUNT_BACKUP` | `off` | `on` serves `/v1/account-backup/...`; off, `403 relay_not_enabled` |
| `PIMLICO_API_KEY`, `PIMLICO_SPONSORSHIP_POLICY_ID` | none, never printed | the paymaster's Pimlico key and sponsorship policy; without both it answers `503 not_configured` |
| `POLY_BUILDER_API_KEY`, `POLY_BUILDER_SECRET`, `POLY_BUILDER_PASSPHRASE` | none, never printed | the Polymarket Builder credentials (the secret is base64); without all three the Polymarket relay answers `503 not_configured` |
| `POLY_BUILDER_CODE` | none | the public builder code (0x and 64 hex), sent as `X-Builder-Code` to the bridge |
| `LIMITLESS_PARTNER_TOKEN_ID`, `LIMITLESS_PARTNER_SECRET` | none, never printed | the Limitless partner token (scopes `trading`, `account_creation`, `delegated_signing`; the secret is base64); without both every Limitless relay route but the market read answers `503 not_configured` |
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
cookie or credential, follows no redirect, uses no proxy and takes at most 10 MiB per answer. Venue reads go through
the SDK readers behind the shared state rule (`sdk/venues/state.ts`): a 429 with Retry-After cools the venue down, a
403, three 401s or a web page served where JSON was expected blocks it for ten minutes, and nothing retries around
either. A venue's list is read at most
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
`/v1/venues` and stops cleanly on SIGTERM; every endpoint against every venue, those with a reader served and the rest
answering `no_reader`, with Trueo in each read state; the indexer against one recorded pass per chain (real public RPC
answers of 2026-10-22: 80 Polygon fills in 3 blocks, 5 Limitless fills, 5 resolutions and 6 condition preparations in 200 Base
blocks, 96 XO fills in 20 blocks), failover, range halving, reorg rewind and a pin failure. On 2026-10-22 one local run of
the bundle with the default configuration (indexer on) against the real public upstreams: `/v1/venues` listed the 19
venues, 10 with a reader, each `ok`, with no venue request; `/v1/markets?venue=polymarket`, `xo` and `limitless` answered
150, 150 and 73 rows, every venue field `venue_api` and the settlement `null` with the index's block range;
`/v1/markets/polymarket/<id>` and `/v1/markets/xo/<id>` answered the market, its rules fingerprint and both books from
`venue_api`; Kalshi, Hyperliquid and Novig answered 150 rows each, Manifold 150 and Gemini 60 after the 8 s budget (the
first request answered with none and the read filled the kept list), Pascal 150 once the per-answer cap was raised from
4 MiB (its snapshot was 5.9 MB); Trueo's Base RPC throttled the list read (429), which the answer stated as `throttled`
with the retry time; `opinion` and `og` answered `no_reader`.

Verified for step 9 (`test/api/x402.test.ts`, `keys.test.ts`, `quote.test.ts`, `deploy.test.ts`): every paid path with a
fake facilitator and EIP-3009 payloads signed by keys generated in the tests (no payment, bad signature, wrong amount,
asset, network or recipient, expired, not yet valid, replayed, ERC-6492, a fake ERC-1271 wallet accepting and refusing,
valid then settled, failed handler never settled, settlement refused, pending and unanswered, facilitator and RPC down,
USDC code or implementation changed); keys (missing, wrong, malformed, revoked, expired, over their limit, tier); quotes
and route prepare with Trueo in each fake state beside a leg on a venue with no reader, and Polymarket from its recorded
market; the bundle's `keys` and `listing` commands. On 2026-10-22 one local run served `/v1/quote` against the SDK's recorded Trueo
world and paid it end to end over HTTP: 402, a signed payment, the loopback fake facilitator's `/verify` and `/settle`, 200
with `PAYMENT-RESPONSE`, then 402 for the replay.

Not verified: the Docker image build (no Docker run here), any deployment, a long run of the indexer at the head, any real
facilitator, any real payment, and whether PayBox's `use_service` pays a version 2 challenge.
