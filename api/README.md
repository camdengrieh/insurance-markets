# api/ - the markets API

The hosted API of `docs/sdk-and-api-design.md` section 4: the free read endpoints and the chain indexer (step 8 of
section 9), and the paid quote and route prepare endpoints with their metering: subscription keys and x402 (step 9).
Built only from `sdk/` and its own code (no import from `pm/`, `src/`, `relay/`, `app/` or `bridge/`). It is an optional
accelerator: `sdk/` stays runnable by anyone with no service of ours, and local mode never depends on it. It holds no
wallet, no signer, no venue credential and no private key, and it submits nothing of its own (the XO relay below forwards
requests a visitor's browser signed). The container and its run and environment table are in `deploy/api/README.md`.

| File | Contents |
|---|---|
| `main.ts` | the entry point, and the only file that reads `process.env`, the global `fetch` and the wall clock; also the `keys` and `listing` commands |
| `config.ts` | configuration from the environment, validated (relay/config.ts is the pattern); the compiled-in limits |
| `server.ts` | the `node:http` server: methods, size limits, the key check, per-key or per-client token buckets with 429 and Retry-After, the metering gate on paid routes, CORS for the configured dApp origins, fixed JSON errors, settle after a good paid answer |
| `app.ts` | the parts and the route handlers: `/v1/health`, `/v1/venues`, `/v1/markets`, `/v1/markets/:venue/:id`, `/v1/groups`, `/v1/quote`, `/v1/route/prepare` |
| `quote.ts` | one leg priced by the SDK engine (`quoteBook`) with every number's source and age, the crossed-book refusal, the ranking |
| `route-prepare.ts` | the route prepare body schema and the Polymarket EOA order built with `sdk/trade`, with its decoded block and the signer's checks |
| `metering.ts` | the only place money is handled: key check, tier, x402 gate (402, verify, claim), settle or release |
| `keys.ts`, `keys-cli.ts` | subscription keys (issue, constant-time check, tiers, limits) and the operator's `keys` command |
| `x402.ts` | x402 version 2 from the specification: requirements, the payload schema, the local checks, the signature as USDC checks it (ECDSA or ERC-1271 on Base), the facilitator client, the on-chain check of the pinned USDC |
| `listing.ts` | the bazaar discovery extension every 402 carries and the listing manifest (`node api.mjs listing`) |
| `metering-store.ts` | the `api_keys` and `x402_payments` tables in the same SQLite file as the index |
| `markets.ts` | every SDK venue reader that needs no key, behind the shared state rule; the in-memory list, detail, book and fee caches with their read times; each row's fields with source and age; `tradeView` for quotes and orders |
| `chain-fields.ts` | the index's read functions: an outcome's last trade from its fills, a market's settlement from resolution events |
| `groups.ts` | approved links and linker candidates from the hash-pinned link bundles; candidates always "proposed" with their band |
| `upstream.ts` | the one outbound fetch: User-Agent `insurance-markets-api/0.1`, no Origin, cookie or credential, no redirect, a size cap and a deadline |
| `xo-relay.ts` | the XO order relay under `/v1/relay/xo/clob/` and the bundler route `/v1/relay/xo/bundler` (off unless `API_XO_RELAY=on`): the route and JSON-RPC method allowlists, the forwarded XO headers, the 64 KiB body cap, its own CORS rule and per-client limit; it forwards what the visitor's browser signed and holds nothing |
| `store.ts` | `IndexStore`, the storage seam, and `SqliteIndexStore` over `node:sqlite` |
| `indexer/chains.ts` | what is indexed per chain: the pinned exchanges (OrderFilled), Conditional Tokens (ConditionResolution, ConditionPreparation) and Polymarket's Protocol V2 modules (ConditionResolved) |
| `indexer/indexer.ts` | one chain's indexer: pin checks, confirmation depth, reorg check and rewind, bounded adaptive ranges |
| `indexer/rpc-pool.ts` | several RPC endpoints per chain, chain id checked, failover with cool-downs |
| `indexer/events.ts` | the ConditionPreparation and module ConditionResolved decoders |

## Rules

- **Every venue with a reader is served.** `markets.ts` constructs every SDK reader that reads without a key and knows its
  host: XO, Polymarket, Kalshi, Limitless, Trueo, Hyperliquid, Pascal, Novig, Gemini and Manifold. Every endpoint serves
  each of them. Any other venue (OG, SX Bet and Underdog Exchange, whose readers have no registered host; Polymarket US,
  Myriad, World, ProphetX, Predict.fun and Opinion, which have no reader) is never asked and answers `no_reader` (404).
  The API does not filter venues by licence class or data terms, and no answer carries either. Quotient is not read: it
  is a signal service a user's own agent pays for per call, not a venue.
- **Links are approved only by a person.** `/v1/groups` serves a link as approved only when its record holds a person's
  recorded approval; every linker candidate is served as `proposed` with its score band.
- **Never shown as live when it is not.** A row read for this request is `venue_api` (or `chain` for a venue read from its
  contracts, like Trueo); a row kept from an earlier read is `cache` with its age; an index field is `chain` with the time
  the index read it and the block it rests on. A field with no value is `null` with the reason. Venue answers stay in
  memory (`sdk/venues/cache.ts`: market data never reaches disk); the database holds public chain events only.
- **No disguise, no retry around a block.** One honest User-Agent, no proxy, no spoofed header; a throttled or blocked
  venue is refused before sending (`sdk/venues/state.ts`) and keeps its rows with its chain fields and the stated reason.
- **Only pinned contracts, only bounded ranges.** Every contract the indexer reads is an SDK pin, checked against its code
  hash before the first log; a contract that changed stops that chain's indexer. Each `eth_getLogs` names a numeric range
  no wider than the span (at most 10,000 blocks, the RPC port's cap), ending at least the confirmation depth below the head.

- **Money only in `metering.ts`.** `sdk/` never sees a price, a key or a payment; the handlers never see one either. A
  paid answer is settled only after it was built; a failed answer is never settled.
- **No defaults for money.** The payTo address, the network, the facilitator, the public URL and each price come from the
  environment only; without them a paid route answers `payments_not_configured` (a key still works).
- **Route prepare is off by default**, the operator's switch: `API_ROUTE_PREPARE=free` serves it at no charge; `paid`
  sells it.

## The XO order relay (`/v1/relay/xo/clob/...`, `/v1/relay/xo/bundler`)

XO's order book (`orderbooks.xo.market`) sends no CORS headers for the dApp's origin, so a browser cannot read its
answers. The relay lets the dApp (`app/src/features/trade/direct/xo/`) trade with the visitor's own wallet: the browser
signs everything (the ClobAuth login and every order with the wallet, every L2 request with the visitor's own API
credential, kept in the visitor's tab), and the relay forwards the signed request unchanged. It holds no key, no
credential and no signer, and stores nothing about a request or an answer. Off by default: `API_XO_RELAY=on`.

| Relay route | Forwarded to `https://orderbooks.xo.market` | Headers forwarded |
|---|---|---|
| `GET /v1/relay/xo/clob/time` | `GET /time` | none |
| `GET /v1/relay/xo/clob/balance-allowance?address=0x<40 hex>` | `GET /balance-allowance?address=...` (the registry and balance read) | none |
| `GET /v1/relay/xo/clob/book?token_id=<decimal>` | `GET /book?token_id=...` | none |
| `GET /v1/relay/xo/clob/auth/derive-api-key` | `GET /auth/derive-api-key` | L1: `XO_ADDRESS`, `XO_SIGNATURE`, `XO_TIMESTAMP`, `XO_NONCE` |
| `POST /v1/relay/xo/clob/auth/api-key` | `POST /auth/api-key` | L1 |
| `POST`, `DELETE /v1/relay/xo/clob/order` | `POST /order` (place), `DELETE /order` (cancel) | L2: `XO_API_KEY`, `XO_PASSPHRASE`, `XO_TIMESTAMP`, `XO_SIGNATURE`, `XO_ADDRESS` |
| `GET /v1/relay/xo/clob/orders` | `GET /orders` (no query: the L2 signature covers the path) | L2 |
| `GET /v1/relay/xo/clob/orders/0x<64 hex>` | `GET /orders/<hash>` (an order post that got no answer is looked up, never resent) | L2 |

Nothing else is forwarded: another path or method is 404 or 405 before anything is sent, and a query key that is not
listed is 400. The browser may name the XO headers `xo-api-key` or `xo_api_key` (a proxy in front may drop a name with
an underscore, so the dApp sends the hyphen form); both spellings of one header is 400. Cookies, `Authorization`, the
viewer's `Origin` and every other header stay at the relay. Bodies: `application/json` only, at most 65,536 bytes,
forwarded byte for byte (the L2 signature covers them). The answer is XO's status and body with only its content-type
(JSON or plain text; anything else is relabelled `text/plain`), plus `x-xo-relay: upstream`; the relay's own refusals
carry `x-xo-relay: refused` and a JSON error (`relay_not_enabled`, `origin_not_allowed`, `upstream_timeout` 504,
`upstream_unreachable` 502, `upstream_invalid` 502 for a redirect or an answer over 1 MiB). XO gets 10 s; nothing is
retried. CORS: `https://xo-markets-explorer.vercel.app` and `http://localhost:<port>` / `http://127.0.0.1:<port>` (the
dApp's dev servers) only; any other `Origin` is refused (403) before sending; preflights are cached 7,200 s; no
credentials mode. Limit: 30 requests at once per client, then 60 a minute (429 with `Retry-After`). Logs: method, route
label, status and time; never a header value, a query or a body (`test/api/relay.test.ts`).

### The bundler route (`POST /v1/relay/xo/bundler`)

XO's ERC-4337 bundler (`https://mainnet-bundler.xo.market/`) sends no CORS headers either. The dApp sets up the
visitor's XO account from the page (`app/src/features/trade/direct/xo/setup.ts`): it builds ONE user operation with the
shared SDK builders (deploy through initCode when the account has no code, then Enable Trading's two approvals), the
visitor's wallet signs its 32-byte userOpHash with `personal_sign`, and the page sends it through this route. The relay
adds nothing to it and holds no key.

| Relay route | Forwarded to | Body |
|---|---|---|
| `POST /v1/relay/xo/bundler` | `POST https://mainnet-bundler.xo.market/` | one JSON-RPC 2.0 request, byte for byte |

Only these methods, each with the params it takes: `eth_supportedEntryPoints` (`[]`), `eth_estimateUserOperationGas`
and `eth_sendUserOperation` (`[userOperation, EntryPoint v0.7]`; any other entry point is refused),
`eth_getUserOperationReceipt` and `eth_getUserOperationByHash` (`[userOpHash]`). No gas-price method: fees are zero on
XO's chain, and the server-side flow asks for none. A batch array, any other method (`eth_chainId`, `debug_bundler_*`,
`pimlico_*`, `eth_sendRawTransaction`, ...), an extra key, an odd `id`, a query, a body that is not `application/json`
or is over 65,536 bytes is refused (400, 415 or 413) before anything is sent. Only `user-agent`, `accept` and
`content-type` go upstream; the answer, the CORS rule, the 10 s deadline, the size cap, the per-client limit (shared
with the order-book routes) and the logs (method, route, status, time; never a body) are as above. Nothing is retried:
an `eth_sendUserOperation` that times out answers `upstream_timeout` saying the operation may or may not have been
accepted, and the dApp looks it up by its hash instead of sending it again. The preflight grants `POST` and
`content-type` only.

## Paid endpoints (the contract)

Both answer JSON; both take a key (`Authorization: Bearer imk_...`) or an x402 payment (`PAYMENT-SIGNATURE`), never both.
A malformed request is refused (400) before any payment is asked for.

### GET /v1/quote?group=&side=&size=&outcome=

| Parameter | Takes |
|---|---|
| `group` | a link id from `GET /v1/groups` (`lnk_` and 32 lowercase hex) |
| `side` | `buy` or `sell` |
| `size` | shares, a decimal above 0 and at most 1,000,000 with at most 6 places |
| `outcome` | optional, the outcome index on the link's first leg (default 0); each leg's own index comes from its outcome map |

Only an identity link, not past its `validUntil`, is quoted (`group_not_quotable` otherwise); a link that is not among the
groups `/v1/groups` serves is `group_not_found`. A leg on a venue the API has no reader for is listed unranked with the
reason "The API has no reader for this venue." The answer: `group` (`state` `approved` with the approval stated, or
`proposed` with its band and "no person has approved"), `request`, `best` (venue, market, net cost and vwap of the first ranked leg, or null),
`legs` (ranked first, then the rest unranked) and `method`. Each leg: `venue`, `marketId`, `outcomeIndex`, `tokenId`,
`collateral`, `executable`, `rank`, `reasons`, `quote` (`requestedSize`, `filledSize`, `complete`, `bestPrice`, `vwap`,
`notional`, `fee`, `netCost`, `feeSpecId`, `feePayer`, `feeError`, `derived`; null when nothing could be quoted) and
`sources` (`market`, `book` with `bookAsOfMs`, `fee` with the spec's `url`, `field`, `verifiedAt`, `ttlSec` and age). A buy's
net cost is notional plus fee, a sell's notional less fee. A leg is executable only when its book is native and filled the
size, its fee is known and in date, and the venue lists the market as tradable.

### POST /v1/route/prepare

`content-type: application/json`, at most 16,384 bytes, strict schema:

```
{ "group": "lnk_<32 hex>", "outcome": 0, "side": "buy" | "sell", "owner": "<the signer's own address>",
  "legs": [ { "venue": "...", "marketId": "...", "price": "0.41", "shares": "10", "tif": "GTC" | "FOK" | "FAK" } ] }
```

1 to 4 legs, each a leg of the group (venue and `marketId` as `/v1/groups` lists them, each once). The answer: `group`,
`owner`, `side`, `outcome`, `submitted: false`, `custody`, and per leg either `built: false` with the `reason`, or
`built: true` with `tokenId`, `order` (kind, signature type 0, book, chain 137, exchange, order type), `signTypedData`
(eth_signTypedData_v4 JSON), `digest`, `digestTag`, `orderHash`, `wire` (the venue's order object without a signature),
`decoded` (the `sdk/trade/contract.ts` decoded block; `rebuildClobOrder` rebuilds the digest from it alone), `summary`,
`covered`, `unbound`, `reference` (the book's best prices with source and age) and `signerChecks`. Built today: Polymarket
orders made by the owner's own address. Not built, with the reason: Limitless (the SDK reader carries no exchange or fee
module, both signed), XO (Kernel user operations, the relay's job), Trueo (a pool swap), a Polymarket Deposit Wallet.

## Metering

**Keys.** `node api.mjs keys issue --label <text> --tier quote|full [--per-minute N] [--burst N] [--days N]` prints the key
once; `keys list` and `keys revoke <id>` manage them (in `API_DATA_DIR/api.sqlite`, sha256 only). Tier `quote` opens
`/v1/quote`, `full` also `/v1/route/prepare`. A key's limit (default 120 a minute, burst 60) replaces the client's on every
route. A bad, revoked or expired key is 401 on every route, even a free one; a key whose tier does not open a route is 403.

**x402** (version 2; sources: github.com/coinbase/x402 at commit 0e6e8c55d86b4f14234fb6e49a4052074fb93e57, read
2026-10-22: `specs/x402-specification-v2.md`, `specs/transports-v2/http.md`, `specs/schemes/exact/scheme_exact.md`,
`scheme_exact_evm.md`, `specs/extensions/bazaar.md`; EIP-3009; github.com/circlefin/stablecoin-evm at commit
fc85788bc7c23cefe3df1a757133048bfddadeaa, `contracts/v2/EIP3009.sol` and `contracts/util/SignatureChecker.sol`):

| Request | Answer |
|---|---|
| no `PAYMENT-SIGNATURE` | 402; `PAYMENT-REQUIRED` (base64) and the body hold the PaymentRequired object: one `exact` offer on `eip155:8453`, asset USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, the configured `payTo` and price in atomic units, `maxTimeoutSeconds` 60, `extra` `{ name: "USD Coin", version: "2" }`, the resource URL (public origin, path and query), the bazaar extension |
| a header that is not a v2 exact-EVM payload | 400 |
| a payload whose scheme, network, asset, payTo, amount, timeout, token domain or resource differ; an authorization not valid yet, expiring within 10 s, or valid for more than an hour; a bad signature; an ERC-6492 signature; an authorization seen before | 402 with the reason, before the facilitator or the handler |
| the facilitator's `/verify` refuses | 402; unreachable: 503 `payments_unavailable`; nothing charged |
| valid | the handler runs; a good answer is settled with `/settle` and sent with `PAYMENT-RESPONSE` (base64 SettlementResponse) |
| the handler fails | its error, no settle, the claim released (the same authorization can pay for a later good answer) |
| `/settle` refuses | 402 `payment_failed` with `PAYMENT-RESPONSE`; the answer is withheld |
| `/settle` pending or unanswered | the answer is delivered with `PAYMENT-RESPONSE` saying so; the authorization stays used |

The signature is checked as USDC (FiatTokenV2_2 on Base) checks it in `transferWithAuthorization`: an address with no code
must have signed with ECDSA (65 bytes); an address with code (a smart account, or an EIP-7702 delegated account) must answer
`isValidSignature(digest, signature)` with the ERC-1271 magic value, read on Base through the SDK's RPC port (the first
`API_RPC_BASE` URL). ERC-6492 signatures (undeployed wallets) are refused: neither the exact-EVM scheme nor USDC handles
them. Before the first payment the API checks on Base that USDC's proxy code, its implementation (address and code hash,
pinned in `x402.ts`), its domain separator and its decimals are the pinned ones; a mismatch keeps payments off
(`payments_unavailable`). The facilitator is called with no credential; one that needs a key (the CDP facilitator does) is
not supported (design section 10). x402 version 1 (`X-PAYMENT`) is not accepted.

## Listing the API as a PayBox service

What PayBox documents (docs.paybox.sh/llms-full.txt, read 2026-10-22): `discover_services` searches "the curated x402 Bazaar
set", returning by default "services with recent usage, at least 10 unique payers in the last 30 days, and a supported x402
rail"; `use_service` probes the URL, parses the 402, has the user approve, pays and re-fetches; `pay_x402` takes the 402's
`accepts` with `x402_version` 1 or 2 and says "x402 requires a plain EOA payer". PayBox publishes no submission form or
listing API of its own: a service reaches it through the x402 Bazaar, which a facilitator that implements the `bazaar`
extension fills after it processes payments for a resource. What an operator must do:

1. Set the payment variables (`deploy/api/README.md`).
2. Run `node api.mjs listing` and keep its output beside the deployment: the service name, tags, the rail, `payTo`, and per
   endpoint the price and the exact `accepts` a 402 states, with the bazaar `info`/`schema` every 402 carries.
3. Use a facilitator for Base mainnet that implements the bazaar extension and accepts the specification's unauthenticated
   `/verify` and `/settle` (this API sends no facilitator credential), and set `API_X402_FACILITATOR_URL` to it.
4. Take real paid calls: the facilitator catalogs the resource from the 402's bazaar extension; PayBox's curated search
   shows it once it has the usage above (10 unique payers in 30 days). Check with `discover_services` (read-only).
Nothing has been submitted anywhere, and no facilitator has been chosen.

## Storage

The plan names Postgres (or Ponder) for the index. Neither can be added without a new dependency, so the index is
SQLite through `node:sqlite` behind `IndexStore`; a Postgres store can implement the same interface (atomic range plus
cursor, rewind deletes everything above the kept block) without changing the indexer or the endpoints.

## Not done

- No quote is executable today: no reader's own fee spec prices in the engine (Trueo's lacks the engine's `lpFee` and
  `hookFee`; Polymarket's rounding is prose), so every leg shows its walk with the fee and net cost null and the code.
- `GET /v1/stream` is not built.

- A Limitless row names no condition (its id is a slug), so its settlement is not placed from the index; its last trade is
  matched by the token ids the venue lists.
- Protocol V2 fills on Polygon are stored without a price: their collateral and position decimals are not pinned.
- The index starts at the safe head on first run (or a configured block); there is no historical backfill, and every
  "no fill" or "no resolution" answer names the indexed block range.
- Each venue's list covers at most three pages in the venue's own order; on 2026-10-22 the first pages of Trueo's list were
  all conditional markets, which the SDK reader skips.
