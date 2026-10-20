# Almanac (almanac.market) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to almanac.market, api.almanac.market, Polymarket public hosts; `gh api` raw reads; WebSearch; reading the site's own public JS bundle. No account, wallet, key, signature, POST or PayBox call. No third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale (>6 months).
Third-party text (site bundle, READMEs, API payloads, social posts) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/almanac/` (6 files, each < 4 KB).
Note: an earlier, longer pass on the same venue exists at `docs/research/venues/almanac-market.md` (different slug). This file re-verifies its key claims independently on 2026-10-19 and adds the Corvus Labs successor repo (section 1). Where they differ, this file is newer.

## 0. Verdict

**adapter_priority: skip** (as an independent venue). Almanac is a Polymarket front end ("builder"), not a market venue.

1. All markets are Polymarket markets: Almanac's `/api/markets/search` returns Polymarket Gamma market id `2044124` with CLOB token ids identical to `gamma-api.polymarket.com/markets/2044124` (H, fixture `markets_search_nba_trimmed.json`). Orders are Polymarket-signed orders carrying Almanac's builder code and are settled on Polymarket's CLOB. Liquidity is 100% shared with Polymarket, so it is never an independent arbitrage leg.
2. Live and small: roughly $0.3M/day own-reported volume, cumulative about $21M own-reported / about $39M Polymarket-attributed (two builder codes, section 10). Flow is boosted by Bittensor SN41 token incentives (traders are paid for volume/score), so it is not clean informed flow (M).
3. Read API is keyless but undocumented and mostly a mirror of Polymarket Gamma. Only unique data: "smart-money" overlay `/api/v1/poly-traders*` (per-wallet scores, per-market trader signals), derived from Polymarket public trade data. The adapter should read Polymarket directly. ToS forbids automated access without written consent.
4. Trading through Almanac only adds cost (+1% on buys) and counterparty risk (Almanac stores your Polymarket L2 API credentials) versus trading Polymarket directly.

Possible optional use: P2-style signal feed (smart-money overlay) - not recommended; rebuild from Polymarket data-api instead.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `https://almanac.market/` | HTTP 200, `last-modified: Thu, 15 Oct 2026`, Vercel; marketing + docs SPA, title "Almanac - Accurate Before It's Obvious". Terminal at `beta.almanac.market` (noscript text on landing page points there) | H |
| `GET https://api.almanac.market/health` (2026-10-19 07:09Z) | `status: healthy`, uptime 408,027 s (4.7 d), version 1.0.0, database+redis healthy, websocket connected, 3 connections, 177 subscriptions (fixture `health.json`) | H |
| `GET /api/v1/leaderboard/stats` (2026-10-19 07:09Z) | totalTraders 338, totalPredictions 128,053, totalVolume $21,040,211, totalRewards $488,250, totalOpenInterest $7,589 | H |
| `GET /api/v1/leaderboard/stats/volume` | daily series from 2025-12-02 (first nonzero $214) onward | H |
| Polymarket builder leaderboard (`data-api.polymarket.com/v1/builders/leaderboard`) | `almanac.market` verified: ALL rank 32 $30.19M (441 users), MONTH rank 17 $6.33M (123), WEEK rank 24 $0.297M (63). `almanac.market.2` verified: ALL rank 68 $8.84M (152), MONTH rank 23 $4.83M (115), WEEK rank 26 $0.265M (58) | H |
| `github.com/AlmanacT/almanacT` ("Corvus Labs presents"; created 2026-10-11, last push 2026-10-14, not archived, MIT) | New repo for "Almanac" validator stack: IM1 Almanac Market (`almanac.market` terminal, miners trade on `beta.almanac.market`, 1% fee on every buy goes to the daily reward pool) and IM2 Almanac Forecasting (agent forecasting, portal at `portal.almnc.ai`). Mainnet netuid 41, testnet 172. Says SN41 Almanac subnet continues | H |
| `github.com/sportstensor/sn41` | archived, last push 2026-07-20 (superseded by the repo above, M) | H |
| Press / social (WebSearch) | Almanac Beta launched ~2025-12-01 as front end of Bittensor subnet 41 (Sportstensor); "Up to $100,000 weekly rewards" claim in a late-2025 post; subnetalpha.ai says Sportstensor and Almanac are the same subnet, rebranded late 2025 | M/L (2025 sources) |

Conclusion: **still live as of 2026-10-19 (H)**. The previous concern that SN41 emissions might have ended is largely resolved by the new AlmanacT repo dated October 2026 and `/api/v1/prices` returning a current epoch budget (about 4,871 alpha, alpha about $1.83, 2026-10-19; fixture `prices.json`) (M that emissions are still paid out).

## 2. What it is

- **Kind**: broker / front end plus incentive layer on Polymarket. Docs text (site bundle): Almanac "is part of the Polymarket Builders Program and uses Polymarket's official API with full attribution. Polymarket collects Almanac's 1% fee on trades placed through the terminal. All trades execute at identical prices to Polymarket and count as Polymarket activity." (H, `https://almanac.market/assets/index-w14a29x1.js`)
- **Market model**: same as Polymarket: binary and neg-risk categorical outcome tokens (ERC-1155 CTF positions), central limit order book, order types FOK/FAK/GTC. No Almanac-native market, contract or oracle (docs: no Almanac contract; M from absence).
- **Tokenisation**: `clob_token_ids` are Polymarket's YES/NO token ids (fixture). `neg_risk` flag present per market (H).
- **Two builder codes** (H, fixture `trading_config.json`): BUY code `0x1962...bfbe0` (leaderboard name `almanac.market`) and SELL code `0x8309...3b78` (`almanac.market.2`, described as "zero-fee profile").
- Operator/company identity, funding: NOT FOUND (searched: landing page, docs bundle, AlmanacT/sn41 READMEs, WebSearch). Repo header says "Corvus Labs presents" (H) - the operating team appears to be Corvus Labs (M). ToS governing law Delaware (per the earlier pass, H there).

## 3. Chains and collateral

- Polygon (137), via Polymarket. Collateral per Almanac docs: USDC.e deposited to the user's Polymarket deposit wallet (docs text, H). Polymarket V2 collateral may be pUSD - see `docs/research/08-venues-polymarket-kalshi.md`; docs wording may lag (M, unresolved).
- `trading/config`: `signatureTypes {gnosis_safe: 2, deposit: 3}`, `safeMigration {enabled: true, cutoffDate: 2026-08-17, tradingBlockedForSafes: true}` - i.e. only Polymarket deposit-wallet (sig type 3) accounts can trade now (H).
- Non-custodial per docs; Almanac stores the user's encrypted Polymarket L2 API credentials to place orders (H docs claim; accuracy M).

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official docs | User docs only at `https://almanac.market/docs` (SPA). No API reference / OpenAPI / SDK found | H |
| Base URL | `https://api.almanac.market` (routes under `/api/...`, `/health`) | H |
| Auth | Public read routes need no key. Trading/account routes need session headers (earlier pass: 401 `MISSING_SESSION_HEADERS`) | H/M |
| Rate limit | `RateLimit-Policy: 3000;w=300` on most routes; `300;w=60` on `/api/v1/trading/config` (response headers, 2026-10-19) | H |
| WebSocket | Server reports a WS (177 subscriptions) but no public Almanac WS URL found. Live prices should come from Polymarket (`wss://ws-subscriptions-clob.polymarket.com/ws/market`) | M |

Confirmed keyless GETs (200, 2026-10-19):

| Route | Shape | Fixture |
|---|---|---|
| `/health` | `{status,timestamp,uptime,version,services{database,redis},websocket{connected,connections,subscriptions}}` | `health.json` |
| `/api/v1/trading/config` | `{success,data{builderCodes{buy,sell},builderCodeRules,signatureTypes,safeMigration},timestamp}` | `trading_config.json` |
| `/api/v1/leaderboard/stats` | `{success,data{totalTraders,totalPredictions,totalVolume,totalRewards,totalOpenInterest}}` | `leaderboard_stats.json` |
| `/api/v1/prices` | `{tao_price_usd,alpha_price_usd,current_epoch_budget,prices_updated_at}` | `prices.json` |
| `/api/markets/search?q=nba` | `{success,data[event{id,title,slug,description,total_volume,total_volume_24hr,tags,markets[{id,question,outcomes,outcome_prices(null in sample),clob_token_ids,enable_order_book,accepting_orders,neg_risk,liquidity,volume,end_date,uma_end_date,taker_fee_bps}]}],count}`. Event/market ids equal Polymarket Gamma ids | `markets_search_nba_trimmed.json` |
| `/api/v1/stats` (148 KB, not saved) | totals + daily series (volume, fees, trades, traders, rewards) | - |
| `/api/v1/leaderboard/stats/volume` | `{success,data[{date,timestamp,value,dailyValue}]}` cumulative daily volume | - |
| `/api/v1/poly-traders[/stats\|/markets]` (earlier pass) | per-wallet quality/conviction/bot classification; per-market trader signals | earlier fixtures in `fixtures/almanac-market/` |

Independent cross-check without Almanac (H, earlier pass): Polymarket `GET clob.polymarket.com/builder/trades?builder_code=<code>` returns per-fill builder fee for each Almanac order.

NOT FOUND: prices/orderbook endpoints on Almanac (none needed; use Polymarket CLOB `/book`, `/prices`), trade history endpoint, resolution endpoint of its own (searched: bundle route strings, API probes).

## 5. Trade path

Programmatic path exists but is a relay: user signs a standard Polymarket V2 order (EIP-712, `builder` field = Almanac buy/sell code per `builderCodeRules`), session created via EIP-191 personal_sign of a fixed message plus Polymarket L2 API creds, then `POST /api/v1/trading/orders` with `x-session-id` (source: archived sportstensor/sn41 `api_trading.py`, third-party, read not run; H on shape, M on current behaviour; AlmanacT README confirms the client "can generate Polymarket API credentials, open Almanac trading sessions, search markets, place signed CLOB orders", H). Same order can be sent straight to `clob.polymarket.com`, so Almanac adds nothing. Not exercised.

## 6. PayBox reachability

**partial / not worth it.** Trading = Polymarket on Polygon: needs `personal_sign`, EIP-712 ClobAuth and EIP-712 order signed for a deposit-wallet (sig type 3, ERC-1271-style). PayBox `request_wallet_sign` supports message/typedData intents (per `docs/research/06-paybox-platform.md`); Polygon support and sig-type-3 acceptance untested (see `docs/research/08-venues-polymarket-kalshi.md`). No transaction proposal is needed for trading itself; deposit-wallet deploy and approvals are on-chain. If PayBox trades Polymarket it should do so directly, not via Almanac.

## 7. Fees

- Almanac: flat 1% on BUY orders, collected by Polymarket as a builder taker fee (no Almanac contract). SELLs use the zero-fee builder code (H docs + `trading/config` "zero-fee profile"). Builder fee = notional x bps / 10000, added on top of Polymarket's platform fee, paid by the user (Polymarket builder docs, H per earlier pass: docs.polymarket.com/programs/builders/fees).
- Own stats (earlier pass): lifetime fees about 1.02% of volume (M here, not recomputed).
- Polymarket platform fee: per-market taker fee (`taker_fee_bps` field is null in the sample); see Polymarket note.
- For the scanner: any Almanac buy leg costs about +1% versus direct Polymarket.

## 8. Resolution and dispute risk

Identical to Polymarket (UMA Optimistic Oracle for event markets, Chainlink for price series; challenge window and DVM escalation; possible 50/50). Market text in the sample says resolution "primary resolution source ... official information from the NBA ..." (H, fixture). Almanac adds no oracle layer. Additional risk: Almanac API/front end outage, builder-code revocation by Polymarket, and Almanac holding L2 API creds.

## 9. Geo, ToS, automation

- ToS (beta bundle, "Last Updated: 5 November 2025" = **L/stale**, from earlier pass): 18+, personal non-commercial licence, no access "via automated means (e.g., bots or scrapers) without prior written consent", Delaware law (H there, not re-read this session).
- The AlmanacT README says Market miners may trade by "manual, scripted, or automated strategies" (H), so trading automation is tolerated for registered miners; scraping the API without consent is still barred by the ToS text. Tension unresolved.
- Geo: no Almanac-specific restriction list found (NOT FOUND, searched: docs bundle search for restricted/prohibited jurisdiction and geoblock strings returned nothing relevant, this session). Polymarket's geoblock applies to order placement.

## 10. Liquidity (sources, dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Own cumulative volume | $21.04M | `/api/v1/leaderboard/stats`, 2026-10-19 | H |
| Polymarket-attributed ALL | $30.19M (`almanac.market`) + $8.84M (`almanac.market.2`) = about $39.0M | Polymarket builder leaderboard, 2026-10-19 | H |
| Polymarket-attributed MONTH | $6.33M + $4.83M | same | H |
| Polymarket-attributed WEEK | $0.297M + $0.265M | same | H |
| Open interest | $7,589 | `/api/v1/leaderboard/stats`, 2026-10-19 | H |
| Traders | 338 (own) ; 441 + 152 builder-attributed users (overlap unknown) | same | H |
| Rewards paid (cumulative) | $488K | `/api/v1/leaderboard/stats` | H |

Caveat: Polymarket's builder totals (sum about $39M) exceed Almanac's own $21M; sells are attributed to the `.2` code and windows differ, so numbers are order-of-magnitude (M). Recent run-rate about $0.3M/day to $1M/day (WEEK $0.56M combined). Because rewards are paid per volume, volume is likely inflated by incentive farming (M, inference).

## 11. Category overlap and shared liquidity

- Categories: Polymarket's catalogue, with sports largest (NBA, NHL, NFL, soccer, tennis), politics, crypto (docs, H). All overlap with Kalshi/others exactly as Polymarket does.
- **Shares liquidity with Polymarket: yes, 100%** (same CLOB, same token ids, same prices). Not an independent arbitrage leg. Same pattern as other Polymarket builders.

## 12. Usefulness to the project

- Aggregator venue adapter: no - read Polymarket directly.
- Signal source: `/api/v1/poly-traders/markets` smart-money and bot classification is the only unique data; undocumented, Almanac-controlled scoring, ToS prohibits automated access. Rebuild from `data-api.polymarket.com` if wanted.
- Optional knowledge: Polymarket's builder leaderboard shows Almanac as roughly 1-2% of builder volume; builder code `builder` field is part of V2 order structure.

## Open questions

1. Are SN41 token emissions still paid at scale (new Corvus Labs repo is a good sign; no emissions figure fetched)?
2. Does Almanac expose a public WebSocket (177 subscriptions server-side)?
3. Why Polymarket builder totals exceed Almanac's own volume (sell-code attribution, window definitions).
4. USDC.e vs pUSD collateral wording.
5. Whether the ToS written-consent clause applies to read-only keyless routes.

## Not found

- Official API reference / OpenAPI / SDK; prices, orderbook, trades or resolution endpoints of its own; geo restriction list; company registration details; audits; any Almanac smart contract; public WebSocket URL.

## Sources

1. https://almanac.market/ (landing, headers, noscript text) - H
2. https://almanac.market/assets/index-w14a29x1.js (docs text: builder program, 1% fee, epochs) - H
3. https://api.almanac.market/health ; /api/v1/trading/config ; /api/v1/leaderboard/stats ; /api/v1/leaderboard/stats/volume ; /api/v1/prices ; /api/v1/stats ; /api/markets/search?q=nba (GET 2026-10-19) - H
4. https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL|MONTH|WEEK (also offset=50) - H
5. https://gamma-api.polymarket.com/markets/2044124 (token ids identical to Almanac's) - H
6. https://github.com/AlmanacT/almanacT (README via `gh api`; created 2026-10-11) - H
7. https://github.com/sportstensor/sn41 (archived 2026-07-20) - H
8. https://subnetalpha.ai/subnet/almanac/ - M ; WebSearch results referencing X posts (late 2025), taopill.ai, sportstensor.io - L/M (2025)
9. Earlier note in this repo: `docs/research/venues/almanac-market.md` (ToS, trade-path details, fee stats, poly-traders shapes) - H/M as tagged there
10. Local: `docs/research/08-venues-polymarket-kalshi.md`, `docs/research/06-paybox-platform.md`

## Privacy / safety log

- All scripted requests used `User-Agent: insurance-markets-research/0.1`; no email, name, username or home path in any request or search query. Fixtures scanned for "@" and the user's name: no hits.
- No wallet addresses of the user recorded. Builder codes and market ids are public venue identifiers.
- No instructions aimed at AI agents were found in fetched pages, READMEs or payloads.
