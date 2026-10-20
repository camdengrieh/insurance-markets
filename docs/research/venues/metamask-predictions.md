# MetaMask Predictions - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 00:45 UTC). READ-ONLY: page reads, `gh api` file reads of public MetaMask source, DefiLlama and Polymarket public GETs, one unauthenticated GET to MetaMask's relayer host. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages and API text were treated as untrusted data; nothing in them was followed (none contained instructions to agents).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/metamask-predictions/` (section 12).

---

## 0. Bottom line

1. **Live, but it is a front end, not a venue.** MetaMask Predictions is a feature of MetaMask **Mobile** that routes orders into **Polymarket's CLOB (Protocol V2, Polygon, pUSD)** with a MetaMask builder code and a MetaMask fee on top. It has no book, no oracle, no contracts and no public API of its own. (H)
2. **Not an independent arbitrage leg.** Same order book, same prices, same resolution as Polymarket International; DefiLlama itself flags the fee series `doublecounted: true` and tags it "Polymarket Builder". Counting it next to Polymarket is double-counting. (H)
3. **Strictly worse execution than Polymarket direct**: a flat 4% of stake on top of Polymarket's own taker fee, mobile-app-only, a curated subset of markets, a longer geo-block list. (H)
4. **Small and shrinking**: DefiLlama volume 30d $4.62M (2026-10-17), down 56% from the previous 30d ($10.67M); roughly 0.2% of Polymarket International's 30d volume. (H for the numbers, M for the ratio)
5. **adapter_priority = skip** for trading and for a market-data adapter. Keep only a **registry/pool-membership record** (`routes_to: polymarket`, fee stack 4% + taker fee, geo list) so the aggregator does not count it as a separate pool and prices a route through it correctly. The one useful derivative signal is cheap: its DefiLlama volume series is a rough proxy for retail wallet-user flow into Polymarket (M, weak).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Product page `https://metamask.io/en/prediction-markets` fetched 2026-10-19 | "Trade Prediction Markets in MetaMask, Powered by Polymarket"; mobile only ("Open MetaMask Mobile"); copyright 2026 Consensys; no extension mention | H |
| Support page `https://support.metamask.io/trade/predict/how-to-trade-predictions/` | Current how-to with fee, funding (incl. "Money Account", "mUSD"), claim and eligibility text. No "last updated" date shown. | H |
| `MetaMask/metamask-mobile` | Release v8.15.0 on 2026-10-15; repo pushed 2026-10-19T00:42Z; commits touching `app/components/UI/Predict` on 2026-10-14, 10-15, 10-16 (e.g. "use native crypto for Predict HMAC") | H |
| DefiLlama `metamask-predictions` (id 8001) | Category `Interface`, chain Polygon, tag `Polymarket Builder`, parent `MetaMask`. Volume series through 2026-10-17 (24h $146,183); fees series through 2026-10-18 (24h $6,516). | H |
| Launch date | Early Dec 2025 per The Defiant / DefiRate / Yellow (search results); a MetaMask 2026 trends article says November 2025. Mobile >= 7.73.2 at launch per one search summary. Older than 6 months: treat the launch details as stale. | M/L |

Verdict: **still_live = true** (mobile app feature, actively developed, trading volume nonzero, trending down).

---

## 2. Kind and market model

- **Kind (H):** broker / front end. DefiLlama: "MetaMask Predictions is a prediction platform powered by Polymarket"; category Interface (https://api.llama.fi/protocol/metamask-predictions). MetaMask's own support page: "Predictions are powered by Polymarket. A Polymarket account is created automatically when you fund or first trade."
- **Market model (H, product page + source):** binary Yes/No shares on a Polymarket **order book**; each winning share pays $1. Multi-outcome events are Polymarket negRisk groups (app code `outcomeGrouping.ts`, `negRisk` flag on books). Sports (moneyline, spreads, totals, props), esports, "BTC up/down 5m" crypto series and general events are rendered (source `constants/sports.ts`, `btcUpDown5mSeries.ts`, `SUPPORTED_SPORTS_MARKET_TYPES`). No scalar markets visible.
- **Tokenisation (H, source `providers/polymarket/constants.ts`):** Polymarket conditional tokens (ERC-1155, 6 decimals). `MATIC_CONTRACTS_V2.conditionalTokens = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`; collateral is **pUSD** `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` (6 decimals); the V2 exchange is `0xE111180000d2663C0091e4f400237545B87B996B` and there is also a "positions protocol" `ExchangeV3` / `PositionManager`. Verify these against the Polymarket venue spec; they are quoted from MetaMask's source, not from Polymarket docs.
- **Curated subset (H):** feature flags `PredictHiddenMarketsFlag`, sports-market-type allow list and region flags mean the app shows a subset of Polymarket. Which subset is a remote config and was not observable. NOT FOUND (searched: repo flags defaults; remote values are not in the repo).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading chain | Polygon (137). `POLYGON_MAINNET_CHAIN_ID = 137`. | H (source) |
| Trading collateral | pUSD (Polymarket V2 collateral). Legacy USDC.e `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` still referenced for onramp/withdraw. | H (source) |
| Funding | "any EVM token" (page lists ETH, mUSD, USDC, USDT, LINEA ...) or MetaMask "Money Account" balance, swapped/bridged into pUSD inside a single "pay with any token" flow; pre-funding optional. "Solana tokens are not supported yet." | H (support page) |
| Withdraw | to the user's MetaMask account as **USDC.e on Polygon**, or mUSD to a Money Account. MetaMask pays gas for claims and withdrawals. | H (support page) |
| Account model | A Polymarket proxy account owned by the user's MetaMask signer: source supports `POLY_GNOSIS_SAFE` and `POLY_1271` (deposit wallet via factory) signature types. A Polymarket account that already uses MetaMask as signer syncs balance and activity automatically. | H (source, support page) |

---

## 4. Read API

**Official public API: none.** I found no MetaMask developer documentation, OpenAPI spec, SDK or API terms for Predict. NOT FOUND (searched: `docs.metamask.io` search results for Predict, web search "MetaMask Predictions API developers", `MetaMask/api-specs` listing, `metamask-mobile` Predict README).

What exists:

- **The data MetaMask renders is Polymarket's public data**, fetched client-side by the app (H, source `providers/polymarket/utils.ts` `getPolymarketEndpoints()`):
  - Gamma `https://gamma-api.polymarket.com` (`/events/keyset`, `/events/{id}`, `/public-search`, `/tags/slug/{slug}`)
  - CLOB `https://clob.polymarket.com` (`/book?token_id=`, `/clob-markets/{conditionId}`, `/prices-history`, `POST /prices`)
  - Data API `https://data-api.polymarket.com` (`/v2/activity`, `/v2/user-pnl`)
  - WebSockets `wss://ws-subscriptions-clob.polymarket.com/ws/market`, `wss://sports-api.polymarket.com/ws`, `wss://ws-live-data.polymarket.com`
  - Geoblock `https://polymarket.com/api/geoblock` (not called by me: it returns the caller's IP and country)
  These belong to the Polymarket spec (docs `https://docs.polymarket.com/llms.txt`), not here.
- **MetaMask's own backend**: `https://predict.api.cx.metamask.io` (dev: `predict.dev-api.cx.metamask.io`), used as `CLOB_RELAYER` for `POST {CLOB_RELAYER}/order` with header `X-Clob-Version: 2` (H, source `protocol/transport.ts`). Unauthenticated `GET /` returns HTTP 403 `{"message":"Missing Authentication Token"}` with AWS API Gateway headers (H, fixture). Not public, not documented, not a read API. Do not integrate.
- **Volume/fee telemetry**: DefiLlama only (`https://api.llama.fi/summary/fees/metamask-predictions`, `https://api.llama.fi/summary/dexs/metamask`), daily granularity, no key (H, fixtures). Methodology link: `https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts`, "Builder fees received by MetaMask from trades on Polymarket v2" (H).
- **Order-flow attribution on chain**: V2 orders carry a `builder` bytes32 inside the signed order, so MetaMask-routed fills are in principle attributable on Polygon. Whether the exchange emits `builder` in fill events, and MetaMask's builder code value (read from env `MM_PREDICT_BUILDER_CODE`, not in the repo) are NOT FOUND.

Auth and limits: n/a for MetaMask. Polymarket's own limits apply to the hosts above (see Polymarket spec). The app enforces a client-side `ORDER_RATE_LIMIT_MS = 5000` between orders (H, source).

---

## 5. Trade path

- **Programmatic path for MetaMask Predictions: none documented.** It is a mobile UI. Order creation, fee collection and relay happen inside the app and a private relayer. (H, source + product page)
- **How the app trades (H, source `protocol/orderCodec.ts`, `constants.ts`):**
  1. EIP-712 `ClobAuth` message ("This message attests that I control the given wallet") to derive Polymarket CLOB API credentials (HMAC), same as any Polymarket client.
  2. EIP-712 `Order(salt, maker, signer, tokenId, makerAmount, takerAmount, side, signatureType, timestamp, metadata, builder)` signed by the user's key, `signatureType` `POLY_GNOSIS_SAFE` or `POLY_1271`; `builder` = MetaMask's builder code, `metadata` = zero bytes32.
  3. Order posted to MetaMask's relayer `POST /order` (X-Clob-Version 2), which forwards to Polymarket CLOB.
  4. MetaMask's own fee is a separate pUSD transfer to a "collector" address, authorised with a Permit2 fee authorisation when `permit2Enabled` (default false in the repo; production value is a remote flag, unobserved).
  5. Default market-order slippage 3% buy / 5% sell (H, source).
- **Claims**: redeem winning shares via the Polymarket CTF/adapters, gas sponsored by MetaMask (H, support page).

**Reachable through PayBox?** For MetaMask Predictions itself: **no** (no API, relayer is authenticated and undocumented, wallet UI only). The underlying exposure is reachable by an EVM wallet on Polygon through **Polymarket's own CLOB** (signed V2 orders plus pUSD approvals), which belongs to the Polymarket adapter and avoids MetaMask's 4% fee. I did not test any signing path.

---

## 6. Fees

Per trade (buy and, per `calculateFees` on takerAmount, sell):

| Component | Formula | Who pays / receives | Tag |
|---|---|---|---|
| MetaMask fee | `stake * metamaskFee`, default **0.02** | user -> MetaMask | H (source `constants/flags.ts` `DEFAULT_FEE_COLLECTION_FLAG`) |
| "Provider" fee | `stake * providerFee`, default **0.02** | user -> collector (presented as Polymarket's share) | H (source), M (who receives) |
| Headline | "you pay a 4% transaction fee to MetaMask and Polymarket"; "No fees are taken when depositing, cashing out, or withdrawing" | | H (product page, support page) |
| Polymarket platform fee | `fee = C * rate * p^(e-1) * (1-p)^e`, taker only, per-market `{r, e}` from `/clob-markets/{id}` (`fd`). Support page: "0% up to 7%", depends on market type, price and size. | user -> Polymarket | H (source `utils.ts` `calculateMarketFeeAtPrice`; support page) |
| Live example of the market fee config | Gamma market "Cowboys vs. Packers" (2026-10-19): `feesEnabled true, feeSchedule {exponent 1, rate 0.03, takerOnly true, rebateRate 0.15}` | | H (fixture) |
| Polygon gas | covered by MetaMask for claim/withdraw; trade gas n/a (relayed) | | H (support page) |

Notes:
- The defaults are **remote-configurable** (`feeCollection` flag, with a `waiveList` of tag slugs). Production may differ; the public pages still say 4%. (H)
- Polymarket's builder fee is capped at 1% taker / 0.5% maker (H, `https://docs.polymarket.com/programs/builders/fees.md`), so the 4% cannot be entirely an on-order builder fee. DefiLlama calls the whole thing "builder fees". The split between on-order builder fee and the separate collector transfer is not documented. (M)
- DefiLlama fees 30d $189,400 vs volume 30d $4,618,550 = 4.1%, consistent with the flat 4% (M: the two series start on different dates).
- **Arbitrage consequence**: a MetaMask-routed leg costs about 4% of stake each way (about 8% round trip) plus the taker fee. Versus Polymarket direct (0 platform fee on fee-free markets, builder code optional), it is dominated.

---

## 7. Resolution and dispute risk

- Resolution is Polymarket's: "MetaMask does not control or resolve outcomes. Polymarket uses UMA's oracle system, and disputes go through it. MetaMask cannot modify or override market outcomes." (H, support page). The product page says markets "are resolved according to predefined rules found under the market's order book" (H).
- Payout after oracle finalisation; user taps Claim; winners get $1/share (H).
- Dispute/ambiguity risk = Polymarket/UMA risk, identical to the Polymarket leg (see Polymarket spec). An extra operational risk is that the MetaMask UI hides or delays access (hidden-market flags, geoblock changes) while the underlying market keeps trading. (M, inference from source flags)

---

## 8. Geo, ToS, automation

- **Product page excluded territories (H):** Australia, Belgium, Brazil, Burundi, Canada, Ethiopia, France, Germany, Iraq, Italy, Japan, Myanmar, Poland, Singapore, Taiwan, Thailand, UK, USA, plus countries on the US sanctions list. Support pages add **Romania** and "others" and "Not intended for UK persons"; they refer to Polymarket's list as authoritative. The app source also hard-codes `GEO_BLOCKED_COUNTRIES = DE, RO, ES, IN` and calls Polymarket's geoblock endpoint (H, source). The three lists disagree (Spain and India appear only in code; Romania only on the support pages): treat the union as blocked and Polymarket's `/api/geoblock` as the truth.
- **MetaMask Terms of Use (June 2026):** my page read found no mention of Predictions or Polymarket (M, small-model summary). It reserves the right to limit API requests and prohibits scraping and circumventing limits (quote: "We retain sole discretion to limit your API requests"). There is no Predictions-specific automation clause and no Predict API terms. Polymarket's own ToS (`https://polymarket.com/tos`, linked from the app as `POLYMARKET_TERMS_URL`) governs the trading relationship; I did not read it here (covered by the Polymarket workflow).
- **Automation:** nothing permits or documents bots against MetaMask Predictions. Automating the mobile app or its relayer is out of scope.

---

## 9. Liquidity (DefiLlama, fetched 2026-10-19)

| Metric | Value | Date / source | Tag |
|---|---|---|---|
| Volume 24h | $146,183 | 2026-10-17, `api.llama.fi/summary/dexs/metamask` | H |
| Volume 7d | $834,781 | same | H |
| Volume 30d | $4,618,550 (previous 30d $10,666,745, -56.7%) | same | H |
| Volume since series start | $22,793,841 (series starts 2026-07-05, 105 daily points) | same | H |
| Fees 24h / 7d / 30d | $6,516 / $39,792 / $189,400 | 2026-10-18, `api.llama.fi/summary/fees/metamask-predictions` | H |
| Fees all-time | $1,338,178 (series starts 2026-05-16, 155 points); `doublecounted: true` | same | H |
| TVL / open interest | none (Interface; `tvl: []`) | protocol endpoint | H |
| Polymarket International 30d (for scale) | about $2.21B | sibling doc `docs/research/14-platform-of-platforms.md` section 2.1 (DefiLlama, 2026-10-18) | M (not re-fetched) |
| Order-book depth | the Polymarket book; nothing MetaMask-specific | | H |

Caveat: adapter-reported, methodology unverified; the volume series (from 2026-07-05) and fees series (from 2026-05-16) start on different dates so they are not comparable day by day.

---

## 10. Event coverage and overlap

Everything Polymarket lists that survives the app's curation: sports (NFL/NBA/soccer/tennis/esports with a curated market-type list), politics, crypto price (including 5-minute BTC up/down), culture, macro. Every category overlaps Kalshi, Polymarket US, Limitless, Predict.fun, Opinion, XO and others in exactly the way Polymarket does. **No category exists only on MetaMask.** (H for the app's market types from source; M for the overlap statement.)

## 11. Shared liquidity

**Shares 100% of its liquidity with Polymarket International** (same CLOB V2 books, same conditional tokens, same UMA resolution). Not an independent leg; a Polymarket mid is the MetaMask mid, minus a ~4% fee wedge. (H)

---

## 12. Fixtures

In `docs/research/fixtures/metamask-predictions/` (all fetched 2026-10-19, unauthenticated GET, User-Agent `insurance-markets-research/0.1`):

| File | Source | Shows |
|---|---|---|
| `defillama_protocol_metamask-predictions_2026-10-19.json` | `GET https://api.llama.fi/protocol/metamask-predictions` | id 8001, category Interface, tag `Polymarket Builder`, parent `metamask` |
| `defillama_fees_metamask-predictions_2026-10-19.json` | `GET https://api.llama.fi/summary/fees/metamask-predictions` | fee totals, `doublecounted: true`, `totalDataChart` (155 daily points) |
| `defillama_dexs_metamask_parent_2026-10-19.json` | `GET https://api.llama.fi/summary/dexs/metamask` | volume totals; only child is MetaMask Predictions |
| `polymarket_gamma_markets_top1_by_volume24hr_2026-10-19.json` | `GET https://gamma-api.polymarket.com/markets?limit=1&active=true&closed=false&order=volume24hr&ascending=false` | the shape of the data MetaMask renders; `feeSchedule`, `clobTokenIds`, `negRisk` |
| `metamask_predict_relayer_root_403_2026-10-19.txt` | `GET https://predict.api.cx.metamask.io/` | 403 Missing Authentication Token (no public API) |

---

## 13. Adapter recommendation

- **adapter_priority: skip.** Duplicate liquidity, no API, 4% fee wedge, tiny and falling volume.
- Keep a **registry record only**: `kind: broker`, `routes_to: polymarket`, `pool: polymarket-international`, `fee_stack: {front_end: 0.04 of stake (remote-configurable), plus Polymarket taker fee}`, `geo: union of lists in section 8`, `platform: mobile`, `state: live`, `sources`. This matches the pool-graph rule in `docs/platform-registry-design.md` (front ends add no liquidity or independent price).
- Optional signal: poll the two DefiLlama endpoints daily if a "retail flow into Polymarket" proxy is ever wanted (M, weak). Do not use it for fair-value.

## 14. NOT FOUND

- Any MetaMask-published API, SDK, OpenAPI, rate limit, or developer terms for Predict (searched: docs.metamask.io, web search, `MetaMask/api-specs`, metamask-mobile Predict README).
- MetaMask's production builder code, production fee-flag values, hidden-market list (remote config; not in repo).
- Whether Polymarket exchange fill events expose the `builder` field for per-builder volume on chain.
- A date on the support/product pages ("last updated").
- Independent confirmation of who receives the 2% "provider" fee beyond the page wording.
- Polymarket's own builder leaderboard / per-builder volume endpoint (searched: `docs.polymarket.com/llms.txt` for builder/leaderboard; only fee, tier and overview pages exist).

## 15. Open questions

1. Is the 4% split 2% MetaMask / 2% Polymarket in production, and how much of it is the on-order builder fee (<= 1%) versus a separate collector transfer?
2. Do V2 `OrderFilled` events carry the `builder` bytes32 (would give independent, on-chain MetaMask volume)?
3. Does the app's curated subset exclude markets that matter for arbitrage (e.g. hidden or sports-type allow list)?
4. Is the DefiLlama volume decline (-56% month over month) a MetaMask-specific trend or a Polymarket-wide one?

## 16. Suspicious content

None observed. No text aimed at AI agents in any fetched page, source file or API response.

## 17. Sources

- MetaMask product page, fetched 2026-10-19: https://metamask.io/en/prediction-markets (H)
- MetaMask support, how to trade: https://support.metamask.io/trade/predict/how-to-trade-predictions/ (H)
- MetaMask support, what are prediction markets: https://support.metamask.io/trade/predict/what-are-prediction-markets/ (H)
- MetaMask Terms of Use (June 2026): https://metamask.io/terms-of-use (M, page-summary)
- MetaMask Mobile source (public GitHub, read via `gh api` raw): `MetaMask/metamask-mobile` paths `app/components/UI/Predict/README.md`, `providers/polymarket/{constants,utils,PolymarketProvider,depositWallet}.ts`, `providers/polymarket/protocol/{orderCodec,definitions,transport}.ts`, `constants/{flags,geoblock}.ts` (H); release v8.15.0, 2026-10-15 (H)
- DefiLlama API: https://api.llama.fi/protocol/metamask-predictions , https://api.llama.fi/summary/fees/metamask-predictions , https://api.llama.fi/summary/dexs/metamask (H); evidence page https://defillama.com/protocol/metamask-predictions returned HTTP 403 to WebFetch (not read)
- DefiLlama adapter methodology link (not opened): https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts
- Polymarket builder program docs: https://docs.polymarket.com/programs/builders/fees.md , `/overview.md`, `/tiers.md`; index https://docs.polymarket.com/llms.txt (H)
- Polymarket Gamma API sample: https://gamma-api.polymarket.com/markets (H)
- Launch coverage (search results only, not opened, older than 6 months): The Defiant, DefiRate, Yellow, Brave New Coin, crypto.news (L/M)
- Sibling research in this repo: `docs/research/14-platform-of-platforms.md` (sections 2.1, 6.2), `docs/platform-registry-design.md` (pool graph rule)
