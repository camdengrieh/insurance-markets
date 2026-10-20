# Trendle - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ran about 03:30-03:50 UTC). READ-ONLY: page and docs reads, unauthenticated GETs to the venue's own API and to block-explorer pages, one 75-second read-only WebSocket subscribe, `gh api` file reads. No account, wallet, key, signature, invite code, POST/PUT/DELETE or PayBox tool was used. Third-party text was treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session (URL given); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/trendle/` (listed in section 12).

---

## 0. Bottom line

1. **Live as a website and data feed, dormant as a market.** The site, docs and 1-minute index feed are up (H). But the last user trade on the Trading contract was **2026-10-06 21:32 UTC**, 13 days before this probe (H, Monadscan). The Pool contract holds **0.163 USDC** (H). All nine tradable markets show "$0 Vol." (H). The latest pause/unpause pair on the Pool is **Pause Trading at 2026-10-14 13:57:17 UTC**, and the API says `isMaintenance: true` with a `start` of the same minute (H for both records; "currently paused" is my inference, M).
2. **Not an event market.** It is an oracle-priced, perpetual-style long/short product on a social "Attention Index" (DoA, "Dollar of Attention") built from X, Reddit and YouTube engagement. There is no resolution, no outcome token, no probability. The docs say so: "There is no tradable spot attention asset to arbitrage against" (H, https://docs.trendle.fi/product/funding-rate.md). It cannot be an arbitrage leg against Polymarket/Kalshi-style books.
3. **Trading is permissioned and off our chain list.** Wallets must be allowlisted by a six-digit invite code bound to a social identity; the chain is Monad (143), which is not in PayBox's chain catalog (H, from `docs/research/06-paybox-platform.md`, same date).
4. **Best case use: a free, keyless attention-index data feed** (9 topics, 1-minute candles, REST + WebSocket). It is a weak signal and the raw inputs (X/Reddit/YouTube) are public elsewhere.
5. **adapter_priority = skip** (revisit as P2 signal-only only if trading resumes with real volume and the aggregator wants an attention signal).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://trendle.fi/` | HTTP 200, title "Trendle \| Attention Markets", "beta" badge, "Trade Attention", "Spot it early. Trade it first", footer "Trendle (c) 2026". Nine market cards (iPhone, Hunter Biden, Elizabeth Holmes, ChatGPT, GTA VI, Sydney Sweeney, Donald Trump, Kanye West, Elon Musk), each "$ 0 Vol." | H (fetched 2026-10-19) |
| Index feed | `GET .../markets/111/prices/ohlc` returned 10 one-minute candles ending 2026-10-19 03:40 UTC; DoA about 35.4; WebSocket pushed a new candle at 03:41 | H |
| Market list | 113 markets ever created (first 2025-10-06): 9 `Active`+`isTradingEnabled`, 1 `Active` but disabled and hidden (`claude`), 103 `Archived` (incl. Bitcoin, Polymarket, Kalshi, Taylor Swift). Newest created 2026-09-10 | H (`/markets`) |
| Maintenance flag | `GET /utils/maintenance` -> `{"start":1791986220000,"liquidate":false,"marketIds":[],"isMaintenance":true}`; `start` = 2026-10-14 13:57:00 UTC. Semantics of an empty `marketIds` with `isMaintenance:true` are not documented | H (value) / M (meaning) |
| Last trade | Trading proxy `0xAE08...85FE`: newest tx "Close Position" 2026-10-06 21:32:14 UTC (block 111145816); 9,176 txs total | H (Monadscan HTML, plain GET) |
| Pool | Pool proxy `0xe0b5...9231`: 4,325 txs; newest = "Change Traders Status" 2026-10-16 18:57:49 UTC; before that "Pause Trading" 2026-10-14 13:57:17 and "Unpause Trading" 13:57:06 (so the pause is the later of the two); USDC balance 0.163341 | H |
| Ecosystem listing | Monad protocols registry entry `mainnet/trendle.jsonc`, `"live": true`, added 2026-06-24 | H (`gh api repos/monad-crypto/protocols`) |
| Docs | docs.trendle.fi (GitBook, `llms.txt` index, 14 pages) | H |
| Hint "trendle.io redirects to an unrelated domain" | Confirmed: `trendle.io` -> 301 to an unrelated site | H |
| QQ News (2026-01) "up to 5x leverage" | Not fetched (web-search budget exhausted this session). The 5x figure itself is in the official docs | L for the article, H for 5x |

Verdict: **still_live = true** (site, API, index feed) but **no trading activity for 13 days and an empty pool**.

Timing note (M, no causal claim): Azuro, which incubated Trendle, reported its own security incident on 2026-10-06 (see `docs/research/venues/azuro.md`); Trendle's last trade is the same day. I found nothing that links the two.

---

## 2. Kind and market model

- **Kind (H):** "attention market" / "AttentionFi": leveraged perpetual-style long/short on an index, with a pooled LP vault as counterparty. Docs: "Trendle uses pooled liquidity rather than an orderbook" (https://docs.trendle.fi/product/trading-engine.md).
- **Underlying (H, https://docs.trendle.fi/product/attention-index.md):** per-topic Engagement Index (EI) from X (6 metrics), Reddit (14) and YouTube (3), normalised, exponentially decayed, quantile-clipped, smoothed, computed every minute, then DoA = EI x DOA_MULTIPLIER. "No AI/ML." Unitless, no upper bound, cross-topic comparable. The docs contradict themselves on the window: attention-index page says a 6-hour decay window; FAQ says a rolling 7-day window (H, both). Google Trends is "coming in v2".
- **Pricing (H docs, M interpretation):** position entry/exit uses the **oracle DoA price**, not an AMM curve. The oracle signs the price (`indexPrice`, `priceExpiresAt`, `oracleSignature` in `placeOrder`/`closePosition`). So there is no price impact; cost is fees + funding. The client sets `limitPrice` = last 1m close +/- 10% (`slippage: 0.1` in the bundle).
- **Outcome model:** none. Two sides per market, Up (long) / Down (short) on DoA. No categorical or scalar resolution. Not binary, not tokenised: a position is a record in the Trading contract (`tradeId`, status ORDER / POSITION / CLOSED), not an ERC-20/1155.
- **Order types:** market (`orderType` 1 in the bundle) and limit orders executed later by `processTrades` (H, docs "Life of a trade").
- **Leverage:** 1x-5x ("Boost") (H, https://docs.trendle.fi/product/trading-engine/fees.md). The bundle has `maxLeverageFallback: 10`; the on-chain `maxLeverage` value was not read (see open questions).
- **Caps:** `maxPayout = maxPayoutThreshold x collateral` (and for shorts also capped at the value at DoA = 0); reaching it force-closes ("forced take-profit") (H docs). Bundle constants `takeProfit: 3`, `liquidation: 0.3` suggest 3x payout cap and 30% liquidation threshold (M, unlabelled constants).
- **Funding:** a "crowding tax": the side with more open interest pays the other, per second, `rate = (LongOI - ShortOI) x baseFundingRate / LongOI`; surplus goes to LPs (H docs). The `baseFundingRate` value is not published.

Categories on the site: All, Politics, Celebrity, Sports, Tech, AI, Crypto; but only ids tagged Main/Politics/Celebrity/Tech/AI have live markets (H, `/categories` and `/markets`). Active list is topics, not events.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | **Monad mainnet, chain id 143** (`chainId: 143` in the app config; Monad registry; explorer monadscan.com) | H |
| Collateral | **USDC on Monad, 6 decimals**, `0x754704bc059f8c67012fed69bc8a327a5aafb603` (app config; the Pool holds an ERC-20 shown as "USDC" on Monadscan) | H |
| Trading contract | `0xAE0830d7588aB44e5D4443168a8D666B54F385FE` (TransparentUpgradeableProxy, verified, implementation `0x2e42dE9111b036C39d01F599C997df940d4D576c`, solc 0.8.29) | H (config, registry, Monadscan) |
| Pool contract | `0xe0b5D2538038329Cd1Ab9D92273af7DB5EF29231` (TransparentUpgradeableProxy, verified; implementation shown truncated as `0xFcc3d8EF...2b5Feb392`) | H |
| Deployed | 2026-04-06 (both proxies, Monadscan creation tx) | H |
| Earlier deployment | Bundle has `blockchainMigrationTimestamp` = 2025-12-16 and a `base` backend id; the UX tutorial still tells users to deposit "USDC (Base network)". The index feed dates from 2025-10. So an earlier Base-era product probably existed | M |
| Conflicting docs | Registry blurb says "USDT collateral"; tutorial says Base USDC under a heading "USDC on Monad". The bundle config and Monadscan agree on USDC on Monad, so I treat the registry and tutorial as stale | H/M |
| Account model | The app uses Privy login (email/social/external wallet) with optional ERC-4337 smart wallets and a Pimlico paymaster; funding via Relay bridge and MoonPay widgets are referenced in the bundle | H (bundle strings), M (what is live) |

---

## 4. Read API

- **exists:** `official-public` for the index/market metadata, but **undocumented** (no public API docs; Swagger at `https://api.trendle.fi/trendle/docs` redirects to a Cloudflare Access login for an Azuro-named tenant, so it is not public). The endpoints below are those the official web app itself calls, confirmed by unauthenticated GET. (H)
- **Docs URL:** none for the API. Product docs: https://docs.trendle.fi/ (index `llms.txt`).
- **Base URLs:** REST `https://api.trendle.fi/trendle`; WebSocket `wss://streams.trendle.fi`; subgraph `https://thegraph.chainfeedon.com/subgraphs/name/azuro-protocol/trendle-monad` (GraphQL over POST; **not queried**, POST is out of scope; a GET returns a 302). (H)
- **Auth / limits:** none needed for the GETs below (axios client uses `withCredentials`, but anonymous requests worked). Rate limits: NOT FOUND (no headers, no docs). Edge is Cloudflare.

| Endpoint | Purpose | Verified | Tag |
|---|---|---|---|
| `GET /markets?take=100&skip=0&state=Active&isTradingEnabled=true&isVisible=true&orderBy=order&categories=main` | Market list; fields `id, slug, title, keywords, state, isTradingEnabled, isVisible, startedAt, lastPriceAt, categories[]`. No price, volume or OI in the payload | yes (`markets_active_main.json`) | H |
| `GET /markets/{id}` | One market (same shape) | yes | H |
| `GET /markets/{id}/prices/ohlc?version=v1&from=<ms>&to=<ms>&timeframe=1m` | DoA candles; `timeframe` in `1s,1m,5m,1h,4h,1d,1w` per bundle enum (1m and 1d tested); prices are strings, 4 decimals | yes | H |
| `GET /markets/{id}/sunset` | `{tradingEndsAt, closesAt}` or `null` | yes (null for 111) | H |
| `GET /categories`, `GET /utils/maintenance` | Taxonomy; maintenance flag | yes | H |
| `GET /orders/{id}?trader=<addr>&blockchain=monad` | Order status for a trader | shape only (400 without `trader`) | H |
| `GET /allowlist/{address}` | Trader allowlist record (invite code capacity, social info) | 404-style error for an unknown address, returned with HTTP 503 | H |
| `wss://streams.trendle.fi` | Send `{"type":"subscribe","subscriptions":[{"marketId":111,"version":"v1","timeframe":"1m","from":<ms>}]}`; get one `snapshot` (history), then `update` (current 1m candle; one update seen in the 75 s sample) and `ping` (about every 30 s) | yes, 75 s sample (`ws_streams_sample.json`) | H |

What is **missing** from the read API: any order book (there is none), open interest, volume, funding rate, fee rates, pool TVL, trade tape. Those live on-chain / in the subgraph (Trading `getFeeRates`, `getIndexData`, `getPositionLoad`, `reserves`, `tradingIsPaused`, events `OrderPlaced/OrderExecuted/PositionResolved/FundingRateUpdated`, per the ABI in the bundle) and would need Monad RPC `eth_call` or GraphQL, both POST, so I did not call them. NOT FOUND (searched: API root, `/docs`, `/openapi.json`, `/swagger`, `/health`): any public API reference.

The "Vol." number on the home cards is therefore computed from the subgraph or chain; it shows $0 for every market. (M)

---

## 5. Trade path

Only the web app's own flow is visible; it is **not offered to third parties** (no API docs, no keys, no SDK).

1. **Allowlist (blocker).** Each trader address must be on the allowlist: the app shows "You need a six-digit code for early access ... only a few get in", posts `/allowlist` with `{inviteCode, address, socialType, socialId, meta}` (so it binds the wallet to a social account), and the contracts expose `allowedTraders` / `changeTradersStatus` (admin) with revert reason `TRADER_NOT_ALLOWED`. The Pool admin calls "Change Traders Status" nearly daily through 2026-10-16. (H, bundle + ABI + Monadscan)
2. **One-time ERC-20 approve:** `USDC.approve(Trading, max)` on Monad. Needs MON gas for an EOA; smart-wallet users get it sponsored. (H, bundle)
3. **Sign EIP-712 `PlaceOrderRequest`** (H, bundle `43338` module): domain `{name:"Trendle", version:"1", chainId:143, verifyingContract:<Trading>}`; types `PlaceOrderRequest{trader,collateralToken,collateralAmount,leverage,isLong,limitPrice,indexId,orderType,data}` and `CommonRequestData{chainId,trading,nonce,expiresAt}`; `ClosePositionRequest{tradeId,data}`. Decimals: collateral 6, leverage 18, price 8. `nonce` = epoch ms, `expiresAt` = now + 7 days.
4. **Submit by HTTPS:** `POST https://api.trendle.fi/trendle/orders` (body: `traderAddress, marketId, blockchain:"monad", timestamp, expiresAt, nonce, isLong, collateralToken, collateralAmount, leverage, limitPrice, orderType, traderSignature`); close with `POST /orders/close`; poll `GET /orders/{id}`. The backend/executor relays on-chain (`placeOrder` with the oracle's price signature), so the trader pays no gas for orders. Not exercised. (H code, not run)
5. **Cancel/limit orders:** `cancelOrder` takes a trader signature on `CancelOrderRequest` (ABI); the HTTP route for it was not seen in the bundle. (M)
6. **Direct contract call** is not realistic: `placeOrder` needs an oracle signature on the price.

Auth scheme summary: wallet EIP-712 signature + invite-code allowlist; no API key.

---

## 6. PayBox reachability

**paybox_reachable = no.**

- Monad (eip155:143) is **not** in PayBox's chain catalog (`discover_tokens mode=chains` on 2026-10-19: Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid), recorded in `docs/research/06-paybox-platform.md` (H there; not re-queried here). That file also says the catalog is "not a support allowlist" and unsupported-chain behaviour is unresolved.
- `request_wallet_sign` with `typedData` could in principle produce the `PlaceOrderRequest` signature (an EVM MPC wallet shares one address across all `eip155:*` chains, per that file), but a `domain.chainId` of 143 may be denied, and the one-time `approve` would be an on-chain Monad transaction that PayBox does not list. (M)
- Independently of chains, the address must be allowlisted via an invite code tied to a social identity, and funding USDC onto Monad has no PayBox route (M).
- The pool is empty and trading looks paused, so there is nothing to trade anyway.

---

## 7. Fees

| Fee | Formula / value | Who pays | Tag |
|---|---|---|---|
| Entry fee | `(TradingFee% + ImbalanceFee%) x (Collateral x Leverage)`, charged once at open; none on close or on cancelling an unfilled order | Trader -> treasury | H (https://docs.trendle.fi/product/trading-engine/fees.md) |
| Trading fee % | Fixed, "set by contract admin". Value not published (docs example uses 0.20%). Readable on-chain via `tradingFeeRate`; not read | Trader | H (rule) / NOT FOUND (value) |
| Imbalance fee | Only when opening on the prevailing side. 0% below an open-interest ratio of 3:2; 0.45% at 3:2 rising linearly to 3% at 10:1; each side has 1k virtual dollars; OI = margin x leverage including the new position | Trader -> treasury | H |
| Funding | Per second, dominant side pays minority side, proportional to opening notional (collateral x leverage); applies even at 1x; can liquidate a position whose price P&L is positive. `baseFundingRate` not published | Dominant side -> minority; surplus to LPs | H (formula) / NOT FOUND (rate) |
| Liquidation fee | Applies on liquidation, "where applicable"; amount not published | Trader | H (existence) |
| Execution / holding fees | ABI has `executionFeeRate`, `holdingFeeRate`, `getHoldingFee`, and the subgraph schema lists `executionFee`, `holdingFee`; the docs do not mention them. Values unknown | Trader | M |
| Gas | Orders are relayed (no gas for the trader) per the bundle flow; the one-time approve needs gas unless sponsored | - | M |

Worked example from the docs: 1,000 collateral x 3x, 0.20% trading fee = 6.00; a long at a 4:2 OI ratio with a 3.0% imbalance fee = 90.00; total entry fee 96.00 (H).

---

## 8. Resolution mechanism and dispute risk

- **No event resolution.** Positions are marked to the DoA oracle price and closed by the trader, by liquidation (margin call, forced take-profit at the payout cap, funding drain, index/token delisted, trader removed from the allowlist) or by a market "sunset" (`tradingEndsAt` / `closesAt`). (H docs, https://docs.trendle.fi/product/liquidation-engine.md)
- **Oracle trust:** authorised oracle accounts push minute prices; the contract uses oracle signatures; if prices go stale the feed "widens spread / errors". The index is computed off-chain by the team from scraped engagement data; a ZK-verifiable index is "being explored" (H docs). There is no dispute process.
- **Admin powers (H, ABI + Monadscan):** both contracts are upgradeable proxies; the owner can pause trading, change fees, leverage, payout threshold, oracle, treasury, per-index and per-trader status, and virtual funds. Liquidations include "whitelist removal".
- **Manipulation risk:** the docs argue multi-platform inputs are hard to game (self-claim). A thin, single-operator index with admin-set parameters is a counterparty risk, not a resolution risk.
- **Audits:** NOT FOUND (searched all 14 docs pages for "audit"; no audit link in the site, registry entry or docs).

---

## 9. Geo, ToS, automation

- **Terms:** the site footer renders "Terms of Use" and "Privacy Policy" links that both point to `/` in the bundle (H), so no Trendle terms were published at the time. NOT FOUND (searched: site footer, bundle, docs).
- **Geo-blocking:** no geofence strings found in the bundle or docs. NOT FOUND (searched: bundle for jurisdiction, United States, restricted, OFAC; docs). The Privy login and MoonPay on-ramp bring their own terms (M).
- **Automation:** nothing stated. The practical gate is the invite code + social-identity allowlist, which is designed for individual users ("Invite friends to waitlist"; per-code `capacityCapped`). Automating account creation to get in would be circumvention and was not attempted.
- **API access:** swagger is behind Cloudflare Access; no API keys offered.

---

## 10. Liquidity

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| Pool USDC balance | **0.163341 USDC** | Monadscan Pool page, 2026-10-19 | H |
| 24h/home-card volume | **$0** on all 9 markets | trendle.fi HTML, 2026-10-19 | H |
| Trading contract USDC | none listed | Monadscan, 2026-10-19 | H |
| Tx counts | Trading 9,176; Pool 4,325 since 2026-04-06 | Monadscan, 2026-10-19 | H |
| Last trade | 2026-10-06 21:32 UTC | Monadscan, 2026-10-19 | H |
| DefiLlama | Not in `/protocols`, `/overview/dexs` or `/overview/fees` (8,758 / 1,557 / 3,028 entries scanned). `/overview/derivatives` returned HTTP 402 ("Upgrade to the paid API plan"); I stopped there | api.llama.fi, 2026-10-19 | H |
| Weekly rewards | "Attention Markets Arena" paid up to 100k-225k $MON per week over a 5-week programme (rules page undated). Volume threshold stated as $200 in one place and $100 in another | https://docs.trendle.fi/attention-markets-arena-rules.md | H (text) / L (whether still running) |

The reward tables suggest earlier activity was incentive-driven. I did not measure historical volume (needs the subgraph or logs).

---

## 11. Category overlap, shared liquidity, arbitrage fit

- **Overlap with other venues:** none in the arbitrage sense. Topic names (Donald Trump, Elon Musk, GTA VI, iPhone, ChatGPT, celebrities) overlap *thematically* with Polymarket/Kalshi mention, release-date and tweet-count markets, but DoA is an engagement level, not a probability or a settled outcome, so no price is comparable. No sports, no macro, no crypto-price markets are live (the old Crypto/Sports topics are archived). (H)
- **Shared liquidity:** its own Pool on Monad; it does **not** share liquidity with another venue. It is Azuro-built and Azuro-incubated (team page, subgraph under `azuro-protocol/`, Azuro Sentry and Cloudflare Access tenant) but not Azuro's LP. So it would be an independent leg if it had liquidity; it has none. (H for the pool; M for the Azuro relationship, which is self-described in https://docs.trendle.fi/team.md)
- **Signal value:** a minute-level attention index could lead "will X trend / how many tweets" style markets. Weak and unproven; the underlying X/Reddit/YouTube data is public elsewhere.

---

## 12. Adapter recommendation

**adapter_priority = skip.**

Reasons: not an event market (no arbitrage leg), empty pool and no trades for 13 days, allowlist-gated, undocumented API, Monad outside PayBox's chain list. If the aggregator ever wants the attention index as a signal, the whole adapter is three keyless calls (`/markets`, `/markets/{id}/prices/ohlc`, `wss://streams.trendle.fi`), about an hour of work, and should be tagged "signal-only, unreliable, may vanish".

Re-check triggers: Pool balance above a few thousand USDC; new `Place Order` txs on the Trading proxy; `/utils/maintenance` returning `isMaintenance:false`.

Fixtures saved (`docs/research/fixtures/trendle/`):
- `markets_active_main.json` (9 active markets, 14 KB), `markets_active_politics.json`, `categories.json`
- `market_111_ohlc_1m.json`, `market_111_ohlc_1d.json` (iPhone DoA candles)
- `utils_maintenance.json`
- `ws_streams_sample.json` (subscribe request, snapshot prefix, one update, pings)
- `api_error_shapes.json`
- `onchain_snapshot_monadscan.json` (derived by me from explorer HTML, not an API response)

---

## 13. Open questions

- Is trading currently paused on-chain (`tradingIsPaused`), and what are the live `maxLeverage`, `tradingFeeRate`, `baseFundingRate`, `executionFeeRate`, `holdingFeeRate` and Pool `totalReserve`? Needs Monad `eth_call` (POST), not done.
- Historical volume/OI and the number of distinct traders (subgraph, POST, not done).
- Whether `POST /orders` enforces the allowlist off-chain, on-chain, or both (assumed both).
- What the empty `marketIds` with `isMaintenance:true` means to the UI.
- Whether the 2026-10-14 pause and the 2026-10-06 stop are related to the Azuro incident of the same week (no evidence either way).
- Real terms of use (links are placeholders).
- Whether `x.com/trendlefi` announced a pause or relaunch: the fetch returned HTTP 402 (no payment terms in the body) and I stopped.

---

## Sources

| Source | Used for | Tag |
|---|---|---|
| https://trendle.fi/ (HTML + 29 Next.js chunks under `/_next/static/chunks/`, fetched with GET 2026-10-19) | Site state, cards, API hosts, contract addresses, EIP-712 types, order flow, allowlist/invite UI, footer links | H |
| https://docs.trendle.fi/llms.txt and the 14 `.md` pages (readme, background, core-idea, product, attention-index, pulse-data-feed, trading-engine, fees, liquidation-engine, funding-rate, ux-tutorial, arena-rules, team, faq) | Model, formulas, fees, leverage, team, rules | H |
| https://api.trendle.fi/trendle/{markets, markets/{id}, markets/{id}/prices/ohlc, markets/{id}/sunset, categories, utils/maintenance, allowlist/{addr}, orders, docs} (GET only) | Response shapes, maintenance flag, Cloudflare Access on docs | H |
| wss://streams.trendle.fi (75 s read-only subscribe) | WebSocket protocol | H |
| https://monadscan.com/address/0xAE0830d7588aB44e5D4443168a8D666B54F385FE and .../0xe0b5D2538038329Cd1Ab9D92273af7DB5EF29231 (plain GET HTML; the first page-summary read via WebFetch agreed) | Proxy/verification status, tx counts, last activity, pause/unpause, USDC balance | H |
| https://github.com/monad-crypto/protocols `mainnet/trendle.jsonc` (via `gh api`, commit 2026-06-24) | Independent confirmation of chain, addresses, "live": true; stale "USDT" wording | H |
| https://api.llama.fi/protocols, /overview/dexs, /overview/fees; /overview/derivatives returned 402 (paid plan; stopped) | Absence from DefiLlama | H |
| `docs/research/06-paybox-platform.md` (this repo, same date) | PayBox chain catalog and signing semantics | H (as recorded there) |
| `docs/research/venues/azuro.md` (this repo) | Azuro incident date; Azuro ecosystem page listing Trendle as "coming soon" | H (as recorded there) |
| https://x.com/trendlefi | HTTP 402 to WebFetch, nothing read | - |
| QQ News (2026-01), per the discovery hint | "social-attention indices, up to 5x leverage"; not fetched | L |

Searched with no result (NOT FOUND): public API reference or OpenAPI, rate limits, audit report, terms of use, geo restrictions, fee values (trading, funding base, execution, holding), historical volume, any non-Monad deployment currently live.

Hygiene: the public JS bundle contains credential-like strings (a paymaster policy id, an error-tracking DSN and a default invite code). I did not copy, record or use them. No embedded instructions aimed at AI agents were found in the site, docs or API responses. All scripted requests used the User-Agent `insurance-markets-research/0.1`; no personal identifier was sent anywhere.
