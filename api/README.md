# api/ - the markets API

The hosted API of `docs/sdk-and-api-design.md` section 4: the free read endpoints and the chain indexer (step 8 of
section 9), and the paid quote and route prepare endpoints with their metering: subscription keys and x402 (step 9).
Built only from `sdk/` and its own code (no import from `pm/`, `src/`, `relay/`, `app/` or `bridge/`). It is an optional
accelerator: `sdk/` stays runnable by anyone with no service of ours, and local mode never depends on it. It holds no
wallet, no private key and no visitor credential. The free tier needs no secret; the unified-account routes below use the
operator's own credentials (a Pimlico key and sponsorship policy, Polymarket Builder credentials, a Limitless partner
token), each from the environment only and each optional (its feature answers 503 `not_configured` without it). Nothing
it forwards moves a visitor's funds without the visitor's own signature. The container and its run and environment table
are in `deploy/api/README.md`.

## Unified account routes

The server half of `docs/unified-account-design.md` (sections 2, 3.2 and 3.3). Every route here answers the dApp's origin
and the localhost dev servers only (the XO relay's CORS rule), takes no subscription key, is never metered, and is off
unless its switch is on. A route whose operator credential is absent answers **503 `not_configured`**; nothing is sent
upstream. Operator credentials come from the environment only (on AWS, SSM SecureString parameters under
`/pm-workers/api/`, `deploy/aws/README.md` "Operator credentials for the unified account"), are never printed, and are
added to upstream requests only.

**Where this deviates from, or settles, the design's wording** (the browser half must follow these):

1. Errors keep the API's envelope: `not_configured` is HTTP 503 with `{"error":{"code":"not_configured","message":"..."}}`,
   not `{"error":"not_configured"}`. New codes: `not_configured` 503, `proof_required` 401, `proof_invalid` 401,
   `not_sponsored` 403, `not_registered` 409, `account_exists` 409, `already_stored` 409. The paymaster's own refusals are
   these JSON errors with their HTTP status, not JSON-RPC error objects (viem raises them as `HttpRequestError` with the
   body); Pimlico's own answers, errors included, pass through with Pimlico's status.
2. Ownership proof (`proof.ts`): the signed text is `insurance-markets <METHOD> <path> <unix-seconds> <sha256hex>`, the
   lower-case hex sha256 of the exact body bytes, and for a body-less request the sha256 of the empty string
   (`e3b0c442...b855`); that is the form the browser sends. Tolerated as well: an empty field after the last space, or no
   last space. `<path>` is the path on this API as sent; a route with a query accepts the path with its query exactly as
   sent, or the path alone. The window is 300 s either side. A proof may be presented again inside its window (every
   route that takes one is safe to repeat).
3. Limitless cancel: body `{ "account", "orderId" }` (the order's UUID) with `x-im-proof`; the relay calls
   `DELETE /orders/<orderId>?onBehalfOf=<profileId>` (the venue's OpenAPI; the design named no body). Open orders:
   `GET /v1/relay/limitless/orders?account=<0x>&marketSlug=<slug>[&limit=1..200]` with `x-im-proof`, read as
   `GET /markets/<slug>/user-orders` with `x-on-behalf-of`.
4. Limitless register checks the signature against the decoded message here before calling Limitless, answers from its
   store (no call) for an account it already registered, and on a 409 looks the account up in the partner's own list:
   ours is stored and returned (200), anyone else's is `409 account_exists` ("This wallet already has a Limitless
   account ..."). `profileId` is the venue's integer.
5. Limitless answers keep the `x-limitless-relay` marker header the dApp already reads (`upstream`, `refused`, and now
   `server` for an answer this relay made itself, the stored profile id); every other route here uses `x-im-relay` with
   the same values.
6. Polymarket relay: `WALLET-CREATE` needs the proof for `from`; `WALLET` needs none (the owner's batch signature is
   checked on chain) but its `depositWalletParams.depositWallet` must be one of the two addresses derived from `from` and
   every call must pass the target rule below; the session-signer routes need an `Idempotency-Key` header. Besides the
   design's status and nonce reads, `GET /deployed` and the older `GET /transaction` are mirrored.
7. Bridge addresses: `POST /v1/relay/polymarket-bridge/deposit` takes `{ "sender": "<E>", "address": "<E's Deposit
   Wallet>" }` (one of the two derived addresses, so the uncapped route only funds E's own wallet), returns the bridge's
   answer unchanged, and is on with `API_PAYMASTER=on` (it serves the paymaster; it needs no credential).
8. The account backup store has its own switch, `API_ACCOUNT_BACKUP`; its `PUT` carries `x-im-proof` for the record's
   `address` and the record `{ version, credentialId, address, iv, ciphertext }` (see below).
9. **Not sponsored** (the address is not in the repository, so it is not on the allowlist; a call to it is
   `not_sponsored` until it is pinned with its source): Limitless's per-venue fee modules (`venue.feeModule`, the USDC
   approval a non-`postOnly` order on a new-fee venue needs, research note 44 section 3.1), Polymarket's
   NegRiskCtfCollateralAdapter (`0xadA2…eAab` in note 45, full address not recorded), BNB USDT (Predict.fun's collateral)
   and Predict.fun's Conditional Tokens.

### `POST /v1/paymaster/:chainId` (137, 8453, 56) — `paymaster.ts`, `sponsor-policy.ts`

The page's viem bundler and paymaster clients point here. One JSON-RPC 2.0 request per POST (no batch), forwarded to
`https://api.pimlico.io/v2/<chainId>/rpc` with the operator's key in the upstream URL. Methods: `eth_chainId`,
`eth_supportedEntryPoints`, `pimlico_getUserOperationGasPrice` (`[]`), `eth_getUserOperationReceipt`,
`eth_getUserOperationByHash` (`[hash]`), `eth_estimateUserOperationGas`, `eth_sendUserOperation`
(`[userOperation, EntryPoint 0.8]`), `pm_getPaymasterStubData`, `pm_getPaymasterData`
(`[userOperation, EntryPoint 0.8, <route's chain id>, context?]`; the server replaces the context with
`{ "sponsorshipPolicyId": <PIMLICO_SPONSORSHIP_POLICY_ID> }`). Every user operation must:

- have only v0.7/v0.8 fields, no factory but EIP-7702's `0x7702` marker, and a `callData` that is Simple7702Account
  `execute` or `executeBatch` (at most 16 calls), each call with no native value and one of: `approve` of a listed token
  to a listed venue contract; `setApprovalForAll` on a listed position contract to a listed venue contract; an EIP-3009
  `transferWithAuthorization` / `receiveWithAuthorization` (both signature forms) on USDC that pays the sender (a gasless
  deposit from the funding wallet); a `transfer` of a listed token (to a bridge address this server fetched for the
  sender: free; to anything else: a withdrawal);
- come from a sender delegated to viem's Simple7702Account `0xe6Cae83BdE06E4c305530e199D7217f42808555B` (read from the
  installed viem 2.57.2): an `eip7702Auth` for that implementation, for this chain or chain 0, signed by the sender; or,
  without one, the sender's code on chain equal to `0xef0100` and that address (`eth_getCode` on `API_RPC_POLYGON` /
  `API_RPC_BASE` or the SDK's public RPCs, BNB's public RPC; a positive answer is remembered ten minutes).

Listed per chain (sources on each line of `sponsor-policy.ts`): **137** pUSD, USDC.e, native USDC (EIP-3009); spenders
the CTF Exchange, Neg Risk CTF Exchange, Exchange V3, Neg Risk Adapter, CtfCollateralAdapter and the Collateral Onramp;
position contracts Conditional Tokens and PositionManager. **8453** USDC (EIP-3009); the six Limitless exchanges and three
NegRisk adapters; Limitless Conditional Tokens. **56** Binance-Peg USDC; Predict.fun's four exchanges. Limits: 60 calls at
once then 60 a minute per client; 10 at once then 6 a minute per sender for `pm_getPaymasterData` and
`eth_sendUserOperation`; 10 sponsored operations with withdrawals per sender per UTC day (counted once per chain and
nonce at `pm_getPaymasterData`; the stub and estimate calls refuse early once the day is spent). Pimlico's own policy caps
apply on top. Body at most 64 KiB; answer at most 256 KiB; 15 s; nothing retried.

### `POST /v1/relay/polymarket-bridge/deposit` — `polymarket-bridge.ts`

`{ "sender", "address" }` as in point 7; this server calls `POST https://bridge.polymarket.com/deposit {"address"}`
(with `X-Builder-Code` when `POLY_BUILDER_CODE` is set), returns its status and body, and remembers the `address.evm`
deposit address for the sender for 30 days (`account-store.ts`).

### `/v1/relay/polymarket/<relayer path>` — `polymarket-relay.ts`, `builder-signing.ts`

A mirror of `https://relayer-v2.polymarket.com` for: `POST /submit` (`WALLET-CREATE`, `WALLET`), `GET
/v1/account/transactions/params?address=&type=WALLET`, `GET /v1/account/transactions/<id>`, `GET
/deployed?address=&type=WALLET`, `GET /transaction?id=`, `POST /v1/session-signers/authorizations` and `/revocations`.
Every forwarded request carries `POLY_BUILDER_API_KEY`, `POLY_BUILDER_PASSPHRASE`, `POLY_BUILDER_TIMESTAMP` and
`POLY_BUILDER_SIGNATURE` = url-safe base64 (padding kept) of HMAC-SHA256(base64-decoded secret, seconds + METHOD + path
without query + exact body). Bodies are forwarded byte for byte; the query as sent. `to` must be the Deposit Wallet
factory `0x00000000000Fb5C9ADea0298D729A0CB3823Cc07`. A `WALLET` call may target: pUSD, USDC.e, native USDC (`approve` to a
listed spender, `transfer` only back to `from`), and Conditional Tokens, PositionManager (any call; `setApprovalForAll`
only to a listed operator), the Neg Risk Adapter, CtfCollateralAdapter and Collateral Onramp (any call). Limits: the
relay bucket per client, and 20 at once then 30 a minute per signer for every write (the relayer's daily quota is shared).
The CLOB and the bridge's other calls are not relayed: the page calls them itself (note 45 section 8: CLOB orders must
carry the visitor's own IP).

### `/v1/relay/limitless/...` — `limitless-relay.ts`

| Route | Request | Upstream (`https://api.limitless.exchange`, signed with the partner token unless public) |
|---|---|---|
| `GET /signing-message` | none | `GET /auth/signing-message` (public) |
| `POST /register` | `{ account, signingMessageHex, signature }` | `POST /profiles/partner-accounts` with `x-account` (EIP-55), `x-signing-message`, `x-signature`, body `{}`; on 409 `GET /profiles/partner-accounts?account=`; answers `{ profileId }` |
| `POST /orders` | `{ account, order, orderType: GTC/FAK/FOK, marketSlug, postOnly?, clientOrderId? }` | `POST /orders` with `ownerId` = `onBehalfOf` = the stored profile id; `order.maker` = `order.signer` = `account`, `signatureType` 0, a 65-byte signature |
| `POST /orders/cancel` | `{ account, orderId }` + `x-im-proof` | `DELETE /orders/<orderId>?onBehalfOf=<profileId>` |
| `GET /orders?account=&marketSlug=[&limit=]` | `x-im-proof` | `GET /markets/<slug>/user-orders[?limit=]` with `x-on-behalf-of` |
| `GET /markets/<slug>` | none | `GET /markets/<slug>` (public, unchanged) |

The visitor-token routes (`/profiles/me`, `DELETE /orders/<id>`, `/markets/<slug>/user-orders` with the visitor's
`lmts-*` headers) are gone, and no browser `lmts-*` header is read or forwarded. Limits: the relay bucket per client, and
20 at once then 30 a minute per account for registration, orders and cancels. Body at most 64 KiB; 10 s; nothing retried.

### `PUT` / `GET /v1/account-backup/<credentialIdHex>` — `account-backup.ts`

The passkey-encrypted copy of a generated trading key. `credentialIdHex`: lower-case hex, 16 to 512 bytes. `PUT` with
`x-im-proof` and the JSON record `{ "version", "credentialId", "address", "iv", "ciphertext" }`, at most 4,096 bytes:
the proof's account must be `address`, `credentialId` the path's (the same hex in any case with an optional 0x, or the
same bytes in base64url), `iv` and `ciphertext` 0x hex or base64, `version` a whole number or a short word. 201
`{ credentialId, stored: true }` the first time, 200 for the same record again, 409 `already_stored` for another (never
replaced, whoever asks). `GET`: 200 with the record (those five fields, `address` EIP-55) or 404 `not_found`. 10 at once
then 6 a minute per client. The browser reads 404, 405, 501 and 503 as "not available".


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
| `limitless-relay.ts` | the Limitless partner relay under `/v1/relay/limitless/` (off unless `API_LIMITLESS_RELAY=on`): signing message, register, orders, cancel and open orders with the operator's partner token, the account to profile id store, the ownership proof on cancel and reads |
| `paymaster.ts` | `POST /v1/paymaster/:chainId` (off unless `API_PAYMASTER=on`): the JSON-RPC pass-through to Pimlico, the user operation checks, the EIP-7702 delegation rule, the withdrawal cap |
| `sponsor-policy.ts` | what is sponsored per chain (every address with its source), the Simple7702Account callData decoder, the Deposit Wallet batch rule |
| `polymarket-bridge.ts` | `POST /v1/relay/polymarket-bridge/deposit`: the bridge's deposit address for the sender's own Deposit Wallet, remembered for the paymaster |
| `polymarket-relay.ts`, `builder-signing.ts` | the Polymarket relayer mirror under `/v1/relay/polymarket/` (off unless `API_POLYMARKET_RELAY=on`) and the Builder HMAC headers |
| `account-backup.ts` | `PUT`/`GET /v1/account-backup/<credentialIdHex>` (off unless `API_ACCOUNT_BACKUP=on`): write-once encrypted key backups |
| `proof.ts` | the ownership proof (`x-im-proof`) of design section 3.3 |
| `account-store.ts` | the `limitless_profiles`, `bridge_deposits`, `sponsored_withdrawals` and `account_backups` tables in the same SQLite file |
| `relay-http.ts` | what the unified-account routes share: answers, CORS, preflight, body reading, the one-request upstream forward |
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

## The Limitless relay (`/v1/relay/limitless/...`)

Replaced on 2026-10-24 by the partner relay in "Unified account routes" above: the visitor no longer pastes a Limitless
API token; the relay signs with the operator's partner token, registers the visitor's trading key as a partner
sub-account, and fills `ownerId`/`onBehalfOf` itself (`limitless-relay.ts`, `test/api/limitless-relay.test.ts`).

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
