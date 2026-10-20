# Yeno (yeno.market, formerly yeno.trade) - adapter spec

Researched 2026-10-19 (~00:50-01:20 UTC). READ-ONLY: unauthenticated GETs to documented hosts, one public WebSocket read (three SUBSCRIBE messages), public static JS/HTML read as text (never executed), `gh api` read of one DefiLlama adapter file. No account, no sign-up, no wallet, no API key, nothing signed, no POST/PUT/DELETE. Two read-only PayBox `discover_plugins` searches ("polymarket", "yeno": 0 results each). No third-party code cloned, installed or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (site copy, docs, llms.txt, JS bundle, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/yeno/` (9 files, each <= 8 KB).

## 0. Verdict

**adapter_priority: skip.**

1. Live (H) but **not an independent venue**: every active Yeno market (457/457) is a mirror of a Polymarket market (`isPolymarket: true`, `polymarketConditionId` set), and Yeno's order book is a copy of Polymarket's CLOB book (full-depth identical on 3 of 5 markets compared, top-5 levels identical on a 4th, and a fast-moving BTC Up/Down book differed between two fetches a few seconds apart; section 6). Yeno is a verified **Polymarket Builder** (builder code, 50/100 bps builder fee, volume attributed in Polymarket's own builder API). It adds no price information.
2. Its own marketing and `docs.yeno.trade` describe a Solana-native CLOB with a "Yeno Solana program" and admin resolution. The production app bundle and the market feed contradict that: since ~2026-06-26 all markets are Polymarket mirrors, and the app calls `clob.polymarket.com` directly (section 2). The old native phase (2026-05-30 to 2026-06-28) was tiny ($97K summed listed volume over 481 markets).
3. Strictly worse than Polymarket direct for any trading leg: same book, plus 1% taker / 0.5% maker builder fee, plus a $50 per-order BUY cap, plus a ToS ban on unauthorised bots, plus a 41-country block list.
4. No external order-signing interface. Orders are placed by Yeno's backend for a Privy-created embedded wallet (session JWT from a Privy login). PayBox cannot trade it; at most it could send USDC to a Yeno deposit address, which gains nothing over Polymarket (section 5).
5. Thin: Polymarket builder API shows $152K on 2026-10-18 (rank 30 of 201 builders), ~0.5% of builder-routed Polymarket volume that day.

Possible tiny value: the free public `GET /api/markets` + orderbook feed is a convenient Polymarket-shaped mirror, but the aggregator should read Polymarket's own Gamma/CLOB APIs (covered by the parallel Polymarket workflow). The only Yeno-unique signal is its own builder volume/active users (Polymarket data-api `/v1/builders/volume`), which is a demand proxy, not a price.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `https://yeno.trade` | 301 to `https://yeno.market/` (CloudFront); site is a static S3-hosted SPA | H |
| Market feed `GET https://api.yeno.trade/api/markets?status=ACTIVE` | 457 active markets, new 5-minute crypto markets created at 00:55Z on 2026-10-19 (fixture `yeno_listing_stats_2026-10-19.json`) | H |
| Polymarket builder API, `builder: yeno-markets`, `verified: true` | daily rows 2026-06-22 to 2026-10-18; 2026-10-18 volume $152,166, 189 active users, rank 30 | H |
| DefiLlama `summary/dexs/yeno` | 24h (2026-10-18 row) $57,242; chart through 2026-10-18 | H |
| WebSocket `wss://api.yeno.trade` | accepts connections and subscriptions (section 3) | H |
| Copyright footer "2026 by Yeno Pvt. Ltd."; "incubated by KGeN" | in app bundle / `docs.yeno.trade` footer | H |

## 2. What it is

- **Kind**: onchain-other in the discovery list; more precisely **a Polymarket front-end / router (Polymarket Builder) with a legacy native-CLOB code path** (H for the router evidence below; M for the history).
- **Operator**: "Yeno Pvt. Ltd." (footer), incubated by KGeN (H). Jurisdiction/registration NOT FOUND (searched: ToS bundle text, About page, footer).
- **DefiLlama**: protocol id 8166, category "Interface", chain **Polygon**, tag **"Polymarket Builder"**; fee methodology: "Builder fees received by yeno-markets from trades on Polymarket v2" (H, `api.llama.fi/protocol/yeno`, `api.llama.fi/summary/fees/yeno`). DefiLlama adapter `factory/polymarket.ts` lists Yeno with builder code `0x5bffd61a6dbfca06f19a543cac4b9e433378ac9992d70b8a40824720e353498f`, start 2026-06-26 (H, `gh api repos/DefiLlama/dimension-adapters/contents/factory/polymarket.ts`). `tvl` arrays are empty: no TVL.
- **Production app evidence (H, `https://yeno.market/assets/index-TUT8OxpJ.js`, read as text)**: `clob.polymarket.com` hard-coded and used for `/book`, `/tick-size`, `/neg-risk`, `/clob-markets/`, `/fees/builder-fees/<builderCode>`; client calls `POST /trades/polymarket/order`, `/trades/polymarket/exit`, `/trades/polymarket/cancel-all-open-orders`, `GET /trades/polymarket/{status,eligibility,wallet-status,balance,promo-balance,bridge-deposit...}`, `POST /trades/polymarket/provision`; UI strings "Deploying Polymarket wallet on Polygon (one-time, ~1-2 min)", "Change to pUSD" (Polymarket v2 collateral), Polymarket bridge withdraw quote. Home HTML preconnects `gamma-api.polymarket.com` and uses Polymarket's S3 for images.
- **Market model**: binary Yes/No only in the feed (sentinel outcome ids `00000000-0000-0000-0000-000000000001` Yes / `...0002` No); multi-outcome Polymarket events appear as separate binary rows (`groupId`/`groupItemTitle`/`isGroupPrimary` fields exist but were null on sampled rows). Central limit order book (it is Polymarket's); price tick $0.01; Yes and No books are mirrored (No bid = 1 - Yes ask) (H, orderbook fixture). Tokenisation of outcomes is Polymarket's (CTF ERC-1155 on Polygon) (M; follows from routing; Yeno's own docs say "shares" and do not describe tokens).
- **Legacy native design (L/M, `docs.yeno.trade`)**: docs describe an off-chain matching engine with deferred on-chain settlement through a Solana program `HNe9eM6s9dqaSCfTgZBou98NaoXMx8sq3PWTotPUtWme`, Solana USDC mint `EPjFWdd5...`, Privy embedded Solana wallet, admin `settle_event` resolution, build-sign-submit Solana transactions. I could not verify the program on-chain (a Solana JSON-RPC read is an HTTP POST, which this run may not do). Evidence it is no longer the live path: the last native (no `polymarketConditionId`) market in the feed was created 2026-06-28T10:40Z; all 52 CLOSED + 2250 RESOLVED + 457 ACTIVE markets created after 2026-06-26 carry Polymarket ids. Native phase: 749 CLOSED native markets created 2026-05-30 to 2026-06-28, 481 with non-zero volume, summed listed volume $96,632 (H, fixture `yeno_listing_stats_2026-10-19.json`; CLOSED scan was 17 pages, so the native count may be incomplete).
- **Chains and collateral**: Polymarket side = Polygon, pUSD/USDC via a per-user Polymarket deposit wallet (H, bundle). Yeno side: login via Privy (Google/X/Telegram/email/Phantom/MetaMask/Coinbase/Rabby/WalletConnect), deposits from Solana USDC or Base/Ethereum/Polygon/Arbitrum/BSC via Kana/XyraLabs aggregator and Polymarket's bridge, min deposit $5, min withdrawal $5 (H, `docs.yeno.trade`; guide page H). The marketing line "settles on Solana" is not reconcilable with the Polygon CLOB routing; treat Solana as the funding/UX layer (M).
- **Categories (active feed, 457 markets, 2026-10-19)**: tech 158, football 58, crypto 47 (5m/15m/1h/daily Up/Down for BTC, ETH, SOL, HYPE), global-news 45, NFL 36, NBA 26, weather 20, tweets 16, finance 14, culture 12, UFC 11, esports 4, cricket 4, AI 4, NHL 1 (H, fixture). Listed `volume`/`liquidity` fields are Polymarket's global figures (e.g. Iran-invasion market `volume` 74,632,969.34 equals Gamma `volumeNum` 74,632,969.34), not Yeno's.

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Docs | `https://docs.yeno.trade/` (JS single-page app; content lives in `app.js`, so WebFetch of the page shows only the nav). `https://yeno.market/docs/api` = "public API" page covering only `GET /api/v1/odds/:ticker` and `GET /api/v1/calibration`. Docs partly stale (section 2). | H |
| REST base | `https://api.yeno.trade/api` (also in `llms-full.txt`) | H |
| Auth | Public reads need none. Writes: `POST /api/users/sync` with a Privy access token returns a Yeno JWT (HS256); then `Authorization: Bearer <jwt>` plus `X-Privy-Access-Token` on non-GET. Requires a Privy login = account creation; not done. | H (docs) |
| Rate limits | Documented only qualitatively: global per IP "standard", trade writes tighter, auth strictest, per-user-per-market 10 req/60 s; 429 with `Retry-After`; orderbook GET "exempt from the trade rate limiter, safe to poll at 5-10 s". No numeric global limit NOT FOUND. ~90 GETs at <=2 req/s caused no 429. | H/M |
| WebSocket | `wss://api.yeno.trade`. Confirmed live: server sends `{"type":"CONNECTED"}`; `{"type":"SUBSCRIBE","channel":"market:<uuid>:orderbook"}` and `...:price` returned `SUBSCRIBED`; documented channel `markets:list` returned `{"type":"ERROR","message":"Subscription not allowed"}`. No pushes seen in 12 s on a quiet long-dated market, so push payload shapes are unverified (documented: `PRICE_UPDATE`, `NEW_TRADE`, orderbook same payload as REST; per-client buffer cap 1 MB). | H |

**Key public endpoints (confirmed unless noted)**
- `GET /api/markets?status=ACTIVE|CLOSED|RESOLVED&category=&limit=<=50&cursor=` : `{"success":true,"data":{"markets":[...],"nextCursor":"...","hasMore":true}}`. **Docs say limit max 100; server rejects >50** (`400 VALIDATION_ERROR "Number must be less than or equal to 50"`). Market row fields: `id` (UUID), `title`, `slug` (Polymarket slug), `category`, `topic`, `status`, `resolution`, `yesPrice`, `noPrice`, `volume`, `liquidity` (strings, Polymarket figures), `startDate`, `endDate`, `resolutionSource(Url)`, `outcomes[]`, **`polymarketConditionId`**, `isPolymarket`, `groupId`, `sportsMatchId`. Fixture `yeno_api_markets_list_sample_2026-10-19.json`.
- `GET /api/markets/:id`, `/api/markets/trending`, `/api/markets/search?q=`, `/api/markets/:id/midpoint`, `/api/markets/:id/spread`, `/api/markets/:id/polymarket-fee` (returned `{"feesEnabled":false,"feeDetails":null}` for the geopolitics sample) (search and polymarket-fee H; midpoint/spread M, docs only).
- `GET /api/trades/orderbook/:marketId` : `{"success":true,"data":{"market","timestamp","hash","tick_size":"0.01","min_order_size":"1","last_trade_price","yes":{"bids":[{"price","size"}],"asks":[...]},"no":{...}}}` (prices/sizes are strings; full depth up to 80 levels). Fixture `yeno_api_orderbook_iran_2026-10-19.json`. `hash` = 16-char content hash for dedup.
- `GET /api/v1/calibration` : returns `total_predictions: 0`, null Brier score (empty) (fixture). `GET /api/v1/odds/:ticker` is for finance tickers (not exercised; likely irrelevant).
- Resolution data: market rows carry `status` (ACTIVE/CLOSED/RESOLVED) and `resolution` (PENDING/YES/NO/VOID per docs; PENDING and YES seen). No separate resolution endpoint.
- Trades history is only per-user (`/api/users/me/trades`, auth). No public trade tape NOT FOUND via REST (WS `market:<id>:trades` documented, not verified).

## 4. Trade path

- Programmatic: **only through Yeno's authenticated backend**. Live path: `POST /api/trades/polymarket/order` (and `/exit`, `/cancel-all-open-orders`), body not documented (NOT FOUND; the public docs only describe the legacy native `POST /api/trades/order`, `/trades/preview-market-order`, `/trades/build-place-order-tx` -> `/trades/submit-tx` Solana flow). The client passes the user's Privy access and identity tokens to the backend, which suggests server-side signing with a delegated Privy wallet (M, inferred from bundle; not verified).
- No documented external-signer order interface (no EIP-712 order submission by the client, no API keys). Per-order BUY cap **$50** (H, docs + FAQ + guide), 50 open orders/market/user, idempotency header, tick $0.01.
- Auth bootstrap requires a Privy login (account creation), so none of this was exercised.
- For the aggregator: if the Polymarket leg is wanted, trade `clob.polymarket.com` directly (covered by the Polymarket workflow). Yeno gives no execution advantage.

## 5. PayBox reachability: **no**

- Orders are not signed by the customer's wallet in any externally reachable way: the embedded wallet is Privy-managed and the backend co-ordinates the Polymarket deposit wallet. A PayBox EVM or Solana credential cannot place, sign or cancel a Yeno order via `request_wallet_sign` or transaction proposals; there is no signed-order endpoint to send to.
- Funding only: PayBox could in principle transfer USDC to the user's Yeno deposit address (Solana USDC, or Base/Ethereum/Polygon/Arbitrum/BSC via the Kana swap), but that requires first creating a Yeno/Privy account to obtain the address and then holds funds in a custodial-style Privy/Polymarket deposit wallet. Not worth it versus Polymarket direct.
- PayBox discovery on 2026-10-19: `discover_plugins("polymarket")` and `discover_plugins("yeno")` both returned an empty list (H).

## 6. Liquidity sharing with Polymarket: **100%, not an independent leg**

- Market ids: every one of 457 active feed rows has a `polymarketConditionId` (H, fixture `yeno_listing_stats_2026-10-19.json`).
- Book mirror (H, fixture `yeno_vs_polymarket_book_compare_2026-10-19.json`, fetched ~01:10Z): for "Will the U.S. invade Iran before 2027?" Yeno `/trades/orderbook` and Polymarket `clob.polymarket.com/book?token_id=<yes token>` both had 15 bid and 80 ask levels with identical price and size at every level (e.g. bid 0.15 x 64,985.81; ask 0.16 x 70,450.19). Same result (full depth identical) for "Pro Football: 2027 Champion" and "Anthropic announces bankruptcy by...?"; "EPL: 2027 Champion" identical for the top 5 levels with a deeper-level difference (live movement); BTC daily Up/Down differed on a fast-moving book. Yeno's No side is exactly the mirror of the Yes side.
- Differences that matter only for sizing: Yeno `min_order_size` 1 vs Polymarket 5; Yeno BUY cap $50/order.
- Fee link: the Polymarket builder fee endpoint `https://clob.polymarket.com/fees/builder-fees/0x5bffd61a...` returns `{"builder_maker_fee_rate_bps":50,"builder_taker_fee_rate_bps":100,"enabled":true}` (H, fixture `polymarket_clob_builder_fees_yeno_2026-10-19.json`); the same constants are hard-coded in the Yeno bundle.
- Therefore Yeno quotes always equal Polymarket quotes; Yeno-vs-Polymarket spreads cannot exist except as the fee wedge.

## 7. Fees

- **Builder fee (H)**: 100 bps taker, 50 bps maker, set on Polymarket's CLOB under Yeno's builder code. Paid by the trader on top of Polymarket's own fees. DefiLlama: 30d fees $11,717 vs 30d volume $1,194,041 (0.98%), 24h fees $973 (H), consistent with ~1% of notional on mostly taker flow (M).
- **Yeno Terms fee table (H, `https://yeno.market/terms`, read via WebFetch)**: formula "Shares x Fee Rate x Price x (1 - Price)", applied at match time per category. Taker: Crypto 0.08; Sports, Economics, Culture, Weather, Other/General 0.06; Finance, Politics, Mentions, Tech 0.05; Geopolitics 0.01. Maker: 0.5 in every category (unit not stated; plausibly 50 bps, M). The page does not say who pays beyond the taker/maker distinction.
- **Polymarket's own schedule (H, `https://docs.polymarket.com/trading/fees`, read 2026-10-19)**: taker Crypto 0.07, Sports 0.05, Economics/Culture/Weather 0.05, Finance/Politics/Tech/Mentions 0.04, Geopolitics 0; maker 0 with 15-25% rebate. Yeno's taker rates are each exactly Polymarket's + 0.01, which suggests Yeno's displayed "Trading Fee" is Polymarket's protocol fee plus the builder fee (M, inference). Yeno shows the exact fee in the order confirmation (H, guide).
- Unresolved: Terms shows a p(1-p) formula while DefiLlama's 0.98% fees/volume fits flat bps of notional. Either way, expect >= 1% taker cost over Polymarket direct (M).
- Other costs: deposit/withdraw swap or bridge fees quoted by Kana aggregator; Solana tx fees; min deposit and withdrawal $5.

## 8. Resolution and dispute risk

- Mirrored markets resolve according to **Polymarket's resolution** (UMA Optimistic Oracle, per Polymarket's rules; Yeno's feed carries `resolutionSource` for crypto 5m markets, e.g. "Chainlink TWAP (60s)" for SOL) (M; not independently re-verified on Polymarket this run). Yeno does not resolve these itself.
- Yeno's own text says a Yeno "Oracle" / admin records outcomes on Solana and that Yeno "may create, modify, suspend, cancel, or delist Markets at its discretion"; cancelled markets are settled "at the last traded price or refunded at the entry price, at YeNo's discretion"; disputes: Yeno "may at its discretion open a review ... its determination is final" (H, Terms bundle text). `docs.yeno.trade` says "The Yeno admin team resolves markets" (H, stale for mirrored markets).
- Risk for a Polymarket-vs-Yeno pair: none on resolution mapping (same underlying), but an **extra operator/custody risk** (Yeno's delisting, pause or settlement discretion, plus the Privy/deposit-wallet layer). Admins can pause any market (docs).

## 9. Geo / ToS / automation

- **Restricted jurisdictions (H)**: Terms list includes the United States, Cuba, Iran, North Korea, Syria, Crimea, DPR, LPR "and any other jurisdiction where use o[f]..." is unlawful. The frontend blocks by CDN country cookie `yeno-region`: IN, ID, AU, BE, BY, BI, BR, CF, CD, CU, DE, ET, FR, GB, IR, IQ, IT, JP, KP, LB, LY, MM, MT, NI, NL, PL, RU, SG, SO, SK, SS, SD, SY, TH, TW, UA, UM, US, VE, YE, ZW (41 codes; the backend also returns a `REGION_RESTRICTED`-style error, M).
- **Automation (H)**: Terms "Prohibited conduct" bans "Unauthorised automated trading, including bots, scripts, or algorithms used without prior written authorisation from YeNo". Also bans wash trading/multiple accounts/using from a Restricted Jurisdiction. The public API docs nonetheless describe order endpoints; `ai.txt` says "Do not scrape authenticated APIs, private account data, or rate-limit the site".
- Terms also say Yeno "may use off-chain order matching" and that it "does not hold settled funds" (marketing; unverifiable). Withdrawals to Solana/EVM addresses supported.

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Builder-routed volume, last day | $152,166, 189 active users, rank 30 | Polymarket `data-api.polymarket.com/v1/builders/volume`, row 2026-10-18 | H |
| Builder volume last 7 / 30 days / since 2026-06-22 | $560,704 / $1,589,237 / $2,926,027 (my sums of daily rows) | same, through 2026-10-18 | H |
| Daily range, 2026-10-09 to 2026-10-18 | $56K to $152K/day | same | H |
| DefiLlama dexs 24h / 7d / 30d / all-time | $57,242 / $410,971 / $1,194,041 / $2,114,068 | `api.llama.fi/summary/dexs/yeno`, 2026-10-18 row | H |
| DefiLlama fees 24h / 30d / all-time | $973 / $11,717 / $20,614 | `api.llama.fi/summary/fees/yeno` | H |
| TVL | none (empty) | `api.llama.fi/protocol/yeno` | H |
| Share of builder-routed Polymarket volume (2026-10-18) | ~0.48% ($152K of $31.7M across 201 builder rows) | data-api builders | H |
| Depth | equals Polymarket's depth (e.g. Iran market ~$0.48M liquidity per Gamma) | fixtures | H |

DefiLlama and Polymarket's own builder API disagree by ~1.4x on volume (e.g. 30d $1.19M vs $1.59M); do not use either for edge sizing.

## 11. Overlap with other venues

100% overlap with Polymarket (crypto Up/Down 5m-daily, soccer/NFL/NBA/UFC/esports/cricket, politics and geopolitics, weather, tweets, tech/AI, finance). Because it is the same book, it is a duplicate of Polymarket, not an additional arbitrage venue. Cross-venue edge versus Kalshi/Limitless/Predict.fun etc. must be taken against Polymarket itself.

## 12. Adapter sketch (only if ever built; recommended: do not)

- Skip as a venue. If a "Yeno demand" signal is wanted: poll Polymarket `data-api.polymarket.com/v1/builders/volume` (row with `builderCode` 0x5bffd61a...) daily.
- If a Yeno mirror feed is ever wanted: `GET /api/markets?status=ACTIVE&limit=50` paginated by `nextCursor` (457 rows = 10 requests), join to Polymarket by `polymarketConditionId`, and drop the row (it is the same market).

## Suspicious / untrusted content

- `https://yeno.market/llms.txt`, `llms-full.txt`, `ai.txt` and the homepage "FAQ" are AI-targeted marketing summaries making claims the app contradicts (e.g. "YeNo settles on Solana", "Central limit order book matching; settlement on Solana"). They contain no instructions aimed at an agent beyond crawler policy ("Do not scrape authenticated APIs ... or rate-limit the site"); nothing was followed. Treated as promotional/inaccurate.
- `docs.yeno.trade` content is stale versus the production bundle (Solana program, admin resolution, docs say list limit 100 while server enforces 50, documented WS channel `markets:list` rejected).
- Site claims "YeNo is not affiliated with yeno.pro or similarly named products" (namesake risk).

## Open questions

1. Exact order path and signer for `POST /api/trades/polymarket/order` (client-signed EIP-712 vs server-side delegated Privy signing); needs an authenticated session (not allowed).
2. Whether the legacy Solana program `HNe9eM6s...` is still deployed/used (needs a Solana RPC POST or explorer lookup).
3. Whether Yeno's Terms "Trading Fee" is additive to Polymarket's protocol fee, and whether the builder fee is flat bps of notional or p(1-p) scaled.
4. Operator jurisdiction and licensing.
5. WS push payloads (quiet markets); a busy 5-minute crypto market would show `PRICE_UPDATE`/orderbook messages.

## Sources

- https://yeno.trade (301) and https://yeno.market/ , https://yeno.market/about , https://yeno.market/terms , https://yeno.market/robots.txt , https://yeno.market/sitemap.xml , https://yeno.market/llms.txt , https://yeno.market/llms-full.txt , https://yeno.market/ai.txt , https://yeno.market/docs/api (H)
- https://yeno.market/assets/index-TUT8OxpJ.js (production app bundle, read as text; builder code, geo list, Polymarket endpoints, fee constants, Terms strings) (H)
- https://guide.yeno.trade/ and https://docs.yeno.trade/ (including https://docs.yeno.trade/app.js, the docs content) (H, partly stale)
- https://api.yeno.trade/api/markets , /api/markets/search , /api/trades/orderbook/<id> , /api/markets/<id>/polymarket-fee , /api/v1/calibration , wss://api.yeno.trade (H, unauthenticated GETs and WS subscribe, 2026-10-19)
- https://clob.polymarket.com/book , https://clob.polymarket.com/fees/builder-fees/0x5bffd61a6dbfca06f19a543cac4b9e433378ac9992d70b8a40824720e353498f , https://gamma-api.polymarket.com/markets?condition_ids=... , https://data-api.polymarket.com/v1/builders/volume (H)
- https://docs.polymarket.com/trading/fees (H)
- https://defillama.com/protocol/yeno (403 to non-browser); https://api.llama.fi/protocol/yeno , https://api.llama.fi/summary/dexs/yeno , https://api.llama.fi/summary/fees/yeno (H); `DefiLlama/dimension-adapters` `factory/polymarket.ts` via `gh api` (H)
- WebSearch: not available this run (session search budget exhausted); no third-party coverage of Yeno was found or used.
- Fixtures: `docs/research/fixtures/yeno/{yeno_api_markets_list_sample,yeno_api_orderbook_iran,yeno_api_v1_calibration,yeno_vs_polymarket_book_compare,yeno_listing_stats,yeno_ws_probe,defillama_yeno_dimensions,polymarket_clob_builder_fees_yeno}_2026-10-19.json` and `polymarket_builders_volume_yeno_last14d.json`
