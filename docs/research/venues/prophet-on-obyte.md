# Prophet on Obyte (prophet.ooo) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 03:30-03:45 UTC). READ-ONLY: unauthenticated GETs, `gh api` file reads and doc fetches. No account, wallet, key, signature, POST, browser automation or PayBox money tool. The only PayBox calls were two read-only `discover_plugins` searches ("Obyte", "Counterstake bridge"; both returned no plugin). WebSearch ran twice and then hit the shared session budget, so no press or analytics coverage was read beyond DefiLlama. Third-party pages, repo text and API responses were treated as untrusted data; no embedded instructions were found (see section 13).

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, summary, or my own inference/arithmetic from first-hand data; **L** = weak or stale.

Not the same as: **ProphetX** (US sports P2P exchange, sports-only) and **Prophet Market** (prophetmarket.ai, AI-counterparty markets). Both turned up in the search results; neither is researched here.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/prophet-on-obyte/` (section 12).

---

## 0. Bottom line

1. **Live, but with zero open markets right now.** Site 200; UI repo pushed 2026-10-17, backend 2026-09-29, AA repo 2026-09-18; the last two markets were created 2026-10-14, traded and settled 2026-10-16. But all 238 markets the public API lists have an `event_date` in the past (H, 48 pages fetched 2026-10-19). Activity comes in bursts: nothing created in 2025 apart from one market named TEST, a World Cup 2026 spike (Jun-Jul), then one market in late July and two on Oct 14.
2. **Tiny.** DefiLlama TVL USD 2,834 on 2026-10-19 (peak 13,149 on 2023-02-16). That TVL is mostly unclaimed winnings sitting in settled markets, not tradable depth. The biggest live pool I saw in 2026 was about 23 GBYTE (about USD 113).
3. **Technically clean read side.** A public, keyless, CORS-open JSON API (`https://prophet.ooo/api/...`, Fastify, MIT source) lists markets with supplies, prices, reserve and result. No docs page and no rate-limit statement.
4. **Hostile as an arbitrage leg by design.** The FAQ says the 90% "arbitrageur profit tax" exists to take the profit of people who arbitrage it against other platforms. Add a 1% buy fee and a 2% sell fee.
5. **Not tradable from PayBox.** Obyte is its own ledger (own address format and key type). PayBox has no Obyte chain or plugin. At most an EVM wallet could fund a buy through the Counterstake bridge; selling and claiming need an Obyte key.
6. **adapter_priority = skip.** Revisit only if a venue registry wants a passive row (one GET adapter) or if open markets with more than about USD 1k of reserve reappear (section 11).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Site | `GET https://prophet.ooo` -> 200 (Cloudflare); SPA, `<title>` "Prophet - Decentralized prediction markets"; page preloads `https://prophet.ooo/api/markets/1?type=all|currency|misc|soccer` | H |
| API | all endpoints in section 4 answered 200 on 2026-10-19 | H |
| Latest markets | `BL1_SGE_CGN_2026-10-16` and `CLI_ESU_FLA_2026-10-16` created 2026-10-14, committed 2026-10-16 (fixtures `api_market_*`) | H |
| Repos (`gh api`) | `byteball/prediction-markets-ui` pushed 2026-10-17 (MIT); `-backend` 2026-09-29 (MIT); `-aa` 2026-09-18 ("add tokenless base aa (#13)"; 14 commits since 2026-01-01); `-notifications` 2026-10-13; `sports-oracle` 2026-08-22 (MIT); none archived | H |
| DefiLlama | `api.llama.fi/protocol/prophet`: listed 2022-08-15, `currentChainTvls.Obyte` = 2,833.64 USD, series updated 2026-10-19 02:24 UTC; methodology "USD value of the assets locked into the autonomous agents that extend the Prophet protocol" | H |
| Open markets | `/api/markets/{1..48}?type=all`: 238 total, **0 with `event_date` in the future**, 235 resolved, 3 unresolved (2022-2023 matches) | H (my count) |
| Market creation by year | 2022: 101; 2023: 58; 2024: 18; 2025: 1 (feed `TEST`); 2026: 60 (Mar 4, Apr 4, May 1, Jun 24, Jul 25, Aug 0, Sep 0, Oct 2) | H (derived; the API only lists markets with registered symbols or tokenless, so a few unlisted markets may exist: M) |

Verdict: **still_live = true**, dormant between bursts. The 2026 burst lines up with the FIFA World Cup (WC feeds: 66 markets all-time, covering the 2022 and 2026 tournaments).

---

## 2. Kind and market model

- **Kind (H):** on-chain automated-market-maker ("bookmaker AA") prediction markets on the Obyte DAG. Each market is its own Autonomous Agent (AA), created permissionlessly by a factory AA. Traders trade against the pool, not each other. No order book, no parimutuel pools with fixed odds.
- **Outcomes (H, `agent.oscript`, `factory.oscript`):** YES, NO and optional DRAW. In sports markets "YES" = first-listed (home) team wins, "NO" = second team wins, DRAW = draw, so 3-way markets are categorical, **not** complement pairs. Currency markets are binary (`feed_name comparison datafeed_value`, e.g. `BTC_USD > 82589`). No scalar markets.
- **Tokenisation (H):** v1 "token" markets issue each outcome as an Obyte asset (`yes_asset`, `no_asset`, `draw_asset`, 9 decimals, symbols like `PL_ARS_COV_2026-08-21_ARS`). v2 "tokenless" markets (`is_tokenless:true`, base AA `GVIKYO4EFMSAP7LBBUAZRUFDVGCDP4ZA`, first seen 2026-10-14) keep positions as `balance_<address>` state vars inside the AA and sell with negative amounts in trigger data.
- **Pricing (H, FAQ + `aa-lib.oscript`):** bonding curve over the supplies `s_i`: reserve `r = c * sqrt(s_yes^2 + s_no^2 + s_draw^2)`; price `p_i = c * s_i / sqrt(sum s^2)`; `c` starts at 1 and grows as fees accrue. Prices are in reserve-asset units per token and do **not** sum to 1.
- **Implied probability (H FAQ, M for my formula):** FAQ: "the shares of the total capital invested in specific tokens are ... the market's beliefs of their probabilities ... proportional to the token's price squared". So `prob_i = p_i^2 / sum_j p_j^2` (the coefficient cancels; equals `s_i^2 / sum s^2`). Decimal odds shown by the site = reserve-share payout per stake, about `1/prob_i` before fees and slippage. An adapter must convert; raw `yes_price` is not a probability.
- **Payout (H, `claim_profit`):** winners redeem pro rata of the whole reserve: `payout = floor(winner_amount / winner_supply * reserve)`. A winning token is not worth a fixed 1 unit.
- **Trading window (H):** open until `event_date - quiet_period` (sports: kickoff; currency markets use quiet periods of 1.5 to 90 hours), **closed in-play** ("in-game trading is not allowed", FAQ), reopens at `event_date + waiting_period_length` only if no result was committed ("Resumed trading"). Default waiting period 5 days; 202 of the 238 markets use 3 days, 32 use 5.
- **Code-version caveat (M):** I read the repo master AAs (`agent.oscript`, new base after "new base" commit 2026-08-24). Deployed v1 markets use base AA `A4EH5ZF5L4KEAHQIUSDEQGILHPEFJFPW` (field `base_aa` in the API), which I could not read on-chain. The fee fields and FAQ formulas match, but exact rounding in older bases is unverified.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Obyte (DAG ledger; no EVM, no Solana) | H |
| Reserve assets accepted by the site (`GET /api/reserve_assets`) | `base` = GBYTE (9 decimals), and Obyte asset `S/oCESzEO8G2hvQuI6HsyPr0foLfKwzs+GU73nO9H40=` = "USDC" (4 decimals; presumably the Counterstake-imported USDC: M) | H |
| Actually used | 234 of 238 markets reserve GBYTE; 4 reserve USDC (the last on 2026-06-18) | H |
| Collateral risk | GBYTE price volatility (about USD 4.915 on 2026-10-19, DefiLlama `coins.llama.fi`); USDC markets carry bridge-wrapper risk | H / M |
| Cross-chain funding | FAQ: bettors with funds on Ethereum, BSC or Polygon can bet via the Counterstake bridge (USDC, ETH, WBTC) plus an Oswap conversion; "you still need an Obyte wallet to receive the tokens ... and to claim profit". UI code calls `transferEVM2Obyte` from `counterstake-sdk` (SDK repo pushed 2026-10-09) with `data` forwarded to the AA, `to` = the user's Obyte address, assistant reward 1% | H |
| Network fee | Base-reserve markets deduct a 10,000-byte (0.00001 GBYTE) bounce/network fee from each trigger; Obyte unit fees are paid on top by the sender | H |

---

## 4. Read API

**Exists: official-public, undocumented.** It is the backend of the official site (repo `byteball/prediction-markets-backend`, MIT). No docs page, no OpenAPI. Routes below are from `webserver/index.js` in the repo and were confirmed live.

| Item | Value | Tag |
|---|---|---|
| Base URL | `https://prophet.ooo/api` (testnet `https://testnet.prophet.ooo/api`) | H |
| Auth / limits | None needed; `access-control-allow-origin: *`; Cloudflare in front; **no rate-limit headers, no stated limits** | H absence; limits NOT FOUND (searched headers, repo, FAQ) |
| WebSocket | None on the backend (route list has no WS). Chain-side events via Obyte hub WebSocket `wss://obyte.org/bb` (`light/new_aa_to_watch` + `subscribe`, obyte.js docs) | H |

Key endpoints (all GET, JSON):

| Purpose | Endpoint | Notes |
|---|---|---|
| Market list | `/api/markets/{page}?type=all|soccer|currency|misc[&championship=PL]` | 5 markets per page (`conf.limitMarketsOnPage = 5`); response `{data:[...], max_count}` (238). Order: upcoming (by reserve USD desc), then "resumed trading", then settled. Each row carries `aa_address, base_aa, oracle, comparison, feed_name, datafeed_value, datafeed_draw_value, allow_draw, event_date, quiet_period, waiting_period_length, issue_fee, redeem_fee, arb_profit_tax, reserve, coef, supply_yes/no/draw, yes/no/draw_price, yes/no/draw_asset, result, committed_at, version, is_tokenless, apy, candles[24 hourly], yes_team/no_team, league, bookmaker odds fields` |
| One market | `/api/market/{aa_address}` | params + `eventText`, `marketUrl` (no live supplies/prices) |
| Trades | `/api/recent_events/{aa_address}/{page}` | 5 per page; `type` in `buy_by_type`, `add_liquidity`, `claim_profit`; per event: amounts, `reserve_amount`, post-trade supplies, prices, `reserve`, `coef`, `trigger_unit`, `timestamp` |
| Candles | `/api/daily_candles/{aa_address}` | open/close supplies, prices, reserve per day |
| Upcoming fixtures (no market yet) | `/api/calendar/{sport}/{championship}/{page}`, `/api/calendar/currency/{PAIR}/{page}` | candidate events from football-data.org / oracle feeds, with suggested thresholds |
| Reference | `/api/reserve_assets`, `/api/popular_oracle_pairs`, `/api/championships/{sport}`, `/api/first_trade_ts/{aa}`, `/api/dates/{aa}`, `/api/bookmaker_odds/{sport}/{feed}`, `/api/venue/{feed}` | `bookmaker_odds` returned nulls |

Hub-side reads (trustless path): the Prophet UI reads AA state through the Obyte hub HTTP API `POST https://obyte.org/api/get_aa_state_vars | get_data_feed | get_definition` (H, `src/shared/api/hub-http.ts`; plain GET returns Express 404, H). **I did not call these** (POST is outside this task's rules). The obyte.js docs list the WebSocket equivalents: dry run AA (simulate a trigger), get AA state vars, get AA balances, execute AA getter (H). The AA getters `get_exchange_result(yes, no, draw)` and `get_result_for_buying_by_type(type, amount)` give exact quotes including fees and arb tax, so an adapter can quote without the backend.

Adapter keys: market id = `aa_address` (not the feed: the same feed can have several markets, e.g. `WC_ENG_CRO_2026-06-17` has one market with DRAW and one without); event key = `(oracle, feed_name)` with sports feed `LEAGUE_HOME_AWAY_YYYY-MM-DD` (football-data.org TLAs, e.g. `PL_ARS_COV_2026-08-21`); currency feed `PAIR` + `comparison` + `datafeed_value` + `event_date`. Compute liquidity as `reserve / 10^reserve_decimals * GBYTE_USD`.

---

## 5. Trade path and PayBox reachability

**Trade path (H, `agent.oscript`, `agent-tokenless.oscript`, `prediction-markets.json`):** no order book and no REST order API. A trade is an Obyte unit: a payment to the market AA address carrying JSON `data`, signed with an Obyte private key (the obyte.js quick start sends it with `client.post.payment(params, wif)`; the curve is ECDSA secp256k1 per my background knowledge: M).

| Action | Trigger |
|---|---|
| Buy by amount of reserve | pay `reserve_asset` (base needs > 10,000 bytes), data `{type:"yes"|"no"|"draw", min_expected_amount?, to?}` |
| Buy exact token amount | data `{yes_amount:N, ...}` with enough reserve; surplus is refunded |
| Sell (token market) | send outcome tokens to the AA; (tokenless) data `{yes_amount:-N}` |
| Add liquidity | data `{add_liquidity:1, yes_amount_ratio?, no_amount_ratio?}` (zero fee) |
| Settle | any address: data `{commit:1}` after the oracle posts; winners then `{claim_profit:1}` with winning tokens |

Slippage guard exists only for buy-by-type (`min_expected_amount`; failing returns the reserve minus the network fee). Soft-bounce errors return funds. No MEV ordering games according to the FAQ (DAG); latency to AA response not measured (NOT FOUND).

**PayBox: `paybox_reachable = partial`.**
- PayBox chain catalog (from `docs/research/06-paybox-platform.md`, live 2026-10-19, M here because I did not re-list it): Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid. **No Obyte.** `discover_plugins` for "Obyte" and "Counterstake bridge": 0 results (H).
- Buy leg, theoretically: an EVM transaction proposal on Ethereum/BSC/Polygon to the Counterstake bridge (approve + export call) with `data` for the AA is exactly what the Prophet UI does with MetaMask (H code). It needs a destination Obyte address (`to`) controlled by someone with an Obyte key. I did not verify the bridge contract addresses, the claim latency, or whether PayBox's proposal schema allows the call (M).
- Sell, commit and claim: impossible without an Obyte-signed unit. Payouts cannot be routed back to EVM by the AA (it pays a plain Obyte address).
- Open question for tokenless v2: position is credited to `trigger.address`, which for a bridged trigger is the bridge forwarder, not `to` (code read, untested: M).

---

## 6. Fees (who pays, formulas)

Per-market parameters (defaults, set by the creator at deploy; the API shows them): `issue_fee` 1%, `redeem_fee` 2%, `arb_profit_tax` 90%. Observed in the 238 markets: (0.01, 0.02, 0.9) x 233; (0, 0, 0) x 2; one each of (0.01, 0.2, 0.9), (0.01, 0.05, 0.9), (0.01, 0.01, 0.01) (H, derived).

- **Buy:** `fee = ceil(gross_reserve * issue_fee) + arb_profit_tax_amount`, paid by the buyer, **retained in the pool** (raises `coef`, so it accrues to LPs and to winners). No separate protocol or operator fee exists in the AA code I read (the site UI could add referral or bridge fees: not checked).
- **Sell:** `fee = ceil(gross_payout * redeem_fee) + arb tax`.
- **Arb profit tax** (`aa-lib.oscript`): per outcome `arb_profit_tax * |p_old - p_new| * amount / 2`, i.e. 90% of the triangle of price improvement the trade creates. FAQ: "When our markets are arbitraged against similar markets on other platforms, this tax helps to collect most of the arbitrageur profit in favor of the liquidity providers."
- **Claim:** no fee. **Add liquidity:** fee 0 in the lib.
- Obyte network fee: 10,000 bytes bounce fee for base markets plus unit fees (section 3).
- **Aggregator consequence (M, arithmetic):** correcting a mispricing of size `d` per token over `n` tokens yields about `n*d/2` gross, 90% of which is taxed away, plus 1% on the buy leg. Hold-to-resolution avoids the 2% sell fee. Net edge is roughly one tenth of what the raw price gap suggests; model it with the AA getter, not with spot prices.

---

## 7. Resolution mechanism and dispute risk

- **Mechanism (H, code):** the AA reads an Obyte data feed from a named oracle address (`data_feed[[oracles=$oracle, feed_name=$feed_name]]`), applies `comparison` against `datafeed_value` (YES if true, DRAW if `allow_draw` and the value equals `datafeed_draw_value`, else NO). Anyone can call `commit` after `event_date`; **first commit wins**, there is no appeal.
- **Currency markets (H code, M interpretation):** the read has no time bound, so the AA uses the latest feed value at commit time, not the value at `event_date`. `quiet_period` (stops trading hours before the event) is the mitigation.
- **Oracles the UI trusts (H, `entities/oracle/config/categories.ts`):** sports oracle `TKT4UESIKTTRALRRLWS4SENSTJX6ODCW` (202 markets), currency oracle `JPQKPRI5FMTQRJF4ZZMYZYDQVRD55OTC` (31) with crypto, stock (AAPL, TSLA, NVDA ...) and FX pairs, precious-metals oracle `DXYWHSZ72ZDNDZ7WYZXKWBBH425C6WZN` (4). Anyone can use any oracle; the site warns for unknown ones. FAQ: oracles are "operated by well-known Obyte community members"; "You do have to trust the oracle operator". **Single-operator oracle, no dispute layer.**
- **Sports rule (H, `sports-oracle/modules/api_footballdata_org.js`):** "The oracle will post the name of winning team after 90 minutes play. This includes added injury or stoppage time but doesn't include extra-time, penalty shootouts or golden goal. If the match is rescheduled to another day, no result will be posted." Sources: football-data.org, mysportsfeeds, theScore. This matches the usual 1X2 90-minute definition used by other venues, but cross-check each venue's wording for knockout rounds.
- **Edge cases (open, do not guess):**
  - The oracle code sets a `canceled` value for POSTPONED/CANCELLED fixtures, but another filter drops those fixtures, so whether `canceled` is ever posted is unclear. If it were posted, the AA code would resolve **NO** (the away side), because any other value falls through to NO.
  - World Cup knockout markets are created without DRAW (UI `rules.ts`: no draw allowed for matches after 2026-06-28 19:00Z; the API shows every WC market from 2026-06-29 on with `allow_draw:0`, H). If the oracle posts "draw" after 90 minutes, the AA code would resolve **NO**, not "advance". Verify against settled `WC_*` knockout markets before trusting any cross-venue match.
  - No result in time (default 3-5 days): trading resumes so holders can sell (H, FAQ "Resumed trading").
- Contract risk: AA code is immutable and open (no license file on the AA repo: `license: null`; backend, UI and oracle are MIT). No audit found (DefiLlama `audits: "0"`).

---

## 8. Geo / ToS / automation

- No terms of service, privacy policy, geoblock or KYC found. Searched: UI repo code search for "country", "restricted", "terms"; FAQ; backend repo. NOT FOUND.
- FAQ: "Who operates Prophet? Nobody. Every market is operated by its own Autonomous Agent ... By engaging with this website, you are engaging with the Autonomous Agents ... not with any companies ... There is no contract. You do not acquire any rights or obligations towards anyone." (H)
- Automation is the intended use for on-chain trading (open AAs, SDKs, public source). No API terms and no rate limit are stated for the backend (NOT FOUND). Be polite: it is a small Node app behind Cloudflare; cache pages and poll slowly (I used about 150 GETs at 1 s spacing).
- Regulatory exposure of sports betting by jurisdiction is the user's; the project states no position. (M)

---

## 9. Liquidity (with dates)

| Metric | Value | Source, date, tag |
|---|---|---|
| DefiLlama TVL | USD 2,833.64 | `api.llama.fi/protocol/prophet`, 2026-10-19; H. History: peak 13,149 (2023-02-16); 2025 range 892-3,326; 2026 range 1,199-3,104 |
| Sum of `reserve` over all 238 listed markets | 517.4 GBYTE (about USD 2,543 at 4.915) + 0.053 USDC | my sum of the API data, 2026-10-19; H. 76 markets still hold a reserve: these are settled markets with unclaimed winnings (largest 21.7 GBYTE, about USD 107) |
| Open markets | **0** | 2026-10-19; H |
| Largest 2026 pool seen | 22.99996 GBYTE (about USD 113), `WC_FRA_MRO_2026-07-09`; typical pools about 10 GBYTE (about USD 50) | sampled trade events; H (sample covers the first 5 events per market; 15 of 51 markets have more) |
| 2026 activity | 51 of 60 markets traded; 225 events in total (buys, LP adds, claims), median 4 per market, max 11. Sampled buys: 86, sum 62.7 GBYTE (about USD 308), median 0.49 GBYTE (about USD 2.4) | `/api/recent_events/...` count fields, 2026-10-19; H (volume is a lower bound) |
| All-time volume | NOT FOUND (no volume endpoint; not computed) | |
| Slippage | Sqrt-curve with `c*||s||` reserve: with pools of about USD 50 any realistic size is slippage-bound (my inference from the curve, not measured) | M |

---

## 10. Event categories, overlap, shared liquidity

- **Sports (soccer 1X2, 90 min):** 202 of 238 markets. Leagues by count: WC 66, CL 34, PL 27, BL1 12, EC 12, CSL 10, PD 10, ASL 6, PPL 5, FL1 5, BSA 5, CLI 3 (H, derived from feed names). This overlaps Polymarket, Kalshi, Limitless and others on big matches (World Cup, Champions League, Premier League), where depth is orders of magnitude larger. Markets exist only if someone creates them; the `calendar` endpoint lists candidates.
- **Crypto / commodity / stock price thresholds:** 35 markets (last batch 2026-04 to 2026-06; BTC, ETH, DOGE, BNB, BAT, GBYTE, XAU, XAG). Overlap with crypto-price markets elsewhere; none open now.
- **Politics, macro, other:** none (one `TEST` market in 2025). Custom oracles are possible but none are in use.
- **Shared liquidity (H):** none. Each AA holds its own reserve; it is not routed to or mirrored from another venue. It is an independent price source, but with USD 50 pools the quote is dominated by one or two small trades. The only external link is onboarding (Counterstake bridge and Oswap), which is not market liquidity. The site mentions ODEX, an Obyte DEX where token-market outcome tokens can be traded off-AA (no fees there; not researched).

---

## 11. Priority

**adapter_priority = skip.**

Why: zero open markets today; typical pool USD 50, best seen USD 113; the AMM design taxes arbitrage on purpose (section 6); sports resolve through a single oracle with undocumented edge cases (section 7); no PayBox path to exit or claim (section 5); markets appear in bursts, not continuously. Against that, the read API is simple and free.

Revisit triggers: (a) at least one open market with more than about USD 1k reserve, (b) a documented API with stated limits, (c) an EVM-native entry/exit path, or (d) the registry wants an exhaustive venue list. If (d): implement a read-only adapter from `/api/markets/1?type=soccer` plus `get_exchange_result` quotes, mark `tradable:false`, apply `prob_i = p_i^2/sum p_j^2`, and skip rows with `event_date < now` or `result != null`.

---

## 12. Fixtures saved

All under `docs/research/fixtures/prophet-on-obyte/` (each <= 50 KB; raw API responses unless noted):
- `api_markets_1_type-all_2026-10-19.json`, `api_markets_2_type-all_2026-10-19.json`, `api_markets_3_type-all_2026-10-19.json` - market list pages 1-3 (page 2 contains the traded `PL_ARS_COV_2026-08-21` and a currency market; page 3 `WC_FRA_ENG_2026-07-18`)
- `api_market_token-v1_BL1_SGE_CGN.json`, `api_market_tokenless-v2_CLI_ESU_FLA.json` - single-market detail, v1 token and v2 tokenless
- `api_recent_events_WC_FRA_ENG_page1.json`, `api_daily_candles_WC_FRA_ENG.json` - trade event and candle shapes
- `api_reserve_assets.json`, `api_popular_oracle_pairs.json`, `api_championships_soccer.json`, `api_calendar_soccer_PL_page1.json`, `api_calendar_currency_BTC_USD_page1.json`
- `doc_url_prediction-markets.json`, `doc_url_prediction-factory.json` - AA `doc_url` field descriptions (trigger data keys)
- `defillama_protocol_prophet_trimmed.json` - **trimmed by me** (metadata and last 60 TVL points of a 433 KB response)
- `derived_market_census_2026-10-19.json` - **derived by me** from the 48 list pages (all 238 markets, 10 columns; column names inside the file)

---

## 13. Not found, open questions, suspicious content

NOT FOUND (searched in brackets):
- API documentation, OpenAPI, rate limits, ToS, geo policy, audit report [UI/backend/AA repos, FAQ, site paths `/faq`, `/robots.txt`, `/sitemap.xml` which all serve the SPA shell].
- All-time and 2026 total volume [no endpoint; only a partial sample].
- Latency from trigger to AA response [not measured].
- On-chain read of the deployed v1 base AA `A4EH5ZF5L4KEAHQIUSDEQGILHPEFJFPW` [needs hub POST or WebSocket; out of scope].
- Counterstake bridge contract addresses, current status and fees per chain [only the SDK use was read].
- Whether the sports oracle posts a value for cancelled or postponed matches and how it labels knockout draws after 90 minutes (section 7).

Suspicious content: none found. No text addressed to AI agents in the fetched pages, repos or API responses. (`WebFetch` of `https://prophet.ooo` returned only the page title because the site is a client-rendered SPA; the FAQ was read from the UI repo source instead.)

Privacy: all scripted requests used the User-Agent `insurance-markets-research/0.1`; no contact address or personal identifier was sent anywhere; fixtures were scanned for personal identifiers and contain none (trader addresses in `recent_events` are public third-party Obyte addresses).

---

## Sources

- Site and API: `https://prophet.ooo` (200, 2026-10-19), `https://prophet.ooo/api/markets/{page}?type=...`, `/api/market/{aa}`, `/api/recent_events/{aa}`, `/api/daily_candles/{aa}`, `/api/reserve_assets`, `/api/popular_oracle_pairs`, `/api/championships/soccer`, `/api/calendar/...`, `https://prophet.ooo/prediction-markets.json`, `https://prophet.ooo/prediction-factory.json` (H)
- AA source: `https://github.com/byteball/prediction-markets-aa` (`README.md`, `factory.oscript`, `agent.oscript`, `agent-tokenless.oscript`, `aa-lib.oscript`; pushed 2026-09-18) (H)
- Backend source: `https://github.com/byteball/prediction-markets-backend` (`webserver/index.js`, `webserver/controllers/marketsController.js`, `marketController.js`, `conf.js`, `crontab.txt`; pushed 2026-09-29) (H)
- UI source (contains the FAQ text): `https://github.com/byteball/prediction-markets-ui` (`src/pages/faq/ui/faq-page.tsx`, `src/shared/api/hub-http.ts`, `src/features/trade/lib/trade-links.ts`, `src/entities/bridge/api/counterstake.ts`, `src/entities/oracle/config/categories.ts`, `src/entities/market/config/rules.ts`, `src/shared/config/env.ts`; pushed 2026-10-17) (H)
- Sports oracle: `https://github.com/byteball/sports-oracle` (`README.md`, `modules/api_footballdata_org.js`, `conf.js`; pushed 2026-08-22) (H)
- Bridge SDK: `https://github.com/byteball/counterstake-sdk` (`README.md`; pushed 2026-10-09) (H)
- Obyte client docs: `https://obytejs.com/llms.txt`, `https://obytejs.com/getting-started/quick-start.md`, `https://obytejs.com/api/autonomous-agents/dry-run-aa.md`, `.../get-aa-state-vars.md`, `.../execute-aa-getter.md` (H)
- Obyte hub HTTP probe: `GET https://obyte.org/api/get_aa_state_vars` -> 404 "Cannot GET" (H)
- DefiLlama: `https://api.llama.fi/protocol/prophet` (TVL, listing date, methodology), `https://coins.llama.fi/prices/current/coingecko:byteball` (GBYTE 4.915 USD, 2026-10-19) (H)
- Search result pages listing the repo and third-party coverage (not opened): `https://zycrypto.com/obyte-launches-prophet-a-bonding-curve-based-prediction-market-platform/`, `https://nextpredict.io/market-news/tech-and-ai/prophet-launches-ai-driven-prediction-market/` (the latter is about a different "Prophet", prophetmarket.ai) (L)
- Project context: `docs/research/06-paybox-platform.md` (PayBox chain catalog) (M here)
