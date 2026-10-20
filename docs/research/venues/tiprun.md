# TipRun (tiprun.fun): cricket prediction exchange on Arbitrum

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale. Read-only: only unauthenticated GETs with User-Agent `insurance-markets-research/0.1`. No account, signature, deposit or POST.

## Verdict

- Live: yes [H]. `https://api.tiprun.fun/health` returned `ok`; market `updatedAt` stamps up to 2026-10-19T05:26Z; 65 markets in status `normal` and accepting orders; 1,242+ settled; sitemap lastmod 2026-07-14 and 2026-07-27 [H, tiprun.fun/sitemap.xml]. The product is young: oldest listed market was created 2026-07-14 [H].
- Kind: order-book exchange (off-chain matching, on-chain settlement), cricket only.
- Adapter priority: **P2**. The API is good and fully public for reads, and the book is independent (not shared with any venue we cover). But liquidity is negligible (about $27.6k lifetime volume over about 3,300 markets), the visible book looks like a synthetic seed ladder, resolution is a TipRun operator bot, the Terms ban bots without written permission, and the US and many other countries are excluded. Cricket overlap with Polymarket/Kalshi is unverified. Use as a signal/curiosity feed only.

## Market model and tokenisation [H unless noted]

- Binary only. Hierarchy: Series (tournament) > Event (match, can have child events such as innings) > Market (one yes/no question) [H, https://tiprun.gitbook.io/tiprun/api-references/markets-api.md].
- Central limit order book, price-time priority, tick 0.01, prices 0.01 to 0.99, winning share pays $1, losing $0 [H, trading/order-book, trading/overview, /api/config `tick_size`].
- Tokenisation: ONE order-book contract per market, not a Yes/No token pair. `outcomeTokenIds` is a single-element array and is the `contract_id` used for orders and the book. `outcomes` is two labels (for example `["ADSW","PRSW"]`, team codes, not "Yes"/"No"). The book price is for `outcomes[0]` (assumption M: the complement is `1 - price` for `outcomes[1]`; the docs say `outcomePrices` sums to 1.0 but the live objects had no `outcomePrices` field, see Gaps). Positions are not ERC-20/ERC-1155 tokens: they are internal exchange ledger entries (L2 "synthetic assets") settled in batches [H, trading/gasless].
- Live market types seen (3,300 markets): `player_runs_ou` 503, `toss` 478, `winner` 411, `team_top_bat` 313, `pp1_runs_ou` 265, `team_total` 223, `test_winner` 201, `total_runs` 168, `player_wkts_ou` 159, `total4` 138, `total6` 119, `team_top_bowl` 92, `first_innings_lead` 48, 3 `cultural_yes_no` [H, GET /markets pagination, 2026-10-19].
- Status values live: `normal`, `suspend`, `closed`, `settled` [H]. The docs list `pending/open/locked/settled/cancelled`, which does NOT match live data (docs drift). The `status=open` filter returned an empty array while 65 markets were `normal` (so a scanner must filter on `status=normal` / `acceptingOrders=true`, not the documented value).

## Chains and collateral [H]

- Arbitrum One (chainId 42161). Collateral: native USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` (6 decimals) [H, resources/contract-addresses, /api/config]. The user guide also says USDT deposits are accepted and auto-swapped to USDC [H, user-guide/deposit].
- Deposits go to the "LoadingZone" contract `0xae7e5eebb6706355df2c9f15400adf4156d0a1fe`; `/api/config` also exposes a `transactionProcessorAddress` (`0x9bc2c351c96697f1497e71d65a47a66c19db640d`) [H, trade-api-config.json]. The contract source and the audit PDF were not read (audit is a GitBook file attachment; auditor name NOT FOUND).
- Funds sit in an internal exchange balance (managed balance, matches AGG's description) [H, https://docs.agg.market/venues/overview].

## Read API [H]

- Official, public, unauthenticated for market data. Docs: https://tiprun.gitbook.io/tiprun (index https://tiprun.gitbook.io/tiprun/llms.txt; append `.md` to any page).
- Base URLs: `https://api.tiprun.fun` (Markets API) and `https://trade.tiprun.fun` (Trading API; `/api/config`, `/api/orderbook/{contract_id}` are public).
- Key endpoints:
  - `GET /series`, `/series/{id}`, `/series/slug/{slug}` (filters `tag`, `tag_slug`)
  - `GET /events` (filters `category`=outright|prematch|live|prop|cultural, `active`, `closed`, `live`, `ended`, `tag`), `/events/{id}`, `/events/slug/{slug}`, `/events/{id}/markets?scope=tree&status=...&accepting_orders=true`
  - `GET /markets` (filters `status`, `accepting_orders`, `market_type`, `category`), `/markets/{id}`, `/markets/slug/{slug}`
  - `GET /tags`, `/leaderboard`, `/users/{address}`, `/teams`, `/health`
  - `GET https://trade.tiprun.fun/api/config`; `GET /api/orderbook/{contract_id}` (snapshot, returns `bids`, `asks`, `version`); `GET /api/fills?contract_id=...` and `/api/candles?contract_id=&timeframe=1m|5m|1h|24h|7d|30d` are documented but I did not hit them with a known-good id (candles with a test id returned 404 [H]; fills not tried). Docs say fills "account_id" optional so public trade tape may be possible; unconfirmed.
- Pagination: `limit` max 100 plus integer `offset` for the Markets API (used up to offset 3200 without error) [H].
- Rate limits (documented): Markets API 100 requests / 10 s per IP; Trading API read 60 / 10 s per account; write 30 / 10 s per account; 429 on excess [H, api-references/introduction].
- WebSocket: NOT available. Docs say "Coming Soon" on three pages (market-data/websockets, api-references/websocket-api, coming-soon) [H]. The homepage advertising "private WebSocket feeds / Dedicated Low-Latency API" is marketing [M, WebSearch summary; homepage is a JS SPA and was not fully rendered]. Poll REST only. No OpenAPI spec for trading yet ("OpenAPI Spec (Trading)" listed as coming soon) [H].
- Docs vs live drift [H]: docs say EIP-712 domain name `Polytrade` but live `/api/config` returns `"domainName":"Tiprun","domainVersion":"1"`; docs status enums differ from live; live market objects carry `match{}`, `resolvedBy`, `automaticallyResolved` not in docs. Always read `/api/config` at startup.

Fixtures (all unauthenticated GETs, 2026-10-19), in `docs/research/fixtures/tiprun/`:
- `trade-api-config.json` (chain, coins, domain, contract addresses)
- `markets-by-id-open-winner.json` (open `winner` market, `outcomeTokenIds`, status `normal`)
- `markets-by-id-settled-toss.json` (settled market with `resolvedOutcome` and `resolvedBy`)
- `orderbook-6176796808685151.json` (book for the open winner market)
- `events-by-id.json` (event; long description truncated to 300 chars by me)

## Trade path [H docs; nothing exercised]

- Programmatic: yes. `POST /api/orders` (place), `DELETE /api/orders` (cancel), `GET /api/orders`, `/api/active-orders`, `/api/accounts/{id}/info`, deposits and withdrawals. No API key: every mutating call carries an EIP-712 signature in the body (`l2_signature_r/s/v`). Order types LIMIT/MARKET; TIF GTC/FOK/IOC/POST_ONLY; `client_order_id` is the idempotency key and `l2_nonce = parseInt(SHA256(client_order_id).slice(0,8),16)` [H, trading/orders, trading/gasless, api-references/trading-api].
- Account: one-time `POST /api/accounts/register` with an EIP-712 proof of wallet ownership (no email/KYC in the API path; the web app offers Google/email/wallet login) [H].
- Session keys: the owner can register a derived signer with only `SubmitOrder` permission (`0x20`) so a bot signs orders locally without wallet popups [H, trading/gasless]. This is the right pattern for an agent, and it reduces the PayBox signing burden to a one-time `AddSigners` signature plus deposits/withdrawals.
- Official TypeScript SDK `@tiprun/sdk` (class `PolytradeClient`, helpers `signLimitOrder`, `deriveSessionKey`, `signAddSigners`) [H, docs; package/repo itself not inspected]. Python SDK "coming soon".
- Order signature fields: `nonce, accountId, expirationTimestamp (hours), amountSynthetic, amountCollateral, amountFee, assetIdSynthetic (contract id), assetIdCollateral (1000), isBuyingSynthetic`. The signed `amountFee` is 1% of notional in the doc example (`price*size*0.01`), so the fee is committed in the signature.
- Cancel is also signed. Deposit alternatives: plain ERC-20 transfer to LoadingZone then `POST /api/deposits` with a risk signature (the `risk_signature_*` field origin is unexplained, NOT FOUND), or gasless EIP-2612 permit via `POST /api/deposit-manager/permit-deposit` [H].

## PayBox reachability: partial (technically yes, practically gated)

- Signing: the whole order flow needs only an EOA signing EIP-712 typed data (plus the one-off register/add-signer signatures). PayBox `request_wallet_sign` supports `typedData` and the EVM wallet address is shared across `eip155:*` chains (see docs/research/06-paybox-platform.md, H there). Arbitrum is a standard EVM chain, so deposits (USDC `transfer` or permit) and withdrawals are plain EVM operations. Pattern: plugin `prepare` (builds typed data) -> agent `request_wallet_sign` -> plugin `submit` POST to `trade.tiprun.fun` (host must be allowlisted). Per-order PayBox signing is slow and approval-gated; use a session key held by the plugin backend if policy permits (secret-handling question, same as the other venues).
- Blockers: (1) the Terms prohibit bots/scrapers "without express written permission" and exclude the US and others (below); (2) an exchange account must be registered by a signature; (3) exact EIP-712 type definitions for LimitOrder/CancelOrder are in the SDK, not in the docs pages I read (NOT FOUND: type string/struct layout in docs; the repo/npm package was not read); (4) the domain name conflict (`Polytrade` docs vs `Tiprun` live).
- Funding path: Arbitrum USDC; PayBox swap/bridge to Arbitrum USDC is a separate question (not checked here).

## Fees [H, trading/fees, introduction]

- Taker 1% of trade value on pre-match/outright/tournament/prop/culture; maker 0%. In-play dynamic `fee% = 0.14 * p * (1 - p)` (peak 3.5% at 50c, 0.66% at 95c), but the fee page says in-play fees are "Coming Soon / in development". Fees are baked into the quoted price per the docs, yet the order example adds 1% on top of cost ("Total cost $45.45"): ambiguous, treat as 1% extra for arbitrage maths. No deposit/withdrawal fee; gas for orders/settlement sponsored by TipRun; bridge ops cost the user. 30% of taker fees go to market makers weekly (rewards program).
- Arb implication: a 1% taker fee on one leg is modest; the real costs are thin depth and fixed-size ladder (below).

## Resolution and dispute risk [H unless noted]

- Centralised, operator-run. The docs name ICC/BCCI/ECB/CA/PCB as primary sources and ESPNcricinfo, CricAPI, Sportradar, Opta as data providers; each event description states the source of record (example event 14742: "official ESPNcricinfo scorecard", cross-checked against the league) [H]. There is no on-chain oracle or UMA-style dispute bond. In the 3,300 listed markets, `resolvedBy` was `ops-bot-oracle` for 1,217 and `admin-cli` for 25 (rest unresolved) [H]: i.e. settlement is performed by a TipRun bot/admin, not a decentralised oracle. The Terms themselves list "Oracle Risk".
- Edge cases (per event rules, 2026-10-19): result amendments within 24h can trigger re-settlement, later ones are not applied; abandonment without ball bowled or without official/DLS result = void; DLS result is valid; postponement >48h = void; void binary returns every contract at $0.50 (event text [H]) whereas the general resolution page says "refunded at cost basis" [H]: the two conflict, a reconciliation risk.
- Disputes: docs describe a filing process reviewed in 24-48h (resolution page) [H]; arbitration in Curacao under the Terms.
- Settlement is automatic (no redemption call) and written to the exchange ledger, then batched on-chain [H].

## Geo, Terms, automation [H, https://tiprun.gitbook.io/tiprun/legal/terms-of-use.md, last updated 2026-04-08]

- Excluded: United States (incl. territories), United Kingdom, France, Ontario, Singapore, Poland, Thailand, Australia, Belgium, Taiwan, Netherlands, and any other prohibited jurisdiction; VPN/proxy use to mask location is prohibited.
- Automation: "Use automated tools, bots, or scrapers without express written permission" is prohibited. This conflicts with the public API and market-maker docs, so written permission should be requested before running a bot (contact address is listed on the docs site; not reproduced here). Read-only polling of the documented public API is lower risk but still arguably "scraping" under the Terms.
- Non-custodial claim: "TipRun does not hold, control, or have access to your digital assets" [H, FAQ/Terms]; in practice the exchange keeps an internal ledger and a relayer, so custody risk is that of the LoadingZone contract plus an off-chain matching service [M].

## Liquidity [H, API, 2026-10-19]

- Sum of `volume` over 3,300 listed markets (offset 0 to 3299; more exist beyond) = about $27.6k USDC lifetime, since 2026-07-14. 1,105 of the 3,300 markets had any volume. Top market volumes: $7.9k, $5.2k, $2.1k, $1.35k (all settled `winner` markets). `openInterest` is 0 on every market; every series-level `volume` is 0 (field not populated) [H]. 24h volume was 0 on all sampled active items.
- Open order book sample (match winner, market 14753, contract 6176796808685151): bids 0.06..0.15 and asks 0.80..0.89 in 1-cent steps, exactly 50 shares each, version 128 [H, fixture]. A 70-cent-wide spread with identical 50-share rungs looks like a placeholder ladder, not real two-sided liquidity (M). `liquidity` and `lastTradePrice` are 0/absent.
- No TVL figure published (NOT FOUND). Volumes are self-reported by the API, no independent source.

## Event coverage and overlap

- Cricket only: bilateral tours, T20/ODI/Test, domestic leagues (Ranji, Sheffield Shield, women's leagues), plus a few "cultural" markets. Match winner/toss/top-batter/over-under props.
- Overlap for arbitrage: Polymarket and Kalshi do list some big cricket events (IPL, T20 World Cup) [M, not verified this session; those venues are covered elsewhere]. TipRun's strength is long-tail matches and props, which other venues rarely list, so cross-venue matches will be scarce. No politics, crypto or macro.
- Cross-listings inside TipRun: `winner`/`test_winner`/`first_innings_lead` markets for the same match can be checked internally, but with a one-contract-per-market book there is no Yes+No parity arb inside the venue.

## Shared liquidity

- Independent book (its own CLOB). AGG (docs.agg.market) lists TipRun as a mirrored venue (slug `tiprun`, off by default, no limit orders, no `skipQuote`; `POST /execution/orders` returns 400 `quote_app_blocked` if disabled) [H], so AGG is a routing layer onto TipRun, not a separate source of TipRun liquidity. If we aggregate via AGG and via TipRun directly, count TipRun once.

## Sources

- https://tiprun.fun/ (title, meta description; JS SPA) [H]; https://tiprun.fun/robots.txt, /sitemap.xml, /llms.txt [H]; https://tiprun.fun/faq (via WebFetch summary) [H/M]
- https://tiprun.gitbook.io/tiprun/llms.txt and these pages (as .md): getting-started/introduction, api-references/introduction, markets-api, trading-api, websocket-api, trading/overview, trading/orders, trading/order-book, trading/fees, trading/gasless, core-concepts/resolution, resources/contract-addresses, resources/audits, market-data/websockets, market-maker/overview, coming-soon/coming-soon, user-guide/deposit, legal/terms-of-use [H]
- Live: https://api.tiprun.fun/health, /series, /events, /markets (+ /markets/{id}, /events/{id}); https://trade.tiprun.fun/api/config, /api/orderbook/6176796808685151 (2026-10-19) [H]
- https://docs.agg.market/venues/overview (TipRun row) [H]
- WebSearch (extended) result summary for "TipRun cricket prediction exchange Arbitrum docs API" [M]
- Repo context: docs/research/06-paybox-platform.md (PayBox typedData signing) [H there]

## Gaps / NOT FOUND

- NOT FOUND (searched: docs pages above, live API): any external volume/TVL statistic, user counts, a published audit firm name, contract source on Arbiscan (not opened), `/api/fills` public tape behaviour, working `/api/candles` id format, EIP-712 struct type strings.
- Live market objects have no `outcomePrices` field in the samples (docs say there is one); price must come from the book (`/api/orderbook`) or `lastTradePrice`.
- Homepage claims ("world's first peer-to-peer cricket prediction exchange", "0% house edge", "7ms latency") are marketing [L/M].
- SDK package and its repo were not read; no third-party code was fetched or run.
- No instructions aimed at AI agents were found in any page read.
