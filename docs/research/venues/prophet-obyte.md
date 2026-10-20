# Prophet (Obyte) - venue spec

Researched 2026-10-19. Tags: **H** read first-hand in a primary source this session, **M** secondary or inferred, **L** weak or stale. "NOT FOUND (searched: ...)" means no evidence located, not that it does not exist.

## 0. Verdict

**Priority: skip.** Prophet (https://prophet.ooo) is alive and has a usable unauthenticated JSON API, but it has no open (future-dated) markets today, about 3 GBYTE of tradeable reserve in stale markets, about USD 2.7k "TVL" that is almost all residual reserve in already-resolved markets, a few hundred USD of trading in 2026 from about ten addresses, a 90 percent "arbitrageur profit tax" built into the AMM, and an execution path that needs an Obyte DAG key (not reachable from a PayBox EVM or Solana wallet for the sell/claim leg). It is not a viable independent arbitrage leg. If a read-only price feed is ever wanted, it is one cheap poll (section 3), but the signal value is close to zero.

Disambiguation: "Prophet" at prophetmarket.ai (AI counterparty prediction market, launched May 2026, US-restricted) is a different, unrelated product. H that the site does not mention Obyte; M for the rest (search results only). Not researched further; worth a separate discovery entry.

## 1. Identity and liveness

- Name: Prophet; site https://prophet.ooo; built on the Obyte DAG by the Obyte core team (GitHub org `byteball`; site meta `twitter:site=@ObyteOrg`). [H: prophet.ooo HTML head, fetched 2026-10-19]
- Launch: about Aug 2022 (DefiLlama `listedAt` 1660568009 = 2022-08-15; repo `prediction-markets-aa` created 2022-07-12). [H: api.llama.fi, GitHub API]
- **Still live: yes (low activity).** Evidence, all H, 2026-10-19:
  - prophet.ooo returns HTTP 200; API `/api/markets` returns data.
  - Repos pushed recently: `prediction-markets-ui` 2026-10-17, `prediction-markets-notifications` 2026-10-13, `prediction-markets-backend` 2026-09-29, `prediction-markets-aa` 2026-09-18 (commits "add tokenless base aa" 2026-09-18, "solvency checks" 2026-08-27, "new base" 2026-08-24).
  - Newest markets created 2026-10-14 (two soccer matches for 2026-10-16); latest on-chain event in the sampled 2026 markets is a `claim_profit` on 2026-10-17 08:29 UTC.
  - World Cup 2026 markets were created June-July 2026 (66 `WC_*` markets in total).
- Hint "tiny/legacy" is half right: tiny yes; legacy no, it is still maintained and new AA versions are shipping.

## 2. Market model

- **Kind:** fully on-chain AMM on Obyte "Autonomous Agents" (AAs, Oscript smart contracts). One AA per market, created permissionlessly through a factory AA. [H: `factory.oscript`, `agent.oscript`, `agent-tokenless.oscript`, `aa-lib.oscript` in github.com/byteball/prediction-markets-aa]
- **Outcomes:** binary YES/NO, optionally a third DRAW outcome (`allow_draw`; 167 of 238 markets have it, i.e. 3-way soccer 1X2 style). No scalar, no categorical beyond the optional draw. A "YES" is defined by `comparison` (`==, >, >=, <, <=, !=`) of an oracle data-feed value against `datafeed_value`; for soccer, YES = home/first team wins, `datafeed_draw_value=draw`. [H: factory/agent source, API samples]
- **Tokenisation:** two flavours. Token markets (`is_tokenless=0`, 237 of 238 listed) issue YES/NO/(DRAW) as native Obyte assets (9 decimals). Tokenless markets (new in Sept 2026, 1 listed) keep positions as `balance_<address>` state vars inside the AA and sell with negative amounts. [H]
- **Pricing (Pythagorean bonding curve):** reserve `R = coef * sqrt(s_yes^2 + s_no^2 + s_draw^2)`; token price (in reserve units) `p_i = coef * s_i / sqrt(sum s^2)`. `coef` starts at 1 and grows as fees accrue into the pool. [H: `aa-lib.oscript`]
- **Prices do NOT sum to 1 and a winning token does not pay 1.** Winning tokens redeem pro rata: `payout = winner_amount / winner_supply * reserve` [H: `agent.oscript` claim_profit]. Hence payoff per winning token is `R / s_i = coef^2 / p_i`, and the implied probability (and the UI's own "odds" display, `new_reserve / new_supply / new_price`) is **`P_i = (p_i / coef)^2`**, which sums to 1 because `sum p_i^2 = coef^2`. [H: derived from the contract; matches `transaction-estimation.tsx` odds formula]. Worked check on a live sample (WC_FRA_ENG, event add_liquidity): p_yes 0.8517, p_no 0.6603, coef 1.0777 gives P_yes 0.625, P_no 0.375, sum 1.000. [H: fixture `recent_events_token_OVW24JB2_page1.json`]. An adapter must use this, not the raw price.
- **Order book:** none. Trades are against the curve; there is no maker/taker, no limit order. Liquidity providers deposit reserve and receive outcome tokens in proportion to current supplies (all outcomes), earning the accrued fees via `coef`. [H]
- **Lifecycle:** trading, then optional `quiet_period` (trading closed before event; 205 of 238 markets use 0), then waiting for oracle (default 259200 s = 3 days for 202 markets, 432000 s for 32), then either committed result (claiming) or, if the oracle never posts, **trading resumes** after the waiting period. [H: `getMarketPhase` in UI, agent `$trading_open`]

## 3. Chains and collateral

- Chain: **Obyte DAG** (not EVM, not Solana). Hub for light clients: `wss://obyte.org/bb` (mainnet), `obyte.org/bb-test` (testnet). [H: backend `conf.js`]
- Reserve assets supported by the site (the AA accepts any existing asset, the site filters to these two): **GBYTE** (`base`, 9 decimals) and **USDC on Obyte** (asset id `S/oCESzEO8G2hvQuI6HsyPr0foLfKwzs+GU73nO9H40=`, 4 decimals; this is Counterstake-bridged USDC). [H: backend `conf.js`, `GET /api/reserve_assets`]. 234 of 238 markets are GBYTE-denominated; only 4 use USDC, with a combined reserve of 0.053 USDC. [H: computed from the full market list, 2026-10-19]
- GBYTE is a thinly traded native coin; CoinGecko `simple/price` returned USD 5.00 on 2026-10-19 [M: round number, one source]. USD conversion of all GBYTE figures below uses USD 5.
- Network fee: 10,000 bytes (0.00001 GBYTE) per trigger when the reserve is GBYTE. [H: `$network_fee` in agent source]
- Factory AAs (v1 token markets): `S6WVQ6JQCNQ27OQJM2IQDS6DYTKBM24G`, `ZV3JPT2RDDQSEFTO7IDOZF3OWVUZF7NC`, `HUJCVN2ZTG6CWUEKG4LQDAMBWSVCSP5L`; v2 factory (tokenless): `M56MS5K2YTDG2AFJJIWNTMHJWXO7BJPM`. [H: backend `conf.js`]. Note the repo HEAD `factory.oscript` names token base AA `22F6NK23...`, while older live markets report `base_aa=A4EH5ZF5...`; repo HEAD is therefore newer than (some of) the deployed contracts. [H observed, consequence M]

## 4. Read API

- **Classification: official but undocumented, public, unauthenticated** (the site's own backend, MIT-licensed open source at github.com/byteball/prediction-markets-backend, `access-control-allow-origin: *`, no key). There is no API documentation page. [H]
- Docs URL: NOT FOUND (searched: prophet.ooo, README of backend/UI/AA repos, developer.obyte.org). The source of truth is `webserver/index.js` in the backend repo. AA field docs: https://prophet.ooo/prediction-markets.json, `/prediction-markets-tokenless.json`, `/prediction-factory.json` (HTTP 200, `application/json`; fixture saved). [H]
- Base URL: `https://prophet.ooo/api` (testnet `https://testnet.prophet.ooo/api`).
- Auth and limits: none required. Rate limit: NOT FOUND (searched: response headers, `webserver/index.js`; no rate-limit middleware in the Fastify app; Cloudflare sits in front, `cf-cache-status: DYNAMIC`). I paged 48 list pages plus 51 event pages at about 1 request per second with no throttling. Be polite: <=1 req/s.
- WebSocket: **Prophet has none.** Real-time data comes from the Obyte hub (`wss://obyte.org/bb`) by subscribing to AA responses; hub request names include `light/get_aa_state_vars`, `light/dry_run_aa`, `light/get_aas_by_base_aas`, `light/get_data_feed`. [H: `ocore/network.js` case labels; M for exact semantics; community HTTP wrapper `obyte-http-client` on npm is third-party, L]
- Key endpoints (all GET, H from `webserver/index.js` plus live calls):

| Endpoint | Purpose | Notes |
|---|---|---|
| `/api/markets/:page?type=all\|currency\|soccer\|misc[&championship=XX]` | Paged market list | **5 markets per page** (`limitMarketsOnPage=5`), returns `{data:[...], max_count}`; `max_count=238` on 2026-10-19 (35 currency, 202 soccer, 1 misc). Sorted: future-dated markets by reserve desc, then resumed-trading, then claiming. Includes `reserve`, `yes_price/no_price/draw_price`, `supply_*`, `coef`, `result`, `event_date`, `oracle`, `feed_name`, `candles` (24 hourly, yes-price only), `first_trade_at`. Full crawl = 48 requests. |
| `/api/market/:aa_address` | One market's params | Adds `eventText`, `marketUrl`; does NOT include live supplies/prices (use the list, or the hub state vars). |
| `/api/recent_events/:aa_address/:page` | Trade history | 5 events per page; `{data, count}`; event types `buy_by_type`, `trade`, `add_liquidity`, `claim_profit`; each row has `yes/no/draw_amount`, `reserve_amount`, `supply_*`, `*_price`, `coef`, `reserve`, `timestamp`, `trigger_address`. |
| `/api/daily_candles/:aa_address` | Hourly (first 30 days) or daily candles | open/close supplies, prices, reserve, coef. About 33 KB for a 59-candle market. |
| `/api/reserve_assets` | Supported reserve assets | |
| `/api/calendar/:sport/:championship/:page`, `/api/calendar/currency/:currency/:page` | Upcoming events with or without markets | not exercised |
| `/api/bookmaker_odds/:sport/:feed_name`, `/api/venue/:feed_name`, `/api/championships/:sport?`, `/api/popular_oracle_pairs`, `/api/first_trade_ts/:address`, `/api/dates/:address` | helpers | not exercised |

- Resolution fields: `result` (`yes\|no\|draw\|null`), `committed_at`, `event_date`, `waiting_period_length`, `oracle`, `feed_name`, `datafeed_value`, `comparison`.
- Quirks for an adapter: `reserve` is in smallest units (divide by `10^reserve_decimals`); `*_price` is in reserve units and is 0 once the market is resolved and supplies are redeemed; `yes_odds/no_odds` are third-party bookmaker odds scraped for the UI, not Prophet's own price.
- **Saved fixtures** (`docs/research/fixtures/prophet-obyte/`): `markets_all_page1.json`, `markets_currency_page1.json`, `market_token_OVW24JB2.json`, `market_tokenless_BPNK3UYY.json`, `recent_events_token_OVW24JB2_page1.json`, `recent_events_tokenless_BPNK3UYY_page1.json`, `daily_candles_OVW24JB2_first3.json` (trimmed), `reserve_assets.json`, `aa_doc_prediction-markets.json`, `defillama_prophet_summary.json`. All under 20 KB, public data only.

## 5. Trade path

- Trading is **a signed Obyte unit sent to the market AA address**: a `payment` of the reserve asset plus a `data` message, e.g. `{type:"yes"}` to spend the whole payment on YES, or `{yes_amount|no_amount|draw_amount: N}` to mint, `add_liquidity:1`, `commit:1`, `claim_profit:1`. For token markets, selling or claiming means sending the outcome tokens back to the AA; for tokenless markets, selling uses negative amounts from the sender's in-AA balance. `min_expected_amount` gives slippage protection on buy-by-type; `to` redirects the output address. [H: AA source and `prediction-markets*.json` field docs]
- Signing: Obyte-native wallet/key (the DAG has its own address and signature scheme, not EVM `secp256k1` transactions). Programmatic options are `ocore`/`headless-obyte` (Node) or `obyte.js` (light client over the hub WebSocket). [M: from npm/GitHub descriptions; exact signing details NOT FOUND in developer.obyte.org (searched: developer.obyte.org home)]. `dry_run_aa` on the hub lets a bot simulate a trigger before sending. [H for the existence of the request in ocore; M for use]
- No off-chain order API; no API key; the site "takes no custody of users' crypto assets" and "does not host or resolve any markets" (UI footer disclaimer). [H]

## 6. Reachable from a PayBox wallet?

**Partial for entry, no for exit: treat as no.** [M: reasoning over H facts]
- PayBox's chain catalog (this repo's `06-paybox-platform.md`, live `discover_tokens` 2026-10-19): Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB Chain, Avalanche, Robinhood, Arc, Hyperliquid. Obyte is not there; PayBox signs EVM transactions/typed data and Solana transactions only.
- The one EVM-to-Obyte path is the **Counterstake bridge** (Ethereum, BSC, Polygon to Obyte; per the SDK README). The Prophet UI itself lets a user pay a market from MetaMask: `transferEVM2Obyte` bridges USDC (optionally swapped to GBYTE by an Oswap forwarder AA) and forwards a `data` payload to the market AA, with `to` set to the user's Obyte address. [H: `entities/bridge/api/counterstake.ts`, `counterstake-sdk` README]. So a PayBox EVM wallet on Ethereum/BNB/Polygon could in principle fund a buy with an EVM contract call (token approval then bridge send), assistant reward about 1 percent plus swap fee, with minutes of latency.
- But positions are then held at an **Obyte address**; selling, adding liquidity or claiming needs an Obyte-key-signed unit, which PayBox cannot produce. A bot would need a separate Obyte wallet anyway, so the EVM leg adds nothing. Note `commit` is permissionless and could be triggered by anyone, but claiming is not.

## 7. Fees (who pays) - all stay in the pool

Defaults on 233 of 238 markets: `issue_fee=0.01`, `redeem_fee=0.02`, `arb_profit_tax=0.9`. Outliers: 2 markets with all zero, 1 with redeem 0.2, 1 with redeem 0.05, 1 with 0.01/0.01/0.01. Parameters are fixed at creation by the creator. [H: computed from full API crawl; formulas from `aa-lib.oscript`]
- Buy: `fee = ceil(reserve_in * issue_fee)`; plus **arb profit tax** per outcome `= |p_old - p_new| * amount / 2 * arb_profit_tax`. The UI describes this as a fee on the "implied arbitrageur profit... against other markets where the same event is traded". [H: UI string `forms.create.arb_profit_fee.desc`]
- Sell/redeem: `redeem_fee` (2 percent default) on gross payout, plus the same arb tax.
- All fees go to the reserve, raising `coef`; they accrue to holders of the winning token and liquidity providers (who hold all outcomes). No protocol or treasury cut found in the contracts read. [H]
- Network fee: 0.00001 GBYTE per trigger.
- **Practical cost for an arbitrageur:** my replication of the buy-by-type math (not verified on chain, M) in a freshly seeded 10 GBYTE 50/50 market gives total entry cost (issue fee plus arb tax, before price impact) of about 1.4 percent for a 0.1 GBYTE buy, 4.5 percent for 1 GBYTE and 10.6 percent for 5 GBYTE, plus a further 2 percent plus tax on exit. The venue is deliberately hostile to cross-venue arbitrage.

## 8. Resolution and dispute risk

- Each market names one `oracle` address, a `feed_name`, a comparison and a target value. After `event_date`, **anyone** may send `commit:1`; the AA reads `data_feed[[oracles=$oracle, feed_name=$feed_name]]` and sets `result` to `yes`, `draw` (if enabled and equals `datafeed_draw_value`) or `no`. Once set it is final: the commit branch is guarded by `!$result` and no dispute/appeal path exists in the code. [H: `agent.oscript`]
- Oracles in use (backend `conf.js`): sports oracle `TKT4UESIKTTRALRRLWS4SENSTJX6ODCW` (202 markets; the `byteball/sports-oracle` repo says data comes from football-data.org and mysportsfeeds.com); crypto/currency price oracles `JPQKPRI5FMTQRJF4ZZMYZYDQVRD55OTC` and `DXYWHSZ72ZDNDZ7WYZXKWBBH425C6WZN` (31 and 4 markets; pairs such as GBYTE_USD, BTC_USD, ETH_USD, BNB_USD, DOGE_USD, XAU_USD, XAG_USD). [H: config + API]. The UI warns "This market uses an oracle ... unknown to this website, trade with care", so arbitrary third-party oracles are allowed. [H]
- Risks: single-oracle trust with no dispute; "no-winner" or missing-feed cases resume trading after the waiting period instead of voiding; draw handling differs by sport (World Cup knockout games disallow draws via a UI rule); the AA code is under active change (solvency-check and reserve-check fixes in Aug 2026) and **no audit was found** (DefiLlama `audits: "0"`; NOT FOUND, searched: repo README, DefiLlama). [H for the facts, M for the inference]
- Rule ambiguity across venues: event text is generated from the feed name (`CLI_ESU_FLA_2026-10-16`: team abbreviations plus date), "who wins" means 90-minute or full-time result per the oracle's data source; not documented. NOT FOUND (searched: repo READMEs, UI strings).

## 9. Geo, ToS, automation

- No terms of service page found. The only legal text is the footer disclaimer: informational and educational only, no custody, "does not host or resolve any markets", users responsible for complying with applicable laws. No geo-block, KYC or jurisdiction list found. [H: UI `footer.tsx`; NOT FOUND for ToS/geo, searched: prophet.ooo, UI repo strings]
- `robots.txt`: `Disallow:` empty (all allowed). [H: `public/robots.txt` in UI repo; the live `/robots.txt` served the SPA shell]
- Automation is natural here (contracts are permissionless, API is open CORS `*`); no prohibition found. Hotjar tracking is embedded in the site HTML (irrelevant to API use).
- Legal exposure for the operator of an aggregator: sports betting on football from a US/UK/EU person via a permissionless AMM; no venue-level gating, so the compliance burden sits with the user. [M]

## 10. Liquidity (with dates)

- DefiLlama TVL **USD 2,667 on 2026-10-18** (peak USD 13,149 on 2023-02-16; about USD 965 in Sep 2025, about USD 2.5k since mid-2026). [H: `api.llama.fi/protocol/prophet`, fixture `defillama_prophet_summary.json`]. DefiLlama's TVL code path is `projects/prophet/index.js`; methodology is assets locked in the AAs.
- Cross-check from the Prophet API crawl (2026-10-19): sum of all market reserves = **517.4 GBYTE (about USD 2.6k) plus 0.053 USDC**, consistent with DefiLlama. [H]
  - **513.8 GBYTE of that is in already-resolved markets** (winners' unclaimed payouts and fee residue), i.e. not tradeable.
  - Markets with `result=null`: 3, all stale (events 2022-10-29/30 and 2023-09-17), totalling about 3.6 GBYTE (about USD 18).
  - **Markets with `event_date` in the future: 0.** Nothing is open for new bets today.
- Activity: 238 markets ever; 60 created in 2026; 51 markets had a first trade in 2026 with 225 on-chain events in total (86 buys, 43 add-liquidity, 51 claims in the first event page per market, median 4 events per market). Buy volume in 2026 about 63 GBYTE (about USD 310) from first-page data, concentrated in about 10 trigger addresses, one of which made 42 of 86 buys and seeded about 40 GBYTE, another seeded about 80 GBYTE (10 GBYTE per market, about USD 50). [H data, M interpretation; first-page-only sample, likely near complete for 4-event medians]
- Aggregate volume: NOT FOUND (searched: Prophet API, DefiLlama protocol JSON, aa-stats `/api/v1`, which returned `[]` for the factory).

## 11. Event categories and overlap with other venues

- Soccer (202 markets, 85 percent): World Cup (66), Champions League (34), Premier League (27), Bundesliga (12), Euro (12), plus La Liga, Serie A, Ligue 1, Copa Libertadores, Brazilian and Chinese leagues. Match-winner (1X2 style) is the only market type. This overlaps Polymarket/Kalshi/Azuro/Overtime-type soccer winner markets, joinable on team plus date via the `LEAGUE_HOME_AWAY_YYYY-MM-DD` feed name. [H counts, M overlap]
- Crypto and commodity price thresholds (35): BTC/ETH/BNB/DOGE/MATIC/BAT/GBYTE vs USD, XAU/XAG; one-off "price above X on date" with `>` comparisons, last event 2026-08-01. Overlaps Polymarket/Kalshi crypto price brackets in principle, but none are open. [H]
- Politics, macro, weather, culture: none. [H: oracle set]

## 12. Shared liquidity

Not shared. Each market is a standalone bonding-curve AA with its own reserve; no order routing to, or mirroring of, another venue's liquidity. (Counterstake and Oswap are only used for funding conversion.) So it is an independent price, but one with effectively no depth and a built-in anti-arbitrage tax. [H]

## 13. Adapter notes (only if built later; not recommended)

- Poll `/api/markets/{1..ceil(max_count/5)}?type=soccer` (about 41 requests for the full list; most are resolved, so stop at the first page whose markets are all `result != null` and `event_date < now`; ordering puts future-dated markets first).
- Normalise: tradeable only if `event_date - quiet_period > now` or (`now >= event_date + waiting_period_length` and `result == null`) and `result == null`. Implied probability per outcome `(price_i / coef)^2`; ignore markets with all supplies zero (price 0).
- Executable size: use `(reserve / 10^reserve_decimals) * usd_rate` and the contract formulas in `aa-lib.oscript` for slippage; budget 1 percent issue fee plus 0.9 arb tax factor.
- Settlement mapping: `result` yes/no/draw maps to team-1/team-2/draw for soccer.

## 14. Open questions

1. Is there any aggregated volume metric (hub scan of AA responses for the factory children)? Would need an Obyte full node or explorer; not attempted.
2. Does the sports oracle define "win" as 90 minutes or full time (extra time and penalties in knockout games)? Not documented.
3. Whether the deployed token base AA differs from the repo HEAD (`22F6NK23...` vs `A4EH5ZF5...`); matters only if anyone integrates execution.
4. Exact Counterstake chain list and current USDC bridge liquidity (SDK README says Ethereum, BSC, Polygon; counterstake.org page was not extractable).

## Sources

- https://prophet.ooo (HTML head: description, API preload links, `twitter:site=@ObyteOrg`), https://prophet.ooo/api/markets/1?type=all, `.../api/market/{aa}`, `.../api/recent_events/{aa}/1`, `.../api/daily_candles/{aa}`, `.../api/reserve_assets`, https://prophet.ooo/prediction-markets.json [H, fetched 2026-10-19]
- https://github.com/byteball/prediction-markets-aa (`factory.oscript`, `agent.oscript`, `agent-tokenless.oscript`, `aa-lib.oscript`, README) [H]
- https://github.com/byteball/prediction-markets-backend (`webserver/index.js`, controllers, `conf.js`, README, MIT) [H]
- https://github.com/byteball/prediction-markets-ui (`docs/architecture.md`, `public/prediction-*.json`, `src/entities/market/lib/*`, `src/entities/bridge/api/counterstake.ts`, `src/widgets/footer/ui/footer.tsx`, `src/shared/i18n/en-template.json`, `public/robots.txt`) [H]
- https://github.com/byteball/sports-oracle (README), https://github.com/byteball/counterstake-sdk (README), https://github.com/byteball/ocore (`network.js` request names), https://github.com/byteball/aa_stats (routes) [H]
- https://api.llama.fi/protocol/prophet (TVL, listedAt, methodology, audits) and https://defillama.com/protocol/prophet (web page returned 403 to WebFetch) [H via API]
- https://api.coingecko.com/api/v3/simple/price?ids=byteball,usd-coin&vs_currencies=usd (GBYTE USD 5.0, 2026-10-19) [M]
- https://developer.obyte.org/ (libraries only; no hub HTTP API or signing details) [H for absence]
- https://registry.npmjs.org/obyte-http-client (third-party HTTP wrapper, 0.0.2, 2024) [L]
- WebSearch (extended) results: https://github.com/byteball/prediction-markets-aa, https://zycrypto.com/obyte-launches-prophet-a-bonding-curve-based-prediction-market-platform/, https://blog.obyte.org/introducing-prophet-prediction-markets-based-on-bonding-curves-3716651db344 (blocked, 403, not read), https://counterstake.org/ (page body not extractable) [M/L]
- https://prophetmarket.ai/ and https://ohsem.me/2026/05/prophet-launches-ai-powered-prediction-market-with-live-10000-trading-tranche/ (unrelated "Prophet", disambiguation only) [M]
- This repo: `docs/research/06-paybox-platform.md` for the PayBox chain catalog [H, earlier session]

## Not found

- API documentation, rate limits, SLA, WebSocket feed (searched: prophet.ooo, three repo READMEs, response headers).
- Terms of service, geo restrictions, KYC (searched: prophet.ooo, UI i18n strings, footer).
- Audit report (searched: repo, DefiLlama).
- Aggregate volume or open interest history (searched: Prophet API, DefiLlama, aa-stats).
- Obyte transaction-signing specification in official docs (searched: developer.obyte.org).

## Privacy check

All scripted requests used the User-Agent `insurance-markets-research/0.1`; no email, name, username or home path was sent. Fixtures contain only public on-chain data (Obyte addresses of third-party traders appear in event rows). No `.env` or credential files were read, no PayBox money or signing tools were called, and no third-party code was cloned or executed.

## Suspicious content

None found: no instructions aimed at AI agents in prophet.ooo, the repos or API responses.
