# Almanac (almanac.market) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (~04:00-04:30 UTC). READ-ONLY: public unauthenticated GETs to almanac.market, beta.almanac.market, api.almanac.market and Polymarket public hosts; static reading of the site's own public JS bundles; `gh api` raw file reads. No account, wallet, key or signature, no POST, no PayBox call, no third-party code run or cloned.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (site bundles, READMEs, API payloads incl. LLM-written trader summaries) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/almanac-market/` (9 files, each <= 6 KB, wrapped as `{_fixture_meta, response}`).
WebSearch was unavailable (session budget exhausted), so no press/social/third-party coverage was consulted. Everything below comes from first-party sites, their API and the Sportstensor GitHub repo.

## 0. Verdict

**adapter_priority: skip.**

1. **Not a venue. It is a Polymarket front end (a "builder") routing orders into Polymarket's CLOB.** Its markets carry Polymarket Gamma ids and CLOB token ids verbatim, the front end opens Polymarket's market WebSocket, and orders carry an Almanac builder code (H, sections 2 and 6). Liquidity is 100% Polymarket's, so it can never be an independent arbitrage leg.
2. **Live (H) but small and incentive-driven.** Own-reported volume about $0.3M/day (about $5.7M month-to-date for October, about $21.0M since 2025-12-02). The flow is boosted by Bittensor subnet 41 (Sportstensor) alpha-token emissions paid to traders, so it is not clean informed flow (M).
3. **Key-less read API exists but is undocumented and Almanac-specific.** Market endpoints just mirror Polymarket Gamma, so an adapter should read Polymarket directly. The only distinctive data is a "smart-money" overlay (`/v1/poly-traders*`: per-wallet quality/conviction scores, bot classification, per-market trader positions), derived from Polymarket public trade data. It could be a weak signal feed, but it is undocumented and the ToS bars automated access without written consent.
4. **Trading through Almanac adds cost and risk and no access** compared with trading Polymarket directly: +1% buy fee, user must hand Polymarket API credentials to Almanac, ToS ban on bots.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://api.almanac.market/health` | `status: healthy`, uptime 396,949 s (4.6 days), version 1.0.0, db/redis healthy, WebSocket connected (fixture `health.json`) | H |
| `https://almanac.market` | HTTP 200, last-modified 2026-10-15 (marketing/docs SPA, Vercel); `https://beta.almanac.market` HTTP 200, last-modified 2026-10-08 (the trading terminal, Cloudflare/CloudFront) | H |
| Own volume series (`/api/v1/leaderboard/stats/volume`) | last daily point 2026-10-18 = $273,443; series starts 2025-12-02 | H |
| Polymarket public `GET clob.polymarket.com/builder/trades?builder_code=<buy code>` | 300 confirmed trades, 2026-10-18 03:16Z to 17:53Z, $208K notional (fixture `polymarket_builder_trades_sample.json`) | H |
| Polymarket builder leaderboard (`data-api.polymarket.com/v1/builders/leaderboard`) | `almanac.market`, verified, ALL rank 32 (441 active users), MONTH rank 17 (123), WEEK rank 24 (62) | H |
| `github.com/sportstensor/sn41` (the subnet repo behind the incentives) | **archived**, last push 2026-07-20 | H |

Caveat: the archived sn41 repo while the site still advertises a live "miner trading track" is unreconciled. Whether subnet 41 is still emitting alpha rewards in October 2026 is NOT FOUND (no web search; no Bittensor explorer fetched). The `/v1/prices` endpoint still returns a TAO and an alpha USD price and a `current_epoch_budget` of about 4,812 (2026-10-19), which suggests it is (M).

## 2. What it is

- **Kind**: broker/frontend + incentive layer on top of Polymarket. Site title "Almanac - Accurate Before It's Obvious"; meta (beta site): "the first information incentivization layer for curated prediction markets. Powered by Bittensor SN41 and Polymarket" (H, beta.almanac.market HTML).
- **Product**: a trading terminal with curated Polymarket markets (Sports largest, Politics, Crypto), a Polymarket trader analytics/copy-trading page, and a rewards scheme: a 1% fee pool is split daily by a volume/PnL score (docs text inside the almanac.market bundle). "Almanac is the front end to Sportstensor" (sn41 README) (H).
- **Market model**: identical to Polymarket: binary (and neg-risk categorical) outcome tokens, central limit order book, orders FOK/FAK/GTC. No Almanac-native market, contract or oracle.
- **Evidence it is a pure mirror (H)**: `GET api.almanac.market/api/markets/search?q=nba` returns market id `2044124`, `clob_token_ids` `[3837...6617, 5037...8117]`; `GET gamma-api.polymarket.com/markets/2044124` returns the same id, same token ids (JSON equal), volume 324195.87 and liquidity 84976 vs Almanac's 84973 (fixture `markets_search_nba_1.json`). Docs: "built on top of Polymarket's infrastructure ... All trades execute at identical prices to Polymarket and count as Polymarket activity."
- Publicly stated "Almanac is part of the Polymarket Builders Program and uses Polymarket's official API with full attribution." Verified builder, **two builder codes** (H): BUY code (1% fee) and SELL code ("zero-fee profile") returned by `GET /api/v1/trading/config` (fixture `trading_config.json`).
- Operator identity, funding, jurisdiction of the company: NOT FOUND (searched: site bundles, ToS text, README). ToS governing law: Delaware, US (H).

## 3. Chains and collateral

- Polygon (chainId 137); collateral USDC.e per Almanac docs ("a crypto wallet on the Polygon network and some USDC.e"). Polymarket V2 collateral is pUSD per Polymarket docs (see `docs/research/08-venues-polymarket-kalshi.md`); Almanac's docs say USDC.e and deposits go "into your Polymarket deposit wallet". The docs/UX wording may lag Polymarket's V2 wrapping (M, unresolved).
- Account: a Polymarket **deposit wallet** (signature type 3; "Almanac no longer uses safe or proxy wallets"). `trading/config` lists `signatureTypes {gnosis_safe: 2, deposit: 3}` and `safeMigration {enabled: true, cutoffDate: 2026-08-17, tradingBlockedForSafes: true}` (H).
- Exchange contracts in the (archived) sn41 client: V2 CTF Exchange `0xE111180000d2663C0091e4f400237545B87B996B`, neg-risk `0xe2222d279d744050d28e00520010520000310F59` (V1 marked deprecated) (H, third-party client source; see the Polymarket note for authoritative addresses).
- Non-custodial per docs: deposits/withdrawals require the user's wallet signature; Almanac stores the user's **Polymarket L2 API credentials** (encrypted) to place orders for them (H, docs "API credentials are generated, securely stored and encrypted"). Those credentials can place/cancel orders but not withdraw (M, Polymarket model).
- Fiat/crypto onramp and swap endpoints exist (`/v1/onramp/*`, `/v1/convert/*`) (H, route strings only; not probed).

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official docs | Only user docs at `https://almanac.market/docs` (client-rendered SPA; `docs.almanac.market` 301 -> `/docs`). **No API reference, no OpenAPI** (`/docs`, `/openapi.json` on the API host both 404). | H |
| Base URL | `https://api.almanac.market/api` (from the site's own build config) | H |
| Auth | Public read routes need none. Trading/account routes return `401 MISSING_SESSION_HEADERS` (`x-session-id` plus wallet address header; session created by POST `/v1/trading/sessions` with an EIP-191 `personal_sign` of the string "Create Almanac trading session" and the Polymarket API creds - from the archived sn41 client source). | H |
| Rate limit | IETF headers on every response: `RateLimit-Policy: 3000;w=300` (3,000 requests per 300 s). | H |
| WebSocket | Server reports a WS with 177 subscriptions (`/health`), but **no public WS URL for Almanac was found** in the bundle. The front end gets live prices from Polymarket (`wss://ws-subscriptions-clob.polymarket.com/ws/market`, `https://clob.polymarket.com/prices`, `.../prices-history`). | H |
| CORS | `access-control-allow-credentials: true`; keyless GETs worked from curl. | H |

**Public routes confirmed (200, keyless):**

| Route | Shape | Fixture |
|---|---|---|
| `GET /health` | `{status, timestamp, uptime, version, services{database,redis}, websocket{connected,connections,subscriptions}}` | `health.json` |
| `GET /api/v1/trading/config` | `{success, data{builderCodes{buy,sell}, builderCodeRules, signatureTypes, safeMigration}}` | `trading_config.json` |
| `GET /api/v1/stats` | totals `{volume, fees, trades, payouts, traders, averageTradeSize}` + daily `series{volume,fees,trades,traders,rewards,budget,...}` | `stats_trimmed.json` |
| `GET /api/v1/leaderboard/stats` | `{totalTraders, totalPredictions, totalVolume, totalRewards, totalOpenInterest}` | `leaderboard_stats.json` |
| `GET /api/v1/leaderboard[/stats/{volume,traders,trades,rewards}]` | pseudonymous rank table / daily cumulative series | (not saved) |
| `GET /api/markets/search?q=` | `{success, data[event{id,title,slug,description,tags,total_volume,total_volume_24hr,markets[{id,question,outcomes,clob_token_ids,enable_order_book,accepting_orders,neg_risk,liquidity,volume,end_date,uma_end_date,taker_fee_bps,...}]}], count}`; note `outcome_prices` was null in the sample, and the `limit` param was ignored on the first call | `markets_search_nba_1.json` |
| `GET /api/v1/search/events?q=` | `{success, events[], pagination, meta}` (Gamma-like event objects, 24 per page) | (not saved) |
| `GET /api/v1/poly-traders[/stats\|/markets\|/recommended]` | per-wallet scores (`qualityScore`, `convictionAvg`, `winRate`, `roi`, `classification` e.g. `arb-bot`, `botLikelihood`) and per-market `traderSignals[]`, `outcomeConviction`, `convictionAggregate`. `/recommended` was empty. 1,883 Polymarket traders tracked, hourly sync. | `poly_traders_1.json`, `poly_traders_markets_1.json` |
| `GET /api/v1/prices` | `{tao_price_usd, alpha_price_usd, current_epoch_budget, prices_updated_at}` | (not saved) |

Authenticated/not probed: `/v1/trading/{sessions,orders,positions,performance}`, `/v1/redeem`, `/v1/account/{addr}/balance|history`, `/v1/profile/*`, `/v1/auth/builder-sign`, `/v1/sessions/{id}`.

**Independent cross-checks that do not need Almanac at all (H):** `GET https://clob.polymarket.com/builder/trades?builder_code=<code>` is a public Polymarket read (documented at docs.polymarket.com/trading/place-orders#builder-attribution). It returned 300 trades per page with `builderFee`, `feeUsdc`, `side`, `price` for every Almanac BUY (fixture `polymarket_builder_trades_sample.json`). Observed: all 300 were BUY, builder fee/notional between 0.99% and 1.00%; platform `feeUsdc` was 0 to 3.4% of notional on the same fills.

## 5. Trade path

**Programmatic order placement: possible but only as "Polymarket order + Almanac relay", and pointless for the project.** From the archived `sportstensor/sn41/api_trading.py` (third-party source, read only, not run) (H on shape, M on current behaviour):

1. Local EOA signs `personal_sign("Create Almanac trading session")` -> `POST /api/v1/trading/sessions {signature, message, walletAddress, nonce, timestamp, apiCredentials{apiKey,secret,passphrase}}` -> `{sessionId, walletAddress, proxyWallet, expiresAt}`.
2. Client builds and signs a **standard Polymarket V2 order** locally (`py-clob-client-v2`; EIP-712 on the Polymarket exchange domain) with the `builder` field set to Almanac's code: BUY must carry `builderCodes.buy`, SELL must carry `builderCodes.sell` (rule text in `/v1/trading/config`).
3. `POST /api/v1/trading/orders {marketId, signedOrder, orderType, userWalletAddress}` with header `x-session-id`; Almanac forwards to Polymarket's CLOB with the stored user API credentials. Cancel: `DELETE /api/v1/trading/orders/{id}`.

Because the order is an ordinary Polymarket-signed order, anyone can place the identical order directly on `clob.polymarket.com` (as the Polymarket note describes) without Almanac, without the 1% buy fee and without handing API credentials to a third party. Order types FOK, FAK, GTC (docs say "limit orders: no partial fills" - odd; unverified), minimum $5 buy; sells have no $5 minimum (client source) (M).

## 6. PayBox reachability

**partial / not worth it.** Trading here means Polymarket on Polygon (137). Needed signatures: EIP-191 personal_sign (session), EIP-712 ClobAuth, EIP-712 order (deposit-wallet / ERC-1271-style signature type 3 per `trading/config`). PayBox `request_wallet_sign` has `message` and `typedData` intents (H per `docs/research/06-paybox-platform.md`), with no documented chain/domain allowlist; Polygon at tool level and signature type 3 acceptance are untested (see `docs/research/08-venues-polymarket-kalshi.md` section 9). No on-chain transaction proposal is needed for the trade itself. Deposit wallet deployment and approvals would be on-chain actions. If PayBox can ever trade Polymarket, it should do so against Polymarket directly. Routing through Almanac only adds a bespoke session and an extra counterparty that holds API creds.

## 7. Fees

| Fee | Detail | Tag |
|---|---|---|
| Almanac | "flat 1% fee on trades placed through the terminal", collected by Polymarket as a **builder taker fee**, no Almanac fee contract. Charged only when the order fills. | H (docs text, bundle) |
| On-chain reality | Fills carry `builderFee` = 1.00% of notional on BUY (fixture); SELL orders use the zero-fee builder code, so **sells are free** (BUY-only 1%). Lifetime fees $213,669 on $20.94M volume = 1.02% (own `/v1/stats`). | H |
| Who pays | The user, on top of any Polymarket platform fee. Polymarket docs: builder fee paid by the user, "added on top of any platform fee and never replaces it"; taker max 100 bps, maker max 50 bps; formula `builder_fee = notional x bps / 10000`; collected from on-chain `OrderFilled` events and paid to the builder's wallet (docs.polymarket.com/programs/builders/fees). | H |
| Polymarket platform fee | Taker-only, per-market (seen 0% to 3.4% of notional in the Almanac sample). Authoritative schedule is in the Polymarket note. | H |
| Deposit/withdraw | Withdraw minimum $1, no max; funds appear in 5-20 s (docs). Gas for wallet deployment/approvals/execution covered by Polymarket's relayer (Polymarket builder docs). | M |

For the scanner: any Almanac round trip costs **about +1% on the buy leg** over Polymarket. Arbitrage vs Polymarket through Almanac is strictly dominated.

## 8. Resolution and dispute risk

Identical to Polymarket (UMA Optimistic Oracle for event markets; Chainlink-based for up/down series; 2-hour challenge, escalation to the UMA DVM, possible 50/50): see `docs/research/08-venues-polymarket-kalshi.md` section 2.10. Almanac adds no oracle or dispute layer. Almanac's own docs say "A position closes when you sell out of it, or when the market resolves and the shares become redeemable" (H). Almanac's `/v1/redeem` route handles redemption (not probed). Counterparty risk specific to Almanac: it holds your encrypted L2 API credentials and the front-end/API can go down; funds sit in your Polymarket deposit wallet (non-custodial per docs, M for the claim's accuracy).

## 9. Geo, ToS, automation

- Terms of Service (in the beta bundle; "Last Updated: 5 November 2025", so about 11 months old = **L/stale**): 18+ only; personal, non-commercial licence; users must not "Access the Platform via automated means (e.g., bots or scrapers) without prior written consent"; "No Gambling Services or Financial Advice" heading; Delaware law and courts; may suspend without notice (H).
- **Tension**: the sn41 README says miners "may use manual strategies, models, or automated systems" and ships an API trading client, so automation is tolerated for subnet miners, but the ToS text still requires written consent (H both). For a scanner this means: no scraping of `api.almanac.market` at volume without consent, even though routes are keyless.
- Geo restrictions: **NOT FOUND in Almanac's docs/ToS (searched: docs bundle, ToS, beta bundle strings).** Polymarket's own geoblock applies to order placement (US and many others are close-only; see the geoblock sections of the Polymarket note, geoblock by request IP; server-side relays from a restricted IP would be circumvention).
- Polymarket Builders Program: Polymarket can revoke a builder's fee ability at its discretion; orders with a disabled code are rejected by the CLOB (docs.polymarket.com/programs/builders/fees) (H) - platform dependency risk.

## 10. Liquidity (sources and dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Own cumulative volume | $20.94M (`/v1/stats`, generated 2026-10-19 01:00Z); $21.03M (`/v1/leaderboard/stats`, 2026-10-19 04:04Z) | api.almanac.market | H |
| Own monthly volume | 2026-06 $2.19M; 07 $1.38M; 08 $1.49M; **09 $6.83M**; 10 (to the 18th) $5.70M | summed from `/v1/leaderboard/stats/volume` | H |
| Own recent daily | $237K to $383K/day over 2026-09-20..2026-10-18; last 7 full days $1.73M, last 30 $9.04M | same | H |
| Polymarket-attributed (builder leaderboard) | ALL $30.18M (rank 32); MONTH $6.33M (rank 17); WEEK $296K (rank 24, 62 active users) | data-api.polymarket.com, 2026-10-19 | H |
| Open interest | $5,911 (`totalOpenInterest`) | `/v1/leaderboard/stats` | H |
| Traders | 338 to 441 depending on definition; 291 in `/v1/stats` | same | H |
| Trades | 120,457 trades, avg $173.85 | `/v1/stats` | H |

Reconciliation note: Polymarket's ALL figure ($30.2M) is 43% above Almanac's own ($21.0M), and the WEEK figure ($296K) is far below Almanac's own 7-day sum ($1.7M); the leaderboard windows (calendar vs rolling, 24 h lag) and sell-code attribution are unknown, so treat volumes as order-of-magnitude. The Polymarket builder-trades sample (300 buys, $208K over 14.6 h on 2026-10-18) is consistent with Almanac's own $0.27-0.30M/day.
Quality: volume jumped about 4.5x from August to September, top leaderboard accounts show large volume with negative PnL (e.g. rank 1: $881K volume, -$55K P&L, $21K earnings) - consistent with emissions-farming flow rather than informed flow (M, inference).

## 11. Category overlap and shared liquidity

- Categories: Sports (largest: NHL, NBA, NFL, soccer, tennis, in-play "HT" markets), Politics (2028 US Presidential/primaries), Crypto (H, docs). All are Polymarket markets, so overlaps with Kalshi / other venues exactly as Polymarket does.
- **Shares liquidity with Polymarket: yes, 100%** (same CLOB, same token ids, same prices). It is NOT an independent arbitrage leg. Betmoar (`docs/research/venues/betmoar-fun.md`) is the same pattern.

## 12. Usefulness to the project

- Aggregator venue adapter: **no**. Read Polymarket directly.
- Possible signal source (optional, P2-ish, not recommended now): `/api/v1/poly-traders/markets` gives per-market "smart money" positions and a conviction aggregate, plus a `classification`/`botLikelihood` tag. Derived from Polymarket public data; undocumented; Almanac-controlled scoring; ToS forbids automated access without consent. Rebuilding from Polymarket's data-api is cleaner. The `summary` field is LLM-generated text about third-party wallets (untrusted).
- Intelligence value: shows how a builder code (here with two codes: 1% buy, 0% sell) is used; confirms Polymarket V2 order structure includes a `builder` bytes32 field.

## Open questions

1. Is Bittensor subnet 41 still emitting (repo archived 2026-07-20)? If emissions stop, Almanac volume likely collapses.
2. Does Almanac expose a public WebSocket (server shows 177 subscriptions) or is that purely backend?
3. Why Polymarket's builder leaderboard windows disagree with Almanac's own volume.
4. USDC.e vs pUSD in Almanac's docs vs Polymarket V2 collateral.
5. Does the ToS "written consent" clause apply to read-only keyless routes? Unknown.

## Not found

- Official API reference / OpenAPI / SDK (searched: almanac.market/docs bundle, api host `/docs` and `/openapi.json`, GitHub org sportstensor, search `almanac.market`).
- Almanac's own GitHub org or repo for the web app/backend (only `sportstensor/sn41`; the unrelated `corvxai/almanac` "Reasoning chain" repo is not this project).
- Explicit geo restriction list; company operator identity; audit reports; any Almanac-controlled smart contract (docs say none).
- Public Almanac WebSocket endpoint.
- X/Twitter (`x.com/almanac_market` is linked from the footer) and press coverage (WebSearch budget exhausted).

## Sources

1. https://almanac.market (landing + docs SPA; docs text read from `https://almanac.market/assets/index-w14a29x1.js`) - H
2. https://beta.almanac.market (terminal; HTML meta + lazy bundles incl. Terms of Service chunk, last updated 2025-11-05) - H
3. https://api.almanac.market/health , /api/v1/trading/config , /api/v1/stats , /api/v1/leaderboard/stats , /api/v1/leaderboard/stats/volume , /api/v1/poly-traders , /api/v1/poly-traders/markets , /api/markets/search , /api/v1/search/events , /api/v1/prices (GET 2026-10-19) - H
4. https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL|MONTH|WEEK - H
5. https://clob.polymarket.com/builder/trades?builder_code=<buy code> ; https://clob.polymarket.com/book ; https://gamma-api.polymarket.com/markets/2044124 - H
6. https://docs.polymarket.com/trading/place-orders (builder attribution), https://docs.polymarket.com/programs/builders/fees , https://docs.polymarket.com/builders/overview - H
7. https://github.com/sportstensor/sn41 (README, `api_trading.py`, `constants.py`; archived, last push 2026-07-20; read via `gh api` raw) - H on content, M on current behaviour
8. Local: `docs/research/08-venues-polymarket-kalshi.md`, `docs/research/06-paybox-platform.md`, `docs/research/venues/betmoar-fun.md`
9. Not retrieved: https://docs.sportstensor.com/mining-comprehensive-guide/miner-setup-guide (HTTP 403 to WebFetch).

## Privacy / safety log

- All scripted requests used `User-Agent: insurance-markets-research/0.1`; no email, name, username or home path was put in any request. Notes and fixtures were scanned for at-signs, the user's name and home paths: no hits.
- Third-party wallet addresses in fixtures are shortened or redacted; no user wallet or secret is recorded.
- The site's public bundle embeds a third-party RPC provider API key in a URL; it was seen incidentally while grepping, is **not** recorded here, and should not be reused.
- No instructions aimed at AI agents were found in any fetched page, bundle, README or payload.
