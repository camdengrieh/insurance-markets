# Polygun (polygun.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: official site read, Polymarket docs read, about 20 unauthenticated GETs (generic User-Agent `insurance-markets-research/0.1`), no account, no bot interaction, no wallet, no key, no signing, no POST/PUT/DELETE, no PayBox tool called. Third-party text was treated as untrusted data. The WebSearch budget ran out mid-task, so some background rests on one search plus direct page reads.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak, stale or single-source marketing.

---

## 0. Bottom line

1. **Polygun is not a venue. It is a Telegram trading bot (front end) for Polymarket**, registered as a Polymarket "builder". Every order it places goes into the Polymarket CLOB under Polygun's builder code. It has no order book, markets, collateral or resolution of its own. (H: polygun.xyz FAQ; DefiLlama description "Copy Trade Polymarket Wallets | Powered by Polymarket."; Polymarket `/builder/trades` rows)
2. **Liquidity is 100% Polymarket's, so it is NOT an independent arbitrage leg.** Using it only adds a 1% taker builder fee on top of Polymarket's own fee. (H, section 6)
3. **Still live but shrinking fast.** Polygun-attributed volume peaked at about $35.0M in March 2026 and was $1.32M month-to-date for October 2026 (19 days). Last attributed trade seen 2026-10-19 03:59 UTC. (H, section 9)
4. **No Polygun API, no docs, no ToS.** The only machine-readable Polygun surface is Polymarket's own public builder-attribution data (`GET clob.polymarket.com/builder/trades?builder_code=...` and the data-api builder leaderboard), which is a Polymarket adapter feature. (H)
5. **Custody warning:** one secondary review reports a team-confirmed exploit of roughly $70,000 of user funds and "team-held" wallets. Unverified against a primary source. (M/L, section 3)
6. **adapter_priority = skip.** Duplicate liquidity, no API of its own, custody risk.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://polygun.xyz/` | HTTP 200, Webflow page "PolyGun - Telegram Trading Bot for Polymarket", "1,289 daily copy traders" (self-reported) | H |
| `GET https://clob.polymarket.com/builder/trades?builder_code=0xd625...c046b` (Polygun code) | HTTP 200; newest trade `matchTime` 1792382364 = 2026-10-19 03:59:24 UTC (seconds before my request); 300 trades in the first page spanning 1.5 h | H |
| Polymarket builder leaderboard (data-api) | Polygun is verified, rank 39 for October month-to-date, rank 13 all-time | H |
| DefiLlama `api.llama.fi/protocol/polygun` | id 7853, category Interface, chain Polygon, tag "Polymarket Builder", twitter `Polygun_`; fee data last point 2026-10-19, volume last point 2026-10-18 | H |
| Telegram group preview `t.me/s/polygun` | "Prediction Desk (PolyGun)", 25,819 members, 877 online; website "coming soon" | M (small-model page summary) |
| Site build date | Webflow asset id `69aa890a...` decodes to 2026-03-06 (my inference from the hex prefix) | M |

**still_live = true.** The brand "PolyGun/Polygun" is also used by unrelated GitHub repos (2013-2025 game and GunDB projects) and by look-alike sites (section 8); only polygun.xyz is linked from DefiLlama and from the on-chain builder profile.

---

## 2. Kind and market model

- **kind: broker-or-frontend** (Telegram bot + copy-trading layer over Polymarket). Features per site: browse markets, buy/sell, copy trading ("Automatically copy trades from profitable wallets in real time"), portfolio/PnL, "Smart Wallets" (most-copied wallets), limit orders, referral hub, PnL cards. (H: polygun.xyz)
- **Market model: inherited from Polymarket.** Binary (and neg-risk multi-outcome) markets on the Polymarket CLOB; outcomes are CTF tokens (`assetId` / token id, e.g. `4954094456...`), prices 0-1 in USD terms. Fixture rows show `outcome` ("Up", "Down", "Yes", "No", player or team names) and `outcomeIndex`. (H: fixture `clob_builder_trades_polygun_page1_sample_2026-10-19.json`)
- Polygun adds no market creation. Market ids to use in our matcher are Polymarket `conditionId` / token ids.

## 3. Chains and collateral

- Trading chain and settlement: **Polygon** (DefiLlama chain; Polymarket CLOB). Collateral on Polymarket V2 is **pUSD** (builder-fee docs example "1,000 pUSD taker buy"). (H: docs.polymarket.com/programs/builders/fees.md)
- Deposits: site says autobridge from **Polygon, Solana, Ethereum, BNB**. Bridge provider and route not stated. (H for the claim, NOT FOUND for the mechanism)
- Wallet: `/start` makes the bot generate a wallet; "You fully control your funds... wallet can also be exported at any time" (Polygun FAQ, L: marketing). Polymarket Academy (review "Updated August 2026") lists Polygun as "Team-held wallet", says "wallets are held by the developers", and "the team has confirmed a reported exploit that resulted in roughly $70,000 in user funds being taken" with Security score 0/10 (M/L: affiliate-style comparison that ranks a competitor first, exploit date, tx and refund status not given). A different Polymarket bot, Polycule, was reported hacked for about $230K in January 2026 (M: search snippet, not Polygun). I could not find a Polygun primary statement. Treat deposits as custodial-risk.
- Wallet type (EOA / Safe / Polymarket deposit wallet): NOT FOUND (searched: polygun.xyz, polymarket-academy, polygun.app).

## 4. Read API

| Item | Value | Tag |
|---|---|---|
| Official Polygun API | **None documented.** `polygun.xyz/docs`, `/api`, `/terms`, `/privacy`, `/llms.txt`, `/sitemap.xml` all 404; `docs.polygun.xyz` and `app.polygun.xyz` do not resolve | H |
| Undocumented host | `GET https://api.polygun.xyz/` -> 401 `{"error":{"code":"UNAUTHORIZED","message":"Missing or invalid API key"}}`. Exists, key-gated, no public docs. Not probed further (fixture `api_polygun_xyz_root_401_2026-10-19.json`) | H |
| Polygun GitHub | none found (searched `gh api search/repositories q=polygun`, user `polygun` is an unrelated 2013 account) | H |
| Market data for Polygun's markets | Use Polymarket: Gamma `https://gamma-api.polymarket.com`, CLOB `https://clob.polymarket.com` (`/book`, `/price`, `/midpoint`), Data API `https://data-api.polymarket.com`, docs https://docs.polymarket.com (llms.txt) | H |
| **Polygun-attributed trades (public)** | `GET https://clob.polymarket.com/builder/trades?builder_code=<bytes32>` params `id, market, asset_id, before, after, next_cursor`; page size 300, `next_cursor` is base64 offset (`MzAw` = 300; `LTE=` = end); I confirmed page 2 works. No auth (OpenAPI `security: []`; my GET returned 200). Row fields: `id, tradeType, takerOrderHash, market, assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt` | H |
| Builder leaderboard / volume | `GET data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY|WEEK|MONTH|ALL&limit=` (50 rows, rank is a string, calendar-bucket periods) and `/v1/builders/volume?timePeriod=MONTH|ALL` (despite the "daily" title it returned monthly buckets, 13 months). v2 counterparts `/v2/builders/leaderboard`, `/v2/builders/volume` documented | H |
| Polygun builder code | `0xd625c78659cda77fc5e1b2c2657ec4ecc9187ec82fbc4a2300337269332c046b` (public in the leaderboard response) | H |
| WebSocket | None from Polygun. Polymarket's own feeds apply (see the Polymarket spec) | H (absence on polygun.xyz) |
| Rate limits | Polymarket Cloudflare IP limits: CLOB general 9,000 req/10 s, ledger `/trades` etc. 900 req/10 s; `/builder/trades` has no separately documented limit (NOT FOUND). https://docs.polymarket.com/api-reference/rate-limits.md | H |

Real response shapes: see fixtures `docs/research/fixtures/polygun/` (list in section 14). `trades` rows are **taker-side only** in my sample (300 of 300 `tradeType: TAKER`), `builder` field is empty and `builderCode` carries the attribution. Rows expose the trader's wallet (`maker`, public on-chain) and a CLOB api-key owner uuid; I truncated both in the fixture.

## 5. Trade path and PayBox reachability

- **Polygun:** Telegram bot UI only; no programmatic order API, signing scheme or webhook is documented. The bot signs orders with its own (bot-generated, exportable) wallet. (H: site; NOT FOUND for any API)
- **PayBox EVM wallet via Polygun:** only by sending funds to a bot-generated deposit address, which hands custody to an unaudited Telegram bot (section 3). **paybox_reachable = no** for Polygun as a venue.
- **The same liquidity is reachable directly:** a PayBox EVM wallet can sign Polymarket CLOB orders itself (signed order struct with `builder` bytes32 field, `signatureType`, `timestamp`, pUSD on Polygon) - see the Polymarket spec. A builder code can be attached to our own orders (default fee 0 bps, max taker 100 bps, maker 50 bps; one rate change per 7 days) if we ever want attribution; builder profile is created on polymarket.com (account action, not done here). (H: programs/builders/fees.md, place-orders.md)

## 6. Fees

- **Polygun:** "PolyGun charges a 1% fee on each transaction, both buys and sells." (H, polygun.xyz FAQ.) It is implemented as a **Polymarket builder fee**: DefiLlama methodology "Builder fees received by Polygun from trades on Polymarket v2". Observed: `builderFee / sizeUsdc` = 0.0100 on 296 of 300 sampled taker trades (0.0096-0.0099 on the other four, rounding of small notionals). (H)
- **Formula:** `builder_fee = notional x builder_fee_rate_bps / 10000`, flat, taker cap 100 bps, maker cap 50 bps; paid by the user, additive to Polymarket's platform fee. (H: docs.polymarket.com/programs/builders/fees.md.) Polygun's maker-side rate (limit orders resting on the book) is not stated: NOT FOUND (searched: polygun.xyz, builder docs; docs say rates are "publicly queryable" but I found no endpoint).
- **Polymarket platform fee on top (taker only):** `fee = C x feeRate x p x (1 - p)`, rates Crypto 0.07, Sports 0.05, Finance/Politics/Tech/Mentions 0.04, Economics/Culture/Weather/Other 0.05, Geopolitics 0. (H: docs.polymarket.com/trading/fees.md.) Check on a fixture row: 625.125 shares at 0.04 on a sports market = 1.2002 platform + 0.25 builder = 1.4502, reported `feeUsdc` 1.45 (so `feeUsdc` includes the builder fee). (H, my arithmetic on first-hand data)
- A competitor page (polygun.app) claims "zero fees on-chain"; it is not the official site (section 8).
- Net for an arbitrage engine: trading via Polygun costs +1% of notional versus trading Polymarket directly. Polygun also earns a "referral" share model (site: "earn a share of their trading fees"). (H)

## 7. Resolution

Inherited from Polymarket: **UMA Optimistic Oracle** for event markets (proposal with bond about $750 pUSD, 2-hour challenge period, one re-proposal, then UMA DVM vote on a second dispute) and **Chainlink TWAP** for up/down markets. (H: https://docs.polymarket.com/concepts/resolution.md.) Dispute risk is Polymarket's; Polygun adds counterparty/custody risk, not resolution risk. Polygun's mix is mostly the short-horizon up/down markets (section 10).

## 8. Geo, ToS, automation

- Polygun ToS / privacy / acceptable use: NOT FOUND (searched: polygun.xyz /terms /tos /privacy 404, FAQ, Telegram group preview). No geo statement on the site.
- Polymarket rules bind the order flow: orders from blocked regions are rejected; OFAC jurisdictions fully blocked, a long "close-only" list that includes the **United States, United Kingdom, France, Germany, Singapore, Thailand, Australia** and others; check `GET https://polymarket.com/api/geoblock` (response echoes the caller's IP, do not store it). (H: https://docs.polymarket.com/api-reference/geoblock.md)
- Builder program warning: Polymarket may revoke builder fees or disable a builder code "for any reason", including "automated, self-referred, or other non-bona fide trading activity". (H: builders/fees.md.) Relevant if we ever attach our own code in automated flows.
- **Look-alike / impostor surface (do not use):** `polygun.app` ("independent affiliate interface", different fee claim), `polygunbot.com`, `crypto-deploy.github.io/PolyGun-copy`, Quicknode listing linking `t.me/Polygun_Bot` (official site links `t.me/PolyGunSniperBot`), `polymart.app/polygun`. Handles differ; any scripted use should pin the on-chain builder code, not a brand name. (H for the official links, M for the impostor inference)

## 9. Liquidity (Polygun-attributed flow, all of it Polymarket volume)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| All-time attributed volume | $119.7M, 10,065 active users (rank 13) | data-api `/v1/builders/leaderboard?timePeriod=ALL`, 2026-10-19 | H |
| Monthly series | Nov-25 $2k; Dec $0.42M; Jan-26 $5.98M; Feb $29.9M (rank 4); **Mar $35.0M (3,954 users, rank 4)**; Apr $18.3M; May $8.95M; Jun $9.15M; Jul $6.43M; Aug $2.57M; Sep $1.62M; **Oct MTD (19 days) $1.32M (478 users, rank 39)** | `/v1/builders/volume?timePeriod=MONTH`, 2026-10-19; fixture | H |
| Today so far / week so far | DAY $9.8k (25 users); WEEK $74k (115 users) | leaderboard, 2026-10-19 about 04:00 UTC | H |
| DefiLlama volume ("dexs") | 24h $25.6k (2026-10-18), 7d $205k, 30d $872k, all-time $4.1M (series starts 2026-07-05) | api.llama.fi/summary/dexs/polygun, 2026-10-19 | H |
| DefiLlama fees | 24h $281, 30d $8.6k, all-time $107k (series starts 2026-04-28) | api.llama.fi/summary/fees/polygun | H |
| TVL / OI | none (DefiLlama tvl empty; no own pool) | DefiLlama protocol | H |
| Sample rate | 300 trades = $2.8k notional in 1.5 h (about $45k/day if extrapolated from this sample) | my 600-trade pull, 01:00-04:00 UTC 2026-10-19 | H |

Volume sources do not reconcile (DefiLlama 30d $872k versus Polymarket MTD $1.32M; about 2x spread). Decline from peak is about 96% (Mar to Oct run-rate). Treat all figures as order-of-magnitude.

## 10. Event categories and overlap

- Because it is Polymarket, it can route any Polymarket market (sports, politics, crypto, macro, weather). Actual flow in my sample (600 taker trades, 88 markets, $4.7k notional, 01:00-04:00 UTC 2026-10-19, resolved via Gamma `condition_ids`): **95.6% of notional in crypto short-horizon "Up or Down" markets** (BTC, XRP... 5-minute and hourly), 2.9% other (SpaceX market cap range, Venezuela leader, US-Iran ceasefire, weather), 1.5% sports (tennis, football, NFL). One time-of-day sample; biased to US night. (H data, M for generalisation)
- Overlap with other venues: same as Polymarket's own overlap (see the Polymarket spec); Polygun contributes no extra price discovery.

## 11. Shared liquidity

**Shares 100% of liquidity with Polymarket (global, pUSD/Polygon CLOB).** Every Polygun trade is a Polymarket CLOB match with builder code `0xd625...c046b` in the signed order, emitted in `OrderFilled` events. Do not model Polygun as a separate price source or an arbitrage leg. (H)

## 12. Possible use in our system (not an adapter)

- Optional signal in the Polymarket adapter: poll `/builder/trades` for Polygun (or any builder) to tag retail copy-trade flow. Low value: mostly 5-minute crypto up/down, taker-only rows, tiny sizes.
- "Smart Wallets" / most-copied wallet rankings exist only inside the bot (NOT FOUND publicly). Wallet-level copy signals can instead be built from Polymarket's public Data API activity feeds.

## 13. Priority

**skip.** Reasons: not a venue (duplicate Polymarket liquidity), no Polygun API/docs/ToS, 1% extra taker fee, reported custody exploit, volume down about 96% from peak.

## 14. Fixtures (`docs/research/fixtures/polygun/`)

- `clob_builder_trades_polygun_page1_sample_2026-10-19.json` - 4 of 300 rows of `/builder/trades`, trader wallet and owner id truncated.
- `polymarket_data-api_builders_leaderboard_polygun_rows_2026-10-19.json` - Polygun row for DAY/WEEK/MONTH/ALL.
- `polymarket_data-api_builders_volume_polygun_monthly_2026-10-19.json` - 12 monthly buckets.
- `defillama_polygun_protocol_dexs_fees_2026-10-19.json` - protocol metadata and dexs/fees summaries.
- `api_polygun_xyz_root_401_2026-10-19.json` - the 401 body from the undocumented API host.

## 15. Open questions

1. Polygun maker-side builder fee rate and wallet type (EOA, Safe, deposit wallet) - not public.
2. Date, size, cause and refund status of the reported $70k exploit (only a single affiliate-style source).
3. Whether `api.polygun.xyz` is a partner/analytics API and who it is for; whether polygun.app / polygunbot.com are affiliates or impostors.
4. Whether `/builder/trades` stays unauthenticated (older Polymarket builder endpoints needed builder API keys).
5. Reconcile DefiLlama and Polymarket volume figures.

## Sources

- https://polygun.xyz/ (fetched raw HTML and text; H for what the site claims, L as evidence of facts). Linked: https://t.me/PolyGunSniperBot, https://t.me/polygun, https://t.me/predictiondesknews, https://x.com/Polygun_ (WebFetch returned HTTP 402 with no payment terms visible; stopped).
- https://defillama.com/protocol/polygun (403 to WebFetch) -> https://api.llama.fi/protocol/polygun, https://api.llama.fi/summary/dexs/polygun, https://api.llama.fi/summary/fees/polygun (H).
- https://docs.polymarket.com/llms.txt, /programs/builders/fees.md, /programs/builders/overview.md, /programs/builders/tiers.md, /api-reference/trade/get-builder-trades.md, /api-reference/builders/get-daily-builder-volume-time-series.md, /api-reference/rate-limits.md, /api-reference/geoblock.md, /concepts/resolution.md, /trading/fees.md, /trading/place-orders.md (H).
- https://clob.polymarket.com/builder/trades?builder_code=... , https://data-api.polymarket.com/v1/builders/leaderboard , /v1/builders/volume , https://gamma-api.polymarket.com/markets?condition_ids=... , https://api.polygun.xyz/ , https://polymarket.com/api/geoblock (live GETs, H).
- https://polymarketacademy.com/guides/best-polymarket-copy-trading-telegram-bots (Updated August 2026; M/L, ranks Kreo first and has "Try" affiliate-style links).
- https://www.quicknode.com/builders-guide/tools/polygun-by-polygun (undated listing, L; lists a different bot handle).
- https://polygun.app/ (summary only, look-alike, L); https://t.me/s/polygun and https://t.me/PolyGunSniperBot (M, small-model summaries).
- https://polymarketanalytics.com/copy-trade (Vercel bot checkpoint HTTP 429, not bypassed; relation to Polygun unverified).
- Search results (single WebSearch; later searches blocked by the session budget): telegramtrading.net review not readable (fetched homepage only), kucoin.com news on the Polycule hack (snippet only).
