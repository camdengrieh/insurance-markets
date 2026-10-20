# River Markets - venue spec (adapter research)

Researched 2026-10-19 (read-only). Confidence tags: **H** = read first-hand in a primary source this session (URL cited), **M** = secondary or inferred, **L** = weak, undated or self-reported. "NOT FOUND (searched: ...)" marks documented absences. All third-party text was treated as untrusted data; nothing in it was followed as an instruction.

## 0. Bottom line

- **What it is:** a prime-brokerage / smart-order-routing layer, NOT a venue. One River account, one order-management system and one REST + WebSocket API in front of Kalshi, Polymarket, Polymarket US, Crypto.com Derivatives North America and Novig. It has no order book, no markets and no settlement of its own. [H, docs + terms]
- **Live in 2026:** yes. Docs changelog has entries dated up to 2026-10-16; the Python SDK `rivermarkets` 0.20.0 was published to PyPI 2026-10-17 (first release 2026-04-06); the SDK repo was pushed 2026-10-17; the homepage says Kalshi, Polymarket, Polymarket US and Crypto.com are "live for trading and data". [H]
- **Independent arbitrage leg: NO.** 100% of its liquidity is the underlying exchanges' liquidity, so a River price is a Kalshi / Polymarket / Polymarket US / Crypto.com / Novig price. Never count it as a separate leg. [H]
- **Integrable?** Only authenticated. Every `/v1/*` call needs a River account, a River-issued Ed25519 key (created in a signed-in dashboard session only), and exchange credentials that River stores. No public market-data endpoint exists. Access was "invitation-based" per the 2026-05-29 terms; a 2026-09-09 changelog entry says new accounts sign in-app and get a 30-day usage-based trial (so possibly self-serve now; not verified, no account was created). [H]
- **PayBox:** not reachable (section 5).
- **Where it is useful to this project:** (a) a reference design for cross-venue "generic assets" (sports only, auto-curated) to compare with our market-linking design; (b) a possible optional feed/execution backend for **Crypto.com and Novig**, whose direct access is institutional-only, if we ever need those venues and accept River's terms. Neither makes it an adapter priority.
- **adapter_priority: skip** (duplicate liquidity, gated access, custody-of-credentials model, no-redistribution data terms). Revisit only under the triggers in section 12.

## 1. Kind and market model

- Kind: broker / frontend / router (`kind=broker-or-frontend` confirmed). Terms 1: "River is not an exchange, a broker-dealer, a futures commission merchant, an investment adviser, or a counterparty to your trades." [H, https://www.rivermarkets.com/terms.html, last updated 2026-05-29]
- Market model: inherits each exchange's. Instruments are binary YES/NO contracts with prices normalized to 0-1 ("Kalshi cents / 100; Polymarket already 0.0-1.0"). Central limit order books only (no AMM, no parimutuel). [H, OpenAPI `MarketSearchResult.last_price`, `/v1/prices` description]
- Categorical events appear as sets of binary markets; the schema carries Polymarket-style `neg_risk` and `neg_risk_id`, `condition_id`, `token_id_yes`, `token_id_no`, plus Kalshi `ticker`, `event_ticker`, `series_ticker`. Outcome "tokenisation" is whatever the exchange uses; River only adds a numeric `river_id`. [H, `docs/research/fixtures/river-markets/openapi-schemas-excerpt.json`]
- Combos/parlays are first-class: `is_combo` flag, `POST /v1/parlays/build` (Kalshi MVE collections; Polymarket US up to 15 legs), `POST /v1/markets/resolve-combos`, and RFQs (`POST /v1/rfqs`, maker quote endpoints). [H, llms.txt, changelog 2026-10-07..10-12]
- Scalar markets: NOT FOUND (searched: OpenAPI schemas, changelog, concepts pages).
- **River ID:** "A River ID identifies a single listing on a single exchange. If the same real-world outcome trades on both Kalshi and Polymarket, each listing has its own River ID." [H, https://docs.rivermarkets.com/concepts/river-ids.md]
- **Generic assets (cross-venue grouping):** a `generic_asset_id` groups equivalent listings (their River IDs) across exchanges. Endpoints: `GET /v1/generic-assets` (own + platform-curated), `POST /v1/generic-assets/lookup` (river_ids -> asset), `GET /v1/orderbooks/generic-asset/{id}` (merged book, sums quantity per price level), complex/peg orders on a generic asset. Schema fields: `asset_type` (moneyline | spread | threshold | distance), `period`, `metric`, `entity_id`, `side`, `strike`, `match_type` ("manual", "owner", "auto_*"), `members[].flip` (true when a member's YES is the opposite of the asset's outcome), `exchanges`. [H, OpenAPI + changelog]. This corrects the earlier note in `docs/research/14-platform-of-platforms.md` row "River Markets" (cross_venue_matching "none"); the verifier correction there is right.
- Generic-asset coverage found: **sports only** - MLB, NFL, NBA, WNBA, college basketball, college football, UFC (fight winner / goes the distance / ends before a round), ATP/WTA tennis; moneylines, spreads, totals, team totals, period markets; new instruments normalized "within the hour" (changelog 2026-09-09, 2026-10-16). Politics / crypto-price / macro generic assets: NOT FOUND (searched: changelog, concepts, llms.txt). The matching algorithm and equivalence/void criteria are NOT FOUND. [H]

## 2. Chains and collateral

- River holds no funds: "River does not hold your trading funds at the exchange" (terms 4). Homepage: River's live platform "does not currently provide margin, custody, or cross-venue netting". Subaccounts are "pinned to non_custodial server-side". [H]
- Collateral and chain are the underlying exchange's: Kalshi (USD, fiat, sharded balances; `POST /v1/balance/exchange/shard-transfer` moves funds between Kalshi shards), Polymarket global (Polymarket wallet, Polygon; River can provision a Polymarket wallet in-app with deposit guidance and a "reveal key" flow, changelog 2026-05-03), Polymarket US / Crypto.com Derivatives North America / Novig (USD, US-regulated, off-chain). River's docs do not name a chain or token for the Polymarket wallet: NOT FOUND (searched: docs, changelog); Polygon is inferred from Polymarket (M, covered by the Polymarket workflow).
- River API does not move money: no deposit/withdraw/transfer endpoint other than the Kalshi shard transfer. [H, OpenAPI path list, `docs/research/fixtures/river-markets/openapi-operations.json`]

## 3. Read API

- Docs: https://docs.rivermarkets.com (Mintlify; `llms.txt` index, per-page `.md`), OpenAPI 3.1 at https://docs.rivermarkets.com/openapi.json and https://api.rivermarkets.com/openapi.json (47 paths; the api host copy is a bare FastAPI spec with no securitySchemes). Official Python SDK: https://github.com/rivermarkets/rivermarkets-python-sdk (PyPI `rivermarkets`, no license declared in GitHub metadata). [H]
- Base URLs: `https://api.rivermarkets.com/v1` (REST), `wss://api.rivermarkets.com/v1/ws/{orderbooks,tradeprints,orders,fills,rfqs}` (WebSocket). [H]
- **Auth is mandatory for all data endpoints** (official-authenticated). Unsigned `GET`s to `/v1/markets/search`, `/v1/generic-assets`, `/v1/rate-limit` returned an HTML **403 from CloudFront ("Request blocked")** on 2026-10-19; `/openapi.json` is the only public thing. Whether the 403 is an auth gate or a geo/WAF block on the probing location is NOT determined. No live response shape could be fetched, so there is no live market fixture; schemas are saved instead (`docs/research/fixtures/river-markets/`). [H]
- Key read endpoints (OpenAPI, 2026-10-19):
  - Markets: `GET /v1/markets/search` (q, exchange_name, category, subcategory, status default active, expiration/start date filters, last_price_min/max, volume_min, sort_by, include_combos, limit/offset, event-paginated mode); `GET /v1/markets/lookup` (batch by river_ids); `GET /v1/markets/match` (exact Kalshi ticker or Polymarket slug; fetches uncatalogued markets from the exchange on a miss); `POST /v1/markets/match/batch`; `POST /v1/markets/resolve-combos`.
  - Books: `GET /v1/orderbooks/{river_id}?levels=`; `GET /v1/orderbooks/generic-asset/{id}`. Response: `{status: ok|pending|not_found, orderbook: {river_id, bids[{price,qty}], asks[], best_bid_price, best_ask_price, exchange_timestamp}}`. `is_valid` was removed 2026-10-16; apply your own staleness test on `exchange_timestamp`. [H]
  - Prices / trades: `GET /v1/prices/{river_id}` (type candlestick|history, interval, fidelity; real OHLC for Kalshi, synthetic OHLC for Polymarket unless River captured full history), `GET /v1/prices/{river_id}/volume`, `GET /v1/prices/volume`, `GET /v1/tradeprints?river_ids=...` (newest first, prices normalized to 0-1; Polymarket US trades are "always River's own capture (no public API)").
  - Fees: `POST /v1/fees/schedules/lookup` (up to 1,000 river_ids; returns `missing_river_ids`).
  - Account reads: `/v1/positions`, `/v1/fills`, `/v1/orders`, `/v1/balance/exchange`, `/v1/subaccounts`, `/v1/fair-values`.
  - Resolution: `MarketSearchResult.status` is only `active | closed | inactive` (derived from exchange fields). A resolved outcome / settlement price field: NOT FOUND (searched: OpenAPI schemas). Resolution must be read from the underlying exchange adapter.
- WebSocket: `/v1/ws/orderbooks` snapshot + update frames, up to **1,000 markets per connection** (`subscription_limit` error), optional `max_freq` Hz coalescing, protocol-level PING/PONG, auth failure closes with 4401; `/v1/ws/tradeprints`; `/v1/ws/orders`, `/v1/ws/fills` (per subaccount); `/v1/ws/rfqs` (RFQ stream carrying Kalshi and Polymarket US). [H, https://docs.rivermarkets.com/ws-api-reference/orderbooks.md]
- Auth scheme: Ed25519 request signing. Headers `X-River-Key-Id`, `X-River-Timestamp` (unix ms, within 30 s), `X-River-Signature` (base64 over `METHOD\nPATH\nSORTED_QUERY\nTIMESTAMP\nSHA256(body) hex`), and since 2026-10-13 `X-River-Org-Id` (missing/wrong -> 403 `org_header_required` / `org_header_mismatch`). WS: same values as `key_id`, `ts`, `sig` query params over `WS\nPATH\nSORTED_QUERY\nTIMESTAMP`. Each signature is deduped for 60 s (replay protection), so re-sign on retry. The private key is generated server-side and shown once. [H, https://docs.rivermarkets.com/api-reference/authentication.md, security.md]
- Rate limits: Standard **600 req/min per organization** (across keys and IPs), Premium 2,400 (Settings -> Billing), institutional orgs +300/min per active member above three (+600 on premium); 429 with `Retry-After`; WebSocket streams are not counted. [H, authentication.md, changelog 2026-10-13] Stale contradiction: the OpenAPI `info.description` still says "Standard: 10 requests/second", Novig "Coming soon", and omits `X-River-Org-Id`; trust the authentication page and changelog. [H]
- Keys cannot be created or rotated over the API: "Create or revoke API keys ... require a signed-in dashboard session" (`403 human_session_required`). An API key can read and trade only. [H]

## 4. Trade path (programmatic)

- Yes, programmatic and rich: `POST /v1/orders` (LIMIT/MARKET; GTC/GTD/IOC/FOK), `POST /v1/orders/batch` (max 10), `PATCH /v1/orders/{id}`, `DELETE /v1/orders/{id}`, `POST /v1/orders/cancel-all`, queue position, `POST /v1/complex-orders` (iceberg, peg, smart-taker, conditional stop/TP/SL, peg across a generic asset with `exchanges` allow-list), RFQs, parlays. Orders reference `river_id` (or `generic_asset_id` for complex orders) and a `subaccount_id`. [H]
- Execution model: River submits to the exchange **using the exchange credentials you stored**: Kalshi API key + secret (Read/Write); Polymarket wallet address + **private key** (`POST /v1/credentials`, recommended: an email-created Polymarket account, key exported from Polymarket settings); Crypto.com FIX CompIDs + SFTP key (institutional). Credentials are libsodium-sealed-box encrypted; the decryption key lives in the trading service. [H, subaccounts.md, security.md, terms 9]
- Status of venues (as of 2026-10-16): Kalshi, Polymarket, Polymarket US tradable; Crypto.com "fully tradable" since 2026-10-07 (orders returned 400 until then); **Novig: books stream, "Trading on Novig is not yet enabled"** (changelog 2026-10-16). `exchanges.md` still lists Novig as "Available" and the homepage says "coming soon", so treat Novig as data-only. Rothera: "Future integration". [H]
- No signed-order or on-chain transaction-proposal interface exists: you hand River raw exchange credentials; there is no way to sign orders with your own wallet and submit them. [H by absence; searched OpenAPI paths and docs]

## 5. PayBox reachability

- **no.** Reasons: (1) River needs its own account and a dashboard-created key; (2) trading works by giving River the exchange secrets (including a Polymarket private key), which a non-custodial PayBox wallet does not hand out (M; no key-export path assumed or tested); (3) four of five exchanges are fiat/US-regulated and involve no wallet; (4) no PayBox plugin or service for River: `discover_plugins("River Markets prediction markets")` returned an empty list, and `discover_services` returned only unrelated third-party Polymarket/Hyperliquid data proxies (x402, not River). [H for the discovery calls, read-only, nothing invoked]
- The only wallet-shaped overlap: a PayBox EVM wallet could fund a Polymarket deposit wallet on Polygon (a transfer, not a River feature). That is a Polymarket route, covered by the Polymarket workflow, and River would still hold that wallet's key.

## 6. Fees

- River's own pricing is **not public**: no pricing page (`/pricing` -> 403); the homepage lists none; terms 6: "You are responsible for any fees, taxes, network/gas costs, and exchange charges." A plan "platform fee" and "monthly minimum" exist (Billing page shows them "when it has one"; invoices itemize trading fees, monthly minimum adjustment and platform fee; 30-day usage-based trial for new accounts). Amounts: NOT FOUND (searched: docs, changelog, homepage, terms, YC page, funding article). [H for existence, NOT FOUND for amounts]
- Trading fees are the underlying exchange's, passed through, and exposed in normalized form by `POST /v1/fees/schedules/lookup` per river_id: `model` `price_shape_v1` -> `fee = quantity * coefficient * price * (1 - price)`, or `price_shape_combo_v1` (Polymarket US combos) -> `fee = quantity * price * (coefficient * (1 - price) + tail_coefficient * (1 - price)^4)`; separate `maker` and `taker` rules; coefficients are decimal strings; `rounding` in `none | ceil_cent | half_even_cent | half_up_millicent`; `schedule_version` fingerprint. Payer: the trader, per exchange. Useful for our fee-aware scanner as a single normalized source (but see ToS on redistribution). [H, OpenAPI `FeeModel`, `FeeRuleResponse`, `FeeScheduleResponse`]
- Marketing claim: "~2 cent average price improvement" from smart routing; "up to 50%" better pricing (YC page). Self-reported. [L]

## 7. Resolution mechanism and dispute risk

- River does not resolve anything; each listing resolves under its exchange's rules (Kalshi, Polymarket and the US-regulated exchanges each apply their own rules; not re-verified here, see the per-venue notes). [H for "River is not a counterparty"; exchange-specific mechanics covered elsewhere]
- **Cross-venue resolution-mismatch risk is real and acknowledged by River:** "The order ticket warns that a cancelled game may resolve differently across the exchanges in an asset" (changelog 2026-09-09); tie handling differs by contract (a tie can be its own contract, or every exchange pays half; River splits those into separate assets). A generic asset is therefore NOT a guarantee of identical settlement; for arbitrage keep our own equivalence/void checks. Curated-asset criteria: NOT FOUND. [H]

## 8. Geo, ToS, automation (quote sparingly)

- Terms (Centos Group Inc., last updated 2026-05-29): eligibility excludes persons in jurisdictions "where use of the Service or of the connected exchanges is prohibited"; "Access is currently invitation-based." Orders "are subject to that exchange's own rules, terms and eligibility requirements" (so US-regulated venues imply US-person/KYC constraints at the exchange level). [H]
- Automation is explicitly supported (official SDK, WebSocket streams, "systematic traders"). Acceptable use bans wash trading, spoofing, circumventing "authentication or rate limits", scraping "except through interfaces we expressly provide", and sharing access. [H]
- **Data redistribution is prohibited:** "Market data displayed in the Service is provided by the exchanges and their data providers and is subject to their restrictions; you may not redistribute it." This conflicts with using River as a public data source for a shared aggregator. [H]
- A signed-in "human session" is required to create keys, subaccounts and credentials, so a fully autonomous agent cannot onboard itself. [H]

## 9. Liquidity

- None of its own. Volume is not published by the product. Claims: YC profile "Over $50M traded on the platform" (undated; the YC batch is Spring 2026) [L]; a search-result summary of a co-founder post said "100 million event contracts traded" four months after launch (could not be re-verified; web-search budget exhausted) [L]; funding article: the company "targets annualized trading volume in the hundreds of millions by year-end" [M]; $8.5M seed led by Haun Ventures with Coinbase Ventures and Y Combinator (undated, Finance Magnates via TradingView) [M]. Team size 2 on the YC page. Nothing here is a TVL/OI figure and none is from a primary dashboard.

## 10. Event-category overlap

- Because River mirrors the underlying venues, its overlap with other venues is theirs: sports (strongest, and the only category with curated cross-venue assets: Kalshi vs Polymarket vs Polymarket US vs Novig vs Crypto.com), plus whatever politics / crypto-price / macro Kalshi and Polymarket list (River search has `category`/`subcategory` filters; no per-category coverage statement found). Overlap with XO Market, Limitless, Predict.fun, Opinion, Myriad, Trueo etc.: none (none are on River). [H for venue list; M for category claims]

## 11. Shared liquidity

- **Fully shared** with Kalshi, Polymarket (global), Polymarket US, Crypto.com Derivatives North America and Novig. It is not an independent arbitrage leg and River quotes must be de-duplicated against direct adapters for those venues. [H]

## 12. Adapter recommendation

- **skip** as a venue adapter. Reasons: 100% duplicate liquidity; no public data (credentialed, invite/trial-gated account); key and credential setup needs a human dashboard session; you must give River exchange secrets (custody-of-credentials risk that cuts against our PayBox/non-custodial design); terms forbid redistributing the data; no resolution field.
- Cheap value to take anyway: (1) its normalized fee schema (`model`, per-side `coefficient`, `rounding`, `schedule_version`) as a design reference for our `fees` record; (2) its generic-asset schema (`asset_type`, `period`, `strike`, `entity_id`, `flip`, `match_type`, tie-as-own-asset) as a reference for market linking; (3) its list of what exchanges require for API access (Crypto.com needs FIX CompIDs).
- Revisit if: Crypto.com or Novig become must-have venues and have no direct public API for us; River publishes a public/keyless data tier or a signed-order (wallet-signed) path; or pricing/terms allow internal analytics use.

## 13. Open questions

- Is signup self-serve now (30-day usage-based trial per changelog 2026-09-09) or still invite-only (terms 2026-05-29)? Not tested (no account created).
- Why does `api.rivermarkets.com/v1/*` return CloudFront 403 to unsigned GETs (auth gate vs geo/WAF)?
- River platform fee and monthly minimum amounts; whether "Premium" costs money.
- Generic-asset curation rules and any non-sports categories.
- Novig trading enable date; Rothera timeline.
- Whether Polymarket US credentials are API keys (the docs' credentials tabs list only Polymarket, Kalshi, Crypto.com).

## Sources

All fetched 2026-10-19 with User-Agent `insurance-markets-research/0.1`, no auth, GET only.

- https://docs.rivermarkets.com (intro), `/llms.txt` (saved: `docs/research/fixtures/river-markets/docs-llms.txt`), `/concepts/river-ids.md`, `/concepts/exchanges.md`, `/concepts/subaccounts.md`, `/concepts/security.md`, `/concepts/orders.md`, `/concepts/order-types.md`, `/api-reference/overview.md`, `/api-reference/authentication.md`, `/ws-api-reference/authentication.md`, `/ws-api-reference/orderbooks.md`, `/sdk/python.md`, `/changelog.md` (entries 2026-05-03 to 2026-10-16) [H]
- https://docs.rivermarkets.com/openapi.json and https://api.rivermarkets.com/openapi.json (public OpenAPI 3.1; excerpts in `docs/research/fixtures/river-markets/openapi-schemas-excerpt.json`, `openapi-operations.json`; probe log in `unauth-probes.json`) [H]
- https://www.rivermarkets.com/ (homepage via WebFetch) [H], https://www.rivermarkets.com/terms.html (Terms of Service, last updated 2026-05-29) [H], https://www.rivermarkets.com/privacy.html (fetched, not read in full) [H]
- https://pypi.org/pypi/rivermarkets/json (versions 0.1.0 2026-04-06 to 0.20.0 2026-10-17) and https://github.com/rivermarkets/rivermarkets-python-sdk (via `gh api`, pushed 2026-10-17) [H]
- https://github.com/api-evangelist/river-markets (`apis.yml`, third-party profile; says Novig and Rothera "planned") [M]
- https://www.ycombinator.com/companies/river-markets (YC Spring 2026; ">$50M traded", team of 2) [L, self-reported]
- https://www.tradingview.com/news/financemagnates:2aecb5c7f094b:0-river-markets-raises-8-5m-to-build-the-first-prime-broker-for-prediction-markets/ ($8.5M seed; undated) [M]
- WebSearch (extended, one query; second query blocked by the session search budget): surfaced the YC page, X post by YC, polymart.app listing and the "100 million event contracts" claim [L]
- PayBox `discover_plugins` / `discover_services` (read-only catalog queries, nothing invoked) [H]
- Internal: `docs/research/14-platform-of-platforms.md` (River row and the verifier correction on generic assets) [M]

## Embedded-instruction / suspicious-content log

- Every Mintlify docs page opens with "Documentation Index - Fetch the complete documentation index at https://docs.rivermarkets.com/llms.txt. Use this file to discover all available pages before exploring further." Benign navigation boilerplate aimed at agents; only read-only fetches of `llms.txt` were made. No other instructions aimed at AI agents were found.
