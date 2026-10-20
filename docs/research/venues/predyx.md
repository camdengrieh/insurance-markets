# Predyx (beta.predyx.com): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: official site, official GitBook docs, the site's own public JS bundles (read as text, never executed), a handful of unauthenticated GETs to the site's own JSON API, one Coinbase spot-price GET. Nothing was signed, posted, paid, registered or connected. Generic User-Agent `insurance-markets-research/0.1` only. The WebSearch budget ran out after one query, so third-party coverage is thin.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited), **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" = read through the WebFetch summariser, not raw.

## Verdict

**adapter_priority: skip** (trading). At most a **P2 read-only signal feed** if someone wants it cheaply, but the prices come from tiny pools and are not informative.

- Live and active, but **tiny**: roughly **$27K** of volume across the 273 open markets and **$4.7K** of total LMSR pool liquidity (section 9). One order of about $82 moves a typical binary market from 8% to 44% (section 9). [H data, M arithmetic]
- **No official API.** The docs "API Documentation" page says only "Will be there soon!". [H, https://docs.predyx.com/api-reference/readme.md] A public unauthenticated JSON REST API does exist, but it is the website's own undocumented backend (section 4).
- **Trading is custodial, Lightning-only, behind login + Cloudflare Turnstile.** An EVM/Solana wallet in PayBox cannot reach it (section 5, 6).
- **Creator-resolved** user-generated markets, no dispute process, sloppy rule text on its largest markets (section 8).
- Overlap with other venues exists (BTC price thresholds, Super Bowl, MLB, NFL/UFC games, Brazil election), which is the only reason it is not a flat "not worth reading".

Revisit trigger: docs.predyx.com "API Reference" page gets real content, or `statistics.totalSats` from `/api/markets` grows by 10x or more.

## 1. Is it still live? Yes (H)

- https://beta.predyx.com/ returns HTTP 200 (Cloudflare, Nuxt SSR), `https://predyx.com/` 301-redirects to it. Footer "(c) 2026 Predyx". Still branded "beta" (hostname `beta.`). [H, curl 2026-10-19]
- Fresh activity: market slugs embed a creation unix timestamp; the newest open market (a UFC 333 fight) was created 2026-10-18, and open markets show 15 to 32 creations per month from 2025-08 through 2026-10. Latest price point in the API was 2026-10-19 02:00 UTC. [H, `/api/markets` fixture]
- Stacker News launch post is dated 2 Jan 2025 and says the site was already on `beta.predyx.com` then, so it has been in beta for about 21 months. The operator signs as `@mega_dreamer`, who is also the creator of the biggest live markets (Super Bowl, BTC 120K). Operator claims Delaware incorporation. [M, https://stacker.news/items/833261, fetch-summarised]
- Docs site https://docs.predyx.com is live (GitBook) but half of it is unedited GitBook template text (see section 11).
- Brand-confusion warning: unrelated "PredX" (SEI network, New York) exists; a "Predyx clone script" marketing blog (2026-03-30) is not evidence about the platform. [M, search snippet]

## 2. Kind and market model

- **kind: centralised, custodial-style prediction market with a Bitcoin Lightning front end** (not on-chain, no smart contracts, no tokenised outcomes). [H, docs + JS]
- **Outcome shares are rows in the operator's database**, priced 0 to 1 sat, paying 1 sat per winning share. "Each outcome share is priced between 0 and 1 sat... shares representing the correct outcome pay out 1 Satoshi for each corresponding share." [H, https://docs.predyx.com/basics/what-is-predyx.md]
- **Three pricing modes, chosen at creation** (UI strings in the site bundle): `LMSR` (automated curve, no order book), `Hybrid` (LMSR plus limit-order book), `CLOB` (pure order book, "CLOB markets cannot switch later"). [H, https://beta.predyx.com/_nuxt/BB1fbENY.js English locale strings]
- **What is actually deployed (2026-10-19, `/api/markets?openClose=open`, all 273 open markets):** 270 are `priceType: "LMSR"`, 3 are `priceType: "CLOB"` (all BTC "hits X before Y" markets with 1.4K to 4.3K sats volume and 0 liquidity), and **`clobHybridEnabled` is false on all 273**. So in practice this is an LMSR AMM venue; the docs' "Hybrid CLOB" order book (limit, stop-limit, stop-market, Basic/Pro toggle) is not enabled on any open market. [H, fixture `markets-list-light-sample.json`; counts from my own aggregation of the 3 pages, M]
- **Market shapes:** `type: "DOUBLE"` (Yes/No; 195 open) and `type: "MULTIPLE"` (75 open). Docs: "Binary markets -> Yes / No; Multiple choice markets -> Several possible outcomes". Scalar: not offered (`NOT FOUND`). [H]
- **Multi-outcome oddity (important for any price mapping):** a MULTIPLE market such as "Super Bowl Winner 2027?" has 64 outcomes named `<Team>/YES` and `<Team>/NO` inside ONE LMSR softmax. Sum of the 32 YES prices is **0.82** and the 32 NO prices sum to **0.18**; they are not complements. A naive "YES price = probability of that team winning" therefore does not sum to 1 and needs normalisation or a check against the UI before use. [H computed from fixture `market-detail-by-slug-sample.json` source data; interpretation M]
- **Price formula (verified by reproduction):** `price_i = exp(q_i / b) / sum_j exp(q_j / b)` where `q_i` = `outcome[i].share` and `b` = market `liquiditedSats`. This reproduces the site's displayed odds exactly for the Super Bowl market (e.g. Rams/YES 0.0788, Bills/YES 0.0979) and the BTC 120K market (Yes 0.0764 vs chart 0.0763). Creation docs state "Currently Predyx uses LMSR ... creators need to provide a pre market liquidity starting as low as 2000 Sats." [H data; docs https://docs.predyx.com/markets/how-to-create-markets-on-predyx.md]
- `negRiskEnabled` exists as a flag (false everywhere) and there are `/trades/negrisk` and `/trades/redeem` endpoints for pair merge/redeem, so a neg-risk style conversion is built but unused. [H JS, M meaning]
- Markets are **permissionless and user-created**; 273 open markets by dozens of creators, the platform's own accounts (`predyxmarketing` 43, `team_predyx` 11) and a few power creators. [H]

## 3. Chains and collateral

- **No blockchain chain in the EVM/Solana sense.** Collateral and settlement unit = **satoshis over the Bitcoin Lightning Network**. Deposits via Lightning invoice only: "Predyx only accepts deposits via the Bitcoin Lightning Network." [H, https://docs.predyx.com/basics/funding-your-predyx-wallet.md]
- Login: email + password, Google, or Lightning wallet (LNURL-auth style "linking public keys"). [H, https://docs.predyx.com/basics/sign-in-and-sign-up.md; JS routes]
- Account balances are held in sats on the operator's ledger (`wallet.balance` socket event, `/trades/withdraw`, "settlement outbox" admin strings). Docs pages claim "No deposits, no custodial balances" (first-trade and creator pages) which **contradicts** the shipped UI/JS and the "Funding Your Predyx Wallet" page. Treat as **custodial** (M, but strongly supported by the code). [H docs and JS; conclusion M]
- Limits from the public settings endpoint: deposit 100 to 10,000,000 sats; withdraw 10 to 10,000,000 sats; **buy stake 100 to 500,000 sats per order** (about $0.08 to $412); min buy shares 100; min sell shares 1; max shares 500,000. [H, fixture `trades-site-settings-limits.json`, `GET /api/trades/site-settings/limits`]

## 4. Read API

**Official/documented: none.** Docs "API Reference" page text: "API Documentation / Will be there soon!" [H, https://docs.predyx.com/api-reference/readme.md; llms-full.txt]. The changelog page is untouched GitBook template text dated 2025-11/12. [H]

**Undocumented but public and unauthenticated: the website's own backend** (same origin, `apiBase: "/api"` in the page's public runtime config). I confirmed the following with plain GETs (about 20 requests total, one-off, no auth, no cookies sent). Classification: **unofficial-only**; no terms grant API/automation rights, no versioning, no stability promise, and it sits behind Cloudflare (Turnstile is used on sign-in forms). [H]

Base URL: `https://beta.predyx.com/api`

| Purpose | Endpoint | Auth | Verified |
|---|---|---|---|
| Market list + platform stats | `GET /markets?openClose=open&sorting=TRENDING&itemPerPage=100&page=N&light=true` (also `openClose=closed`, `openClose=RESOLVED`, `search=`, `categorySlug=`, `type=`, `minVolume=`) | none | yes. `itemPerPage` is capped at 100 (asked 300, got 100). 273 open markets = 3 pages. Resolved listing reports 1,288 markets. |
| One market by slug | `GET /markets/slug/{slug}?disabledOutcomes=true` | none | yes |
| Price history | `GET /prices/price-lines?contractId={market _id}&period=ALL&resolved=false` | none | yes. Shape `{e:"price.lines", t, d:{p:[{o:outcomeTitle, t:bucketUnix, v:price, k:{o,h,l,c}}]}}` |
| Trading limits | `GET /trades/site-settings/limits` | none | yes |
| Geo check | `GET /authentication/geo-status` -> `{blocked, country, name, imageUrl}` | none | yes (response reflects caller IP; not saved) |
| Category list, search | `GET /markets/categories`, `GET /markets/search?query=` | none | from JS only |
| Resolution history | `GET /resolutions/marketId?marketId=` | **403 anonymous** | tested, forbidden |
| Order book / tape / holders / live prices | **Socket.IO** at `wss://beta.predyx.com/price-socket/socket.io` (`transports:["websocket"]`, `withCredentials`) with events `market.subscribe`, `market.state`, `market.prices`, `price.snapshot`, `price.changes`, `price.quote` / `quote.get`, `orders.join` / `orders.init` / `orders.update`, `book.add` / `book.update` / `book.remove`, `scores.*` | unknown (cookie used when logged in) | **not connected** (names read from the bundle only). A separate `/notification-socket/socket.io` carries user notifications. No REST order-book endpoint was found in the bundle. |
| Own orders/portfolio | `/trades/orders/my`, `/orders/history`, `/transactions`, `/portfolio` | cookie session + `x-user-id` | JS only |

Response shape of `/markets` (H, fixture `markets-list-light-sample.json`): top level `{markets[], eventCount, pageCount, statistics:{totalMarketCount, totalSats, totalTradeCount, maxVolumeSats}}`. Each market: `_id`, `marketUuid`, `title`, `text` (HTML rules), `slug`, `type` (`DOUBLE|MULTIPLE`), `priceType` (`LMSR|CLOB`), `clobHybridEnabled`, `negRiskEnabled`, `resolutionMode` (`EXCLUSIVE`), `active`, `end_time` (ISO), `categories[]`, `volumeSats`, `liquiditedSats` (the LMSR `b`), `traderCount`, `fees{buy,sell,win,limit_buy,limit_sell}` (null in `light=true` list, populated in the by-slug detail), `creator{username,reliabilityScore,roles}`, `resoluted`, `winnerOutcomeId`, `outcome[]{_id,title,share,volumeSats,traderCount,disabled,chart[]{time,value}}`. No per-outcome price field: derive it from `share` and `liquiditedSats` (formula above) or use the `chart` last value (hourly bucket).

Caveats:
- `statistics.totalSats` = 32,431,727 is within 0.01% of the sum of `volumeSats` over the 273 open markets (32,429,265), so it is **volume of currently open markets, not lifetime volume**, despite the footer saying "Total ₿ ... since inception". [H data, M reading]
- Rate limits: none documented. The client maps HTTP 429 to "Too many requests". No `X-RateLimit-*` headers seen. [H JS / headers]
- Some junk data: an `end_time` of year 7202 exists; one market closed on 2026-10-04 is still unresolved. [H]

## 5. Trade path

- **No public trading API.** Programmatic trading means replaying the website's private authenticated API: `POST /api/trades/buy`, `/sell`, `/negrisk`, `/redeem`, `/liquidity`, plus `POST /api/authentication/login`. Requests carry a cookie session (`withCredentials`, refresh via `/authentication/refresh`), an `x-user-id` header, and an `Idempotency-Key` header. Buy body fields seen in JS: `contractId, outcome, stakeSats, shares, limitPrice, stopPrice, stopVariant, orderKind, priceType, timeInForce, expiresAt, expiryAction, slippageBps, spilloverEnabled, spilloverWaitMinutes`. Error codes: `COUNTRY_BLOCKED` (403), `TRADING_PAUSED` / `PAYMENTS_UNAVAILABLE` (503), `ORDER_WOULD_NOT_FILL` (400). [H, bundle `CpSkHVvX.js`; never called]
- Sign-in forms use **Cloudflare Turnstile** (site key present in the page config), so unattended account creation/login is designed to be hard. [H]
- No per-order cryptographic signing; auth is account-session based. There is no signed-order or EIP-712 scheme to delegate. [H absence in bundle]
- Funding is a manual Lightning invoice payment (`/payments/invoice/{id}`, SSE status stream); withdrawals via `/trades/withdraw`. [H JS]
- Docs mention "Basic/Pro" order entry; per-market fee fields `limit_buy`/`limit_sell` exist; stop and limit orders only work on Hybrid/CLOB markets, which are effectively absent today. [H docs, M]

## 6. Reachable through PayBox (EVM / Solana wallet)? **No**

- Predyx only accepts Lightning deposits and pays out in sats; there is no EVM, Solana or other chain integration, no contract, and no signed-order scheme. [H]
- PayBox's chain catalog (from this repo's own research, 2026-10-19) is Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid; no Bitcoin or Lightning. [M, `docs/research/06-paybox-platform.md`]
- The only conceivable route is an off-platform swap (stablecoin to a Lightning invoice via a third-party swap service) followed by manually logging in. That is not a transaction proposal or signed order and would need a human-created custodial account behind Turnstile. Not investigated; not recommended. [L]

## 7. Fees

- **Defaults in the live page config:** buy 0.45% (`VUE_DEFAULT_BUY_FEE 0.0045`), sell 0.35% (`0.0035`), win 0.20% (`0.0020`). [H, public runtime config in https://beta.predyx.com/ HTML payload]
- **Per-market, creator-set:** docs: "Market creators can set fees of up to 5% on buy, sell, and winning payouts", sub-2% recommended. Observed: Super Bowl 0.45% / 0.35% / 0.20% (buy/sell/win); a UFC 333 market 2% / 2% / 1%. Limit-order fees 0 in both. Category-level fee policies exist. [H, docs + fixtures]
- **Marketing disclaimer range (site footer, ToS, FAQ):** "Fees are variable and may range from 0-3% for Buy/Sell trades and 0-1% on winnings." This conflicts with the docs' "up to 5%". [H, https://beta.predyx.com/terms-of-service]
- **Who pays:** traders, per trade, at buy/sell time; win fee on winnings at resolution; creator UI says fees are "Charged to traders on each trade. Not deducted from your payout." Who receives them (platform vs creator) is not stated. [H UI strings, receiver NOT FOUND]
- **Withdrawals:** `withdrawFeePercent: 0.01` (read as 1%, M) plus `withdrawFixedFeeSats: 1`. Lightning routing costs extra. [H, limits fixture]
- **Implicit cost:** LMSR slippage dominates, see section 9.

## 8. Resolution mechanism and dispute risk

- **Resolved by the market creator** (`/api/market-controls/resolve`, "Resolution is irreversible", "all open orders... cancelled and refunded"), with an admin fallback ("Your payout request has been sent to the admin team. We will process it manually", "Resolution is temporarily disabled for creators"). Creators are told to name a resolution source and criteria; the UI nags them ("Market closed - resolution required... Traders are waiting for their payouts"). Void/refund is possible ("Void the market and refund every position"). [H, English locale strings in bundle `BB1fbENY.js`; docs https://docs.predyx.com/markets/how-to-create-markets-on-predyx.md]
- **Conflict of interest by design:** the creator funds the LMSR pool and receives "what remains in the market: the liquidity you posted, less what was paid to winners, plus whatever the pool gained from trading". Creator also resolves. [H UI string, M inference]
- **No formal dispute process.** Only a post-hoc rating prompt ("Was the resolution fair and transparent?", "How quickly did the creator resolve this market?") and a `reliabilityScore` on creators. FAQ: "we use verified data to close the market." [H]
- **Observed rule quality problems:** the BTC "$120K in 2026" rules say the window runs "between January 1, 2026, 00:00 PT and December 31, 2025, 23:59 PT" (end before start); source is Coinbase spot ("touch any time"). Other venues use different sources (Binance, Chainlink) and definitions, so cross-venue "same event" matching needs rule-level checks. [M, https://beta.predyx.com/market/bitcoin-120k-in-2026-1767267703 fetch-summarised]
- **Resolution latency risk:** 9 markets are `closed` and unresolved; one (Brazil STF market) closed 2026-10-04, 15 days earlier. [H, `openClose=closed` listing]
- Resolved so far: 1,288 markets (mostly sports game/props). [H, `openClose=RESOLVED` `eventCount`]

## 9. Liquidity (BTC spot = $82,377 from Coinbase `GET /v2/prices/BTC-USD/spot` on 2026-10-19; 1 sat about $0.000824)

| Metric | Sats | USD | Source / date |
|---|---|---|---|
| Sum of `volumeSats`, 273 open markets (= `statistics.totalSats`) | 32.43M | about $26.7K | `/api/markets` 2026-10-19 [H] |
| Largest market volume (`maxVolumeSats`) | 3.29M | about $2.7K | same [H] |
| Super Bowl 2027 winner: volume / LMSR `b` / traders | 2.95M / 1.0M / 2,111 | $2.4K / $824 | by-slug detail [H] |
| Sum of LMSR pool liquidity (`liquiditedSats`), open markets | 5.71M | about $4.7K | computed [M] |
| Median open market volume | 12.6K | about $10 | computed [M] |
| Open markets with volume above 100K sats / above 1M sats | 46 / 9 | | computed [M] |
| 9 closed, unresolved markets | 7.03M | about $5.8K | `openClose=closed` [H] |
| 1,288 resolved markets; newest 100 sampled | 1.82M for the sample | about $1.5K | `openClose=RESOLVED` page 1 [H] |

Depth example (standard LMSR cost with `b` = `liquiditedSats`, M): BTC 120K Yes (price 7.6%, `b` = 200,000 sats = $165). A 100,000-sat (about $82) buy moves Yes to about 44%. Any arb leg here is capped at a few tens of dollars before it eats its own edge, and the per-order maximum is 500,000 sats (about $412). Max loss of a creator on an N-outcome pool is `b * ln(N)`.

No TVL/OI figure is published. Third-party stats: NOT FOUND.

## 10. Event overlap with other venues (where arbitrage could exist)

Open-market category tags (overlapping): bitcoin 78, sports 67, politics 67, finance 53, crypto 24, economy 22, world-news 19, trump 19, us-elections 14, nfl 11, stocks 10, ai 7. Volume share by tag group (overlapping): bitcoin-tagged 21.1M sats (65%), economy/finance/stocks 17.0M, sports 7.0M, politics/elections 4.0M, crypto 3.7M. [H data, M grouping]

- **Crypto price thresholds** (BTC $90K/$120K/$130K/$140K/$150K in 2026, "BTC 100K before 70K"): overlap with Polymarket, Kalshi, Limitless, Predict.fun. Largest Predyx market after Super Bowl. Rule/source mismatch risk (Coinbase spot touch-any-time vs other sources).
- **Sports:** Super Bowl 2027 winner, MLB World Series 2026 winner (1.04M sats, 1,814 traders), NFL game/spread/prop markets, UFC 333 fights, college football spreads. Overlap with Polymarket/Kalshi sports and sportsbooks. Game markets are short-lived (days).
- **Politics:** Brazil presidential election (1.02M sats, ends 2026-10-26), US-election and Trump tags.
- **Macro/finance:** thin: "Fed raise at the October meeting" (7.7K sats), "US Recession 2027?" (3.3K), "S&P 500 hits 8000 in 2026?" (117K), gold $5K/$6K markets (9K to 32K), Presidential Election Winner 2028 (30K), plus corporate-treasury markets such as "Will Strategy reach 905,000 BTC holdings" (602K). All overlap with Polymarket/Kalshi but at a few dollars of depth. [H titles/volumes from `/api/markets`]
- Bitcoin-protocol niche (BIP-110/Knots fork coin, BIP-360 quantum, Core vs Knots): unique to this venue, no overlap.

## 11. Geo, ToS, automation

- **Geo-restricted by IP country.** Site footer: "Predyx is not available in certain jurisdictions. Where access is restricted, new sign-ups, deposits, and trading are disabled; existing users may sign in to withdraw funds only." The blocked-country list is **not published** (NOT FOUND in ToS, FAQ, docs, client bundle; checked server-side via `/authentication/geo-status`). UI text: "Prediction markets aren't permitted under the regulations that apply there". Whether the US is blocked: NOT FOUND. [H, https://beta.predyx.com/terms-of-service; bundle locale strings]
- **ToS** (short, generic): 18+, "Interfering with or disrupting our Services" is prohibited, termination "at any time, without notice, for any reason", governing law "Delaware, USA". **Nothing about bots, scraping, API use or market making.** No operator legal name, no licence or regulator named. [H]
- **Docs:** claim "no KYC needed"/"Anyone". [H, https://docs.predyx.com/getting-started/quickstart.md]
- Using the private API for automated trading is untested against the ToS and would need a human-created account; account may be closed at will. Treat as high platform risk.

## 12. Shared liquidity

None found. Predyx runs its own LMSR pools on its own database; it does not route to Polymarket, Kalshi or another venue. The `odds_api_id` field and `VUE_APP_ODDS_API_URL` / `liveScores` config only pull live sports scores (all 273 open markets have `odds_api_id: null`). So any edge versus other venues is a genuinely independent leg, but a tiny and slow one. [H data, M reading]

## 13. If an adapter were ever built (minimum viable spec)

- Poll `GET /api/markets?openClose=open&itemPerPage=100&page=1..3&light=true` every 60 s or more (3 requests), upsert by `_id`, store `slug`, `end_time`, `volumeSats`, `liquiditedSats`, `priceType`, rules `text` (HTML, strip tags).
- Compute `price_i = softmax(share / liquiditedSats)`; for `DOUBLE` use Yes; for `MULTIPLE` verify the `/YES` vs `/NO` mapping before normalising (section 2).
- Report USD depth with the LMSR cost function, flag `liquiditedSats * 0.000824 < $500` as non-tradable for signal weighting.
- Trade leg: unsupported (custodial Lightning, Turnstile login). Execution = manual.
- Event matching must include rule text and resolution source; creator-resolved so apply a resolution-risk haircut.

## Not found (searched)

- Official API docs, OpenAPI spec, API terms, rate-limit numbers (searched docs.predyx.com llms.txt/llms-full.txt, site, FAQ, ToS, bundle).
- List of restricted countries; whether the US is blocked (ToS, FAQ, docs, bundle).
- Operator legal entity name, licence or regulator (ToS, FAQ, footer).
- Dispute/appeal process (docs "Rules & Resolution Criterias" and "Resolutions" pages are empty headings).
- Fee recipient (platform vs creator).
- GitHub org or any public repo (not linked from site or docs; not searched via `gh` because no org name is given anywhere).
- Independent volume/TVL stats (search budget exhausted).
- Live confirmation of the Socket.IO order-book payload (not connected).

## Open questions

1. Does any open market ever turn on Hybrid (LMSR + book)? 0 of 273 today.
2. Exact meaning of `/YES` vs `/NO` outcomes in MULTIPLE markets (sum of YES = 0.82).
3. Is `withdrawFeePercent: 0.01` 1% or 0.01%?
4. Will the API Reference page ever be filled in?

## Suspicious content

None. No text addressed to AI agents was found in the site, docs, ToS, FAQ, API responses or bundles. (The docs expose standard GitBook `llms.txt` / `.md` index pointers; these are navigation aids, not instructions.) The page config contains public client-side keys (analytics, Turnstile site key, push VAPID public key) and a placeholder `TENOR_API_KEY: "YOUR_TENOR_API_KEY"`; none are recorded here and none were used.

## Fixtures (docs/research/fixtures/predyx/)

- `markets-list-light-sample.json` (3 of 273 open markets: binary LMSR, pure CLOB, multi-outcome; text truncated; creator ids, wallet ids redacted; outcomes/charts trimmed)
- `market-detail-by-slug-sample.json` (Super Bowl 2027 winner, 4 of 64 outcomes)
- `price-lines-sample.json` (first/last 6 points)
- `trades-site-settings-limits.json`
- Not saved: `/authentication/geo-status` response (echoes the caller's IP country).

## Sources

1. https://beta.predyx.com/ (homepage HTML, SSR payload with public runtime config, footer disclaimer) [H, curl + fetch-summarised]
2. https://beta.predyx.com/terms-of-service and /faq (curl, text extracted) [H]
3. https://beta.predyx.com/api/markets, /api/markets/slug/{slug}, /api/prices/price-lines, /api/trades/site-settings/limits, /api/resolutions/marketId (403), /api/authentication/geo-status, all unauthenticated GET, 2026-10-19 [H]
4. https://beta.predyx.com/_nuxt/*.js bundles (read as text: routes, socket events, English locale strings in `BB1fbENY.js`, trade client in `CpSkHVvX.js`) [H for what the code contains, M for intent]
5. https://docs.predyx.com/llms.txt and /llms-full.txt (GitBook index and full text: quickstart, what-is-predyx, funding, markets basics, creating markets, order types, API Reference placeholder, changelog template) [H]
6. https://beta.predyx.com/market/bitcoin-120k-in-2026-1767267703 (rules text, fetch-summarised) [M]
7. https://stacker.news/items/833261 (launch thread, Jan 2025 to Aug 2025 replies, operator claims) [M, fetch-summarised]
8. https://api.coinbase.com/v2/prices/BTC-USD/spot (BTC/USD $82,377.075, 2026-10-19) [H]
9. https://x.com/predyx_markets, YouTube, Publish0x (seen only as search-result titles; not opened) [L]
10. `docs/research/06-paybox-platform.md` in this repo (PayBox chain catalog) [M]
