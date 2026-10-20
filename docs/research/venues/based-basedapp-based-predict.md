# Based (BasedApp / Based Predict) - venue spec

Researched 2026-10-19 (probes ran about 00:50-01:20 UTC). READ-ONLY: public web pages, the GitBook `.md` mirrors, `based.one/llms.txt`, DefiLlama public API, CoinGecko public API, `gh api` raw reads of DefiLlama's adapter repo, Polymarket's public builder feeds and Gamma API (unauthenticated GET), and static text reading of the app's server-rendered HTML and two public JS chunks (downloaded as text, never executed). No account, no wallet, no POST, no signing, no payments, no browser automation. Generic User-Agent `insurance-markets-research/0.1` only. Based's own backend was NOT probed (it has no documented API).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures: `docs/research/fixtures/based-basedapp-based-predict/` (section 12).

---

## 0. Bottom line

1. **Based is a wallet/front end, not a venue. "Based Predict" is a Polymarket front end.** Based's own docs say it offers "PolyMarket prediction markets inside the same app" as Hyperliquid perps/spot (H, https://basedapp.gitbook.io/docs/based/prediction.md). The live `app.based.one/predict` page is server-rendered with Polymarket Gamma data: for market `2589810` the embedded `clobTokenIds`, volume, liquidity and tick size equal what `gamma-api.polymarket.com/markets/2589810` returns (H, fixture `based_predict_ssr_market_vs_polymarket_gamma.json`). The app JS builds a Polymarket CLOB client (minified; the package name is not visible) with `chain: 137`, `signatureType`, `funderAddress` and `builderConfig: {builderCode}`, and opens Polymarket's user WebSocket `wss://ws-subscriptions-clob.polymarket.com/ws/user` (H, JS chunk 21512). DefiLlama registers it in its Polymarket builder-code factory (H).
2. **"BasedApp Outcome" (the Hyperliquid HIP-4 entry) is a DefiLlama auto-listing of Based's Hyperliquid builder code, not a Based product page.** It counts any HIP-4 fill carrying Based's builder address. It has $78.1k lifetime volume since 2026-05-02, $0.5 over 30 days and $0 over 7 days (H, DefiLlama, 2026-10-19). Based's docs, `llms.txt` and the SSR predict page contain no mention of HIP-4 or outcome markets (H, grep = 0 hits).
3. **No independent liquidity.** Every Based Predict order lands on Polymarket's CLOB. Polymarket's own builder feed shows Based-attributed share notional of 14.4k over 2026-10-12..18 against 181.6M across all builders (about 0.008%) (H, computed). It is **not** an independent arbitrage leg.
4. **No public API of its own.** Prices, books, trades and resolution all come from Polymarket (and, for the dead outcome route, Hyperliquid).
5. **adapter_priority = skip.** An aggregator should read and trade Polymarket directly (covered by the parallel Polymarket workflow) and Hyperliquid HIP-4 directly (see `docs/research/venues/hyperliquid-outcomes-hip-4.md`). Based adds a flat 1% builder fee on top, a geo layer and no new price. The one useful by-product: Based's builder-code feed is a free, public signal of how much retail flow routes through this app (negligible).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://app.based.one/predict | HTTP 200, 3.6 MB SSR page titled "Prediction Markets \| Based Trading \| Based", embeds current Polymarket events (e.g. "Fed Decision in October?", endDate 2026-10-29) | H |
| Newest Based-attributed Polymarket trade | `clob.polymarket.com/builder/trades?builder_code=<Based>` newest row in page 1: `createdAt 2026-10-18T09:17:02Z` | H |
| Daily activity | Polymarket builder feed: 88 of the last 90 days (2026-07-21..2026-10-18) have a Based row; last row 2026-10-18, rank 197 that day (rank 72 to 186 in the last two weeks) | H |
| DefiLlama "Based Predict" (id 7123, chain Polygon, category Interface) | 24h $1.91, 7d $3.68k, 30d $12.3k, lifetime $441.7k, series starts 2026-07-05 in the API (adapter `start` 2025-11-18) | H |
| DefiLlama "BasedApp Outcome" (id 8963, chain Hyperliquid L1, tag "Hyperliquid HIP4 Builder", listedAt 2026-10-08) | 24h 0, 7d 0, 30d $0.5, lifetime $78,120; 76 non-zero days since 2026-05-02, the last being 2026-10-03 with $0.50 (dust) (fixture) | H |
| Company/brand | `based.one/llms.txt`: ">$44 billion lifetime trading volume", ">100,000 users", "~$20 million annualised revenue", Series A $11.5M Feb 2026 led by Pantera; product pitch is now Hyperliquid perps, stock perps, Based Cash card, Based AI | H |
| Product focus drift | `based.one/llms.txt` (Oct 2026) and `based.one/md/about` never mention prediction markets; the HyENA HIP-3 market was sunset 2026-08-28 | H |

Verdict: **still_live = true** (the Polymarket route trades daily), but prediction markets are a side feature with tiny usage, and the Hyperliquid outcome route is effectively unused.

---

## 2. Kind and market model

- **Kind:** self-custody wallet / trading super-app and **builder-code front end** for (a) Polymarket on Polygon and (b) Hyperliquid perps/spot, with a nominal HIP-4 outcome attribution. "Based is not a broker" and "does not hold user funds" (H, https://based.one/llms.txt, https://based.one/md/about).
- **Market model (inherited from Polymarket):** binary Yes/No outcome tokens with `clobTokenIds` pairs, order book (CLOB), `negRisk` multi-outcome events (neg-risk flag present in SSR data), `orderMinSize 5`, `orderPriceMinTickSize 0.001` (H, SSR vs Gamma fixture). Based UI has list, card and calendar views, filters by status/volume/liquidity/date, and a Top Traders leaderboard (H, docs Prediction page).
- **Tokenisation:** Polymarket conditional tokens (ERC-1155 position tokens on Polygon). Based mints nothing of its own (M inference, consistent with H evidence above; Based publishes no contract addresses for any prediction product - docs "Official Links" lists none, H).
- **Hyperliquid outcome route:** HIP-4 outcomes are fully collateralised Yes/No tokens on HyperCore. That model is covered in `docs/research/venues/hyperliquid-outcomes-hip-4.md`. Whether the Based UI can place HIP-4 orders at all is **unconfirmed**: no doc, `llms.txt` or SSR mention (H for absence), only DefiLlama's builder-address attribution (H) and the 2026-05-02..2026-06 trickle of volume (H, fixture).

## 3. Chains and collateral

- **Prediction (Polymarket route):** Polygon, chainId 137 (H, JS `chain:137`; DefiLlama chain "Polygon"). Collateral: the JS carries the legacy bridged USDC address `0x2791bca1...4174` plus newer constants and both wallet modes `legacy-safe` (Polymarket Gnosis Safe, `signatureType POLY_GNOSIS_SAFE`) and `new-deposit` (Polymarket deposit-wallet batches via a relayer `/submit` with `type: "WALLET"`) (H, JS chunk 21512). This matches Polymarket's V2 transition (pUSD, deposit wallets) described in `docs/research/08-venues-polymarket-kalshi.md` (H there). Funding from other chains goes through Relay (`api.relay.link`, `/quote/v2`) (H, JS).
- **Perps/spot/outcome route:** Hyperliquid L1 (HyperCore), USDC. Extra Based token chains (BASED): Ethereum `0x4f2b...ed87`, BSC, Hyperliquid, HyperEVM (H, CoinGecko API). The BASED token is not collateral for any market.
- **Wallet model:** several wallets can be linked to one Based account; Standard / Unified / Portfolio Margin account modes; "builder code addresses accrue fees only in Standard mode" (H, docs Web Terminal). Auth/embedded-wallet vendor NOT FOUND (searched: docs Web Terminal, About, llms.txt).

## 4. Read API

- **Official Based API:** **none documented.** NOT FOUND (searched: gitbook `llms.txt` index of all docs pages, Web Terminal, Prediction, Fees, About, Official Links (which says "Not found ... API, GitHub, contract addresses"), `based.one/llms.txt`, `based.one/md/about`). The Web Terminal page defers to "Hyperliquid's API docs" only for the perps side (H).
- **Undocumented first-party proxy (do not integrate):** the app calls its own Next.js routes `/api/polymarket/activity/`, `/positions/`, `/closed-positions/`, `/userOpenOrders/`, `/balance-portfolio/` and, for writes, `/api/polymarket/clob-proxy/order` and `/clob-proxy/cancel` (H, JS chunk 21512; routes only read as text, never called). They are per-user, require the user's L2 credentials, and are not a contract.
- **Real data sources an adapter should use instead:**
  - Polymarket Gamma `https://gamma-api.polymarket.com` (markets, events; no auth), CLOB `https://clob.polymarket.com` (books, prices; no auth for reads), Data API `https://data-api.polymarket.com/v2` (trades, resolutions; no auth), WebSocket `wss://ws-subscriptions-clob.polymarket.com/ws/...` (H, see `08-venues-polymarket-kalshi.md` sections 2.x and the Based JS which uses the `/ws/user` channel).
  - Hyperliquid info API and WebSocket for HIP-4 (see the HIP-4 note; not probed here because the info API is POST-only).
- **Attribution feeds (the only Based-specific read data), all unauthenticated GET (H):**
  - `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90` -> rows `{date, rank, builder_name:"Based", builder_code, volume (share notional), active_users}`.
  - `GET https://clob.polymarket.com/builder/trades?builder_code=0x07aa1a8523160e8e9c2d07ac890d56d21c3fe0f11292558f941f69624788d1cf` -> `{data:[trade], next_cursor, limit:300, count}`; trade fields include `side, size, sizeUsdc, price, outcome, market, assetId, fee, feeUsdc, builderFee, builderCode, matchTime, createdAt`, plus third-party `owner`/`maker` (redacted in the fixture).
  - DefiLlama `GET https://api.llama.fi/summary/dexs/based-predict`, `/summary/dexs/based-app-outcome`, `/summary/fees/...`.
- **Rate limits / WebSocket:** none documented by Based (NOT FOUND). Polymarket's apply (see Polymarket note).

## 5. Trade path

- **Via Based:** none usable. Orders are signed in the user's browser/app with the Polymarket CLOB client and POSTed through Based's own proxy; Based's builder code is injected via `builderConfig` (H, JS). No order API, no API keys, no agent wallets are documented (H absence). Telegram bot and desktop app exist (docs index, H) but are UI surfaces, not APIs.
- **Via the underlying venues (the sensible path):** place Polymarket orders directly (EIP-712 signed CLOB orders on Polygon 137, L2 API creds, optional Builder Program code of the project's own) per `08-venues-polymarket-kalshi.md`; place HIP-4 orders directly on Hyperliquid per the HIP-4 note. Using Based's builder code from someone else's order flow is not appropriate ("builder codes should only be attached to orders from apps you control", Polymarket docs, M via `cro-trade-predict.md`).

## 6. PayBox / EVM wallet reachability

- **Based itself: no** (no API, no transaction proposals, no signed-order interface; Safe/deposit-wallet setup is done inside its UI).
- **Underlying venues: partial/unknown, inherited.** Polymarket on Polygon needs EIP-712 typed-data signing (`request_wallet_sign` typedData) and POL gas or the relayer; whether PayBox exposes Polygon at the tool level was unverified in the Polymarket note ("a `discover_tokens(mode=chains, query=polygon)` check is the follow-up"). HIP-4 needs Hyperliquid L1 action signing; PayBox tool descriptions name Hyperliquid (999) per the same note (M). I did not call any PayBox tool. Reachability is therefore the Polymarket/HIP-4 specs' question, not a Based question.
- Value of routing via Based for a PayBox wallet: negative (extra 1% fee, no unique liquidity).

## 7. Fees

- **Polymarket route (H):** Polymarket's own platform fee (taker-only, per-market `feeSchedule`, formula `C x feeRate x p x (1-p)`, see Polymarket note) **plus Based's builder fee of 1%**. Docs: "Based adds an extra 1% on top of Polymarket's trading fees" (H, docs Prediction page). The Based docs also print `fee = round up (0.07 x C x P x (1-P))` with "100 contracts at $0.50 cost $1.75" and "Sells carried no fees as of 12 Dec 2025" - the 0.07 coefficient is Polymarket's crypto-category rate only and the page's sell-fee statement is dated about 10 months ago, so treat it as **stale (L)**; live Polymarket fee rates vary per market (0 to 0.07, per `08-venues-polymarket-kalshi.md`).
- **Observed builder fee (H, computed from 300 consecutive Based-attributed trades, 2026-09-10..2026-10-18, $17.3k notional, 200 markets):** `builderFee / sizeUsdc = 0.0100` on every row, for BUY and SELL and for both TAKER and MAKER rows (min = max = 0.01). Open question: this exceeds the 50 bps maker cap quoted in the cro-trade note from Polymarket's builder-fee docs (M there); either the cap changed or `tradeType` MAKER does not mean what it seems. Not resolved.
- **Hyperliquid side (H, docs Fees):** total = Hyperliquid fee + Based builder fee. Perps 0.045% HL taker + 0.025% builder = 0.070%; "growth-mode" perps 0.009% + 0.002% = 0.011%; spot buy 0.070%, spot sell 0.070% + 0.1% builder; Diamond staking (600k+ BASED) removes the builder fee. No separate schedule is published for HIP-4 outcome trades (NOT FOUND, searched: docs Fees, llms.txt). Hyperliquid itself charged zero opening fees on HIP-4 in early testing (M, secondary).
- **Who pays:** the trader; up to 76% of builder fees are redistributed to affiliates (H, docs Fees).
- **Funding/bridging:** Relay quote fees apply when bridging in; Based's swap product charges a 1% app fee (H, DefiLlama description of "Based Aggregator"). Not Polymarket-specific.

## 8. Resolution and dispute risk

- Based does not resolve anything. Markets resolve exactly as on Polymarket: UMA Optimistic Oracle (proposal bond, 2-hour challenge, DVM escalation on repeat dispute, 50/50 possible) and Chainlink for up/down markets (H, `08-venues-polymarket-kalshi.md` section 2.10; not re-verified today).
- For any HIP-4 outcome the resolution is Hyperliquid's (validator/oracle-set mark-price settlement per the HIP-4 note; I did not re-read it).
- Extra risk layers from using Based: a front-end dependency, its Safe/deposit-wallet deployment step, and a geo gate on top of Polymarket's (section 9). Based's Terms do not appear to define a dispute process for prediction markets (Terms body not retrieved, see below).

## 9. Geo, ToS, automation

- Docs: "Prediction market features may not be available in certain jurisdictions due to regulatory requirements" (H, docs Prediction page) and "Access is restricted for certain countries" (H, docs About). The list of countries is **NOT FOUND** (searched: docs About/Prediction/Web Terminal/Mobile index, `based.one/llms.txt`, one web search).
- Terms of Service: `https://based.one/terms` exists (HTTP 200, "Terms of Service", footer "Platform Terms / Card Terms / Privacy Policy") but the body is client-rendered; neither raw HTML, RSC payload nor a summarising fetch returned clause text. Bot/automation clause, operator entity and Polymarket-specific clause: **NOT FOUND** (searched: `based.one/terms` raw + RSC payload, `based.one/md/*` twins, docs, web search). Do not infer permission.
- Polymarket's own rules still bind the underlying order: IP-based geoblock, close-only list including the US, attestation against VPN circumvention (H, `08-venues-polymarket-kalshi.md` section 8). An aggregator going to Polymarket directly faces the same rules without Based's extra layer.
- Automation: Based exposes no API, so scripted use of its UI/proxy would be unsanctioned scraping or reverse engineering (M inference; no clause found either way).

## 10. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Based Predict volume (DefiLlama, share-notional based) | 24h $1.91; 7d $3,679; 30d $12,269; lifetime $441.7k | api.llama.fi, 2026-10-19 | H |
| Based Predict fees (DefiLlama) | 7d $36.35; 30d $122; lifetime $7.3k | api.llama.fi, 2026-10-19 | H |
| Polymarket builder feed, Based, 2026-10-12..18 | 14,369.6 shares notional vs 181,599,184 for all builders (about 0.008%); 3-7 active users/day on busy days | data-api v2, 2026-10-19 | H |
| 90-day Based total in that feed | 390.3k share notional over 88 days | data-api v2, 2026-10-19 | H |
| BasedApp Outcome (HIP-4 via Based builder code) | lifetime $78,120 (peak days 2026-05-06..2026-05-12, e.g. $18.0k on 2026-05-11); 30d $0.5; 7d $0 | api.llama.fi, 2026-10-19 | H |
| Whole Based platform | ">$44B lifetime volume", ">100k users", "~$20M ARR" (company claims); DefiLlama BasedApp Perps fees 1y $6.60M, 30d $41.3k | llms.txt; api.llama.fi, 2026-10-19 | H (claims), M (accuracy) |
| BASED token | price about $0.0485, market cap about $11.4M, 24h volume about $7.9M, CoinGecko category list includes "Prediction Market Tools" | CoinGecko API, 2026-10-19 | H |
| Book depth available through Based | = Polymarket's (Based's "liquidity" column is Polymarket's `liquidity` field verbatim) | SSR vs Gamma fixture | H |

TVL: DefiLlama shows empty TVL for both entries (H). The BASED token's "Prediction Market Tools" tag is a CoinGecko classification of a wallet/app token, not evidence of a prediction venue.

## 11. Event-category overlap and shared liquidity

- **Overlap:** everything Polymarket lists (politics, sports, crypto price, macro/Fed, geopolitics, tech, culture) - Based's UI categories: Crypto, Sports, Finance, Elections, Politics, Geopolitics, Tech, Culture (H, docs). That is also where Kalshi, Limitless, Predict.fun, Opinion, Myriad etc. overlap, but only the Polymarket leg exists here.
- **Shared liquidity: YES, 100% with Polymarket (global, Polygon CLOB)** for Based Predict; shared with Hyperliquid HIP-4 for the Outcome route. Therefore Based must never be counted as a second leg against Polymarket (the "arbitrage" would be Polymarket vs itself, minus a 1% fee).
- **What an aggregator can still take from it:** nothing price-wise. As a flow/sentiment signal, Based's Top Traders leaderboard is UI-only (no API found), and the builder-attributed trade feed is too small (about 17k USDC over 5 weeks) to carry signal.

## 12. Fixtures (all under `docs/research/fixtures/based-basedapp-based-predict/`, each <=50 KB; largest is the 34 KB builder-volume file)

| File | Source / how produced |
|---|---|
| `defillama_summary_dexs_based-predict_trimmed.json` | `GET https://api.llama.fi/summary/dexs/based-predict` (totals + last 30 daily points) |
| `defillama_summary_dexs_basedapp-outcome_trimmed.json` | `GET https://api.llama.fi/summary/dexs/based-app-outcome` (totals, methodology, every non-zero day) |
| `polymarket_builders_volume_v2_based.json` | `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90`, rows where `builder_name == "Based"` plus all-builder totals |
| `polymarket_clob_builder_trades_based_sample.json` | `GET https://clob.polymarket.com/builder/trades?builder_code=<Based>`, first 5 of 300 rows; `owner` and `maker` redacted |
| `based_predict_ssr_market_vs_polymarket_gamma.json` | market object parsed from server-rendered `app.based.one/predict` next to `GET gamma-api.polymarket.com/markets/2589810`; `clobTokenIds_equal: true` |
| `coingecko_based-one_trimmed.json` | `GET https://api.coingecko.com/api/v3/coins/based-one` (categories, platforms, market data) |
| `dimension_adapters_excerpt.txt` | `gh api` raw excerpts of DefiLlama `factory/polymarket.ts` and `factory/hyperliquid.ts` mentioning Based |

## 13. Adapter priority

**skip.** Reasons: (1) duplicate liquidity with Polymarket (Based Predict) and Hyperliquid HIP-4 (Outcome); (2) no official API; (3) tiny volume (Based Predict ~$12k/30d; Outcome ~$0.5/30d); (4) extra 1% fee and an unclear ToS/geo layer; (5) no PayBox-reachable surface that Polymarket/Hyperliquid do not already provide. Re-open only if Based publishes (a) a documented order API or agent-wallet interface, or (b) its own on-chain market contracts.

## 14. Not found / open questions

- Official Based API, SDK, GitHub, contract addresses for any prediction product: NOT FOUND (searched: gitbook llms.txt index, docs pages, Official Links, based.one/llms.txt, DefiLlama `github: null`).
- Whether the Based UI can place HIP-4 outcome orders: NOT FOUND in docs/site text; only builder-code volume evidence.
- Restricted-jurisdiction list, bot/automation clause, operator legal entity: NOT FOUND (Terms body not retrievable by the tools used; client-rendered).
- Why the builder fee reads 1.00% for maker rows when the Polymarket builder-fee cap was recorded as 50 bps maker: open (possible docs change; verify against `docs.polymarket.com/builders/fees`).
- Whether Polygon is exposed at the PayBox tool level (inherited open item from the Polymarket note).

---

## Sources

- https://basedapp.gitbook.io/docs/based/prediction.md (Prediction page: Polymarket integration, fee text, geo warning; fetched via summarising model, wording M-H; fee text dated 12 Dec 2025 so L for currency) - H/M
- https://basedapp.gitbook.io/docs/llms.txt and https://basedapp.gitbook.io/docs (docs index; About page claims) - H
- https://basedapp.gitbook.io/docs/based/fees.md (raw `.md`, fee tables, builder fee, affiliate share) - H
- https://basedapp.gitbook.io/docs/based/web-terminal.md and https://basedapp.gitbook.io/docs/others/official-links.md (account modes; no API/contracts/terms listed) - H/M
- https://based.one/llms.txt, https://based.one/md/about, https://based.one/fees, https://based.one/terms (shell only) - H
- https://app.based.one/predict (server-rendered HTML, 2026-10-19) and chunks `/_next/static/chunks/21512-db33c30d694ed435.js`, `/_next/static/chunks/app/predict/layout-7a3ffcd367d6bf09.js` (read as text) - H
- https://api.llama.fi/summary/dexs/based-predict, /summary/fees/based-predict, /summary/dexs/based-app-outcome, /summary/fees/based-app-outcome, /protocol/basedapp-outcome, /protocols (2026-10-19) - H
- https://github.com/DefiLlama/dimension-adapters `factory/polymarket.ts`, `factory/hyperliquid.ts` (via `gh api`, 2026-10-19) - H
- https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90 ; https://clob.polymarket.com/builder/trades?builder_code=0x07aa1a85...88d1cf ; https://gamma-api.polymarket.com/markets/2589810 (2026-10-19) - H
- https://api.coingecko.com/api/v3/coins/based-one (2026-10-19) - H
- https://defillama.com/protocol/basedapp-outcome (HTTP 403 to WebFetch; same data read via api.llama.fi) - H via API
- Search coverage of HIP-4 (secondary, M): https://cryptobriefing.com/hyperliquid-hip-4-outcome-markets-2/ , https://www.kucoin.com/news/flash/hyperliquid-hip-4-deployment-begins-outcome-becomes-first-builder , https://www.coingecko.com/learn/hyperliquid-hip3-hip4-tokenized-stocks-and-prediction-markets
- Repo cross-references: `docs/research/08-venues-polymarket-kalshi.md`, `docs/research/venues/hyperliquid-outcomes-hip-4.md`, `docs/research/venues/cro-trade-predict.md`

Suspicious / agent-directed content encountered: none. `based.one/llms.txt` has a "Markdown for agents" section that only describes content negotiation and `/md/` URLs; no instructions to act were present.
