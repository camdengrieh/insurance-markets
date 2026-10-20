# Banana Gun / Banana Predict (bananagun.io, predict.bananagun.io) - venue spec

Researched 2026-10-19. Read-only: public web pages, docs.bananagun.io, Polymarket public Data API and CLOB builder-trades endpoint, Polymarket docs, DefiLlama public API. No account, wallet, POST, signing, payment or browser automation. Generic User-Agent only.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak, stale or ambiguous.

## Verdict

- Adapter priority: **skip** (as a venue). Banana Gun is **not a venue**. It is a multi-chain Telegram trading bot company (memecoin sniping, copy trading) that in July 2026 launched **Banana Predict**, a web front end on **Polymarket's markets, odds and liquidity** (H: Banana Gun blog guide dated 2026-10-16, "runs on the same Polymarket markets, the same odds, and the same liquidity"). Orders are attributed with a Polymarket **builder code** (H, leaderboard row below). Zero independent liquidity: never an independent arbitrage leg.
- No public or documented API of its own; no programmatic trade path of its own.
- Residual value: a small, labelled **flow slice**. Polymarket's public `GET /builder/trades?builder_code=...` returns every Banana-routed trade (size, price, market, wallet). It is thin (see Liquidity), so low signal value. A copy-trade leaderboard exists on predict.bananagun.io but is undocumented and unprobed.

## Liveness (still live in 2026?)

Live but tiny as a Polymarket router, as of 2026-10-19 (H).

- Banana Gun main site and docs live (H, https://bananagun.io/, https://docs.bananagun.io/llms.txt). Unified Telegram bot post dated 2026-08-17 (H, blog.bananagun.io). Homepage lists "Banana Predict" as a product (H).
- Banana Predict launch: press release dated 2026-07-21 (M, https://www.crypto-reporter.com/press-releases/banana-gun-enters-prediction-markets-with-the-launch-of-predict-129349/ , sponsored-style); copy-trade guide dated 2026-10-16 (H, blog.bananagun.io).
- Live order flow (H): `clob.polymarket.com/builder/trades?builder_code=0xaa439c5a...60e2` returned 300 rows, `createdAt` 2026-10-16T22:56Z to 2026-10-19T05:28Z (about 2.3 days), total sizeUsdc about $1,964, 8 distinct wallets, 113 distinct markets. So roughly $850/day, a handful of users.
- Polymarket builder leaderboard v2 (H, fetched 2026-10-19, cursor-paged): "Banana Gun", verified, rank 196 ALL (volume 440,642, 129 active users), rank 123 MONTH (35,230; 18 users), rank 140 WEEK (483.57; 5 users), rank 108 DAY (75.86; 2 users). Unit of `volume` is not stated in what I read; a sibling note (polycop-predictions.md) believes shares, and the trade sample ($1,964 over 2.3 days against 483 for a week) does not reconcile cleanly, so treat as order of magnitude only (L).
- Builder code (public attribution id, not a secret): `0xaa439c5a381ab133126b9a485e97d7890b138550ba04b79a57941fa2614860e2` (H).
- DefiLlama has a `banana-gun` protocol (category "Telegram Bot", no chains, no TVL) but **no** dexs/volume entry for Banana Predict (H: `api.llama.fi/summary/dexs/banana-predict` returns "not found").
- Token: $BANANA holders get 40% of platform trading fees (H, Aug 2026 blog). Company-claimed cumulative bot volume about $16B / 1.2M users is unverified marketing (L).

## Kind and market model

- Kind: broker / frontend / copy-trading terminal (H). Banana Predict features (M, press release and blog, consistent): Yes/No share markets across twelve categories (Politics, Sports, Crypto, Elections, geopolitics ...), tabs Trending / Breaking / New / Recurring / Bonding, live order book, price charts, per-market Rules section, comments, My Orders, Portfolio, leaderboard by PnL and volume, Copytrade (mirrors leaderboard wallets' open positions proportionally to a user-set allocation), Wallet Tracker, X/Social tracker. "Mobile-first web app"; connect a wallet, no separate account (M).
- Market model: whatever Polymarket offers: binary and neg-risk multi-outcome CLOB, ERC-1155 conditional tokens (M, Polymarket's design, covered by the Polymarket workflow). Banana adds no market type. Sample outcomes (H, n=300): Up/Down crypto short-term markets (about half), team-name sports outcomes, Yes/No.

## Chains and collateral

- Banana Predict: Polygon (Polymarket) (M: one third-party guide says "EVM compatible wallet that works on Polygon"; builder-attributed Polymarket trades necessarily settle there). Collateral is Polymarket's (USDC.e / pUSD after Polymarket's collateral change; the fees doc example uses "pUSD", H https://docs.polymarket.com/builders/fees.md).
- Banana Gun bot overall: ETH, SOL, BSC, BASE, ROBINHOOD, STABLE, HYPEREVM, MEGAETH (H, bananagun.io). None of these other chains host prediction markets from Banana.
- Custody for Banana Predict: NOT FOUND (searched: bananagun.io, blog copy-trade guide, press release, docs index; guide says only "connect a wallet"). Do not assume custodial or proxy.

## Read API

- `exists`: **none** for Banana itself. NOT FOUND (searched: docs.bananagun.io llms.txt full index (Welcome, tokenomics, rewards, official links, supported DEXes, Telegram Scraper, privacy, ToS; no Predict or API page), predict.bananagun.io (WebFetch returned only the title; page is a JS app), bananagun.io, blog copy-trade guide, DefiLlama, web search "Banana Predict API"). A GitHub search was not run; no official repo was linked from any page I read.
- Usable indirect reads on Polymarket hosts (not Banana's), all public and keyless:
  - `GET https://clob.polymarket.com/builder/trades?builder_code=<code>[&next_cursor=<cursor>]` (H, HTTP 200, 275 KB, 300 rows per page, `{data, next_cursor, limit, count}`). Row fields: `id, tradeType (TAKER|MAKER), takerOrderHash, builder, market (condition id), assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker (wallet), transactionHash, matchTime, bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`. Fixture: `fixtures/banana-gun/clob_builder_trades_banana_gun_sample3.json` (3 rows, maker and owner redacted).
  - `GET https://data-api.polymarket.com/v2/builders/leaderboard?time_period=all|month|week|day&limit<=50&cursor=...` (H). Cursor-only paging: passing `offset` returns an `invalid_request` error. Response `{data:[{rank, builder_name, builder_code, profile_image, verified, volume, active_users}], pagination:{limit, offset, has_more, next_cursor}}`. Banana Gun sits at rank 196 of 592 (ALL), so it needs about 4 pages. Fixture: `fixtures/banana-gun/polymarket_data_api_v2_builders_leaderboard_all_banana_gun_row.json`.
  - v1 leaderboard (`/v1/builders/leaderboard`, the discovery evidence URL) is retired on 2026-10-24 per the sibling PolyCop note (M, from Polymarket migration doc read by that workflow). It also caps at limit 50 with no useful offset: the v1 call in the evidence URL lists only the top 50, where Banana Gun does not appear (H, I checked), so the "$0.44M, 129 users" figure comes from deeper pages of the leaderboard.
- Auth, rate limits, WebSocket: NOT FOUND for Banana. Polymarket's own market data (Gamma, CLOB books, WS) is the real read surface and belongs to the Polymarket adapter.

## Trade path

- **None of Banana's own.** Orders are placed via the predict.bananagun.io web UI with a connected wallet; mechanism (client-side signing vs server key) NOT FOUND. Banana's Telegram bot copy trading is separate and follows on-chain DEX wallets, not Predict (H, blog guide).
- Canonical write path for the same markets is Polymarket's CLOB (EIP-712 signed orders, builder code in the order), owned by the Polymarket adapter. If builder revenue is wanted, register our own builder code rather than routing through Banana.

## PayBox reachability

- `no` for Banana itself: no endpoint, no tx-proposal flow, custody undocumented. A PayBox EVM wallet could trade the underlying markets only via Polymarket directly (Polygon). Funding Banana Predict through its UI would put the trade path under a third party for a 1% extra cost; not recommended.

## Fees

- Banana Predict builder fee measured on-chain (H, n=300 rows, 2026-10-16 to 2026-10-19): `builderFee / sizeUsdc` = 0.9983% to 1.0000% on 299 TAKER rows (i.e. **100 bps taker**, the Polymarket cap) and 0.4999% on the single MAKER row (**50 bps maker**, the cap). Banana publishes no Predict fee table (NOT FOUND, searched: ToS, docs index, blog, press release; one third-party site also says none is published, L).
- Rules (H, https://docs.polymarket.com/builders/fees.md): user pays; builder fee is additive to Polymarket platform fees; taker max 100 bps, maker max 50 bps; builder may change rates once every 7 days, effective 3 days after scheduling. `feeUsdc` in the sample is Polymarket's fee column and was non-zero (e.g. 0.046 on a $2 trade) alongside `builderFee` 0.02.
- Net: routing via Banana costs about 1% more per taker leg than direct Polymarket. Strictly worse than direct for arbitrage cost models.
- Banana ToS 8.3 (H, https://docs.bananagun.io/resources/terms-of-service.md): fees non-refundable, may change at any time without notice, auto-deducted.

## Resolution mechanism and dispute risk

- Identical to Polymarket (UMA optimistic oracle based, covered by the Polymarket workflow). The press release says "UMA-style oracle process" (M). Banana does not resolve anything; dispute risk is Polymarket's plus Banana front-end risk (settlement of Banana-held positions if custodial is unknown).

## Geo / ToS / automation

- Banana ToS: services limited to an "Eligible Person" (term not defined in the excerpt WebFetch returned), company may reject any user at any time for any reason (s.8.5), may delay orders and disclaims responsibility for execution (s.8.2) (M: from a WebFetch summary, not read verbatim). No prediction-market specific terms, geo list or bot/automation rules found (NOT FOUND, searched: terms-of-service.md, docs index, blog). Polymarket geo and ToS apply to the underlying markets.
- Security history: Sept 2024 Telegram bot exploit, about $3M refunded (M, https://www.blocmates.com/news-posts/telegram-trading-bot-banana-gun-to-refund-3-million-to-users, via search result only; relates to the Telegram bot, not Predict).

## Liquidity

- All depth is Polymarket's. Banana-routed flow: about $850/day over the last 2.3 days, 8 wallets in a 300-trade sample (H, 2026-10-19). Leaderboard ALL 440,642 / MONTH 35,230 / WEEK 483.57 (H, unit uncertain). Negligible next to Polymarket's own volume; the top builders (betmoar $2.3B, Gate $885M, PolyCop $373M, ALL, H) dwarf it.
- Liquidity shared with: **Polymarket** (100%). Not independent.

## Event coverage overlap

- All of Polymarket's categories (crypto Up/Down, sports, politics, macro, geopolitics), hence every overlap with other venues is Polymarket's overlap. Nothing exclusive.

## Open questions

- Is Banana Predict wallet custody client-side signing or server-held key? (Affects nothing for us unless we use it.)
- Does the Predict leaderboard / copytrade expose a usable public wallet-ranking endpoint? Not probed; undocumented, so not recommended.
- Unit of Polymarket builder-leaderboard `volume` (USDC vs shares) is not reconciled.

## Suspicious content

- None found. Third-party pages (price-prediction sites, sponsored reviews) are promotional; no embedded instructions to AI agents noticed.

## Sources

- https://bananagun.io/ (H) products, chains, Predict listed
- https://docs.bananagun.io/llms.txt (H) docs index, no Predict/API page
- https://docs.bananagun.io/resources/terms-of-service.md (M, summarised)
- https://blog.bananagun.io/blog/banana-gun-launches-unified-telegram-trading-bot-one-interface-every-chain-every-tool (H, 2026-08-17)
- https://blog.bananagun.io/blog/how-to-copy-trade-on-banana-predict-full-guide (H, 2026-10-16) same Polymarket liquidity, copytrade
- https://predict.bananagun.io/ (title only, JS app)
- https://www.crypto-reporter.com/press-releases/banana-gun-enters-prediction-markets-with-the-launch-of-predict-129349/ (M, press release 2026-07-21)
- https://data-api.polymarket.com/v2/builders/leaderboard (H, fetched 2026-10-19)
- https://clob.polymarket.com/builder/trades?builder_code=0xaa439c5a381ab133126b9a485e97d7890b138550ba04b79a57941fa2614860e2 (H, fetched 2026-10-19)
- https://docs.polymarket.com/builders/fees.md (H)
- https://api.llama.fi/summary/dexs/banana-predict and /protocols (H, not found / Telegram Bot entry)
- https://www.blocmates.com/news-posts/telegram-trading-bot-banana-gun-to-refund-3-million-to-users (L/M, search result only)
- Sibling note docs/research/venues/polycop-predictions.md (same pattern, v1 retirement date)
