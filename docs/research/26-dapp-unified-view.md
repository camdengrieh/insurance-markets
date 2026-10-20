# 26 - dApp unified read model: all markets, the user's positions and orders, and Quotient signals in one place

Researched and written 2026-10-19 (probe clock 09:00 to 09:15 UTC, from response `date` headers). Read-only task: public GETs (plus CORS-preflight `OPTIONS` on three hosts), public OpenAPI/spec downloads, and reads of this repo's docs. No account, key, signature, payment or PayBox tool was used. No POST/PUT/DELETE was sent. User-Agent on every scripted request: `insurance-markets-research/0.1`. Nothing in this file or in the scratch scripts contains a personal identifier; test addresses used in probes were the public dummy `0x...0001`.

Confidence tags: **H** read first-hand in a primary source or observed in a live probe this session; **M** secondary, inferred, or read from a repo note whose own tag was H/M but which I did not re-check; **L** guess. **NOT FOUND (searched: ...)** is a documented absence, **NOT TESTED** means I did not or could not probe it.

Citation keys:

- `[NN §x]` = `docs/research/NN-*.md` section x; `[NN V]` = that note's Verification section (overrides its body).
- `[AD §x]` = `docs/aggregation-design.md`; `[ML §x]` = `docs/market-linking-design.md`; `[PR §x]` = `docs/platform-registry-design.md`; `[PG §x]` = `docs/phase1-gap-closing.md`; `[VC]` = `docs/venue-census.md`; `[VN:slug]` = `docs/research/venues/<slug>.md`.
- `[C1]` to `[C12]` = live probes of this session (listed in full in the Verification section). `[S:...]` = a spec file I downloaded and parsed (listed in the Verification section).

---

## 0. Bottom line

1. **A single read model is feasible, and most of it is feasible from a static page with no secrets.** Market data for Polymarket, XO (Data API), Trueo (Base RPC), Pascal, Novig (public routes), OG/CDNA, Gemini, Hyperliquid, Manifold, Myriad and DefiLlama can be fetched directly by the browser (CORS permits it) [C2, C3, C7, C8, C10]. A user's **positions** are public by address on XO, Polymarket, Limitless, Trueo (on-chain), Hyperliquid and Pascal, so the dApp only needs the user's addresses, never a credential, for the most important screen [02 §2.1, S:polymarket-data-v2, S:limitless, VN:pascal, 11 §7].
2. **The browser cannot reach several of the venues that matter most.** On 2026-10-19 the XO orderbook host, Limitless, SX Bet and Underdog Exchange returned no `Access-Control-Allow-Origin` for an arbitrary web origin, and Kalshi answered **403** to any request that carried a foreign `Origin` header [C1, C4, C5, C7]. These need a **user-run local relay** (a small process on the user's own machine that strips browser headers and holds any credential), or they degrade to "display prices only". The author operates nothing; a public CORS proxy is rejected because it would see every user's addresses (section 2.3).
3. **Per-user orders and history are the hard part.** Open orders and full fill history need venue credentials on every venue except Polymarket and Limitless fills (public by address) and on-chain venues. Kalshi, Novig, Gemini, UDX, ProphetX, OG, SX need signed API keys; XO needs the HMAC triplet that is itself gated on unresolved wallet-ownership questions [PG §0]. The doc therefore splits "day zero, zero credentials" from "needs the user's own key, held by the user's own relay, never by the browser or the author" (section 12).
4. **Terms shape what may be shown and kept.** Kalshi's Developer Agreement bars caching/aggregating except for the member's own trading; ProphetX, Gemini and the OG data feed bar redistribution; Quotient bars sharing and republishing outputs; Pascal's ToS has a Platform Data clause [08 §4.9, 12 §8, VC]. A per-user, client-side display with no author-operated server, no shared cache and no bundled third-party price data stays inside the "own use" shape these terms allow on the most natural reading, but **that is an interpretation, not legal advice**, and the Kalshi question (does an anonymous public GET count as "API use") is unresolved (section 5).
5. **Quotient is shown per user, from the user's own access.** Three modes (section 8): (A) the user's own `qt_` key held in their own browser or relay; (B) the user's PayBox agent pays x402 and hands the response to the dApp as a local import; (C) an in-browser x402 payment signed by the user's own wallet (conditional on a wallet that can sign in a browser). Quotient's CORS allows the browser to send its key header and to read the x402 challenge [C6]. The author redistributes nothing.
6. **The "unified" part is the link overlay, and it is honest about proof.** Linked groups show spread and the proof level P0 to P4 from the linking design, with `state` shown separately; no group ever prints an arbitrage label above `hedged_discrepancy` while D2 is unmet [ML §5, §7.5, AD §0.4].
7. **Option 0 (PayBox wallet is the wallet, no separate AA kit) costs the read model nothing.** The read model needs only addresses. Under Option 0 those addresses are the PayBox EOA(s) plus addresses that are pure functions of them (the XO Kernel account is a CREATE2 function of the owner EOA [19 §0]). Whether PayBox can sign for them is a write-side question owned by other tasks.
8. **What is unverified is listed in section 13.** The biggest: the shape of populated XO and Hyperliquid/Pascal user responses; CORS for Polygon/BNB/Solana RPCs and for WebSockets; whether Kalshi's 403 on browser origins is deliberate; whether any PayBox read surface is callable from a browser at all.

---

## 1. Premises (binding decisions applied to this design)

| Decision | Consequence for the read model |
|---|---|
| Runnable by everyone from day zero, nothing the author operates, no custody of others' credentials (local-first / static client) | Static assets only. Every network call originates from the user's browser or the user's own machine. No author backend, no shared cache, no telemetry. Credentials never leave the user's machine and never enter author-controlled code paths |
| Nobody contacts the XO team | No venue "permission request" is assumed to succeed; the design must stand without any written permission (it degrades, it does not wait) |
| No browser automation of any third-party site | Only documented/public API routes. The dApp never drives or scrapes a venue's web app. Undocumented app JSON (Trueo home-page `initialMarkets`, `api.trueo.com`) is not used [11 V] |
| Caps are advisory against a compromised agent; every write path flag-gated OFF | This doc is read-only. The dApp has no order-placement control; its only outbound action toward trading is "copy this plan to my agent". Any future write control is behind a flag that ships OFF |
| PayBox terms are no obstacle; PayBox upload is not available | The dApp is not a PayBox plugin and does not depend on a plugin upload |
| **Option 0 (user steer 2026-10-19):** the user's PayBox wallet is the wallet, no separate AA kit | The read model's identity input is a set of **address bindings** derived from the PayBox wallet(s) (section 7). A separate session-key/AA layer is not assumed anywhere in this document |

Nothing in this document depends on the XO gates (wallet ownership, funding, chain-3223 signing) being resolved: reading is independent of writing [AD §0.1 item 8].

---

## 2. Architecture of the read model

### 2.1 Transport classes

Every venue feature is assigned exactly one class from the live probes (section 3). The class decides whether it works on day zero.

| Class | Meaning | Day zero? |
|---|---|---|
| **T0** | Browser calls the venue directly; CORS permits an arbitrary origin; no credential | Yes |
| **T0-RPC** | Browser calls a public JSON-RPC (preflight reflects the origin) | Yes, shared public-RPC limits; user may enter their own RPC URL |
| **T1** | Needs a **user-run local relay** because the browser is blocked (no CORS header, or WAF 403 on `Origin`), but no credential | Only with the relay running; otherwise degraded |
| **T2** | Needs the user's own credential (API key, HMAC token, signing key) and therefore the relay (never the browser) | No |
| **T3** | Agent-mediated: data only exists inside the user's PayBox agent session (for example `world_*`, x402 payments); enters the dApp by local import | Only if the user's agent supplies it |
| **T4** | Not feasible (KYC/FCM onboarding, partner contract, region-locked) | No |

### 2.2 Components (all client-side)

```
 static page (any static host, or localhost)            optional: user's own machine
 +-----------------------------------------------+      +--------------------------------+
 | UI screens (section 10)                       |      | local relay (127.0.0.1)         |
 | view models: Explorer, Groups, Portfolio, ... |<---->| read-only routes, host allow-   |
 | normaliser  (section 6)                       |      | list, strips Origin/cookies,    |
 | link overlay  links.json (ids+hashes only)    |      | token bucket per host, signs    |
 | fee/registry tables (bundled, TTL'd)          |      | with the user's OWN keys        |
 | store: memory + IndexedDB (user's own data)   |      | (Kalshi read key, Limitless     |
 | adapters: T0 direct / T0-RPC / relay client   |      |  HMAC, Gemini, ...)             |
 +--------------------+--------------------------+      +---------------+----------------+
                      | T0 / T0-RPC                                      | T1 / T2
                      v                                                  v
  Polymarket, XO Data API+explorer, Trueo(Base RPC), Pascal,     XO orderbook, Kalshi, Limitless,
  Novig public, OG/CDNA, Gemini, Hyperliquid, Manifold,          SX Bet, UDX, (+ user-keyed routes)
  Myriad, DefiLlama, Quotient (key or x402)
```

Reuse: the repo's existing local relay for XO credentials already binds to 127.0.0.1, validates `Host` and `Origin`, keeps a per-host token bucket and a pinned non-personal `User-Agent` [PG §9 A5]. A **read-only proxy mode** (GET allowlist, no credential storage) is the natural extension; it is described here as a requirement, not built (another workflow owns `relay/`).

### 2.3 The local relay: why, and why not a public proxy

- A browser forbids reading a cross-origin response without a permissive CORS header; five venues withhold it [C1, C4, C5, C7]. A public CORS proxy (third-party) is **rejected**: it would receive every address the user queries and every API key header, and it is a service nobody has agreed to trust.
- The relay is **the user's own process**. It exposes only `GET /r/<venue>/<path>` for allowlisted hosts, sets `Access-Control-Allow-Origin` to the dApp's own origin only, strips `Origin`, `Cookie` and `Referer` upstream, sets a non-personal `User-Agent` (for example `insurance-markets-dapp/0.1`), applies a per-host token bucket under the venue's documented limit, and answers 429/403 with a machine-readable reason.
- Credentialed routes (T2) are separate (`/k/<venue>/...`), disabled unless the user put a key in the relay's local config, scoped to read operations by an explicit route allowlist, and never return the key. A read-scoped key is preferred where the venue offers one (Kalshi has read and write scopes [08 §4.8]).
- Kalshi note: the 403 on `Origin`-bearing requests is observed, not explained [C4]. A server-side client that sends no `Origin` is the normal pattern for Kalshi's own SDKs; the relay does not forge another site's origin or identity, it simply is a non-browser client. Whether that is the behaviour Kalshi intends for anonymous reads is NOT FOUND.
- Observed but **not relied on**: `orderbooks.xo.market` and `external-api.kalshi.com` echoed `Access-Control-Allow-Origin` for `http://localhost:3000` only (not 5173, 8080 or 127.0.0.1:3000) [C1, C4]. This looks like an allowlist for the venues' own dev servers. Running the dApp on port 3000 to exploit it would be fragile and is not a design.

### 2.4 Hosting and what the author operates

Nothing. The static bundle can be served from any static host or opened from `localhost`; the relay is optional and local. Link data (`links.json`) ships inside the bundle (section 9). If the author never publishes a signed dataset, users still get the bundled snapshot with an age warning.

---

## 3. Live CORS and access probes (2026-10-19)

Method: `curl` with `Origin: https://dapp.example` (a non-existent site), UA `insurance-markets-research/0.1`, one request per URL, at least 0.7 s apart. "No ACAO" means no `access-control-allow-origin` header, so a browser would block reading the response. Probe ids are referenced throughout.

| Id | Host and route | Result with an arbitrary origin | Reading |
|---|---|---|---|
| C1 | `orderbooks.xo.market` `/health`, `/positions?address=`, `/book`, `/time` | 200 (404 on a dummy token), `access-control-allow-credentials: true`, **no ACAO**; ACAO echoed only for `http://localhost:3000`; preflight `OPTIONS /positions` returns 200 and lists the `Xo_*` auth headers but no ACAO | T1. Public data but not browser-readable (H) |
| C2 | `api-mainnet.xo.market/api/markets`, `/users/portfolio`, `/public/liquidity-rewards/earning-pools` | 200/404, **ACAO `*`**; headers `x-ratelimit-limit: 50`, `x-ratelimit-remaining: 49`, `x-ratelimit-reset: 1` | T0 (H). Window semantics of the header unverified; docs say 100 per 10 s [02 §1] |
| C2b | `explorer-mainnet.xo.market/api/v2/stats`, `/addresses/{a}`, `/token-balances`, `/token-transfers` | 200, **ACAO `*`**, Blockscout-style REST (`token-balances` returned `[]` for the dummy address) | T0 for chain-3223 balances and transfers (H) |
| C3 | `gamma-api.polymarket.com/markets`, `clob.polymarket.com/time`, `data-api.polymarket.com/v2/status`, `polymarket.com/api/geoblock` | 200, **ACAO `*`** on all; Gamma `cache-control: public, max-age=300`; Data API exposes `retry-after` | T0 (H) |
| C4 | `external-api.kalshi.com/trade-api/v2/exchange/status` and `api.elections.kalshi.com/...` | **403 with any `Origin` header** (dapp.example, example.org, localhost:5173); **200 with no `Origin`**; 200 plus ACAO only for `http://localhost:3000` | T1 (H). Cause unknown |
| C5 | `api.limitless.exchange/markets/active` | 200, **no ACAO** for dapp.example or localhost:3000; `cache-control: public, max-age=30, s-maxage=30` | T1 (H) |
| C6 | `quotient-api-gateway.onrender.com` `/api/public/pricing` (200) and unpaid `GET /api/v1/signals` (402) | **ACAO `*`**; `access-control-allow-headers` includes `X-Quotient-Api-Key`, `Payment-Signature`, `X-Payment`, `Payment-Identifier`; `access-control-expose-headers` includes `PAYMENT-REQUIRED`, `PAYMENT-RESPONSE`, `Retry-After`, `RateLimit`; preflight for `x-quotient-api-key` returns 204; the 402 carries a base64 `payment-required` header | T0 for key mode and for reading the x402 challenge (H) |
| C7a | `api.novig.com/v3/public/types/sports` | 200, ACAO `*`, `cache-control: public, max-age=3600` | T0 (H) |
| C7b | `data.pascal.trade/api/v1/markets` | 200, ACAO `*`, `cache-control: no-store` (response is about 5.9 MB [VN:pascal]) | T0 (H) |
| C7c | `api.crypto.com/fcm/v1/public/get-events` | 200, ACAO **reflects the origin**, allow-credentials true; `OPTIONS` returns 204 | T0 for simple GETs (H) |
| C7d | `api.gemini.com/v1/prediction-markets/events` | 200, ACAO **reflects the origin** | T0 (H) |
| C7e | `api.sx.bet/metadata/obv3`, `/markets/active` | 200, **no ACAO** | T1 (H) |
| C7f | `api.underdogexchange.com/markets` | 200, **no ACAO** (dapp.example and localhost:3000); `ratelimit: "read";r=7;t=1`, `ratelimit-policy: "read";q=8;w=2` | T1 (H); policy reads as 8 requests per 2 s (M) |
| C8 | `api.hyperliquid.xyz/info` | preflight `OPTIONS`: 200, `access-control-allow-origin: *`, methods `*`, headers `*`. The POST itself was **not** sent | T0 for POST `/info` is M (preflight H, actual POST response headers NOT TESTED) |
| C9 | `mainnet.base.org` | preflight: 200, ACAO reflects origin, allows `Content-Type` | T0-RPC (H for preflight) |
| C10 | `api.llama.fi/protocols`, `api.manifold.markets/v0/markets`, `api-v2.myriadprotocol.com/markets` | 200, ACAO `*` | T0 (H) |
| C11 | `api.predict.fun/v1/markets` (401, ACAO reflects origin); `market-api.probable.markets` (403 to curl) | key-required / WAF | not a day-zero source |
| C12 | WebSocket endpoints (`wss://orderbooks.xo.market/ws/market`, Polymarket, Pascal, Gemini, Hyperliquid) | **NOT TESTED**: an HTTP/2 upgrade probe is uninformative (400). Browsers do not apply CORS to WebSocket, but servers may check `Origin` | polling is the default; WS is an optional, flagged upgrade |

Not probed: Polygon, BNB and Solana RPC hosts (users should enter their own RPC URL; defaults are NOT TESTED), Polymarket US gateway, Opinion, MagicMarkets, Rain, PredictIt.

---

## 4. Per-venue read specifications

### 4.1 Summary matrix

Class codes from section 2.1. "By address" means no credential. Rate limits are per source IP unless stated, and from the dApp they are the **user's** IP, which is the point of a client-side design (they are not a shared pool as in the plugin sandbox [AD §8.2]).

| Venue (registry pool) | Market data | User positions | User orders and fills | Credential for the latter | Documented limit | Notes |
|---|---|---|---|---|---|---|
| **XO** (chain 3223) | Data API T0; **books T1** | Data API portfolio T0 (populated shape unverified); raw `/positions`, `/claimable`, `/balance-allowance` T1 | none public (`/orders`, `/trades` are L2 HMAC, live 401 [02 §0]) | XO HMAC triplet (relay; gated by [PG]) | orderbook 5 req/s; Data API 100 per 10 s documented, `x-ratelimit-limit: 50` observed [C2] | explorer T0 for chain balances [C2b] |
| **Polymarket** (Polygon) | Gamma, CLOB, Data v2: T0 | `GET /v2/positions?user=` T0 | fills and activity T0 (`/v2/trades?user=`, `/v2/activity?user=`); **open orders** need L2 | L2 API creds (not offered at day zero) | Gamma 300 to 900 per 10 s; `/book` 1,500 per 10 s; Data v2 800 per 10 s [08 §2.6] | positions keyed by the proxy wallet |
| **Kalshi** (USD) | **T1** | signed `GET /portfolio/positions` T2 | signed `/portfolio/orders`, `/fills`, `/settlements`, `/balance` T2 | Kalshi API key (read scope exists) | anonymous limit NOT FOUND; Basic 200 read tokens/s, 10 per request [08 §4.6] | Developer Agreement constraints (section 5) |
| **Limitless** (Base) | **T1** | `GET /portfolio/{account}/positions` public (relay) | `/portfolio/{account}/history` public; open orders `/markets/{slug}/user-orders` HMAC | HMAC token for open orders only | numeric limit NOT FOUND; CDN `max-age=30` [09 §2.3] | all routes via relay |
| **Trueo** (Base) | on-chain T0-RPC | `getUserPosition(address)` and ERC-20 `balanceOf` T0-RPC | none (no orders; swaps are the history) | none | public RPC limits | no API; do not use `api.trueo.com` [11 V] |
| **World** (Solana) | not publicly queryable | PayBox `world_*` only | PayBox `world_*` only | the user's PayBox session | n/a | T3 [14 §8.1] |
| **Hyperliquid HIP-4** | POST `/info` T0 (M) | `spotClearinghouseState` for the user, outcome tokens named `+<enc>` (M) | `userFills` etc. (M) | none | 1,200 weight per minute per IP [VN:hyperliquid-outcomes-hip-4] | POST-only; WS optional |
| **Pascal** (Solana) | `data.pascal.trade` T0 | `/api/v1/accounts/{owner}` unauthenticated [VN:pascal] | `/fills`, `/history` same | none | NOT FOUND | no Yes/No tokens: long/short |
| **Novig** (USD, US-KYC) | public routes T0 | signed only | signed only | trading key (can place orders) | NOT FOUND for public routes | effectively T4 for users |
| **OG / CDNA** (USD) | public REST T0 | private routes need FCM onboarding | same | HMAC after onboarding | 100 req/s per method per IP [VC] | effectively T4 for users |
| **Gemini Predictions** (USD) | public REST T0; public WS | `/v1/prediction-markets/positions` signed T2 | `/orders/active`, `/history` signed T2 | Gemini API key, HMAC-SHA384 | NOT FOUND | no public REST trade tape |
| **SX Bet** (own rollup) | **T1**; books need a key except the legacy snapshot | `/positions-v3` key-gated | key-gated | scoped API key | legacy snapshot gets a stricter limit from 2026-12-01 [VN:sx-bet] | |
| **Underdog Exchange** (USD) | **T1** | key-gated | key-gated | RSA-PSS key | "read" q=8 per 2 s [C7f] | US-only |
| **ProphetX** (USD) | partner key for everything | partner key | partner key | partner contract | NOT FOUND | T4 |
| **Quotient** | T0 (key or x402) | n/a (never send a wallet; section 8) | n/a | key or x402 | 20 rps / 600 rpm / 20,000 per day per payer [12 §4] | |

### 4.2 XO

**Market data (T0).** `GET https://api-mainnet.xo.market/api/markets` with `marketType=2,4&statuses=ACTIVE&take=50`, page on `meta.hasNextPage` only; `search=` for title substring; detail routes for rules, `resolverAddress`, `effectiveFeeConfig`, `rootEventSlug`. The traps (default scope returns only the AMM slice, `take` max 50, micro-unit prices, `categories` filter applied after paging, outcome index 0 is "Yes") are in [02 §0, §2.2] and [AD §2.4]. Data API prices are display prices only; a constant `500000` currentPrice appears on some detail routes [02 V].

**Books (T1).** `GET https://orderbooks.xo.market/book?token_id=` is public and unauthenticated but not browser-readable [C1]. Without the relay the dApp shows XO's list price tagged `display_price, not executable` and refuses any spread label above `indicative` for XO legs. With the relay: one `GET /book` per token, bounded by the documented 5 req/s; the documented `POST /books` batch is untested and not used.

**Chain 3223 balances (T0).** `explorer-mainnet.xo.market/api/v2/addresses/{a}/token-balances` and `/token-transfers` [C2b]. The chain's JSON-RPC needs a privately issued key [02 §0 item 8], so the explorer is the keyless route. Blockscout-style routes beyond the four probed are NOT TESTED; the explorer's availability and terms are undocumented.

**User positions.** Two sources, which must not be mixed:

- Data API `GET /users/portfolio?user=<0x address or username>&status=all` (T0): per-market entries with `positions[]` carrying `shareAmount` (micro-shares), `entryPrice`, `entryValue`, `currentValue`, `pnl`, `hasClaimed`. "Private profiles return an empty paginated result"; an unknown user is 404. **The populated response was never verified live** [02 §2.2]; this document treats the field names as M.
- Orderbook `GET /positions?address=`, `/claimable?address=`, `/balance-allowance?address=` (T1): raw `token_id` balances in micro-shares, claimable winners/voids, cash. No market metadata (join `token_id` through the Data API); the positions response cannot page [02 §2.1].
- **Which address:** the Kernel smart account, not the owner EOA. `balance-allowance?address=<owner EOA>` never resolves to the account (18 of 18 observed owners returned `smart_account: null`) and the Data API's `creator.walletPublicKey` is the account [19 §0 item 6]. The account address is a pure function of the owner (section 7).
- Privacy corollary: anyone's XO balance and positions are world-readable by address [02 §0 item 1].

**Orders and fills.** `/orders`, `/data/orders`, `/trades` need L2 HMAC (live 401) [02 §0]. Day zero: none. The history view for XO is derived from the portfolio entries (entry price, stake, claimed flag) and says so.

**Terms.** Bots allowed if compliant; "harvest or scrape data ... for unauthorized purposes" barred [03 §5, 19 §1]. Reads are throttled well under limits, from the user's own IP.

### 4.3 Polymarket

**Market data (T0).** Gamma `GET /markets/keyset`, `/events/keyset`, `/public-search`; CLOB `GET /book?token_id=`, `/price`, `/midpoint`, `/tick-size`; Data v2 `/v2/prices-history`, `/v2/resolutions`, `/v2/tokens`. Use **v2 only**; Data API v1 retires 2026-10-24 [08 §2.1]. Derive best bid/ask from the sorted book (`/price` semantics contradict between docs and live [08 V-A1]). Fees from Gamma `feeSchedule` per market, never from `/fee-rate` [08 §2.7].

**User positions (T0, no credential) [S:polymarket-data-v2].** The Data API v2 OpenAPI (fetched) exposes:

| Route | Use in the dApp |
|---|---|
| `GET /v2/positions?user=&status=OPEN|REDEEMABLE|REDEEMABLE_LOST|MERGEABLE|CLOSED&limit&cursor` | open book; `REDEEMABLE` for claimable; `CLOSED` replaces v1 `/closed-positions`. Row: `proxy_wallet, token_id, condition_id, current_size, avg_price, entry_cost_usdc, entry_fees_usdc, total_cost_usdc, current_price, current_value, realized_pnl, unrealized_pnl, total_pnl, status, redeemable, mergeable, negative_risk, title, slug, event_slug, outcome, outcome_index, opposite_token_id, end_date` |
| `GET /v2/activity?user=` | trades, splits, merges, redeems, keyset-paged, `(block_timestamp, sequence_id)` order |
| `GET /v2/trades?user=` | the user's fills |
| `GET /v2/value?user=` | portfolio value (single-market marked; unresolved combos at cost) |
| `GET /v2/user-pnl?user=&interval=` | cumulative PnL series; `user` is the **proxy wallet** |
| `GET /v2/approvals?user=` | wallet approvals |
| `GET /v2/positions/combos`, `/v2/activity/combos` | combo positions (separate product; relation to the main book unknown [PR §4.2]) |

Pagination is an opaque cursor (`pagination.next_cursor` until `null`). The positions row already includes entry cost, fees and PnL, so cost basis is venue-reported (labelled so).

**Which address.** The `user` is the wallet that holds the tokens (the proxy/deposit wallet), not necessarily the EOA. Gamma `GET /public-profile?address=` accepts "proxy wallet or user address" [S:polymarket-gamma]; this is the documented route to map an EOA to its profile. Polygon address derivation is not re-derived here: the local code's Safe-proxy derivation is wrong [13 §5.1], so the dApp **never computes** a Polymarket wallet; it asks the profile endpoint or accepts a pasted address.

**Orders.** Open orders: CLOB `GET /data/orders` needs L2 credentials [08 §2.2]; not offered at day zero. Fills: public through `/v2/trades?user=`.

**Terms.** Redistribution terms for Gamma/CLOB/Data: NOT FOUND; docs state no key is required and CORS `*` [08 §2.11]. Geoblock: `polymarket.com/api/geoblock` (T0, [C3]) reports the caller's own IP status; the dApp shows it as a banner for the user, it never blocks or masks.

### 4.4 Kalshi

**Market data (T1).** `external-api.kalshi.com/trade-api/v2`: `/markets`, `/events?with_nested_markets=true`, `/markets/orderbooks?tickers=a&tickers=b` (repeated params; comma-joined returns a bogus empty book [08 V-A2]), `/markets/{ticker}`, `/series`. No free-text search endpoint (NOT FOUND [08 §4.2]); the dApp searches only the markets it has loaded or the link registry's tickers. Books are bids-only, best last; price fields are `*_dollars` strings, counts `*_fp` [08 §4.4, §4.5].

**User data (T2, relay only).** The OpenAPI (3.34.0) defines `GET /portfolio/positions`, `/portfolio/orders`, `/portfolio/fills`, `/portfolio/settlements`, `/portfolio/balance` [S:kalshi]. Requests are signed with `KALSHI-ACCESS-KEY`, `KALSHI-ACCESS-TIMESTAMP`, `KALSHI-ACCESS-SIGNATURE` (RSA-PSS or Ed25519 over `timestamp + METHOD + path`) [08 §4.8]. Because the signature needs a private key, **the key stays in the relay**; the browser never holds it. A read-scoped key limits a leak to disclosure. API keys carry a location attestation since 2026-08-16 [08 §4.8]. Kalshi funds are a USD account, so positions are account rows, not on-chain tokens; they cannot be found by wallet address.

**Terms.** See section 5. In short: the Developer Agreement (v1.1, 2023-11, possibly superseded) limits API use to "facilitating a members own trading", and s3.1 bars collecting/caching/aggregating/storing API data "except for purposes of facilitating your own trading", s3.2 bars facilitating other members' trading, s3.5 bars monitoring/benchmarking use, s6.4 bars public statements about the API without approval [08 §4.9]. The dApp therefore treats Kalshi as: opt-in flag, off in the distributed build; **memory-only** market data with a 30 to 60 s TTL; the user's own positions may persist locally (it is the user's own account data); nothing from Kalshi is exported, shared or bundled.

### 4.5 Limitless

All routes need the relay (T1) because there is no ACAO [C5]. Public, credential-free per the OpenAPI [S:limitless]:

- Markets: `GET /markets/active` (`limit` max 25 else 400), `/markets/{slug}`, `/markets/{slug}/orderbook` (YES-side only, raw 1e6 sizes [09 §2.3]).
- User: `GET /portfolio/{account}/positions` ("Get All User Positions", security none), `/portfolio/{account}/history`, `/portfolio/{account}/pnl-chart`, `/portfolio/{account}/realized-pnl`, `/portfolio/{account}/traded-volume`.
- Authenticated variants (`/portfolio/positions`, `/portfolio/history`, `/portfolio/trades`) need a bearer or session; open orders `GET /markets/{slug}/user-orders` need the HMAC token. Not offered at day zero.

Mirror hooks (`metadata.externalSlug`, `externalProvider`, `externalRulesWatch.rulesHash`) are the only native cross-venue hooks and feed link proof P0 [16 §0.1, ML §5].

### 4.6 Trueo

No API, no subgraph, no SDK [11 §0, §15]. The read path is on-chain through a Base RPC (T0-RPC; the user may supply their own endpoint):

- Market list: `TruthMarketManager.numberOfActiveMarkets()` / `getActiveMarketAddress(i)` / `isActiveMarket(addr)`; events `MarketCreatedWithDescription` for backfill [11 §7 (enumeration via the Manager)].
- Per market: `paymentToken()`, `getCurrentStatus()` (derived; do not use the stored `currentStatus` or an indexer status), `getPoolKeys()`, `StateView.getSlot0`, `V4Quoter` quotes at the intended size, hook allowlist and `poolPaused` checks [11 §11 (recommended read algorithm)].
- User: `getUserPosition(address) -> (yes, no)`, `getUserClaimableAmount(address)`, and ERC-20 `balanceOf` of `yesToken()`/`noToken()` [11 §7 interface]. Positions are plain ERC-20s held by the address [11 §10 gate 3], so any EOA or smart wallet address works. Collateral is TYD (6 decimals, an ERC-4626 share, **not USD**: value via `convertToAssets`) [11 §12].
- Cost basis is not stored on-chain; PnL is `n/a` unless the user opts into an `eth_getLogs` scan of their own swaps (not implemented in v1).
- Batch with JSON-RPC batch arrays or multicall; public RPCs rate-limit [04 §6.3].
- Do not use `api.trueo.com` or the app's embedded JSON: scraping is prohibited by the terms and the endpoints are undocumented [11 V, §13].

### 4.7 World (PayBox official, Solana)

The catalogue is not publicly queryable; the 11 tool names were seen through a third-party `get_contract` capture [14 §8.1, AD §3.2]. The dApp has no network path to it. T3: if the user's agent calls `world_*` and passes the output into the dApp's import box, the dApp normalises it as a venue `world` with `reach = X3_other_paybox` and no price independence claims (pool and fees NOT FOUND).

### 4.8 Census P0/P1 venues

These come from `docs/venue-census.md`, which is single-pass research with no skeptic pass (every row is a lead) [VC header]. Only the read-relevant facts are kept; all were re-read from the cited notes, and CORS was probed where stated.

| Venue | Public market data | Transport [probe] | User data | Why it is or is not usable |
|---|---|---|---|---|
| **Novig** (CFTC DCM, USD, sports only) | `GET api.novig.com/v3/public/catalog/events`, `/markets/{id}`, `/markets/{id}/book`, `/trades`, `/types/*` keyless, cached (15 s catalog, 1 h types) [VN:novig] | T0 [C7a] | `/v3/account/positions`, `/v3/portfolio/positions`, `/v3/account/orders`, `/v3/portfolio/fills` require NOVIG-V3 signing with a trading key that **can place orders** [S:novig] | User data: T4 for almost everyone (US-resident KYC'd individuals only, own account only [VC]). Prices only, if the terms allow redistribution (open question in [VC]) |
| **OG / CDNA / Nadex** (CFTC DCM, USD) | `GET api.crypto.com/fcm/v1/public/get-events|get-instruments|get-tickers|get-book|get-trades`; 100 req/s per method per IP [VC] | T0 for simple GETs [C7c] | `private/*` needs FCM onboarding, conformance sign-off and HMAC [VC] | Prices only. Docs labelled Preview/private beta; WebSocket channels return 40003; a separate `data-api.crypto.com` feed has a non-commercial EULA and must be avoided [VC]. Sibling books are not linked by the engine, so complements are computed |
| **Pascal** (Solana, public beta) | `data.pascal.trade/api/v1/markets` (5.9 MB, 3,255 markets, `best_bid`, `best_ask`, `mark_price`, Polymarket reference on 94.8%), `/books?symbols=` (max 50), `/trades`, `/trade-candles` [VN:pascal] | T0 [C7b] | `/api/v1/accounts/{owner}` plus `/fills`, `/transfers`, `/history`, `/position-resolutions` "unauthenticated by owner pubkey" [VN:pascal] | Best new link source: a native machine-readable Polymarket reference per market (proof P0). Contracts are long/short, not Yes/No tokens. Thin real volume (about $33k per day) and rewards-subsidised depth [VN:pascal]. ToS "Platform Data" clause open [VN:pascal] |
| **SX Bet** | `GET /markets/active`, `/markets/find`, `/metadata/obv3`, trade tape keyless; order books need a key except legacy `/orderbook-v3/snapshot?marketHash=` [VN:sx-bet] | T1 [C7e] | `/positions-v3`, `/fills-v3` key-gated | Sports only, own rollup chain 4162, escrow positions (not tokens). Scraper clause in ToS; the official API is the invited route [VN:sx-bet] |
| **Hyperliquid HIP-4 outcomes** | POST `api.hyperliquid.xyz/info` `outcomeMeta`, `outcomeTemplates`, `settledOutcome`, `l2Book coin:'#<enc>'`; WS `l2Book`, `allMids` [VN:hyperliquid-hip-4-outcomes-native] | T0 (preflight H, POST M) [C8] | `spotClearinghouseState`/`userFills` by address (M: outcome tokens appear as `+<encoding>`) | `encoding = 10*outcome + side`; Yes-side book is merged. "Excluded Persons" list is open-ended and unpublished [VC]: the dApp shows the clause, it cannot compute eligibility |
| **ProphetX** | all reads are partner-authenticated (`/partner`, ISV API) [VC] | T4 | partner | Market data internal-business-use only (Rule 10.1 / MPA 9.2) [VC]; not usable |
| **Gemini Predictions** (DCM, USD) | `GET api.gemini.com/v1/prediction-markets/events?status=active&limit=`, `/events/{ticker}`; public WS `wss://ws.gemini.com` `@bookTicker`/`@depth10` [VC, VN:gemini-predictions] | T0 [C7d]; payload sizes up to 1.1 MB for `limit=3` | `/v1/prediction-markets/positions`, `/orders/active`, `/orders/history`: HMAC-SHA384, `Trader` role key | "Gemini Market Data is proprietary to us ... subject to a separate Market Data Agreement"; no derivative products from the API [VC]. Prices only, with a no-persist rule |
| **Underdog Exchange (UDX)** | `GET api.underdogexchange.com/markets?status=open&type=single_leg&limit<=100` keyless; EOD CFTC files on S3 [VN:underdog-udx] | T1 [C7f] | key-gated (RSA-PSS) | 80% of volume is combos; US-only with a linked Underdog Fantasy account [VC]. Prices only |

Every census row marked "effectively T4" still earns a place in the Explorer **as a read-only reference price** where its public routes are T0/T1, because several of them overlap Kalshi/Polymarket sports and politics; they never produce a portfolio row.

### 4.9 Other registry venues (P2 or skip)

| Venue | Read transport | User data | Note |
|---|---|---|---|
| Polymarket US | public gateway REST (25 req/s per IP); CORS NOT TESTED [08 §3] | authenticated host only | SSN-KYC; separate pool from Polymarket International [PR §4.2] |
| Predict.fun | key required on mainnet (401, ACAO reflects origin [C11]) | key | P2 |
| Opinion | keyless 5 rps (CORS NOT TESTED) [09 V-E2] | not assessed | P2 |
| Manifold | T0 [C10], 500 req/min/IP [09 §2.10] | public by user via API | play money; signal and duplicate-question reference only |
| Myriad | T0 [C10] | not assessed | negligible real volume [09 V-C3] |
| Probable | WAF 403 to curl [C11] | n/a | mirror hook only |
| MagicMarkets, PredictIt, Rain | not probed / Cloudflare 403 / dead | n/a | skip |

### 4.10 Non-venue sources

| Source | Use | Transport | Terms |
|---|---|---|---|
| DefiLlama `api.llama.fi/protocols` (and overview routes) | liveness, 30-day volume, `defillama_slug` join key; includes XO and Trueo [14 §2.1] | T0 [C10] | no licence stated; read-time lookups only [14 §13] |
| PolyKal `polykal.net/data/fees.json` | cross-check of Kalshi/Polymarket fee parameters | T0 (CORS stated in [14]; NOT re-probed) | CC-BY-4.0, attribution required [14 §2.6] |
| Manifold | slow prior, duplicate lint | T0 | permits bots [09 §2.10] |

---

## 5. Terms and display policy

### 5.1 What each venue's text restricts (as read by the repo's notes)

| Venue / source | Restricts | Source | Confidence |
|---|---|---|---|
| Kalshi | API use "limited to facilitating a members own trading"; s3.1 no "collecting, caching, aggregating, or storing" API data except for own trading, no sharing with third parties; s3.2 no facilitating other members; s3.5 no monitoring/benchmark use; s3.7 no sublicensing; s6.4 no public statement about Kalshi/its API without approval; v1.1 dated 2023-11, possibly superseded; whether anonymous public GETs are "API use" unresolved | [08 §4.9], [AD §10] | H for text, M for scope |
| Quotient | licence "for your personal or internal business purposes"; may not "share or resell access", "copy, republish, redistribute, sublicense, or sell the Services or their outputs except as expressly permitted", "build a competing data or signals product"; agents: the user "remains responsible" for spending and actions | [12 §8] (terms updated 2026-08-07) | H text, M interpretation |
| ProphetX | market data for internal business use only; no redistribution or derivative works without written consent | [VC] | M |
| Gemini | "Gemini Market Data is proprietary"; separate Market Data Agreement; no derivative products from the API | [VC] | M |
| OG / CDNA | public REST terms NOT FOUND; the `data-api.crypto.com` feed EULA is non-commercial / internal-US use and bars redistribution | [VC] | M |
| Pascal | ToS "Platform Data" clause (excludes professional, fintech and market-data-distributor use); bars unprovided automated means but publishes an API | [VC] | M |
| UDX | bars automated access other than approved APIs; documented keyless REST is "reasonably approved use" (VC's reading); redistribution terms NOT FOUND | [VC] | M |
| Polymarket | data redistribution terms NOT FOUND; docs state no key required, CORS `*` | [08 §2.11] | H absence |
| XO | bots allowed if compliant; "harvest or scrape ... for unauthorized purposes" barred | [03 §5] | H |
| Trueo | scraping prohibited; undocumented endpoints must not be used for automation; on-chain reads are fine | [11 §13] | H |
| Limitless, Novig, Hyperliquid, SX | bots/automation invited via the official API; Novig affiliate/redistribution terms open; HL bars bots that "exceed reasonable usage" | [09 §2.3, VC] | M |

### 5.2 Display and caching rules (policy decisions for this design; D = design default)

What a **per-user, client-side display** does: the page runs in the user's browser; each request is made by the user, from the user's IP, with the user's key where one is needed; the data is shown to that one user; the author receives nothing. On the most natural reading of every text above this is "own use", the shape Kalshi's and Quotient's text allow, and it is the opposite of redistribution. Where a venue's text bars aggregation for other purposes (Kalshi s3.2, s3.5) or bars derivatives (Gemini), the doubt remains and the flag stays off by default.

| # | Rule | Applies to |
|---|---|---|
| R1 | Every fetch originates from the user's browser or the user's own relay. No author-operated server, queue, cache or telemetry sees prices, addresses, keys or positions | all |
| R2 | The shipped bundle contains **no third-party price, title or rules text**: `links.json` stores venue, native id, rules hash, close time, outcome map, proof, state; titles are fetched live. Registry fee tables carry source URLs and dates, not scraped data | Kalshi, Gemini, ProphetX, Quotient, all |
| R3 | **Memory-only** for market data from Kalshi, Gemini, OG, UDX, Novig, ProphetX, Quotient mid-run lists (D: TTL 30 to 60 s for books, 5 to 15 min for Quotient lists). Never written to IndexedDB, files, URLs or logs | those venues |
| R4 | The user's **own** positions/orders/fills may be persisted locally (IndexedDB, encrypted with a user passphrase for credentialed venues) because they are the user's own data | portfolio |
| R5 | No export, share link, screenshot helper or CSV containing Quotient outputs or Kalshi/Gemini market data. Export is limited to the user's own positions and orders | Quotient, Kalshi, Gemini |
| R6 | Quotient figures are shown **beside**, never blended into, a dApp-computed score; no "top mispriced markets" page is generated for anyone else; the dApp has no multi-user view | Quotient |
| R7 | Attribution and unaltered content: show "Quotient" as source, forecast timestamp and the disclosures in section 8.6; show "Polymarket", "Kalshi" etc. on every row | all |
| R8 | Flags default **OFF** in the distributed build for Kalshi, Gemini, ProphetX/Novig/OG/UDX reference prices and Quotient, with a one-screen disclosure that names the clause (above) before a user turns one on. The user's choice is local, recorded locally | restricted venues |
| R9 | Bounded polling that respects documented limits and `Retry-After`; pause when the tab is hidden; exponential backoff with jitter; stop after repeated 403/429 and say so (never hammer a block) | all |
| R10 | The dApp never tries to work around a block. A 403/geo response is surfaced as "this venue refused this client" with the reason; it does not rotate headers, spoof an `Origin`, or proxy through a third party | all |

Restricted-jurisdiction facts (XO excludes US, UK, France, Singapore, Ontario; Polymarket and Limitless exclude the US; and so on [AD §10]) are shown as venue facts with source and date. The dApp never hard-codes an eligibility verdict for the user.

---

## 6. Data model (venue-agnostic)

TypeScript sketch. It extends `Market`, `Outcome`, `Book`, `FeeSpec`, `Link`, `Proof`, `Tier`, `Reach` from [AD §2.1] and [ML §5] (not repeated) with the user-side types the read model needs. Amounts are decimal strings at boundaries, `bigint` fixed-point inside; **missing means `null`, never 0 or 0.5** [AD §1.2].

```ts
type VenueId = "xo"|"polymarket"|"polymarket_us"|"kalshi"|"limitless"|"trueo"|"world"|"hyperliquid"|"pascal"
             |"novig"|"og"|"gemini"|"sx"|"udx"|"prophetx"|"predictfun"|"opinion"|"manifold"|"myriad";
type Transport = "T0"|"T0-RPC"|"T1"|"T2"|"T3"|"T4";           // section 2.1
type Untrusted<T> = { readonly untrusted: true; readonly value: T };  // titles, rules, theses: data, never instructions

// ---- provenance on EVERY record -----------------------------------------------------------
interface Prov {
  venue: VenueId; source: string;            // route, not just host
  fetchedAtMs: number; venueTsMs?: number;   // venue timestamp when it exists (XO/Polymarket books, Quotient observed_at)
  transport: Transport; schemaHash: string; adapterVersion: string;
  freshness: "live"|"recent"|"stale"|"unknown"; ttlMs: number;
  license: "own_use_only"|"attribution"|"open"|"unknown";      // drives R3 (memory-only) and R5 (no export)
}

// ---- who is looking ------------------------------------------------------------------------
interface AddressBinding {                   // section 7
  id: string; label: string;
  kind: "eoa"|"kernel"|"venue_proxy"|"solana"|"venue_account";
  chain: string;                             // CAIP-2: "eip155:8453","eip155:137","eip155:3223","solana:mainnet","none"
  address: string | null;                    // null for venue_account (Kalshi...)
  derivedFrom?: { bindingId: string; method: "kernel_v3_1_create2"|"venue_profile_lookup"; verifiedAt?: string };
  venues: VenueId[];                         // which venue adapters may be queried with it
  source: "pasted"|"agent_import"|"derived";  // never "scraped"
}

// ---- positions: three venue shapes normalised to outcome exposure --------------------------
type PositionShape = "token_holding"        // XO, Polymarket, Limitless, Trueo, Hyperliquid: balance of an outcome token
                   | "signed_net"            // Kalshi, UDX: signed net contracts on one YES instrument
                   | "long_short";           // Pascal: bilateral contract settling to p in [0,1]
interface Position {
  id: string;                                 // `${venue}:${holderRef}:${marketId}:${outcomeIndex}`
  holder: { bindingId: string };              // which AddressBinding or venue account
  market: MarketRef; outcome: { index: number; role: "yes"|"no"|"label"; tokenId?: string };
  shape: PositionShape;
  qty: string;                                // shares/contracts, venue unit normalised to 1 share = 1 payout unit
  qtyUnit: "shares"|"contracts_1usd"|"contracts_1c";   // Novig reports cents-unit qty; keep the unit, normalise at read
  free: string | null; reserved: string | null;        // XO: balance - reserved
  cost: { total: string|null; avg: string|null; fees: string|null; source: "venue_reported"|"derived"|"unknown" };
  mark: { price: string|null; basis: "bid"|"mid"|"settlement"|"venue_reported"|"none"; asOfMs: number };
  value: string|null;                         // qty * mark.price if mark.basis in {bid,settlement}; else null
  pnl: { realized: string|null; unrealized: string|null; total: string|null; source: "venue_reported"|"derived"|"unavailable" };
  status: "open"|"resolved_unclaimed"|"claimable"|"claimed"|"voided_refund"|"lost"|"closed";
  claim?: { amount: string|null; mechanism: "redeem"|"venue_auto"|"manual"; refundReason?: "resolved_winner"|"voided_refund" };
  collateral: Collateral;                     // symbol, chain, decimals, custody ("self"|"smart_account"|"venue"|"broker")
  prov: Prov;
}

// ---- orders and fills -----------------------------------------------------------------------
interface Order {                             // OPEN orders only; needs credentials except where noted
  id: string; venue: VenueId; market: MarketRef; outcome: { index: number; tokenId?: string };
  side: "buy"|"sell"; price: string; size: string; filled: string; tif: "GTC"|"GTD"|"IOC"|"FOK"|"PO"|"unknown";
  expiresAtMs: number | null;                 // null = no expiry (XO bearer-instrument risk [AD §6.2])
  status: "open"|"partial"|"unknown"; reservedCollateral: string | null; prov: Prov;
}
interface Fill {                              // executed trades; public by address on Polymarket and Limitless
  id: string; venue: VenueId; market: MarketRef; outcome: { index: number };
  side: "buy"|"sell"; price: string; size: string; fee: string | null; feeAsset: string | null;
  atMs: number; txHash?: string; role: "taker"|"maker"|"unknown"; prov: Prov;
}
interface Settlement { market: MarketRef; result: "yes"|"no"|"scalar"|"void"|"cancelled"|"unknown";
                       value: string|null; settledAtMs: number|null; voidPolicy: string; prov: Prov }

// ---- signals -------------------------------------------------------------------------------
type SignalSource = "quotient_forecast"|"quotient_mispriced"|"quotient_signal"|"consensus_mid"|"link_spread"
                  |"structure_violation"|"manifold_prior";
interface Signal {
  id: string; source: SignalSource;
  target: MarketRef;                          // the market this signal is ABOUT
  via?: { linkId: string; proof: Proof; relation: string };   // when reached through a link (XO via a Polymarket twin)
  probability: string | null;                 // oriented to the TARGET venue's YES token (section 8.4)
  orientation: { proven: boolean; yesMap: number[] | null };
  edge?: { executableNet: string|null; shrunkNet: string|null; lambda: string; feeModel: string };
  freshness: { forecastAtMs: number; quoteAtMs: number|null; ageOk: boolean };
  gates: { name: string; pass: boolean; reason?: string }[];   // entry_eligible, in_play, drawdown_risk, capacity ...
  coverage: "forecasting"|"experimental"|"under_review"|"research_only"|"n/a";
  quality?: { tier: string; basis: string; n: number|null; source: "live"|"historical" };
  disclosures: string[];                      // section 8.6, rendered with the card
  prov: Prov;                                 // license "own_use_only" for Quotient
}

// ---- link overlay (from the linking design) -------------------------------------------------
type Proof = "P0_native"|"P1_slot_equal"|"P2_template"|"P3_llm_assisted"|"P4_human";
type LinkState = "proposed"|"template_approved"|"human_approved"|"executable_eligible"|"quarantined"|"suspended"|"rejected"|"expired";
interface LinkView {
  linkId: string; relation: string; proof: Proof; state: LinkState; tierCap: Tier;
  legs: { ref: MarketRef; pinnedRulesSha: string; liveRulesSha: string|null; closeUtc: string; outcomeMap: number[] }[];
  basis: { class: "identical"|"settlement_window"|"settlement_source"|"different"; axes: AxisInstance[]; cutoffDeltaH: number };
  verification: { ok: boolean; checkedAtMs: number; reasons: string[] };   // L4 runtime verifier, rerun in-page
  spread: SpreadView | null;
}
interface SpreadView {
  midGap: string | null;                      // display only; requires both books ok
  executable: { size: string; netPerShare: string|null; capital: string|null; feeStatus: "verified"|"conflicted"|"unknown" } | null;
  tier: Tier;                                 // min(proof cap, class cap, axis cap, gate result)
  reasons: string[];                          // machine-readable, shown in the UI
}
```

### 6.1 Per-venue position mapping (the unit and key hazards the normaliser absorbs)

| Venue | Source fields to `Position` | Hazards |
|---|---|---|
| XO | Data API `shareAmount` (micro-shares), `entryPrice`, `entryValue`, `currentValue`, `pnl`, `hasClaimed`, `outcome.outcomeTokenId`; orderbook `balance`/`reserved` (micro-shares) | divide by 1e6; `currentPrice` is not a price; outcome index 0 is "Yes"; positions belong to the **Kernel account** [02, 19] |
| Polymarket | `/v2/positions` `current_size`, `avg_price`, `entry_cost_usdc`, `entry_fees_usdc`, `current_price`, `realized_pnl`, `unrealized_pnl`, `status`, `redeemable` | `outcome_index` is not a stable key across routes; map by token id [08 V (the `outcome_index` vs `clob_index` finding)]; `current_price` is venue-supplied, so the dApp re-marks from the book bid and shows both |
| Limitless | `/portfolio/{account}/positions` | field names not read first-hand (only the route and its security were); cost basis availability NOT VERIFIED |
| Trueo | `getUserPosition -> (yes, no)` 18 decimals; value via the pool quote; collateral TYD | TYD is not USD; no cost basis; claimable via `getUserClaimableAmount` |
| Hyperliquid | spot balance of token `+<enc>`; `coin` for the book is `#<enc>` | outcome side is `enc % 10`; only the Yes-side book is merged |
| Pascal | owner account rows: long/short qty at p | `shape = long_short`; a short of q at p is NO exposure with entry `1-p` |
| Kalshi | `/portfolio/positions` signed net `position_fp`, exposure | counts are fractional `*_fp` strings; dollars are `*_dollars` strings |
| Novig / UDX | signed net per outcome | Novig API qty is in cents-units (qty/100 = USD payout) while its CSV docs say $1 per contract [VC]; keep `qtyUnit` |

### 6.2 Valuation policy

- **Mark = best bid** for long exposure (the price the user could actually sell into), from the venue's own sorted book at the displayed `asOf`; mid and venue `current_price` are shown as reference columns, never summed into portfolio value. A one-sided or empty book yields `value = null`, not 0. (This follows [AD §2.2]'s ban on `currentPrice`, `outcomePrices`, `last_trade_price` as prices.)
- **Resolved**: mark = settlement value; **voided**: mark = refund per the venue's void policy (XO: "trades reversed or funds returned"; Polymarket 50-50 pays 0.50; Kalshi scalar or last price) [AD §3.4].
- **PnL**: show the venue's reported realized/unrealized where it exists and label it `venue_reported`; otherwise `derived` from cost and mark, otherwise `unavailable`. Portfolio totals add only rows whose `value` is non-null and state how many rows were excluded.
- **Cross-venue netting is not done silently.** A hedged pair appears as two positions joined by a link badge (the group's proof and basis), because their payoffs diverge in the cases the axes describe [ML §5].

---

## 7. Identity: address bindings, chains and Option 0

The read model needs **no private key**. It needs a set of `AddressBinding`s. Under Option 0 the starting point is the PayBox wallet(s): an EVM EOA (the same address on every EVM chain) and a Solana address.

| Binding | How the dApp gets it | Used for |
|---|---|---|
| PayBox EVM EOA | user pastes it, or imports a JSON from their agent (the PayBox `list_credentials`/`get_portfolio` surfaces are MCP tools for the agent; **no browser-callable PayBox read API was found**, so this is a manual or agent-mediated step, NOT FOUND for any browser SDK) | Base (Limitless, Trueo, Quotient x402 balance), Polygon (Polymarket owner), BNB (Opinion, Predict.fun) |
| XO Kernel account | **derived**: `CREATE2(factory, keccak256(initData(owner) \|\| salt=0), initCodeHashERC1967(impl))` for owner = the EOA; verified for 2,627 of 2,627 `OwnerRegistered` events and 6 of 6 Base `getAddress` calls [19 §0]. The pinned constants live in [PG §2.1] and must pass a strict EIP-55 check there (the notes contain bad-checksum strings [PG §0 item 6]) | XO positions, claimable, balance; chain-3223 explorer balances. **A derived account may be undeployed**: the dApp shows "counterfactual, not deployed" unless explorer shows code |
| Polymarket wallet | **looked up**, not computed: Gamma `/public-profile?address=` (accepts user or proxy address) or pasted [S:polymarket-gamma] | Data API v2 `user` |
| Solana address | pasted or imported | Pascal account (owner pubkey), World, USDC balance |
| Venue accounts (Kalshi, Novig, Gemini, UDX, OG, SX) | **not addresses**; configured as relay-side credentials with a label. The browser only ever sees the label and the returned rows | T2 features |

Chains the portfolio reads (cash/collateral view): Base (USDC, TYD), Polygon (pUSD), XO chain 3223 (USDC.e via the explorer [C2b]), Solana (USDC), HyperCore (spot balances via `/info`), and custodial USD ledgers (Kalshi `/portfolio/balance`, others) when keyed. Polygon, BNB and Solana RPC CORS are NOT TESTED, so the default is "paste your own RPC URL"; `mainnet.base.org` is the only RPC verified here [C9].

"Multichain smart-contract wallet" scope note: the design question of one account abstraction wallet across chains belongs to the wallet task. For reading, the relevant fact is [19 §0 item 2]: the Kernel address is the same function of the owner on the factory's chains, and `getAddress` on Base returned the real XO account for 6 of 6 observed owners. So one derived address can be queried on both Base and chain 3223. Deployment state per chain must be checked, not assumed.

Privacy: querying by address tells each venue the user's IP and address, and positions are public by address anyway. The binding screen states this, lets the user choose which venues to query per binding, and the dApp loads no third-party analytics, fonts-from-CDN or tracking scripts.

---

## 8. Quotient, per user

### 8.1 What Quotient is for here

A calibrated YES probability ("Q") on markets it covers (Polymarket International, Polymarket US, Kalshi, HL Outcomes), separately gated "signals", and a "mispriced" scan. It does **not** cover XO or Trueo; its measured edge is small and not distinguishable from zero outside the last day once same-day forecasts are excluded (pooled Brier advantage 0.0029, CI 0.0003 to 0.0053, falling to +0.0009, CI -0.0018 to +0.0036) [12 §0, 12 V-Corrected]. It must stay optional; the dApp works on venue prices alone.

### 8.2 How a user brings their own access (three modes)

| Mode | Flow | Where secrets/money live | Verified facts | Risks |
|---|---|---|---|---|
| **A. Own API key** | User creates a `qt_` key in Quotient's console (prepaid credits, 1,000 credits = $1 [12 §3]) and pastes it into the dApp (or the relay). Calls: `fetch(url, { headers: { "x-quotient-api-key": key } })` directly from the browser | The key sits in the user's browser storage (encrypted IndexedDB with a passphrase) or in the relay | Preflight for `x-quotient-api-key` returns 204 with ACAO `*` [C6]; key auth scheme documented `gatewayApiKey` [12 §4]. Whether a **browser-origin** call with the key is accepted by the gateway (no origin restriction) is NOT TESTED (needs a key) | A key in page JS is exposed to XSS; spend is capped by the prepaid balance, not by the dApp. Recommend the relay as the key holder for users who care |
| **B. Agent-paid x402 (PayBox)** | The user's agent (the "agent terminal" or the PayBox MCP) runs the flow in [12 §10.6]: `discover_services`, free unpaid GET to pin the 402 tuple, `use_service` or `pay_x402`. The agent saves the JSON response and the user drops it into the dApp's **Signal Inbox** (file or paste); the dApp validates it against a pinned schema and joins it to markets | Payment stays with PayBox's spend controls; the dApp holds nothing | The 402 challenge and the tuple (`exact`, `eip155:8453`, USDC `0x8335...2913`, `payTo` constant) are verified [12 §4, C6]. 14 Quotient routes are listed in PayBox discovery [12 §9]. The Inbox format is this design's | Human step per refresh unless the agent terminal pushes the result in-process. The dApp cannot cap an agent's spend [06 §10] |
| **C. Browser x402** | The dApp reads the 402 (`PAYMENT-REQUIRED` is exposed to the browser [C6]), asks the user's wallet to sign an EIP-3009 `transferWithAuthorization` for USDC on Base, retries with `Payment-Signature` and a `Payment-Identifier` | The user's wallet signs each payment; no key in the dApp | Header names and idempotency semantics verified [12 §4]. **Open**: a wallet that signs typed data from a browser page. A PayBox wallet's browser-callable signing surface was not found (NOT FOUND), so under Option 0 this mode is conditional | One signature per call; a malicious page could ask for a larger amount, so the dApp enforces the pinned tuple and `amount <= 2 x` price ceiling before asking [12 §10.6] |

Free routes need nothing: `GET /api/public/performance` (cached 30 min), `/api/public/pricing`, `/api/public/forecast-targets`. `forecast-availability` takes about 30 s and is avoided [12 §3, §6].

Never call `/api/v1/portfolio` (it takes the user's wallet and would hand the address to a third party), the X endpoints ($1) or `forecast-requests` ($1, needs a `forecastApiKey`, and sends XO market text to a third party) [12 §10.2].

### 8.3 Budget and cost visibility

Prices per call: signals $0.01, mispriced $0.02, lookup $0.005, forecast $0.01 [12 §3]. Poll costs [12 §4]: mispriced every 30 min about $0.96 per day, signals hourly about $0.24 per day, both every 15 min about $2.9 per day. The dApp shows a running per-session and per-day spend meter, defaults to **manual refresh** for paid lists, and offers a user-set auto-refresh only in mode A (hard-capped by the prepaid balance) or mode B (the agent decides). Suggested data budget for modes B and C: at most $0.05 per call and $2 per day, outside any trading cap [12 §10.6].

### 8.4 Joins and orientation

- Join key: `marketKey` (`polymarket:<id>`, `kalshi:<TICKER>`, `polymarket_us:<id>`, `hl_outcomes:#<id>`, percent-encode `#`), never question text [12 §10.3].
- Orientation: sports rows are probabilities for `sports.yes_side` (a bug mispriced second-listed-team markets before 17.11.0); non-sports use the venue YES. The dApp maps Q's YES to the venue token id **before** any edge, and sets `orientation.proven = false` (hides the number) when it cannot [12 §10.3, V].
- XO and Trueo get a Q number only through an **approved link** to a covered twin, labelled "via link (proof P_, state _)". It is used as "same outcome" only when the link is P2/P4 with `axes = []`; Quotient's own `match` block counts only when `match_level == same_outcome` and `settlement_match == exact`, and even then as a **candidate source**, never as proof (a same-outcome link can have different rules) [12 §5.4, ML §5].
- Units: `entry_q`/`entry_pm` are 0 to 100, `latest_q`/`market_odds` are 0 to 1, `*_cents` are on the signal's own side; normalise to [0,1] at ingest [12 §5.1].
- Edge: recompute `EV = q_eff - (ask + fee)` from the venue's own book with `q_eff = mid + lambda_q (q - mid)`, default `lambda_q = 0.25` until 200 resolved logged forecasts exist; show Quotient's number and ours side by side [AD §5.4, 12 §10.4]. The dApp can log the user's own snapshots locally (forecast id, probability, quote, own mid) to fit `lambda_q` later; this is the user's own data (R4).

### 8.5 Which Quotient outputs matter for arbitrage and edge

| Output | Why it matters | How the dApp uses it | Weight |
|---|---|---|---|
| `markets/mispriced` rows on Polymarket and Kalshi (`quotient_odds`, `market_odds`, `spread`, `venue_quote`, `inDispute`) | Candidate generator: model-vs-quote gap on the two venues that have verified live quotes | Watchlist; the dApp recomputes the executable edge from the book; rows with `quote_method == graph_snapshot`, `inDispute`, or stale quotes are dropped | High, but only as a ranker |
| `signals` with `entry_eligible: true` and `sports.markets[]` | Published ideas; for a sports game the response lists **every graph-linked listing with its own quote, `signal_side`, availability** (Kalshi and Polymarket for the same game, [C6] example) | Shows a free cross-venue price comparison and seeds link **candidates** (never proof); choose the listing on the user's venue, never `markets[0]` | High for sports cross-venue context |
| `forecast.delta_from_prior`, `refresh_reason`, `forecast_status` (`converging`, `diverging`, `adverse_move_pct`) | A change in the model's view is a leading indicator for repricing and for exiting | Alert on a flip or `fading_q`, `under_review` for a market the user holds | Medium |
| `quality` (tier, basis, sample size, live vs historical), `similar_trades`, `conviction_calibration` | Calibration of how much to trust Q | Shown with every Q number (disclosure); feeds the `lambda_q` default | Medium |
| `drawdown_risk_elevated`, `capacity_usd_at_2c`, `capacity_basis` | Sizing and exit risk (null drawdown = unknown, not safe) | Hard gates on the Signals feed; capacity below the user's size demotes the row | Medium |
| `q_coverage` (`forecasting` vs `experimental`) | Sports are `experimental`: no demonstrated edge in the 60-day paper test (-4.8% on sports) | Default filter `forecasting`; `experimental` behind an explicit opt-in and a visible label | Gate |
| `match` block (`match_level`, `settlement_match`) | Hint for link discovery | Candidate source only | Low |
| Free `performance` snapshot | Honest track record | Show favourable 60-day figure **and** all-time together | Required disclosure |
| `price-outlooks`, `assets`, `x/*`, `latest` | Not prediction-market edge | Not used (cost, scope) | None |

### 8.6 What per-user display permits, and the disclosures

On the most natural reading of Quotient's terms (licence for personal or internal business purposes; no sharing or resale of access; no redistribution of outputs; no competing signals product), **each end user paying for and viewing their own calls in their own browser is inside the licence shape**; an author-operated feed, a shared cache, a public "top mispriced" page and exposing raw payloads over any shared API are not [12 §8]. This is an interpretation (M, not legal advice); no commercial licence exists and the terms say prices and compatibility can change without notice. Default for the distributed build: **off**, with the clause shown before a user turns it on (R8). Quotient's published contact for a licence is in [12 §8]; the design does not wait for a reply.

Disclosures rendered with every Q number [12 §10.9]: forecast timestamp and age; `q_coverage` state (sports: "experimental, no established edge"); `quality` tier with basis, sample size and live-vs-historical; the quote source and age; that a spread is not an executable edge; that performance figures are hypothetical paper results excluding fees and slippage and the signals record mixes historical replays with live signals; that the edge is small and concentrated at short lead times; the per-call cost; not investment advice; no affiliation with the venues; attribution to Quotient. No auto-trade from a Quotient number, ever.

Failure handling (402 tuple mismatch is a hard stop; 409 `payment_replay_mismatch`; 429 honours `Retry-After` and is not billed; unknown `entry_status`/`venue` enums fail closed; schema pinned to OpenAPI 20.5.0 with a contract check on version change; seven breaking majors so far) follows [12 §10.8].

---

## 9. Linked-market groups: spread and proof level

### 9.1 What is bundled and what is live

`links.json` (and `templates.json`) are compiled from the offline indexer's human-approved set: `linkId`, `relation`, per-leg `venue`, `nativeId`, `rulesSha256`, `maskedSha256`, `closeUtc`, `outcomeMap`, `proof`, `state`, `basis`/`axes`, `validUntil`. **No titles, prices or rules text are shipped.** At runtime the page re-reads both legs through their own transports, recomputes the rule hash recipe from [ML §5] (`sha256(NFKC(strip_html(join(rule-bearing fields, U+241F))))` with per-venue fields), compares status, close time, tick and fee model, and sets the link `suspended` on any mismatch, with no model in the loop (the L4 verifier from [AD §4.3]). A link older than `validUntil` or a dataset older than its own release date shows an age banner. Per-venue rule fields: Polymarket `description, resolutionSource, endDate`; Kalshi `rules_primary, rules_secondary, close_time` plus event `settlement_sources`; Limitless `description, expirationTimestamp`; XO (detail route only) `rules, resolutionSources, resolverAddress, expiresAt` [ML §5].

If a leg's transport is unavailable (for example the XO book without the relay), verification of the rules hash can still run (XO rules come from the Data API detail route, T0), but the spread is shown as `indicative` with reason `leg_book_unavailable`.

### 9.2 Proof levels as shown to the user

| Proof (how established) [ML §5] | Badge | May appear in the default view? | Notes |
|---|---|---|---|
| `P0_native` (venue hook: Limitless `externalSlug`/`rulesHash`, Pascal Polymarket reference, Predict.fun/Probable refs, fixture ids) | "Native hook" | Only after a human or template approval (state); otherwise candidate list | Provenance, not verification [AD §4.3 L0] |
| `P1_slot_equal` (deterministic slot gate) | "Slot-equal (candidate)" | No; candidates tab only | May reach `LINK` but not a label |
| `P2_template` (human-approved rule template pair) | "Template-approved" | Yes | The unit of review for XO football triples, FOMC/ECB/BoE sets, crypto ladders [ML §6.7, AD §4.3 L1] |
| `P3_llm_assisted` | "LLM-assisted (candidate)" | No; candidates tab only | LLMs may propose and veto, never promote [ML §0 item 3] |
| `P4_human` | "Human-approved" | Yes | |

`state` (proposed, template_approved, human_approved, executable_eligible, quarantined, suspended, rejected, expired) is shown next to the proof; only `template_approved` and above reach the shipped dataset [ML §5]. Exhaustiveness (`E0` to `E4`) is shown on partition groups: only E2 to E4 allow a long basket; E1 (Kalshi `mutually_exclusive`, augmented neg-risk) allows the short basket only; Kalshi has no exhaustiveness field, so Kalshi sets read E0/E1 [ML §6.2].

### 9.3 Group types shown

| Group | Source | Spread shown | Tier ceiling |
|---|---|---|---|
| Identity bundle (same claim on several pools) | verified identity links, injective per liquidity pool (a front end is not a second pool [PR §4.2]) | `midGap` and an executable gap vs the best other leg; coherent reference price from the bundle | `hedged_discrepancy`; `executable_arbitrage` disabled until D2 [AD §0.4] |
| Constraint cluster (partition, ladder, exclusive, implication) | links at P0 to P2 plus human approval; at most 30 contracts / 64 atoms | structural check result (sum of asks vs 1, monotonicity) | `structural_violation` (rare; alert) |
| Venue group (native membership) | Polymarket event/neg-risk, Kalshi event, XO `rootEventSlug`, Limitless group | membership only | none |
| Factor cluster | tags/entities | correlation display only, no spread | `relative_value_signal` |

### 9.4 Spread computation (reuse, do not reinvent)

- `midGap = mid_A - mid_B` on proven-orientation outcomes, shown only when both books are native (not complement-derived) and two-sided; otherwise `n/a`.
- Executable gap: walk both ladders to the user's chosen size (default the $10 advisory cap), apply the registry `FeeSpec` for each leg, add capital-lock and the basis reserve from the axes, per [AD §5.0, §5.1, §5.6]. XO's fee sources disagree (`/fee-rate` 0 vs `effectiveFeeConfig.takerFeeBps` 400/800), so the XO leg uses the maximum and the row is labelled `fee unreconciled` until one real fill reconciles it [AD §3.3].
- Gates before any non-`indicative` tier: verified link, both markets tradable and not near close, no UMA proposal/dispute flag, leg timestamp skew within 5 s (`executable`) or 60 s (`hedged`), verified fee model, net marginal edge above 0.5 cent, eligibility attested by the user [AD §5.1]. Anything else is `indicative_discrepancy` with reasons.
- Honest expectation shown in the UI: cross-venue XO-vs-Kalshi football showed a median mid gap of 0.1 cent and zero gross edge on the 2026-10-18 snapshot; spread plus fees remove about 90% of an apparent mid-gap [AD §0.1, 18 §2.6]. The screen is a reference-price and risk view, not an arbitrage feed.

---

## 10. Screens

Every screen shows a provenance strip (venue, transport, fetched-at, freshness) and a degraded-state reason in plain words. No screen has an order-entry control (writes are out of scope and flag-gated OFF); the only outbound action is "copy plan / copy market reference to my agent".

### 10.1 Market explorer

- **Purpose**: one searchable list of markets across the enabled venues.
- **Source**: per-venue list routes (XO Data API `marketType=2,4`; Polymarket Gamma keyset; Kalshi via relay; Limitless via relay; Trueo on-chain; Pascal; Novig/OG/Gemini public). Local text index over loaded titles (titles are `Untrusted<string>`, length-capped, control characters stripped). DefiLlama supplies venue liveness and 30-day volume.
- **Columns**: venue badge, title, status, closes-at (UTC, with the venue's own timezone convention noted), best bid/ask (from the book when T0/T1 allows; "display price" tag otherwise), spread, depth within 5 cents, 24 h volume (labelled by venue unit), fee model status, link badge (group id, proof), Quotient badge (when enabled), your position marker.
- **Filters**: venue, status, category/tag (client-side where the venue's filter is unreliable, such as XO `categories`), "has link", "I hold this", close window.
- **Rules**: never rank by `outcomePrices` or last trade; cap per-venue fan-out per refresh (section 11); fetch books only for visible rows (virtualised list); a row shows `n/a` rather than a guess.
- **Degraded**: venue without ACAO and no relay: row appears from the venue's other source (for XO the Data API) with "no book (relay needed)"; venue off by flag: a greyed filter chip with the reason.

### 10.2 Linked-market groups

- **Purpose**: the cross-venue view: each approved group with its legs side by side.
- **Layout**: a card per group: relation, proof badge + state, basis class and axes ("timing: cutoff differs by 5 h"), legs as rows (venue, outcome-mapped YES price, bid/ask, depth, fee status, rules-hash match: green/red), spread block (`midGap`, executable net at the user's size, capital, tier with reasons), exhaustiveness for partitions, resolution-risk strip (oracle per leg: UMA / exchange / XO MANUAL; void policy per leg), and a "why not arbitrage" line that is always visible.
- **Actions**: open each leg on its venue (new tab to the venue's own page, no automation), copy a plan to the agent.
- **States**: `suspended` groups are shown struck through with the reason (hash mismatch, status change); `quarantined` and `expired` hidden by default.
- **Candidates tab**: P1 and P3 candidates, off by default, labelled "unverified, never an arbitrage".

### 10.3 Portfolio across venues and chains

- **Header**: bindings in use (labels, not full addresses by default), and per-venue health chips.
- **Totals**: marked value, cash/collateral by chain and custody (Base USDC, Polygon pUSD, chain-3223 USDC.e, Solana USDC, venue-custodial USD), claimable total, count of rows excluded from totals (no bid, unknown mark). Never one blended "net worth" number without the exclusion count beside it.
- **Table** (group by venue / chain / linked group / market): outcome, qty, avg cost, mark (basis), value, PnL (source badge), status, closes-at, claim button label "claim on <venue>" (opens the venue; the dApp does not claim).
- **Exposure panel**: positions grouped by identity bundle and constraint cluster to show net exposure *and* the divergence cases (a hedged pair is shown as a pair, not netted).
- **Alerts inline**: redeemable winners, positions in disputed or near-void markets, markets closing within a window.
- **Degraded**: XO populated-portfolio shape unverified: if a field is missing the row shows what the orderbook `/positions` (relay) gives; Kalshi without a relay key: a "connect Kalshi (read key)" card, no rows.

### 10.4 Order and bet history

- **Fills**: Polymarket `/v2/trades?user=` and `/v2/activity?user=` (public); Limitless `/portfolio/{account}/history` (relay, public); Trueo derived from the user's swap logs only if the user opts in; Kalshi fills (relay key); XO via portfolio entries (no tape without L2); Pascal `/fills`.
- **Open orders**: only where a credential exists (relay): Kalshi, Limitless, Polymarket L2, XO L2. Each shows `expiresAtMs`; an XO order with no expiry is flagged as a bearer-instrument risk [AD §6.2].
- **Settlements**: resolved/voided outcomes with payout and the venue's void policy.
- **Export**: the user's own fills and orders only (R5).
- **Honest labels**: "history is whatever each venue exposes"; a venue with no public tape says so.

### 10.5 Signals feed

- **Tabs**: Quotient candidates (mispriced), Quotient published signals, "For my holdings" (lookup of the user's held `marketKey`s and linked twins), Structural alerts (partition/ladder violations from the client's own checks, no Quotient), Track record (free performance snapshot).
- **Card**: market, venue, orientation proven badge, Q probability and age, our executable edge after fees and `lambda_q` shrinkage, gates (entry eligible, in play, drawdown, capacity), `q_coverage`, quality tier with sample size, spend meter, "related, not equivalent" tag when reached through a non-P2/P4 link, the disclosures (8.6).
- **Empty state**: Quotient off or no key/payment: the tab explains the three modes and shows the free track-record snapshot only.

### 10.6 Alerts

All alerts are **client-side**: they fire while the page (or the optional relay process) is running; there is no push service, because that would be an author-operated server. A closed tab sends nothing; this is stated in the UI.

| Alert | Trigger | Dedupe / cooldown |
|---|---|---|
| Link suspended | rules hash, status or close time changed on a leg | once per link per change |
| Structural violation | partition/ladder net after fees above threshold, past the creation burn-in and settlement-point filter [AD §5.3] | 10 min per group |
| Spread | linked group executable net above the user's threshold at their size | 10 min; re-arm when it falls below |
| Position state | market `closed`/`determined`/`disputed`/`voided`; `redeemable` appears; near-close window | once per transition |
| Quotient | flip, `fading_q`, `under_review`, or a new `entry_eligible` signal on a held/linked market | only when refresh is user-enabled; costs shown |
| Venue health | XO `/trading-state` paused (relay), Limitless maintenance (`425`), adapter error streak, schema drift (unknown enum) | on state change |
| Budget | Quotient spend nearing the user's daily cap | once per threshold |

Notification channels: in-page toast, browser Notification API if the user grants it, and (relay) a local desktop hook. No email/SMS/webhook.

### 10.7 Connections and flags (settings)

Venue switches (default ON for T0 open-data venues; OFF for Kalshi, Gemini, reference-only US venues and Quotient, per R8), address bindings, optional relay URL (`http://127.0.0.1:<port>`) with a handshake that lists which venues the relay serves, optional RPC URLs, Quotient mode and budget, polling intervals, data-age policy, and a "wipe local data" button.

---

## 11. Refresh and caching rules

### 11.1 Layers

1. **In-flight dedupe**: identical requests within one tick share a promise.
2. **Memory cache** with per-class TTL (below). Authoritative for restricted-license data (R3).
3. **IndexedDB** for: link dataset, registry tables, the user's own positions/orders/fills, immutable Quotient `forecast.id` bodies (mode A/B/C, per user, user's own data), fee-table snapshots. Wrapped in try/catch; the page renders without it.
4. **HTTP caches**: honour `Cache-Control` (Gamma `max-age=300`, Limitless `max-age=30`, Novig `max-age=3600` types). Never override with a longer TTL.
5. **No shared or server-side cache** exists anywhere.

### 11.2 TTL, polling and budgets (D = design default; limits are documented/observed)

| Data | TTL / poll | Cap per tick | Rule |
|---|---|---|---|
| Venue market lists | 5 min, refresh on scroll/search | one page per venue per refresh | page on the venue's cursor only; XO on `meta.hasNextPage` |
| Visible-row books | 15 s foreground; paused when hidden; 60 s for rows not in view | XO relay at most 4 per second [PG §9 A5 matches the relay bucket], Polymarket batch where tested else per-token well under 1,500 per 10 s, Kalshi one `orderbooks` batch of up to 100 tickers per link family | stale label past 3x TTL; leg skew shown for linked groups |
| Linked group live view | books 5 to 10 s while the group is open; rules-hash recheck each load and every 5 min | 2 to 4 legs | skew over 5 s blocks `executable`, over 60 s blocks `hedged` |
| User positions (T0 by address) | 30 s open view, 5 min background | one paged call per venue per binding | cursor-paged; XO portfolio via Socket.IO is NOT used |
| Raw XO balances/claimable (relay) | 30 s | 3 calls per binding | |
| Open orders (credentialed) | 15 s while the History tab is open | | stops on 401/403 and says why |
| Fills/activity | 60 s open, none in background | cursor-paged, stop at last-seen id | |
| Trueo state | 30 s | batch via JSON-RPC array or multicall | `getCurrentStatus()`, never the stored status |
| Chain balances | 60 s | one multicall per chain | user-supplied RPC preferred |
| Registry/fees | bundled; per-field TTL: 7 days liquidity, 30 days fees/geo/API; past TTL reads as `unknown` and fails closed [PR §3.5] | n/a | live fee parameters are read per market at quote time (Gamma `feeSchedule`; Kalshi series fee + overrides) |
| DefiLlama | 1 h | one call | liveness only |
| Quotient free `performance` | 30 to 60 min | 1 | matches server cache |
| Quotient mispriced / signals | 5 to 15 min, **manual by default**, never faster | per user budget | do not use a cached spread for any action; re-check `entry_eligible` at action time |
| Quotient forecast by `forecast.id` | indefinite (immutable); "latest for market" pointer 15 to 60 min | | per user, R4 |
| OpenAPI (Quotient) | 5 min (server `max-age=300`) | | on `info.version` change run the contract check before use |

Backoff and blocks: honour `Retry-After`; exponential backoff with jitter; after three 429 or any 403 on a venue, pause that venue for 10 minutes and surface the reason (R9, R10). The relay applies its own token bucket and returns the same signals so the page never needs to retry blindly. Use the Page Visibility API to stop all background polling; a hidden tab does nothing.

### 11.3 Staleness

Venue timestamps where they exist (XO and Polymarket `timestamp` + `hash`; Quotient `observed_at`); fetch time plus RTT otherwise (Kalshi books carry none) [AD §8.3]. Colour bands: live (within TTL), recent (up to 3x TTL), stale (beyond), unknown. A stale or unknown book can never produce a spread tier above `indicative`. Reject for any tiered label: UMA proposal/dispute flag, Kalshi `disputed`/`amended`, XO `PAUSED` or `/trading-state` paused, Trueo derived status not trading, Limitless maintenance, near close, `can_close_early` [AD §8.3].

### 11.4 Memory-only items are really memory-only

Kalshi/Gemini/OG/UDX/Novig/ProphetX market data and Quotient list bodies are held in a module-scope map and dropped on tab close and on a 15 min idle timer. They are excluded from `JSON.stringify` snapshots, URLs, console logs and error reports.

---

## 12. Day zero (zero credentials) vs needs the user's own keys

"Day zero" means: the user opens the static page, pastes at most public addresses, runs no helper. "With relay" means the user also runs the local read-only relay but supplies no credential. "Own key" means a credential the user creates and holds themselves.

| Feature | Day zero | With local relay (no key) | Needs the user's own key / account |
|---|---|---|---|
| **XO** market list, search, rules, status | **Yes** (Data API, T0) | | |
| XO order book, depth, executable spread | No (display price only) | **Yes** (T1) | |
| XO positions, claimables, PnL by address | Partly: Data API portfolio (populated shape unverified) | **Yes**: orderbook `/positions`, `/claimable`, `/balance-allowance` | |
| XO chain-3223 balances/transfers | **Yes** (explorer, T0) | | |
| XO open orders, fills | No | No | XO L2 HMAC triplet (gated by the wallet-ownership gates [PG]) |
| **Polymarket** markets, books, fees, resolution, price history | **Yes** (T0) | | |
| Polymarket positions, activity, trades, value, PnL by address | **Yes** (Data v2, T0) | | |
| Polymarket open orders | No | No | CLOB L2 API credentials (not offered in v1) |
| **Kalshi** market data, books | No (403 to browser origins) | **Yes** (T1; flag off by default; memory-only) | |
| Kalshi positions, orders, fills, settlements, balance | No | No | Kalshi API key (read scope), relay-held |
| **Limitless** markets, books | No (no CORS) | **Yes** | |
| Limitless positions/history by address | No | **Yes** (public routes) | |
| Limitless open orders | No | No | scoped HMAC token |
| **Trueo** markets, quotes, positions, claimables | **Yes** (Base RPC, T0-RPC) | | |
| **World** | No | No | the user's PayBox agent output (T3 import) |
| **Hyperliquid HIP-4** markets and books | **Yes** (POST preflight verified; POST M) | | |
| Hyperliquid positions by address | **Yes** (M) | | |
| **Pascal** markets, books; account by owner pubkey | **Yes** (T0) | | |
| **Novig / OG / Gemini** public prices (reference only) | **Yes** (T0; Gemini/OG flag off by default) | | |
| Novig / OG / Gemini / UDX / ProphetX positions, orders | No | No | account-bound keys; Novig/OG/UDX/ProphetX effectively unavailable to non-US-KYC users (T4) |
| **SX Bet / UDX** public lists | No | **Yes** | |
| SX Bet positions/orders | No | No | scoped API key |
| **DefiLlama** liveness, volume | **Yes** | | |
| **Link overlay** (bundled `links.json`) and rule-hash verification | **Yes** for legs whose rules route is T0; legs on T1 venues verify through the relay | | |
| Spread / executable gap / tier | **Yes** where both legs have books (for example Polymarket vs Pascal vs Trueo); XO and Kalshi legs need the relay | | |
| Within-venue structural checks (Polymarket neg-risk, ladders) | **Yes** | | |
| **Quotient** free track record (`performance`, `pricing`, `forecast-targets`) | **Yes** (flag on) | | |
| Quotient mispriced, signals, forecasts | No | No | Mode A: own `qt_` key; Mode B: agent x402 + Inbox; Mode C: wallet-signed x402 (conditional) |
| Alerts | **Yes** while the page is open | **Yes** (also desktop hook) | |
| Portfolio cash/collateral by chain | **Yes** for Base (public RPC) and chain 3223 (explorer); other chains with the user's RPC URL | | |

Cell contents marked "Yes" for Hyperliquid, Pascal accounts, and the XO populated portfolio rely on M-tagged facts (section 13); the page degrades to "no data" instead of guessing.

---

## 13. Risks, unverified items and what is not possible

Not possible without something the design excludes:

- XO books, Kalshi, Limitless, SX, UDX in a bare browser (no CORS or a WAF block). They need the relay. A fully relay-free product would show XO as display-price-only and omit the others.
- Open orders for most venues without credentials. There is no public "orders by address" on any venue in scope.
- Push notifications when the page is closed (would need an author-operated service).
- A single "net worth" across custodial USD venues and on-chain venues without the user supplying a key for each; the dApp does not guess.
- Kalshi/Novig/OG/UDX/ProphetX positions for users who are not eligible account holders (geo/KYC); the dApp shows facts, never an eligibility verdict.

Unverified (labelled in place; none is hidden):

1. Populated XO `GET /users/portfolio` and raw `/positions` shapes: never observed with real data [02 §2.2].
2. Hyperliquid POST `/info` response CORS (preflight only) and outcome-token visibility in `spotClearinghouseState` [C8, VN].
3. Pascal `/api/v1/accounts/{owner}` field names and its CORS (the same host serves ACAO `*` on `/markets`) [C7b, VN:pascal].
4. Limitless positions response fields and cost-basis availability (route and security read; response not read).
5. Whether Kalshi's 403 on `Origin` is a deliberate browser block, and whether an anonymous read of public data is "API use" under the Developer Agreement [C4, 08 V-E1].
6. Whether the gateway accepts Quotient key calls from a browser origin (needs a key) [C6].
7. Any browser-callable PayBox read or signing surface (none found); this decides Quotient mode C and the "import addresses from my agent" convenience.
8. WebSocket origin policies (C12) and Polygon/BNB/Solana RPC CORS.
9. Whether the XO explorer is a supported public interface; its terms are undocumented.
10. All census-venue facts are single-pass [VC header]; ToS clause readings are summaries, several extracted by a small model (SX, Gemini).

Risks:

- **Stale/false links**: a false link produces a fake spread. Mitigation: only reviewed links ship; in-page hash re-verification; no tier above `hedged_discrepancy` until D2; the "why not arbitrage" line is permanent [AD §0.4].
- **Address-linked privacy**: positions are public by address; browsing leaks IP + address to each venue. Stated in the UI; per-binding venue selection; no analytics.
- **XSS and keys**: a Quotient key (mode A) in browser storage. Mitigation: strict CSP, no third-party scripts, encrypted storage, relay option.
- **Prompt injection**: titles, rules, theses and evidence are attacker-controlled; they are `Untrusted<>`, length-capped, never executed, and never passed to the agent terminal as instructions (they are quoted data blocks) [AD §1.2].
- **API churn**: Kalshi ships weekly changes; Quotient has had seven breaking majors; Polymarket Data v1 retires 2026-10-24. Pinned schemas, fixtures, unknown enums fail closed, adapter `health()` surfaces drift [AD §8.3].
- **Rate limits as the user's IP**: friendlier than a shared sandbox but a VPN user may share an IP with others; polling is bounded and backs off.
- **Terms drift**: the restricted-venue flags, the disclosures and the memory-only rules are the mitigations; none is a legal conclusion.

---

## 14. Phasing (flags ship OFF)

| Phase | Contents | Flag |
|---|---|---|
| U0 | Static shell, provenance strip, address bindings, Polymarket + Pascal + Trueo + XO Data API markets, Polymarket positions/activity, Trueo positions, chain balances, DefiLlama, bundled `links.json` with in-page hash verification | `core` (on) |
| U1 | Local read-only relay (XO books, Limitless, SX, UDX); XO raw positions/claimables; linked-group spreads with fee models | `relay` (on if relay detected) |
| U2 | Quotient modes A and B (Inbox), signals feed, disclosures, spend meter | `quotient` (off) |
| U3 | Credentialed read routes in the relay (Kalshi read key, Limitless HMAC, Gemini) for orders and fills | `credentialed_reads` (off) |
| U4 | Kalshi market data and reference-price venues (Gemini, OG, Novig) behind the disclosure screen | per-venue flags (off) |
| U5 | Quotient mode C (conditional on a browser-signing wallet), optional WebSocket upgrades | `quotient_x402`, `ws` (off) |

None of these adds a write path. The agent-terminal integration consumes the same normalised store through a read-only message interface (list markets, get group, get portfolio snapshot, accept Inbox JSON); market text crosses it only as quoted data. The terminal and the multichain wallet are specified by other tasks.

---

## Verification

Re-checked this session (2026-10-19), with the exact evidence:

1. **CORS and access probes C1 to C11** (section 3): `curl` with `Origin: https://dapp.example` (and, where stated, `http://localhost:3000`, `http://localhost:5173`, `http://127.0.0.1:3000`, `http://localhost:8080`, `https://localhost:3000`, `null`, `https://example.org`), UA `insurance-markets-research/0.1`. Scripts: `cors.sh` and `cors2.sh` in the task's session scratchpad folder `unified-view/` (not committed). Results quoted in section 3 are verbatim header observations. One surprise re-checked: the first run showed Kalshi 403 and no ACAO on `orderbooks.xo.market` for `dapp.example`; I re-ran with no `Origin` (Kalshi 200) and with several origins (only `http://localhost:3000` is echoed by both hosts), so the finding is an allowlist for localhost:3000, not a transient error.
2. **Preflight `OPTIONS` only** (no POST/PUT/DELETE sent): `orderbooks.xo.market/positions`, `mainnet.base.org`, `api.hyperliquid.xyz/info`, `api.crypto.com/.../get-events`, and Quotient `/api/v1/signals` with `Access-Control-Request-Headers: x-quotient-api-key`.
3. **Quotient 402**: one free unpaid `GET /api/v1/signals?status=active`. The `payment-required` header was received and not stored; nothing was paid, no key used. The header's decoded content was not copied here.
4. **Specs downloaded and parsed** (stored in the session scratchpad folder `unified-view/`, not committed): `[S:polymarket-data-v2]` `https://data-api.polymarket.com/v2/openapi.json` (20 GET routes listed; `user` parameter on `/v2/positions`, `/activity`, `/trades`, `/value`, `/user-pnl`, `/approvals`; `Position` schema fields); `[S:polymarket-gamma]` `https://docs.polymarket.com/api-spec/gamma-openapi.yaml` (`/public-profile?address=` accepts proxy or user address); `[S:limitless]` `https://api.limitless.exchange/api-json` (public `/portfolio/{account}/...` routes; authenticated `/portfolio/*` and HMAC `user-orders`); `[S:kalshi]` `https://docs.kalshi.com/openapi.yaml` v3.34.0 (`/portfolio/positions|orders|fills|settlements|balance` paths present; signing requirement taken from [08 §4.8], not re-read in the spec); `[S:novig]` `https://docs.novig.com/api-reference/spec-files/openapi-v3.json` (public catalog routes without security; account/portfolio/orders routes with security).
5. **XO explorer**: `explorer-mainnet.xo.market/api/v2/stats`, `/addresses/{dummy}`, `/token-balances`, `/token-transfers` returned 200 with ACAO `*` (Blockscout-style).
6. **Repo docs re-read** for this task: `docs/plan.md` status banner; `docs/phase1-gap-closing.md` sections 0 and 9; `docs/aggregation-design.md` sections 0 to 13 and Appendix A (read in full); `docs/market-linking-design.md` sections 0, 5, 6.2, 6.3, 7.5; `docs/platform-registry-design.md` sections 0 and 4; `docs/venue-census.md` P0 and P1 sections (all 17 rows, including duplicates for OG, Hyperliquid and UDX); `docs/research/02` sections 0 to 2.2; `08` (endpoint catalogues, rate limits, Kalshi terms); `12` in full; `13` sections 0 to 5; `14` sections 0 and 1; `19` section 0; `11` interface excerpts; venue notes for Pascal, SX Bet, Hyperliquid, Gemini, UDX, ProphetX (position/auth lines only). I did not read notes 15, 16, 17 or 18 beyond the figures quoted second-hand from [AD] and [ML]; the P0 to P4 definitions come from [ML §5], not from note 16.

Not re-checked, and therefore carried as the source's tag (M) in the text: Gemini/ProphetX/Pascal/UDX/OG ToS wording (from [VC] summaries); Hyperliquid fee and eligibility text; every rate limit not observed in a header; Kalshi's signing details; the Polymarket and Kalshi fee formulas (used only by reference to [AD §3.3]); the XO Kernel address derivation (taken from [19], not recomputed); all PayBox behaviour (no PayBox tool was called).

Privacy check: this file contains no email address, name, username, GitHub login or home path (scratch files are referred to by relative name only). Probe requests carried only the research User-Agent and a fake `Origin`. A `grep` for `@` matches only the WebSocket stream names `@bookTicker` and `@depth10`; a grep for the home-path prefix and for `/private/` has no match.
