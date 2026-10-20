# MetaMask Prediction Markets - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 01:15-01:25 UTC). READ-ONLY: page reads (WebFetch, WebSearch), `gh api` raw reads of public `MetaMask/metamask-mobile` source, unauthenticated GETs to `api.llama.fi`, `docs.polymarket.com`, `data-api.polymarket.com`, `gamma-api.polymarket.com`, `clob.polymarket.com` (User-Agent `insurance-markets-research/0.1`). No account, wallet, key, signature, POST/PUT/DELETE, PayBox call or browser automation. Third-party text was treated as untrusted data; nothing in it was followed and none of it contained instructions aimed at agents.

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale (older than 6 months).

Fixtures (11 files, each <= 16 KB): `docs/research/fixtures/metamask-prediction-markets/` (section 12).

Two earlier notes cover the same product under other slugs: `docs/research/venues/metamask-predictions.md` and `docs/research/venues/metamask-polymarket-integration.md`. This note re-checked their main claims independently (all held), and adds the items marked **NEW** below. Recommend the registry keeps ONE venue record and treats the three notes as duplicates.

---

## 0. Verdict

**adapter_priority: skip** as a trading venue, market-data adapter or arbitrage leg. Keep a **registry/pool-membership record only** (section 13).

1. **Live, but a front end, not a venue.** MetaMask Prediction Markets is a feature of **MetaMask Mobile** that routes orders into **Polymarket International's CLOB** (Polygon, pUSD) with a MetaMask builder code and a MetaMask fee on top. The app's `providers/` directory holds only `polymarket` and `types.ts` (H). It has no order book, oracle, contracts or public API of its own.
2. **Not an independent arbitrage leg.** 100% shared liquidity, prices and resolution with Polymarket International. DefiLlama tags it category `Interface`, tag `Polymarket Builder`, fees `doublecounted: true` (H).
3. **Strictly worse execution than Polymarket direct**: advertised 4% of stake on top of Polymarket's taker fee, taker orders only, mobile only, a curated subset of markets, a longer geo-block list (H).
4. **Real but shrinking volume** (Polymarket's own builder data): $329.65M all-time, rank 5 of all builders; $9.16M month-to-date October (rank 12) vs $28.9M September (rank 6) (H). About 0.6% of Polymarket International's 30d volume ($14.4M vs about $2.2B) at the October pace (M).
5. Nothing here that Polymarket's public API does not give you better and free of the fee wedge.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Product page https://metamask.io/prediction-markets (fetched 2026-10-19; redirects to `/en/prediction-markets`) | "powered by Polymarket", mobile in-app, fee and territory text; no launch date | H (fetch-tool summary) |
| Launch post https://metamask.io/news/introducing-metamask-prediction-markets | Dated 2025-12-04: "now live on mobile"; any token on any EVM network; no KYC for one-tap funding. Older than 6 months. | H (date), L (staleness of content) |
| Support https://support.metamask.io/trade/predict/how-to-trade-predictions/ | Current how-to incl. "Money Account"; copyright 2026; no "last updated" date | H |
| `MetaMask/metamask-mobile` (GitHub API) | not archived; `pushed_at` 2026-10-19T00:42:23Z; latest release v8.15.0 published 2026-10-15; `app/components/UI/Predict/providers/polymarket/` actively present | H |
| Polymarket Data API v2 `/v2/builders/leaderboard` | MetaMask row present in MONTH and ALL windows on 2026-10-19 (fixtures) | H |
| DefiLlama protocol id 8001 `MetaMask Predictions` | no dead flag; fees series to 2026-10-19, volume series to 2026-10-18 | H |

**still_live = true.** Browser extension: I found no Predict code in `MetaMask/metamask-extension` (contents of `ui/pages` has no predict entry; code search for "predict polymarket" returned only a snaps-registry mock; repo pushed 2026-10-19). The support page says points are earned only in MetaMask Mobile. Treat as mobile-only (M: absence of evidence for the extension).

---

## 2. Kind and market model

- **Kind (H):** broker / front end inside a self-custodial wallet. DefiLlama: "MetaMask Predictions is a prediction platform powered by Polymarket" (https://api.llama.fi/protocol/metamask-predictions). Support page: Polymarket provides the service and a Polymarket account is created automatically.
- **Market model (H):** Polymarket's. Binary Yes/No (or Team A/Team B) shares on an **order book (CLOB)**; each winning share redeems for $1. Multi-outcome events are Polymarket negRisk groups (Gamma/CLOB `negRisk` flag; `outcomeGrouping.ts` in the app). No scalar markets seen. Categories on the page: politics, sports, crypto, culture, tech, weather, financial.
- **Tokenisation (H, MetaMask source `providers/polymarket/constants.ts`):** Polymarket conditional tokens (ERC-1155, 6 decimals). V2 contract set as MetaMask hard-codes it: CTF exchange `0xE111180000d2663C0091e4f400237545B87B996B`, negRisk exchange `0xe2222d279d744050d28e00520010520000310F59`, negRisk adapter `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296`, conditional tokens `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`, collateral pUSD `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`, plus ExchangeV3 `0xe3333700cA9d93003F00f0F71f8515005F6c00Aa` and PositionManager `0x006F54F7f9A22e0000CC2AB60031000000ae9fEF`. Quoted from MetaMask's repo, not from Polymarket docs; the Polymarket adapter owns the authoritative list.
- **Curated subset (M):** remote feature flags (`PredictHiddenMarketsFlag`, sports market-type allow lists) mean the app shows a subset of Polymarket. Production values are remote config. NOT FOUND (searched: `constants/flags.ts` defaults only).
- **Orders (NEW, H):** support page: taker orders are "the only order type currently supported by MetaMask"; source uses `OrderType.FOK`/`OrderType.FAK` (no GTC limit orders). No resting liquidity is ever posted by MetaMask users.
- Name collision for market matching: Polymarket also lists markets *about* MetaMask (token launch, FDV). They are ordinary Polymarket events, unrelated to this venue (L, search titles).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading chain | Polygon, chain id 137 (`POLYGON_MAINNET_CHAIN_ID = 137`; DefiLlama chain Polygon) | H |
| Trading collateral | pUSD `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`, 6 decimals; legacy USDC.e `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` still referenced | H (source) |
| Funding | "any EVM token or your Money Account balance"; pay directly with any EVM token when placing a prediction; pre-funding optional and slightly faster; **Solana tokens not supported yet** | H (support page) |
| Withdraw | USDC.e on Polygon to the regular MetaMask account, or mUSD to a Money Account; MetaMask helps cover gas for claim and withdraw | H (support page) |
| Account | Polymarket account auto-created; an existing Polymarket account that uses MetaMask as signer syncs; email-login Polymarket accounts do not sync (a new account is made) | H (support page) |
| Signature types in app | `POLY_GNOSIS_SAFE` and deposit-wallet (`POLY_1271`) per sibling note | M |

---

## 4. Read API

**Official public read API for MetaMask Predictions: none.** NOT FOUND (searched: product page, support pages, `docs.metamask.io` results, `Predict/README.md` in `metamask-mobile`, web search "MetaMask Predictions API"). No OpenAPI, SDK, rate limit, websocket or developer terms. The support page mentions no API (H).

What the app reads is **Polymarket's public data** (H, `providers/polymarket/utils.ts` `getPolymarketEndpoints()`):

- Gamma `https://gamma-api.polymarket.com` (markets, events, search, tags)
- CLOB `https://clob.polymarket.com` (`/book?token_id=`, `/clob-markets/{conditionId}`, prices history)
- Data API `https://data-api.polymarket.com`
- WebSockets (per Polymarket docs https://docs.polymarket.com/getting-started/api.md): `wss://ws-subscriptions-clob.polymarket.com/ws/market` and `/ws/user`
- Geoblock `https://polymarket.com/api/geoblock` (not called by me; returns the caller's IP and country)
- Private relayer `https://predict.api.cx.metamask.io` (`CLOB_RELAYER`, `POST /order`, header `X-Clob-Version`), 403 "Missing Authentication Token" per sibling note (M, not re-fetched; not a documented API host, so I did not probe it). Not public. Do not integrate.

These belong to the Polymarket spec; the Polymarket docs index is https://docs.polymarket.com/llms.txt (H). Per-venue ids: Polymarket `conditionId` is the join key; token ids are `clobTokenIds` from Gamma.

**Live shapes confirmed 2026-10-19 (unauthenticated GET, 200):**

- Gamma `GET /markets?limit=3&active=true&closed=false&order=volume24hr&ascending=false` returns a JSON array; fields include `conditionId`, `clobTokenIds` (stringified JSON list), `outcomes`, `outcomePrices`, `bestBid`, `bestAsk`, `volume24hr`, `liquidityClob`, `negRisk`, `feesEnabled`, `feeSchedule {exponent, rate, takerOnly, rebateRate}`, `orderPriceMinTickSize`, `umaResolutionStatuses`. Example: "Cowboys vs. Packers", 24h volume $3.31M, CLOB liquidity $442K, `feeSchedule {exponent 1, rate 0.03, takerOnly true, rebateRate 0.15}` (fixture).
- CLOB `GET /book?token_id=<id>` returns `{market, asset_id, timestamp(ms), hash, bids[], asks[], min_order_size, tick_size, neg_risk, last_trade_price}`. **Ordering gotcha: both sides are listed worst-to-best; the best bid and best ask are the LAST elements** (bids ascending, asks descending; sample best bid 0.046 / best ask 0.047). (fixture)
- CLOB `GET /clob-markets/{conditionId}` returns compact keys: `{gst, r, t:[{t:tokenId,o:outcome}], c:conditionId, sd, mos:5, mts:0.001, mbf, tbf, ao, cbos, aot, ibce, fd:{r,e,to}, v}`. `fd` is the fee config; `mbf`/`tbf`/`ibce` not interpreted. (fixture)

**MetaMask-attributed flow data (NEW, resolves a sibling open question):** Polymarket Data API **v2** builder routes exist and answer without auth:

- `GET https://data-api.polymarket.com/v2/builders/leaderboard?timePeriod=DAY|WEEK|MONTH|ALL&limit=50` returns `{data:[{rank, builder_name, builder_code, profile_image, verified, volume, active_users}], pagination:{limit, offset, has_more, next_cursor}}`.
- `GET https://data-api.polymarket.com/v2/builders/volume?timePeriod=MONTH` returns `{data:[{date, rank, builder_name, builder_code, profile_image, verified, volume, active_users}]}` (930 KB, 2,919 rows, no pagination object; filter client-side).
- The v1 routes of the same names are **retired on 2026-10-24** (H, https://docs.polymarket.com/migrate/data-api-v1-to-v2.md, which maps both v1 builder routes to `/v2/builders/*`). The v2 builder routes are in that migration page but are not listed in `llms.txt` as separate pages (H); no documented rate limit (NOT FOUND, searched: `llms.txt`, getting-started/api, builders/tiers: tiers page only says "Standard" API rate limits).
- MetaMask builder code (H, same in all rows): `0x11a22276beb720e66a072cba8b8e74cded60afda510af535b947b81a1b81a883`.
- DefiLlama (no key): `https://api.llama.fi/protocol/metamask-predictions`, `/summary/fees/metamask-predictions`, `/summary/dexs/metamask` (daily points; H).

Auth/limits for MetaMask itself: n/a. The app enforces a client-side `ORDER_RATE_LIMIT_MS = 5000` between orders (H, source). Polymarket's own limits apply to the hosts above (Polymarket spec).

---

## 5. Trade path

- **Programmatic path for MetaMask Predictions: none.** Mobile UI plus an authenticated, undocumented relayer (H, product page and source).
- How the app trades (H, source `providers/polymarket/{utils,protocol/orderCodec,protocol/transport}.ts`): (1) user key signs Polymarket's `ClobAuth` EIP-712 message (domain `ClobAuthDomain`, v1, chainId 137) to derive CLOB credentials; (2) user key signs an EIP-712 V2 `Order(salt, maker, signer, tokenId, makerAmount, takerAmount, side, signatureType, timestamp, metadata, bytes32 builder)` with MetaMask's builder code (read from a remote/env value; order creation throws "Missing Polymarket CLOB v2 builder code" if absent); (3) the order is POSTed to MetaMask's relayer `POST /order` with `X-Clob-Version`, which forwards to Polymarket; (4) MetaMask's own fee is a separate transfer to a collector address, optionally via a Permit2 fee authorisation (`permit2Enabled` default false; production value is remote and unobserved); (5) default market-order slippage 3% buy / 5% sell.
- **Reachable through PayBox?** For MetaMask Predictions itself: **no** (no API; the relayer is authenticated; wallet UI only).
- The **same exposure** is reachable by an EVM wallet through **Polymarket's own CLOB**: signed V2 orders (EIP-712 typed data, chain 137) plus on-chain pUSD approvals. PayBox's repo notes (`docs/research/06-paybox-platform.md`, H there, dated 2026-10-19) record Polygon (137) in PayBox's chain catalogue and `request_wallet_sign` with a `typedData` intent that has no documented domain/chainId restriction; whether PayBox actually signs Polygon V2 orders is untested. I called no PayBox tool. That path belongs to the Polymarket adapter and avoids MetaMask's fee entirely.
- Do **not** reuse MetaMask's builder code in your own bot: it would misattribute volume and fees.

---

## 6. Fees

| Component | Formula | Payer -> receiver | Tag |
|---|---|---|---|
| Headline | "a 4% transaction fee ... split between MetaMask and Polymarket" on any trade; "No fees ... depositing, cashing out, or withdrawing" | user | H (product + support pages) |
| App defaults | `DEFAULT_FEE_COLLECTION_FLAG = {enabled: true, metamaskFee: 0.02, providerFee: 0.02, waiveList: [], permit2Enabled: false}`; fee = `userBetAmount * rate`, computed on buys AND on sell proceeds (`calculateFees` is called in the sell preview on `takerAmount`) | user -> collector address | H (source, fixture) |
| Remote override | constant is a DEFAULT; a `waiveList` of tag slugs can waive fees; production values unobserved | | M |
| Polymarket platform (taker) fee | support page: taker fee "can range from 0% up to 7%" by market type, price and size. Docs formula `fee = C x feeRate x p x (1 - p)`, takers only, makers never charged; docs table: crypto 0.07, sports 0.05, finance/politics/tech/mentions 0.04, economics/culture/weather/other 0.05, geopolitics 0 (fee-free) | user -> Polymarket | H (https://docs.polymarket.com/trading/fees.md) |
| Per-market live config | the per-market `feeSchedule`/`fd` is authoritative: NFL game market shows rate 0.03 (docs table says sports 0.05); Fed-decision market shows rate 0.05 | | H (Gamma fixture), discrepancy noted |
| Polymarket builder fee | taker <= 100 bps, maker <= 50 bps of notional, additive to platform fee, never replaces it | user -> builder | H (https://docs.polymarket.com/programs/builders/fees.md) |
| Gas | MetaMask covers claim/withdraw gas; trade gas relayed | | H (support page) |

**NEW - what is actually captured on chain is far below 4% (M, my computation on the fixtures):** DefiLlama's builder-fee series divided by Polymarket-attributed MetaMask volume is 0.51% (May), 0.73% (Jul), 1.19% (Aug), 1.46% (Sep), 1.47% (Oct MTD). So either the 4% is mostly a separate collector transfer DefiLlama does not see (consistent with the <=1% builder-fee cap), or the production fee flag differs from the 2%+2% default, or Polymarket's volume counts both sides. Unresolved. For the aggregator, use the advertised 4% as the conservative per-leg cost.

**Arbitrage consequence:** a MetaMask-routed leg costs about 4% of stake each way (about 8% round trip) plus Polymarket's taker fee. Polymarket direct dominates it on cost.

---

## 7. Resolution and dispute risk

"MetaMask does not control or resolve prediction market outcomes ... MetaMask cannot modify or override market outcomes." Polymarket uses UMA's optimistic oracle; a challenged proposal escalates to UMA token holders; winners redeem $1/share after finalisation by tapping Claim (H, support page). The product page says markets "are resolved according to predefined rules found under the market's order book" (H, page summary).

Dispute/ambiguity risk is identical to, and perfectly correlated with, the Polymarket leg (see Polymarket spec). Extra operational risk (M, inference from source flags): the app can hide a market or block a region while the underlying market keeps trading, and relayer or fee-flag changes are outside your control.

---

## 8. Geo, ToS, automation

- **Product page excluded territories (H):** Australia, Belgium, Brazil, Burundi, Canada, Ethiopia, France, Germany, Iraq, Italy, Japan, Myanmar, Poland, Singapore, Taiwan, Thailand, UK, USA, plus countries on the USA sanctions list; "not available in all jurisdictions".
- **Support page (H):** lists USA, UK, France, Canada, Belgium, Poland, Singapore, Australia, Taiwan, Thailand, then Germany, Romania, sanctioned countries and "more"; "Not intended for UK persons"; Polymarket's full list is the reference.
- **App source (H, `constants/geoblock.ts`, fixture):** `GEO_BLOCKED_COUNTRIES = DE, RO, ES, IN`; the app also calls Polymarket's geoblock endpoint. The three lists disagree (Romania only on the support page, Spain and India only in code). Treat the union as blocked and Polymarket's `/api/geoblock` as the truth. The US is excluded here because Polymarket US is a separate CFTC-regulated product that MetaMask does not use (M).
- **MetaMask Terms of Use (last updated June 2026; H via fetch-tool summary):** no mention of prediction markets or Polymarket. Generic clauses: s5.3 "We retain sole discretion to limit your API requests"; s7.3(d) no scraping "except as permitted by a Plan"; s13 no circumventing limits; s3.3 users stay "fully responsible for all actions taken by such AI Agent". There is no Predictions-specific automation licence and no Predict API terms.
- Trading terms are Polymarket's (https://polymarket.com/tos, not read here; Polymarket workflow).
- **Automation:** nothing permits or documents bots against the MetaMask app or relayer; out of scope.

---

## 9. Liquidity (all sources fetched 2026-10-19)

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| MetaMask builder-attributed volume, all-time | $329.65M, 39,388 active users, rank 5 | `GET /v2/builders/leaderboard?timePeriod=ALL`, 2026-10-19 | H |
| Month buckets (Polymarket builder data) | Nov-25 $0.05M; Dec-25 $20.0M; Jan-26 $34.4M; Feb $33.1M; Mar $34.0M; Apr $64.2M; May $21.1M; Jun $38.8M; Jul $33.8M; Aug $12.2M; Sep $28.9M; Oct (1-19) $9.16M, 1,694 active users, rank 12 | `/v2/builders/volume?timePeriod=MONTH` (fixture) | H |
| October pace | $9.16M / 19 days = about $14.4M per 30 days, about half of September | derived | M |
| Scale vs Polymarket International | 30d about $2.2B (DefiLlama overview, per `docs/research/14-platform-of-platforms.md`, 2026-10-18-19) so MetaMask is about 0.6-0.7% | cited, not re-fetched | M |
| DefiLlama "volume" | 24h $164,348 (2026-10-18); 7d $999,129; 30d $4,782,898; all-time $22.96M since 2026-07-05 | `api.llama.fi/summary/dexs/metamask` | H |
| DefiLlama fees | 24h $6,584; 7d $39,851; 30d $189,459; all-time $1.34M since 2026-05-16 | `api.llama.fi/summary/fees/metamask-predictions` | H |
| TVL / open interest | none (`tvl: []`, Interface) | protocol endpoint | H |
| Book depth | the Polymarket book (e.g. NFL game market CLOB liquidity $442K, 24h volume $3.31M) | Gamma fixture | H |

Caveat: **do not use DefiLlama volume for MetaMask**: it understates Polymarket's own builder numbers about 3-5x (e.g. Sep: DefiLlama $10.6M vs Polymarket $28.9M) and looks derived from fees at an assumed 4% (fees/volume 3.94-4.68% each month) (M, my computation). Use the Polymarket builder endpoint. Whether Polymarket's attributed volume double-counts both sides of a match is not stated (docs: "Volume is credited ... for every matched trade where your code is attached", H).

---

## 10. Event coverage and overlap

Everything Polymarket lists that survives the app's curation: sports (NFL/NBA, soccer, esports, props, spreads, totals, short-horizon markets), politics, crypto price (including short-horizon BTC up/down series), macro/finance (a Fed-decision market is in today's top 3 by 24h volume), culture, tech, weather (H for categories on the page; M for source-based sports detail). Each category overlaps Kalshi, Polymarket US, Limitless, Predict.fun, Opinion, XO and others exactly as Polymarket does. **No category exists only on MetaMask.**

## 11. Shared liquidity

**Shares 100% of its liquidity with Polymarket International** (same CLOB V2 books and tokens, same UMA resolution). A Polymarket mid IS the MetaMask mid, less a fee wedge of about 4% plus taker fee. **Not an independent arbitrage leg**; counting it beside Polymarket double-counts liquidity and volume. (H)

---

## 12. Fixtures

In `docs/research/fixtures/metamask-prediction-markets/` (all fetched 2026-10-19, unauthenticated GET unless stated, User-Agent `insurance-markets-research/0.1`):

| File | Source | Shows |
|---|---|---|
| `polymarket_data-api_v2_builders_leaderboard_MONTH_2026-10-19.json` | `GET data-api.polymarket.com/v2/builders/leaderboard?timePeriod=MONTH&limit=50` | v2 envelope, MetaMask rank 12 |
| `polymarket_data-api_v2_builders_volume_MONTH_metamask_rows_2026-10-19.json` | filtered from `GET /v2/builders/volume?timePeriod=MONTH` (930 KB full) | 12 monthly MetaMask rows |
| `polymarket_data-api_builders_leaderboard_ALL_metamask_v1_vs_v2_2026-10-19.json` | `/v2/` and retiring `/v1/builders/leaderboard?timePeriod=ALL` | v1 vs v2 row shape, builder code |
| `polymarket_gamma_market_sample_2026-10-19.json` | `GET gamma-api.polymarket.com/markets?limit=3&active=true&closed=false&order=volume24hr&ascending=false` (first element) | the market object the app renders |
| `polymarket_clob_book_sample_2026-10-19.json` | `GET clob.polymarket.com/book?token_id=<yes token>` | book shape and worst-to-best ordering |
| `polymarket_clob_markets_sample_2026-10-19.json` | `GET clob.polymarket.com/clob-markets/<conditionId>` | tick, min size, fee config `fd` |
| `defillama_protocol_metamask-predictions_2026-10-19.json` | `GET api.llama.fi/protocol/metamask-predictions` | id 8001, Interface, tag |
| `defillama_fees_metamask-predictions_2026-10-19.json` | `GET api.llama.fi/summary/fees/metamask-predictions` | fee totals, `doublecounted`, daily series |
| `defillama_dexs_metamask_parent_2026-10-19.json` | `GET api.llama.fi/summary/dexs/metamask` | volume totals, daily series |
| `metamask-mobile_Predict_DEFAULT_FEE_COLLECTION_FLAG_excerpt.ts.txt` | `gh api` raw read of `app/components/UI/Predict/constants/flags.ts` | default 2% + 2% flag |
| `metamask-mobile_Predict_geoblock.ts.txt` | `gh api` raw read of `.../constants/geoblock.ts` | DE, RO, ES, IN |

---

## 13. Adapter recommendation

- **adapter_priority: skip** (duplicate liquidity, no API of its own, ~4% fee wedge, mobile only, falling volume). Reason for not P2: the only signal it carries (retail wallet flow) is available more cheaply and directly from Polymarket's own public data.
- **Registry record only** (matches the pool-graph rule in `docs/platform-registry-design.md`): `kind: broker`, `routes_to: polymarket-international`, `pool: polymarket-international`, `independent_liquidity: false`, `fee_stack: {front_end: 0.04 of stake on buys and sell proceeds (defaults 0.02 + 0.02, remote-configurable), plus Polymarket taker fee}`, `order_types: taker only (FOK/FAK)`, `builder_code: 0x11a22276...a883`, `geo: union of lists in section 8`, `platform: mobile`, `state: live`, `execution_for_agents: none`.
- **Optional signal (M, weak):** poll `/v2/builders/leaderboard?timePeriod=MONTH` daily for MetaMask `volume`/`active_users` as a proxy for retail wallet flow into Polymarket. Not a fair-value input. Poll defensively: no documented v2 builder-route stability or rate limit.
- Sizing the arbitrage opportunity from MetaMask is moot: if the aggregator finds edge on a Polymarket market, execute on Polymarket direct, not through MetaMask.

## 14. NOT FOUND

- Any MetaMask-published API, SDK, OpenAPI, rate limit or developer terms for Predict (searched: product page, support pages, `Predict/README.md`, web search).
- Production fee-flag values (2%+2% is only the repo default) and hidden-market list (remote config).
- A "last updated" date on the support and product pages.
- Documentation of `/v2/builders/*` response fields or rate limits on Polymarket's docs (searched: `llms.txt`, builders overview/fees/tiers, migration page; only the route mapping exists).
- Polymarket Data API v2 builder routes listed as their own pages in `llms.txt` (searched; not listed).
- MetaMask's own volume or user numbers from Consensys (searched: web; only Polymarket builder data and DefiLlama).
- Independent confirmation of who receives the 2% "provider" fee beyond the page wording, and of how the 4% splits between on-order builder fee and collector transfer.
- A MetaMask Predictions browser-extension release (searched: extension repo; M for absence).

## 15. Open questions

1. Why is the DefiLlama builder-fee series only 0.5-1.5% of Polymarket-attributed volume if the user fee is 4%? (Lower production flag, separate collector transfer outside DefiLlama's view, or double-counted volume.)
2. Is Polymarket's `/v2/builders/*` stable after v1 retirement on 2026-10-24, and are fields documented anywhere?
3. Does the app's curated subset exclude markets that matter for arbitrage?
4. Is the volume decline (about -50% month on month in October pace) MetaMask-specific or Polymarket-wide?

## 16. Suspicious content

None observed. No text aimed at AI agents in any fetched page, source file or API response.

## 17. Sources

- MetaMask product page, fetched 2026-10-19: https://metamask.io/prediction-markets (H, fetch-tool summary)
- MetaMask launch post (2025-12-04): https://metamask.io/news/introducing-metamask-prediction-markets (H date; content L-stale)
- MetaMask support, how to trade: https://support.metamask.io/trade/predict/how-to-trade-predictions/ (H, summary)
- MetaMask support, what are prediction markets: https://support.metamask.io/trade/predict/what-are-prediction-markets/ (H, summary)
- MetaMask Terms of Use (June 2026): https://metamask.io/terms-of-use (H, summary)
- MetaMask Mobile source (`gh api` raw reads, `MetaMask/metamask-mobile`): `app/components/UI/Predict/constants/{flags,geoblock}.ts`, `.../providers/polymarket/{constants,utils,PolymarketProvider}.ts`, `.../providers/polymarket/protocol/{orderCodec,transport}.ts`, directory listings of `.../Predict/providers`; repo metadata and release v8.15.0 (2026-10-15); `MetaMask/metamask-extension` repo metadata and `ui/pages` listing (H)
- Polymarket docs: https://docs.polymarket.com/llms.txt , https://docs.polymarket.com/getting-started/api.md , https://docs.polymarket.com/trading/fees.md , https://docs.polymarket.com/programs/builders/overview.md , https://docs.polymarket.com/programs/builders/fees.md , https://docs.polymarket.com/programs/builders/tiers.md , https://docs.polymarket.com/migrate/data-api-v1-to-v2.md (H)
- Polymarket public APIs: https://data-api.polymarket.com/v2/builders/leaderboard , https://data-api.polymarket.com/v2/builders/volume , https://gamma-api.polymarket.com/markets , https://clob.polymarket.com/book , https://clob.polymarket.com/clob-markets/{conditionId} (H)
- DefiLlama: https://api.llama.fi/protocol/metamask-predictions , https://api.llama.fi/summary/fees/metamask-predictions , https://api.llama.fi/summary/dexs/metamask (H); methodology link https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts (not opened)
- Web search (extended), results only, not opened: The Defiant, The Block, DefiRate launch coverage (Dec 2025, L); pm.wiki profile (updated 2026-06-29, L)
- Sibling notes in this repo (M for anything not re-checked): `docs/research/venues/metamask-predictions.md`, `docs/research/venues/metamask-polymarket-integration.md`, `docs/research/08-venues-polymarket-kalshi.md`, `docs/research/06-paybox-platform.md`, `docs/research/14-platform-of-platforms.md`, `docs/platform-registry-design.md`
