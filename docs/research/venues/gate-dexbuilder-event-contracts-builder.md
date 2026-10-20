# Gate DexBuilder Event Contracts Builder - venue spec

Researched 2026-10-19. Read-only: WebFetch, `gh api` GET on public GitHub files, unauthenticated GETs to `api.dexbuilder.com` and to Polymarket's public Gamma, CLOB and data hosts (for comparison). No account, no wallet, no API key, no POST/PUT/DELETE to any venue, no signing, no payments, no browser automation, no WebSocket connection. Generic User-Agent only (`insurance-markets-research/0.1`).

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak, stale or ambiguous.

## Verdict

- Adapter priority: **skip** as a venue adapter.
- This is a **B2B white-label toolkit** (Gate DexBuilder), not a venue (H that no consumer venue is named in any source; Sources 1, 2, 3).
- The only deployment I could find, the public `api.dexbuilder.com` Event Contracts and Prediction Markets APIs, is a **mirror of Polymarket**: ids, condition ids, CLOB token ids, prices and order-book levels are Polymarket's with a `ge_` prefix on the event-contracts side (H, own comparison, Source 8, fixtures). It is **not an independent arbitrage leg**.
- It is live and has a real public read API with a documented shape, so the aggregator can recognise it. The correct treatment is a **platform-registry alias** to Polymarket, not a price source.
- Re-check later only if a named customer launches a venue with native (non-Polymarket) markets. None found.

## Liveness (still live in 2026?)

Live (H).

- Product launch: GlobeNewswire release by Gate Technology Incorporated dated 2026-08-07 ("Gate DexBuilder launches first Event Contracts Builder, unveils $3 million grant program"), syndicated by Barchart; I could not read the release itself (Barchart returned 202 empty, GlobeNewswire 403) so I rely on the StartupFortune and Fortune write-ups (H that those articles say it, M for the underlying facts; Sources 1, 2, 3).
- StartupFortune (2026-09-04): toolkit for brokers, wallets, Web3 apps, media platforms, AI trading tools and sports products; market creation, order handling, position management, settlement, liquidity support, risk controls, ops dashboard, via APIs and SDKs; $3M grant program; **article names no chains, oracle, liquidity provider, live customer or official link** (H, Source 1).
- Fortune (2026-09-03, corrected 2026-09-08 to "Prediction Builder"): same facts; Gate funds the grants fully; "first group of grant applicants" reviewed; no live customers named (H, Source 2).
- `https://api.dexbuilder.com/api/v4/event_contracts/*` and `/api/v4/prediction/*` returned live data on 2026-10-19 (markets created about 1 to 2 minutes earlier, order books, trades) (H, own GETs, fixtures).
- Marketing site https://www.dexbuilder.com/en (live 2026-10-19): "Over $3,000,000 in grants available", products Prediction Markets, Event Contracts, Perpetual Futures, Spot, On-Chain Aggregator; **does not name Gate or any operating company** (H, Source 4). The link between dexbuilder.com and Gate rests on the $3M grant match, the `x-gate-trace-id` response header from `api.dexbuilder.com`, and the timing (M).
- Staleness flags: the press coverage is 6 to 7 weeks old (fine). The developer docs are a draft (see Read API).

## Kind and market model

- Kind: **white-label infrastructure** (broker or "Builder" creates a branded DEX front end; DexBuilder supplies accounts, matching, settlement, ops console) (H that this is how the docs and site describe it, Sources 4, 5).
- Two public API namespaces on one host (H, live GETs):
  - `/api/v4/event_contracts/*`: **crypto Up/Down** markets only in everything I sampled: 5-minute and 15-minute windows for BTC, ETH, SOL, XRP, DOGE, BNB, HYPE, ZEC, plus daily 11PM ET "Up or Down" events. 100 active markets on page 1, all of that form. Slugs `ge_<asset>-updown-<5m|15m>-<unix>`.
  - `/api/v4/prediction/*`: the **general Polymarket catalogue** (sports, politics, macro, crypto), with plain Polymarket ids (e.g. market `2589810` "Fed decrease by 50+ bps after the October 2026 meeting", event `507693` "Paris Saint Germain vs. Arsenal").
- Market model per the docs: binary Yes/No (Up/Down) outcome shares priced 0 to 1, central limit order book, negative-risk multi-outcome events supported (docs page `negative-risk.mdx`), outcome tokens are **Gnosis CTF ERC-1155** tokens, each pair fully collateralised by 1 USDT (H that the docs say this, Source 5; M that it describes the real settlement layer).
- Matching: docs say "off-chain matching, on-chain settlement" (hybrid CLOB) (H that docs say it, Source 5). Whether DexBuilder runs its own book or relays orders to Polymarket's CLOB: **NOT FOUND** (see Shared liquidity for the evidence both ways).
- Tokenisation on the wire: `token_id` is the Polymarket CLOB token id (large decimal string) prefixed with `ge_` on event_contracts, unprefixed on prediction (H, fixtures `mirror_identity_check_2026-10-19.json`).

## Chains and collateral

- Collateral per docs: **USDT** (1 USDT per Yes+No pair; winners redeem 1 USDT) (H that docs say it, Source 5). Polymarket's own collateral is pUSD on Polygon since CLOB V2 (sibling notes), so DexBuilder's USDT collateral means users are not simply trading on Polymarket's contracts: there is a DexBuilder account/ledger layer in between (M).
- Chain for the Event Contracts / Prediction products: **NOT FOUND** (searched: both docs repos, the OpenAPI specs, dexbuilder.com, press coverage). The perp-focused docs mention a "Vault" contract with "token approval and Vault deposit transaction" and per-environment "supported networks and collateral" but give no addresses or chain (H that they say so, Source 6). dexbuilder.com says "20+ public blockchains" for the on-chain aggregator only.
- Custody: marketing says "non-custodial asset structure" (H, Source 4) but the API exposes a custodial-style `assets`, `balance`, `account_book`, `fund_flows` and an internal `transfer` endpoint (H, OpenAPI paths, Source 5). Treat as unresolved (L).

## Read API

Official status: **official-public for market data, official-authenticated for orders, positions, balances and fees**. Caveat: the only developer docs found are GitHub repos, not a hosted docs site (see Sources 5, 6 and the provenance note below). The public GET shapes were confirmed live, so the spec for those is reliable (H).

- Base URL: `https://api.dexbuilder.com` (H, live; also the `servers` entry in the OpenAPI files).
- Docs URL: **no hosted docs site found** (`docs.dexbuilder.com` does not resolve). Docs source: https://github.com/The-Dexbuilder/docs (org created 2026-09-23, last push 2026-09-29, README "gtdb"; not verified as Gate's org; OpenAPI at `openapi/event-contracts-en.yaml` and `openapi/event-markets-en.yaml`) (M, Source 5).
- Public endpoints confirmed with unauthenticated GETs (H; fixtures):

| Endpoint | Notes |
|---|---|
| `GET /api/v4/event_contracts/markets?active=true&closed=false&limit=N` | `limit` 1 to 100 (else `INVALID_PARAM_VALUE`). Envelope `{items, next_cursor}`; cursor is an opaque signed token. Item fields: `market_id` (`ge_<event>_<market>`), `condition_id` (`ge_0x...`), `event_id`, `slug`, `question{en,cn,tw}`, `status`, `closed`, `start_date`, `end_date` (unix s), `volume`, `volume_24hr`, `tags[]`, `outcomes[{outcome{en,cn,tw}, token_id}]`, `best_bid`, `best_ask`, `last_trade_price`, `limit_buy_min_shares` ("6"), `uma_end_date*`, `uma_resolution_status*` (null on Up/Down). |
| `GET /api/v4/event_contracts/tokens/{token_id}/order_book` | `{condition_id, token_id, timestamp(ms), hash, bids[{price,size}], asks[...], min_order_size, tick_size, neg_risk, last_trade_price}`. Query param `depth` was **ignored** (73 levels returned for depth=5 on the prediction side). Polymarket-style book shape. |
| `GET /api/v4/event_contracts/tokens/{token_id}/ticker` and `/price` | `{token_id, last_price, best_bid, best_ask, timestamp}`; `/price` returned empty price on a market with no trades. |
| `GET /api/v4/event_contracts/markets/{market_id}/trades?limit<=100` | Market-wide trades, each fill appears as a BUY and a SELL row: `{trade_id, market_id, condition_id, token_id, side, price, size, timestamp(ms)}`. No wallet fields. |
| `GET /api/v4/event_contracts/events`, `/events/{id}`, `/events/slug/{slug}`, `/markets/{id}`, `/markets/slug/{slug}`, `/tags`, `/time` | Gamma-like. `/time` returns `{server_time}` (ms). |
| `GET /api/v4/prediction/markets`, `/markets/{id}`, `/events`, `/tokens/{token_id}/order_book`, `/tokens/prices`, `/price_history`, `/candlesticks`, `/tags`, `/time` | Same paths under `prediction`. List item has `market_id, event_id, event_title, title, condition_id, outcomes[{outcome, price, token_id, clob_token_id}], best_bid, best_ask, last_trade_price, liquidity, volume, accepting_orders, enable_order_book, closed, end_time, start_time, tags`. Quirk: list rows had empty `best_bid/best_ask` and `enable_order_book:false` for all 100 sampled rows, while the detail endpoint returned best prices; do not trust list-level prices. |

- Documented but not called (need auth): orders (place, list, cancel, cancel-by-condition), positions, settled positions, user trades, assets, balance, account book, fund flows, fee (`/fee/current`), transfer, claims (`/prediction/claims*`), plus prediction `positions/{id}/close` (H that the OpenAPI lists them, Source 5). An unauthenticated call to `/event_contracts/fee/current` returned `400 MISSING_REQUIRED_HEADER: Timestamp`.
- Auth: private REST uses headers `KEY`, `Timestamp` (unix seconds) and `SIGN` = HMAC-SHA512 over method, path, query, SHA-512 hex of body, timestamp, keyed by the API secret (H for the perps doc, Source 6; the 400 above is consistent for event contracts; the event-contracts docs themselves say authentication headers are **placeholders** and to "use the final public authentication scheme", Source 5). Format is the Gate API v4 style (M).
- WebSocket: `wss://broker.dexbuilder.com/ws/dex-builder/event-contracts` (H that docs state it; **not connected**). Public channels `ec.trades` (by `condition_id`), `ec.depth` (by `token_id`, levels 5/10/20/50, full-book snapshots with `hash`), `ec.bbo`, `ec.status` (by `market_id`), `ec.cpi`, `ec.candlestick`, `ec.oc_price`; private `ec.orders`, `ec.usertrades`, `ec.positions`, `ec.settlements` with HMAC-SHA512 over `channel=...&event=subscribe&time=...` (Source 5).
- Rate limits: HTTP 429 exists (Source 5, `error-codes.mdx`). A second, personal-account copy of the docs states a default Trading API quota "up to 100 requests per second across ... order operations" and per-IP connection limits (L, perp Trading API, Source 7). No rate-limit headers appeared on public GETs (H, header dump). Public limits: NOT FOUND.
- Resolution data: `uma_resolution_status`, `uma_end_date` fields (null for Up/Down); `GET /events/price_to_beat_final_price/{slug}` gives the reference price; `ec.oc_price` pushes `price_to_beat` and `final_price` (Source 5).
- Freshness warning (H): the event_contracts order book returned the **market-creation snapshot** (timestamp equal to market `start_date`) on two calls about 100 seconds apart while Polymarket's own book for the same token had added levels; the prediction book lagged Polymarket by seconds (70 of 73 shared levels had identical size). Do not price from this host; use Polymarket's feeds.

Provenance note: the three GitHub copies of the docs (an org repo `The-Dexbuilder/docs`, a user-account repo `Gateplatforms/dexbuilder-docs` that is not the verified `gate` org, and a personal-account repo) are unofficial from my vantage point. I trust only what the live API confirms (paths, parameters, field names, `ge_` ids) and mark the rest M or L.

## Trade path

- **Programmatic orders exist on paper only for a DexBuilder account**: `POST /api/v4/event_contracts/orders` with body `{token_id, side BUY|SELL, price, size, total_cost, order_type LIMIT, order_mode GTC, client_order_id, post_only, sell_all, expire_time}` returns `{order_id, client_order_id, status: ACCEPTED, created_at}`; `DELETE /orders/{id}` and `DELETE /orders` (by condition) cancel (Source 5, not called).
- The docs contradict themselves: place-orders uses a plain API-key JSON order, while "Trading Overview" says users "authorize and sign the order", connect a signing wallet and grant contract allowances (Polymarket-docs wording), and the perp docs describe wallet-owned accounts registered per Builder with EIP-712 `Registration{brokerId}` and a Vault deposit (Sources 5, 7). Which applies to event contracts is **NOT FOUND**.
- Account creation and API-key issuance for event contracts: **NOT FOUND** (no signup flow documented; each Builder has its own `broker_id`, and wallet owners register one account per Builder per Source 7). I did not create anything.
- There is no reason for the aggregator to trade here: any fill is a Polymarket-equivalent exposure at extra fee and unknown counterparty risk. Trade Polymarket directly.

## PayBox reachability

- Reachable from a PayBox EVM wallet: **unknown, and moot**. No chain, Vault or token address is documented for the event-contracts or prediction products, API credentials need a Builder-scoped account, and nothing confirms wallet-signed orders. The perp docs show an EIP-712 plus Vault-deposit pattern that a typed-data-capable wallet could follow in principle (not verified for these products).
- The same exposure is available from a PayBox wallet by trading Polymarket directly (see the Polymarket and PayBox notes). Not re-checked here (PayBox calls are out of scope).

## Fees

- Documented formula (taker or maker, per fill): `fee = C x feeRate x p x (1 - p)`, 5-decimal USDT precision, minimum 0.00001 USDT. Default `feeRate` by category: Crypto 0.07; Sports 0.05; Economics 0.05; Culture 0.05; Weather 0.05; Other 0.05; Finance 0.04; Politics 0.04; Mentions 0.04; Tech 0.04; Geopolitics 0 (H that the doc says this, Source 5). It matches the Polymarket taker-fee form in the sibling notes, but the DexBuilder table is headed "Maker / Taker" while Polymarket charges takers only; unresolved (L).
- Authoritative per-account rate: `GET /api/v4/event_contracts/fee/current` or `/prediction/fee` (auth required, not called).
- On top: "The actual Builder or Broker fee structure may be configured according to the business partnership"; fee = platform base fee + Builder revenue (H, Sources 5, 6). Marketing page claims "80/20 revenue share with 80% going to the project" for the on-chain aggregator, not stated for prediction (H, Source 4).
- Minimum order: observed `limit_buy_min_shares` 6 on DexBuilder vs `orderMinSize` 5 on Polymarket for the same market; tick size 0.01 (Up/Down) (H, fixtures).
- Edge maths: model as "Polymarket fee + unknown Builder fee + extra minimum-size friction".

## Resolution mechanism and dispute risk

- Docs: UMA Optimistic Oracle (proposal with bond, about 2h challenge, about 24 to 48h debate, about 48h DVM vote, "Too Early" and 50-50 outcomes possible); crypto Up/Down uses **Chainlink Data Streams TWAP** (30s and 60s windows) (H that docs say so, Source 5). Live confirmation: the Polymarket record for the same Solana 15m market lists `resolutionSource: https://data.chain.link/streams/sol-usd-twap-60s-streams` (H, fixture).
- So resolution risk equals Polymarket's (oracle and UMA dispute risk). Extra risk: how a Builder or DexBuilder credits users when Polymarket resolves late, 50-50, or voids: NOT FOUND.

## Geo, ToS and automation

- Terms of Service, restricted jurisdictions, KYC, automation policy: **NOT FOUND** (searched: dexbuilder.com, its `/en/builder` page, both docs repos, press coverage). dexbuilder.com mentions "multi-language and regional deployment support" only. Regulatory backdrop per StartupFortune: CFTC proposed rule on event contracts published 2026-06-12, comments due 2026-07-27, flagged as a risk for white-label providers (M, Source 1).
- Scripted GET access to `api.dexbuilder.com` public endpoints worked with the generic UA and returned no ToS or limit notices.

## Liquidity (all figures dated)

- **DexBuilder-native volume looks negligible**: across the 50 most recent closed event_contracts markets (window ending 2026-10-19 about 03:10 UTC), the `volume` field summed to 10.0 (two markets at 5), and all 100 active markets showed 0; the same markets carry real Polymarket volume (e.g. market 5851091 shows 3.72 on Polymarket and 0 on DexBuilder) (H, own GETs; the `volume` field's exact definition is not documented, so M).
- The `prediction` namespace echoes Polymarket-wide market volume and liquidity (e.g. market 2589810 `volume` 8,816,142.354547 equals Polymarket Gamma's value exactly; liquidity 522,625 vs Polymarket 747,493) (H, 2026-10-19). These are Polymarket's numbers, not DexBuilder-native depth.
- Gate's flow into Polymarket: Gate is Polymarket builder rank 3 for the month (share-notional $38.0M month to date, 10 active users, 2026-10-19; H, leaderboard GET) and the sibling note records $884M cumulative since 2026-03-16 (H there). StartupFortune repeats Gate's claim of more than $700M cumulative on the builder leaderboard by 2026-08-05 and "monthly volume above $100M", which is company-sourced (M) and above the recent run rate (about $61M share-notional over the last 30 days per the sibling note).
- TVL, OI, user counts, customer count for DexBuilder prediction venues: NOT FOUND.

## Event overlap (where arbitrage exists)

- event_contracts: crypto Up/Down 5m/15m/daily for BTC, ETH, SOL, XRP, DOGE, BNB, HYPE, ZEC (H). Overlaps Polymarket (identical markets), and the same style of short-horizon crypto contracts on other venues.
- prediction: the full Polymarket catalogue: NFL/soccer, Brazil presidential election, Fed decisions and so on (H). Overlap with Kalshi and others is the Polymarket overlap and should be modelled once, on the Polymarket leg.

## Shared liquidity

- **Shares liquidity with Polymarket (not independent).** Evidence (H, own comparison 2026-10-19, `fixtures/.../mirror_identity_check_2026-10-19.json`, `prediction_order_book_vs_polymarket_2026-10-19.json`):
  1. Same market ids: event_contracts `ge_1215535_5912440` = Polymarket event 1215535 / market 5912440; same slug, same `conditionId` `0x09b60c78...1015782` (prefixed `ge_` on DexBuilder), same two CLOB token ids (prefixed `ge_`), same `best_bid` 0.5 and `best_ask` 0.51 at creation.
  2. On the prediction side, market 2589810: DexBuilder's 73 ask levels are all in Polymarket's 80; 70 of the 73 have identical sizes, the 3 differences are within-seconds drift (e.g. 0.003 level 59,664.19 vs 49,664.19).
  3. `volume` matches Polymarket's Gamma value exactly; Polymarket text appears in DexBuilder's own docs (Polymarket WebSocket and data-api URLs in `realtime-data.mdx` and `analytics.mdx`) (Source 5).
- What remains unknown: whether orders placed through DexBuilder are relayed to Polymarket's CLOB (then fills are Polymarket fills) or matched internally against a mirrored/hedged book. The `x-gate-trace-id` header, USDT collateral and account-ledger endpoints suggest a custodial relay (M). Either way the price signal is Polymarket's.
- Consequence: do not count DexBuilder and Polymarket as two venues in cross-venue edge calculations. The same applies to any customer venue that uses these endpoints. Related: `docs/research/venues/gate-predictions-gate-com.md` (Gate's own front end to Polymarket), whose "Open questions" item 1 (Gate Event Contracts: BTC/ETH Up/Down 5m/15m/1h/4h) matches the event_contracts namespace here; I did not prove they are the same product (M).

## Adapter implications

- No adapter. Add a **platform-registry alias**: `gate-dexbuilder` -> underlying `polymarket`, relation `mirror-relay`, id mapping `strip "ge_" prefix` for event_contracts ids (market_id is `ge_<eventId>_<marketId>`), collateral USDT on the DexBuilder side (unconfirmed chain).
- Do not poll `api.dexbuilder.com` for prices (stale/lagging snapshots, `depth` ignored, list-level prices empty). Use Polymarket's Gamma, CLOB and WebSocket.
- If a customer venue with native markets is later discovered, the public GET surface above (`/api/v4/prediction/*` and `/api/v4/event_contracts/*`, same schema) is the integration point; a native market would be recognisable by a `condition_id` that does **not** resolve on Polymarket Gamma (`gamma-api.polymarket.com/markets?condition_ids=...`).

## Open questions

1. Operator and legal entity behind `dexbuilder.com` and `api.dexbuilder.com`, and an official Gate-hosted docs/announcement URL (the press release text itself was unreadable; web search quota was exhausted).
2. Chain, Vault and collateral contract for the prediction and event-contract products; whether orders are wallet-signed (EIP-712) or API-key only.
3. Whether any customer-branded DexBuilder venue is live, and whether any has native liquidity.
4. Who the $3M grant recipients are and whether any funded project is a venue worth a separate spec.
5. Whether the docs repo is official; whether a hosted docs site exists under another domain.

## Not found

- Official URL for the "Event Contracts Builder" product page, official Gate announcement, GlobeNewswire release text (searched: StartupFortune, Fortune, Barchart (202 empty), GlobeNewswire (403), gate.com `/dexbuilder`, `/dex-builder`, announcements page, gate.com/trade-events, docs.gate.com (GatePay docs only), WebSearch (refused: session search budget used up)).
- Chains, oracle details beyond the docs, liquidity provider names, live customers, TOS, geo restrictions, KYC, fee schedule beyond the doc defaults.
- Account creation flow and API key issuance for event contracts or prediction.
- Public rate limits and rate-limit headers for the event-contracts API.
- DexBuilder-native volume, OI, TVL, user counts.

## Method notes

- One mistake: an early `gh api search/repositories -f ...` call defaulted to POST (because of `-f`) and returned 404; nothing was created or changed. All later GitHub calls used explicit GET.
- No personal identifiers were sent: generic User-Agent only, no cookies, no query strings containing identifiers. Fixture files were grepped for "@" and the user's name: no hits.
- Third-party content was treated as data. The only agent-directed text seen was a generic line in `docs.gate.com/llms.txt` telling agents to follow `/_llms/` indexes recursively (unrelated GatePay docs); not followed. A docs placeholder contact `grants@example.com` appears in the Event Contracts overview (placeholder, not used). Public marketing contact `contact@dexbuilder.com` was seen, not used.

## Fixtures

Saved in `docs/research/fixtures/gate-dexbuilder-event-contracts-builder/` (fetched 2026-10-19, all under 50 KB; cursors trimmed, no wallet data):

- `event_contracts_markets_active_2026-10-19.json` - first 5 active Up/Down markets as returned.
- `event_contracts_markets_closed_sample_2026-10-19.json` - first 3 closed markets.
- `event_contracts_order_book_2026-10-19.json` - order book (creation-time snapshot).
- `event_contracts_market_trades_sample_2026-10-19.json` - 6 trades.
- `event_contracts_tags_2026-10-19.json` - tag list.
- `prediction_market_detail_fed_2026-10-19.json` - prediction market detail (Polymarket id 2589810).
- `prediction_markets_list_sample_2026-10-19.json` - 2 list rows plus envelope.
- `prediction_order_book_vs_polymarket_2026-10-19.json` - side-by-side book comparison and match counts.
- `mirror_identity_check_2026-10-19.json` - same market on DexBuilder vs Polymarket Gamma.
- `error_sample_missing_auth_header_2026-10-19.json` - unauthenticated fee endpoint error.

## Sources

1. [H, secondary] https://startupfortune.com/crypto-exchange-gate-launches-a-white-label-builder-for-prediction-markets/ - article dated 2026-09-04 (WebFetch, summarised): launch 2026-08-07 via GlobeNewswire, $3M grants, feature list, no chains/oracle/liquidity/customers/links.
2. [H, secondary] https://fortune.com/2026/09/03/crypto-exchange-gate-enters-prediction-market-space-with-white-label-builder-for-businesses/ - "Prediction Builder" part of Gate DexBuilder; name corrected 2026-09-08; no customers named; Gate-funded grants.
3. [M] Barchart syndication of the press release, https://www.barchart.com/press-releases/3719755/gate-dexbuilder-launches-first-event-contracts-builder-unveils-3-million-grant-program-to-accelerate-market-ecosystem (title and URL from the discovery brief; body not retrievable, HTTP 202 empty; `last-modified` header 2026-08-07).
4. [H] https://www.dexbuilder.com/en and https://www.dexbuilder.com/en/builder - marketing site (WebFetch, summarised): products, "Over $3,000,000 in grants", market-maker liquidity claim, "non-custodial", 80/20 aggregator share, no operator named, demo at https://demo.dexbuilder.com (not opened).
5. [M for docs, H for the public GET shapes] https://github.com/The-Dexbuilder/docs (read via `gh api`): `en/event-contracts/*.mdx`, `openapi/event-contracts-en.yaml`, `openapi/event-markets-en.yaml`. Unofficial from my vantage point; draft state (placeholder auth headers, placeholder grants email).
6. [M] https://github.com/The-Dexbuilder/docs `en/api-reference/perpdex/authentication.mdx` and `builder/*.mdx` (Builder model, fees and revenue, Vault/asset docs).
7. [L] A second docs copy under a personal GitHub account (`authentication/request-signing.mdx`, `concepts/accounts.mdx`, `funds/wallet-authorization.mdx`, `operations/rate-limits.mdx`, `resources/environments.mdx`); perp-oriented, unverified.
8. [H] Live GETs 2026-10-19: `https://api.dexbuilder.com/api/v4/event_contracts/{markets,events,tags,time,tokens/{id}/{order_book,ticker,price},markets/{id}/trades,fee/current}` and `/api/v4/prediction/{markets,markets/{id},events,tokens/{id}/order_book}`.
9. [H] Polymarket comparison GETs 2026-10-19: `https://gamma-api.polymarket.com/markets?slug=sol-updown-15m-1792465200`, `https://gamma-api.polymarket.com/markets/2589810`, `https://gamma-api.polymarket.com/markets/5851091`, `https://clob.polymarket.com/book?token_id=...`, `https://data-api.polymarket.com/trades?market=...`, `https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH`.
10. [H, internal] `docs/research/venues/gate-predictions-gate-com.md` for Gate's Polymarket front end, builder code and volumes; `docs/research/08-venues-polymarket-kalshi.md` for Polymarket mechanics.
11. [H] https://docs.gate.com/llms.txt and https://docs.gate.com/global/essentials/version/100/en/common/overview - GatePay docs, unrelated to DexBuilder; https://www.gate.com/trade-events and https://www.gate.com/announcements returned only navigation; gate.com paths `/dexbuilder`, `/dex-builder` returned 404 or 403.
