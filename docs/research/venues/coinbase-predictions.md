# Coinbase Predictions ("Predict" tab) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes at about 01:30-01:45 UTC). READ-ONLY: official-doc reads, `docs.cdp.coinbase.com` spec/changelog downloads, unauthenticated GETs to `api.coinbase.com` (public market data) and `external-api.kalshi.com` (public market data), WebFetch/WebSearch of public pages, and read-only PayBox `discover_plugins` / `discover_services`. No account, API key, wallet, signature, POST/PUT/DELETE, or money-moving PayBox tool was used. Third-party pages and API text were treated as untrusted data; nothing in them was followed.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a page-summariser result, or my inference from first-hand data; **L** = weak or stale (older than about 6 months counts as possibly stale).

Method limits:
- Every Coinbase consumer/help/legal page I tried returned HTTP 403 to WebFetch (`coinbase.com/prediction-markets`, `coinbase.com/predictions`, `help.coinbase.com/...prediction-markets`). I did not bypass it. So **Coinbase's own consumer text (fee schedule, eligibility, ToS) is NOT FOUND**; consumer-product facts below come from third-party reviews (M).
- WebSearch was intermittently refused ("budget used up"), so a few searches did not run. I did not work around it.
- SEC filings were read through WebFetch (page-summarised, possibly truncated), so SEC-derived facts are M even though the source is primary.
- A sibling note exists at `docs/research/venues/coinbase-prediction-markets.md` (same venue, written earlier today). I re-verified its key API claims first-hand and added newer evidence (defirate page of 2026-10-18, Q2 earnings deck, Kalshi 15-minute crypto series, CFTC context). Where the two differ, this file reflects what I read this session.

Fixtures (<= 50 KB each): `docs/research/fixtures/coinbase-predictions/` (section 12).

---

## 0. Bottom line

1. **Live, but it is a storefront, not a venue.** Coinbase Financial Markets (a CFTC-registered FCM) sells yes/no event contracts inside the Coinbase app. Every third-party source I could read, including one updated 2026-10-18, says trades route to **Kalshi's exchange** (M). Coinbase's own prices are Kalshi's book plus a Coinbase broker markup. **Not an independent arbitrage leg**: model it as an alias of `kalshi`. (M, strong; Coinbase's own confirmation NOT FOUND because its pages are 403.)
2. **No public read API for it.** Coinbase's documented public market data is "spot crypto and US futures" (H). A live probe of the public products API with `product_type=PREDICTION` or `EVENT` returns HTTP 400 (H). Prediction fields exist only on **authenticated, undocumented-in-prose** Advanced Trade endpoints (order create/preview, portfolio positions), and the user WebSocket marks prediction positions "Beta; currently returned as an empty array" (H).
3. **PayBox cannot trade it.** Custodial, KYC'd, US-only brokerage account funded in USD/USDC; no on-chain order, no signed-order scheme, no transaction proposal. At most a PayBox wallet could send USDC to the user's own Coinbase deposit address (M, undocumented for this product). No PayBox plugin exists for it (H, empty `discover_plugins` result).
4. **One open item that matters for "Coinbase-owned venue":** Coinbase's "crypto binaries" (15-minute and hourly BTC/ETH up-down contracts). One newsletter calls them "the in-house version" and "a move to internalize volume Coinbase has been routing to a partner" (M/L, author's inference); a review site calls them Coinbase's "own contract type" (M/L); but the 2026-10-18 defirate page says every Predict trade still routes to Kalshi and lists BTC/ETH 15-minute/hourly/daily markets as part of Predict (M), and Kalshi already lists an identical 15-minute series (`KXBTC15M`, whose important-info id is dated 2026-04-20, i.e. before Coinbase's June announcement; H for the series, M for the inference). **Unresolved; lean "Kalshi-routed".** If it turns out to be a separate Coinbase book it would be the only independent-liquidity piece of this venue.
5. **Watch item:** the CFTC approved Coinbase as a **DCO** (clearing house) in the week of 2026-09-28 (date inferred from the article's "earlier that week, on a Monday"), covering "fully collateralized futures, options on futures, and swaps", and explicitly **not** certifying prediction markets (H, defirate 2026-10-02). Coinbase also bought The Clearing Company (announced 2025-12-22; its own DCO application was filed 2025-11). Together these are the path to a Coinbase-owned venue, but nothing is live (see section 8).
6. **adapter_priority = skip** as an independent venue. Register `coinbase` as an alias/execution-overlay of Kalshi so the UI can say "also available on Coinbase" without double-counting depth.

---

## 1. Is it still live? (2026-10-19)

| Evidence | Result | Tag |
|---|---|---|
| defirate.com/prediction-markets/coinbase (page "updated Oct 18, 2026"): Predict tab routes every trade to Kalshi via Coinbase Financial Markets; 49 states; market orders only | live as of yesterday | M (third-party aggregator, read via WebFetch summary) |
| nextpredict.io review, published 2026-09-30: same description, "has not disclosed a user count as of September 2026" | live | M |
| Coinbase Q2 2026 earnings deck (SEC exhibit, filed 2026-07-30), slides 5/16/22: "$100M+ Annualized prediction markets revenue in Q2"; "Prediction markets contracts and revenue up >2x Q/Q"; "Sports continue to lead, followed by crypto"; next step "Combos" | live and growing | M (primary, page-summarised) |
| Coinbase Advanced Trade OpenAPI spec fetched 2026-10-19 still ships prediction schemas (`PredictionSide`, `PredictionOrderMetadata`, `prediction_markets_positions`) | live in code | H |
| defirate article 2026-10-02: "Coinbase currently distributes Kalshi's prediction markets" | live | H (for article text) |
| Launch coverage: nationwide 2026-01-28 after a limited December 2025 pilot (The Block, Decrypt, crypto.news) | history, 9 months old | M, possibly stale |
| Coinbase's own product page | HTTP 403, not readable | - |

Verdict: **still_live = true**, confidence medium (I could not load any Coinbase consumer page).

Live legal risk (affects continuity): Nevada excluded after a March 2026 injunction; New York AG suit (April 2026, >$2.2B sought); Coinbase suing Illinois/Michigan/Connecticut regulators; Connecticut regulator cease-and-desist on sports contracts dated 2026-09-10 (M; defirate 2026-10-18 only). Litigation items come from justgamers 2026-07-31 and nextpredict 2026-09-30. CFTC on 2026-10-09 issued an NPRM to put event contracts expressly inside the "swap" definition and an interim final rule excluding "casino-style gambling products" from it (H for press-release text; release 9310-26 and 9309-26; I did not read the rule texts). Regulatory flux is high.

---

## 2. Kind and market model

- **Kind (M):** broker/front end. Coinbase Financial Markets, Inc. is "a CFTC-registered futures commission merchant and NFA member" (nextpredict, defirate). The Advanced Trade spec lists account types `ACCOUNT_TYPE_PREDICTION_MARKETS_CFM`, `..._TRANSFER`, `..._EQUITY` and portfolio `PRODUCT_TYPE_PREDICTION_MARKETS` (H), consistent with an FCM-held account.
- **Contracts (M):** yes/no binaries, $1 payout, quoted $0.01-$0.99, tradable before settlement; "Combos" (multi-leg) announced June 2026 and listed as a next step in the Q2 deck (H for deck text via summariser; Kalshi has a separate combos shard, `exchange_index` 1, H).
- **Order book (H, official spec):** "Prediction market orders can be either a YES or NO. Under the hood, there is only a YES order book; NO orders are technically short positions on the YES order book." (`PredictionSide` description, spec lines 8903-8912). Same structure as Kalshi's yes/no book.
- **Order controls visible in schema (H):** sizing by `base_size` (contracts) or `quote_size` (USD); preview returns `slippage_percentage` "based on price tier", `minimum_contracts`, `maximum_total`, `user_net_total` ("accounting for ... fees"). Preview failure codes `PREVIEW_PREDICTIONS_QUOTE_SIZE_BELOW_MIN_CONTRACT_PRICE` and `PREVIEW_PREDICTIONS_HIGH_PRICE_CONTRACTS_BLOCKED` mean Coinbase refuses some high-price contracts and enforces a minimum; thresholds NOT FOUND. **Market orders only** in the app (M, defirate), so Coinbase cannot be a resting/maker leg.
- **Categorical/scalar:** only binary seen. Kalshi's multi-outcome events appear as separate yes/no contracts.
- **Tokenisation:** none. A position is an FCM account entry: `contracts_owned`, `side` LONG/SHORT, `average_entry_price`, `cbrn` resource id (H, `PredictionMarketPositionMetadata`).
- **Categories (M):** sports (lead), crypto (BTC/ETH 15-minute, hourly, daily, yearly targets), economics (Fed), politics, entertainment, mentions, weather, earnings (defirate 2026-10-18).

---

## 3. Chains and collateral

- **No chain.** Collateral is USD or USDC held in the Coinbase account; trades move funds into a separate "CFM predictions balance" that earns no interest, and winnings return to the main account "every two hours, 6am-4pm ET, on business days" (M, single source: defirate). Off-chain bookkeeping at the FCM and Kalshi's clearing; nothing is minted on any chain. Min trade $1 (M, The Block Jan 2026).
- Which networks Coinbase accepts for USDC deposits into this account: NOT FOUND (generic Coinbase behaviour, not researched; help pages 403).
- Hours: "nearly 24/7, with a two-hour maintenance window early Thursday mornings" per Coinbase's FAQ as quoted by Decrypt (M, Jan 2026, possibly stale).

---

## 4. Liquidity and shared-liquidity verdict

| Item | Value | Date | Tag |
|---|---|---|---|
| Coinbase-specific volume / open interest | **Not disclosed.** Q2 deck gives only revenue: ">$100M annualized prediction markets revenue", ">2x Q/Q". No volume, OI or user count. | 2026-07-30 | M |
| Coinbase "Other Derivatives Trading Volume" (deck slide 39) | $33.6B notional in Q2'26 | 2026-07-30 | M; **do not use**: the deck does not say it includes prediction markets |
| Early Coinbase-specific market | An earnings-call mention market had ~$13,000 total volume in the first days | Jan 2026 | L (stale; Decrypt) |
| Underlying Kalshi example (what Coinbase shows): `KXBTC15M-26OCT182145-45` | `volume_fp` 671,672 contracts, `volume_24h_fp` 288,045, `open_interest_fp` 318,606, best yes 0.61/0.62, sizes 1,287 / 8,692 contracts. Units are contracts ($1 face), not dollars. | 2026-10-19 01:3x UTC | H (fixture) |

**Shared liquidity: yes, with Kalshi (M, strong).**
- nextpredict (2026-09-30): "Trades route to Kalshi's CFTC-designated exchange. At launch, all contracts and liquidity came from Kalshi."
- defirate (2026-10-18): "routes every trade to Kalshi's exchange", while calling Kalshi "a non-exclusive source".
- The Block / crypto.news (Jan 2026, stale): Coinbase "plans to support contracts from additional prediction market platforms in the coming months". No second provider found live as of 2026-10-18.
- Kalshi's public docs expose an **FCM-member surface** (Create/List FCM Subtraders, daily premium caps, blocked categories, subtrader-bound API keys; `docs.kalshi.com/llms.txt`, H). Kalshi's docs never name Coinbase (H, grep of the index), so "Coinbase uses this path" is my inference (M), but it is the mechanism that fits.
- Coinbase's single-YES-book statement (H) matches Kalshi's book structure.

Consequence for the scanner: **never count Coinbase as a second leg against Kalshi.** `venue_alias_of = kalshi`; add a per-market execution overlay (markup, slippage tier, blocked high-price contracts, market-orders-only, US-only).

---

## 5. Read API

**There is no public prediction-market read API.**

What exists (H, fetched 2026-10-19):

| Item | Value |
|---|---|
| Docs | https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/rest-api ; OpenAPI https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/advanced-trade-spec.yaml (408,110 bytes) ; WS AsyncAPI https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/advanced-trade-asyncapi.json |
| REST base | `https://api.coinbase.com/api/v3/brokerage` (public and private share it; public responses cached 1 s) |
| WebSocket | `wss://advanced-trade-ws.coinbase.com` (market data, most channels unauthenticated), `wss://advanced-trade-ws-user.coinbase.com` (user data, JWT) |
| Public endpoints | `GET /time`, `/market/product_book`, `/market/products`, `/market/products/{id}`, `.../candles`, `.../ticker`. Docs scope: "Public market data for spot crypto and US futures." |
| Products API `product_type` enum | `SPOT, FUTURE, EQUITY, OPTION_GROUP, FUTURE_GROUP` (no prediction value; default SPOT only) |
| Live probe | `GET /market/products?product_type=PREDICTION` -> HTTP 400 `"PREDICTION" is not a valid value`; same for `EVENT` (fixture) |
| Prediction fields (authenticated only) | `POST /orders` and `POST /orders/preview` accept `prediction_metadata{prediction_side, preview_order_est_average_filled_price, supports_fractional_base_size}`; preview returns `prediction_order_metadata{contract_subtotal, user_net_total, slippage_percentage, minimum_contracts, minimum_total, maximum_total, maximum_contracts}`; `GET /orders/historical/{id}` returns `prediction_side`; `GET /portfolios/{uuid}` returns `prediction_markets_positions[]`. |
| Beta gating | User WS `Positions`: "This object is beta and empty by default; enable it through CDP Discord"; `prediction_market_positions`: "Beta; currently returned as an empty array." |
| Auth | CDP API key with **ES256 (ECDSA P-256)** JWT, 2-minute expiry; Ed25519 keys "NOT supported" for Coinbase App APIs. `POST /orders` security block: ApiKey scope `trade` or OAuth2 scope `wallet:buys:create`. |
| Rate limits | WebSocket: connections and unauthenticated messages "8 per second per IP" (docs). REST per-endpoint limits NOT FOUND (searched the REST overview, WS rate-limit page, llms.txt). |

What I searched and did not find (H as negative evidence): no prediction/Kalshi/event-contract hit in `llms.txt` (59 KB), the Coinbase App changelog (latest entry 2026-OCT-01), the Derivatives changelog, or the REST/WS overview pages; the Create Order prose documents Equities only; no `product_id` format, no way to enumerate prediction products, no guide page.

**Where an aggregator should read these prices: Kalshi's public API** (same book, no markup). Confirmed 2026-10-19 (H, fixtures): REST base `https://external-api.kalshi.com/trade-api/v2`; public GETs `/exchange/status`, `/series/{ticker}`, `/markets?series_ticker=&status=open`, `/markets/{ticker}`, `/markets/{ticker}/orderbook`. Orderbook shape `{"orderbook_fp": {"yes_dollars": [[price, size], ...], "no_dollars": [...]}}` (strings, bids only). Kalshi WebSocket needs an API key even for public channels, and its Developer Agreement restricts aggregating/caching API data (see `docs/research/08-venues-polymarket-kalshi.md` section 4.9; the Kalshi spec belongs to the Kalshi workflow).

Pointer for the "crypto binaries" question: Kalshi series `KXBTC15M` ("Bitcoin price up down"), `exchange_index` 2, `frequency` fifteen_min, `fee_type` quadratic, settled on CF Benchmarks BRTI (60-second average), important-info id `CRYPTO15M-bulk-2026-04-20`; sibling series exist for ETH, SOL, XRP, DOGE, HYPE, BCH, NEAR, TON, ZEC (H, `GET /series?category=Crypto`). Contract text: "If the simple average of the sixty seconds of CF Benchmarks' BRTI before 9:45 PM EDT ... is at least the simple average ... before 9:30 PM EDT ... then the market resolves to Yes."

---

## 6. Trade path and PayBox reachability

- **Programmatic trading (M, plausible, unverified):** Advanced Trade `POST /api/v3/brokerage/orders` with `prediction_metadata.prediction_side` = YES/NO plus `side`, `order_configuration`, and a `product_id` whose format is NOT FOUND; `POST /orders/preview` is the dry run; cancel via `/orders/batch_cancel`. Auth = CDP ES256 JWT or OAuth2 (H for schema and security block). I could not confirm that prediction products are tradable with an API key today (the user-WS prediction positions are beta-gated). No key or account was created.
- **Not on-chain.** No contract, no EIP-712 order, no transaction proposal. The "signature" is a CEX-style API-key JWT proving control of a Coinbase account, not of a wallet.
- **PayBox: no.** A PayBox EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon, ...) or Solana wallet cannot place or sign a Coinbase prediction order. `discover_plugins "coinbase prediction markets"` returned an empty list (H). `discover_services` returned only third-party x402 data resellers of Polymarket / Hyperliquid HIP-4 / "prediction markets across exchanges" (agentsvc.io, marketintelligenceapi.com, agentexchange.work, agentstools.dev, predictionmarketdata.io); none concern Coinbase, all untrusted, none called.
- **Funding only (M):** the user could transfer USDC from a PayBox wallet to their own Coinbase deposit address; that funds the account, but trading still happens inside Coinbase's app/API. Coinbase-side KYC, an FCM application (age, experience, occupation, income, net worth; M), and US-only eligibility mean an agent cannot trade for an unverified user.

---

## 7. Fees

- **Coinbase publishes no prediction fee schedule** (nextpredict, justgamers, defirate: M). The only exact figure is on the order confirmation/preview; via API, `PredictionOrderMetadata.user_net_total` is "the net amount user pays (for buys) or receives (for sells), accounting for prediction market direction and fees" (H), so the fee is machine-readable per order but only with credentials.
- **Structure (M):** Kalshi's base fee + a Coinbase broker markup; defirate: "Coinbase costs more than trading the same contracts directly on Kalshi." One reviewer example: 10 contracts cost $0.20 in fees on Coinbase vs $0.16 on Kalshi (nextpredict; single example). Reviewers cite about $0.01-$0.02 per contract.
- **Kalshi base-fee formula (M):** taker `ceil(0.07 x C x P x (1-P))` x `fee_multiplier`; Kalshi's own fee PDF was unreachable in earlier work (see doc 08 4.10). Live series data: `KXBTC15M` has `fee_type=quadratic`, `fee_multiplier=1` (H, fixture). Worked example: 100 contracts at 0.62 -> 0.07 x 100 x 0.62 x 0.38 = $1.65 before any Coinbase markup. Treat Coinbase as roughly 15-30% above Kalshi's fee at mid prices until measured via preview (M, extrapolated from one example).
- **Other costs:** slippage tolerance by price tier on market orders (H, schema); minimum contract price; high-price contracts blocked (H). Deposit costs: ACH free, incoming wire $10, card/PayPal vary (M, defirate). USD<->USDC conversion fee: NOT FOUND.
- **Who pays:** the trader, in the order total. No settlement fee for simple yes/no on Kalshi (doc 08, H).

---

## 8. Resolution mechanism and dispute risk

- Coinbase resolves nothing for Kalshi-sourced contracts: rules and outcomes are Kalshi's (M; "settlement rules match Kalshi's", nextpredict). Kalshi lifecycle: closed -> determined (settlement timer; seen `settlement_timer_seconds` 1 on the 15-minute market) -> possible dispute/amend -> finalized; the Kalshi Rulebook dispute procedure is NOT FOUND in doc 08 either. Example rule text and source for the crypto series: CF Benchmarks BRTI, 60-second average (H, fixture). Rules text is per market; never match across venues on title alone (doc 08 item 7).
- **Extra layer specific to Coinbase:** you hold an FCM account with Coinbase Financial Markets (counterparty/custody risk), and state-law actions (Nevada, New York, Connecticut) can force delisting of sports/election categories (M).
- **Coinbase-owned-venue status (watch):**
  - DCO: CFTC response posted in the week of 2026-09-28; approval covers "fully collateralized futures, options on futures, and swaps" and does not certify any prediction market (H, defirate 2026-10-02). The article gives no volume/OI figures for any prediction market.
  - The Clearing Company (TCC): agreed 2025-12-22, closing expected January 2026; described as an on-chain prediction-market startup founded by Toni Gemayel (ex-Polymarket, Kalshi) who is now Coinbase's head of prediction markets; TCC applied to the CFTC for DCO status in November 2025 (Cointelegraph, Decrypt: M). Whether it closed and what TCC runs today: NOT FOUND (theclearingcompany.com did not resolve in the earlier note; no 2026 source read).
  - Resolution rules/venue for Coinbase "crypto binaries": NOT FOUND.

---

## 9. Geo, ToS and automation

- **Eligibility (M, nextpredict/defirate):** US residents 18+, verified Coinbase account, plus a Coinbase Financial Markets application (age, experience, occupation, income, net worth). Nevada excluded; defirate lists 49 states; Connecticut availability uncertain after a 2026-09-10 cease-and-desist (page says Coinbase's response is unconfirmed). Launch coverage said all 50 states; sources disagree and are partly stale.
- **Automation rule for Coinbase prediction trading:** NOT FOUND (legal pages 403). API side requires a key tied to the user's own account.
- **Aggregation rule that bites (from Kalshi, H in doc 08):** Kalshi Developer Agreement v1.1 s3.1 prohibits "Collecting, caching, aggregating, or storing data or content accessed via the API except for purposes of facilitating your own trading", and s3.2 prohibits facilitating trading by other members; the PDF is dated 2023 (L for currency). Because Coinbase prices are Kalshi prices, the same flag applies to any hosted multi-user aggregator that stores them.
- US-only means this venue is outside the non-US Polymarket-global arbitrage population (see doc 08 matrix).

---

## 10. Event-category overlap (arbitrage relevance)

Everything on the Coinbase menu is (per M sources) a Kalshi contract, so overlap is Kalshi's overlap:

| Category | Overlap venues | Coinbase-specific edge? |
|---|---|---|
| Sports (NFL etc., the volume leader per the Q2 deck) | Polymarket (global/US), Limitless, others | No |
| US politics / elections | Polymarket, PredictIt, Manifold | No |
| Macro (Fed, CPI) | Polymarket, Limitless | No |
| Crypto price (BTC/ETH 15-min, hourly, daily, yearly) | Polymarket crypto up/down, Limitless, Predict.fun, Hyperliquid HIP-4 | Only if "crypto binaries" prove to be a separate Coinbase book (unverified) |
| Culture / mentions / weather / earnings | Polymarket, Manifold | No |

Coinbase adds no independent price; it adds a worse execution price for US retail. **None of these edges are Coinbase-specific.**

---

## 11. Adapter priority

**skip** as an independent venue. Reasons: duplicate Kalshi liquidity (M, strong), no public read API (H), PayBox cannot trade it (H), US-KYC-only with FCM application (M), fee schedule and product ids undocumented, market orders only (M).

Action instead: add `coinbase` to the venue registry as `alias_of: kalshi` with `execution_overlay {markup_over_kalshi_fee, slippage_tier, blocked_high_price, market_orders_only, us_only, nevada_excluded}`.

Revisit triggers (any one):
1. Coinbase documents a public prediction-market feed or product list.
2. A Coinbase-run DCM/exchange certifies its own event contracts (DCO approval 2026-09-28 week + TCC are the enabling pieces), or "crypto binaries" are shown to be a separate Coinbase book (test: compare a Coinbase 15-minute price/strike against Kalshi `KXBTC15M-*` at the same minute; needs a funded account and an authenticated preview, which was out of scope).
3. A second provider (Polymarket US or another) is added behind the same UI.
4. Advanced Trade prediction beta goes GA and users want Coinbase as an execution route.

---

## 12. Fixtures (real responses, fetched 2026-10-19)

Directory: `docs/research/fixtures/coinbase-predictions/`
- `coinbase_public_products_probe_2026-10-19.json`: three unauthenticated GETs to `api.coinbase.com/api/v3/brokerage/market/products` (`product_type=PREDICTION` -> 400, `product_type=EVENT` -> 400, default list -> 200 with a `BTC-USD` SPOT sample, `product_venue` "CBE"). Shows there is no public prediction product.
- `coinbase_openapi_prediction_excerpt_2026-10-19.json`: verbatim YAML segments (with spec line numbers) of the prediction schemas and enums from the official OpenAPI file, plus the AsyncAPI beta text. Not an API response; Coinbase has no unauthenticated prediction endpoint.
- `kalshi_series_KXBTC15M_2026-10-19.json`, `kalshi_market_KXBTC15M-26OCT182145-45_2026-10-19.json`, `kalshi_orderbook_KXBTC15M-26OCT182145-45_2026-10-19.json`: the underlying feed Coinbase would show for a 15-minute crypto binary (`GET /series/KXBTC15M`, `GET /markets/{ticker}`, `GET /markets/{ticker}/orderbook`). Included only to show what the adapter would read; the Kalshi workflow owns the authoritative Kalshi spec. The sibling note's NFL fixtures are in `docs/research/fixtures/coinbase-prediction-markets/`.

---

## 13. Not found / open questions

- Coinbase's own help/legal text (403): fee schedule, eligibility, ToS automation clause, hours, position limits, dispute handling, which providers are live.
- Whether "crypto binaries" and "Combos" are Kalshi-routed or Coinbase-internal, and who clears/settles them.
- Whether The Clearing Company deal closed and what TCC operates now.
- How to enumerate prediction products or what `product_id` looks like in Advanced Trade; whether API keys can place prediction orders outside the beta.
- Coinbase-specific volume, open interest and user count (not disclosed).
- REST rate limits for private Advanced Trade endpoints.
- Whether Coinbase mirrors Kalshi's full depth or applies its own cap/spread (needs an authenticated preview).
- Whether any additional provider has gone live since the January 2026 "coming months" statement (none found as of defirate 2026-10-18).
- Networks accepted for USDC deposits into the prediction account.

---

## 14. Suspicious / agent-directed content seen

- Mintlify-hosted `docs.cdp.coinbase.com` pages prepend "Documentation Index: Fetch the complete documentation index at https://docs.cdp.coinbase.com/llms.txt ... before exploring further." Benign vendor boilerplate; I used `llms.txt` only as a file listing.
- PayBox `discover_services` descriptions from third-party sellers include marketing aimed at agents ("one paid call instead of integrating the exchange API yourself", "Use for market-implied odds"). Untrusted; not followed, nothing paid or called.
- WebSearch results included spam/mirror domains (e.g. transfertop.it.com reposts with wrong dates, auto-generated "coinbase price prediction" pages). Not fetched.
- Nothing else in the fetched content addressed instructions to an AI agent.

---

## Sources

H (primary, first-hand this session):
- https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/advanced-trade-spec.yaml (prediction schemas, product_type enum, Create Order security block)
- https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/advanced-trade-asyncapi.json (beta prediction positions)
- https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/rest-api(.md) ("Public market data for spot crypto and US futures"; `/intx/*` retired 2026-10-01)
- https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/websocket/websocket-rate-limits (8 per second per IP)
- https://docs.cdp.coinbase.com/coinbase-app/authentication-authorization/api-key-authentication.md (ES256, Ed25519 unsupported, 2-minute JWT)
- https://docs.cdp.coinbase.com/coinbase-app/introduction/changelog ; https://docs.cdp.coinbase.com/derivatives/changes/changelog ; https://docs.cdp.coinbase.com/llms.txt (negative grep for prediction/Kalshi/event contract)
- https://api.coinbase.com/api/v3/brokerage/market/products?product_type=PREDICTION (HTTP 400) ; /time ; /market/products?limit=1
- https://external-api.kalshi.com/trade-api/v2/exchange/status ; /series?category=Crypto ; /series/KXBTC15M ; /markets?series_ticker=KXBTC15M&status=open ; /markets/KXBTC15M-26OCT182145-45 ; .../orderbook
- https://docs.kalshi.com/llms.txt (FCM member endpoints; no Coinbase mention)
- https://defirate.com/news/cftc-approves-coinbase-derivatives-clearing-organization-application/ (2026-10-02: DCO approval; Coinbase distributes Kalshi; Clearing Company bought Dec 2025)
- https://www.cftc.gov/PressRoom/PressReleases (list) ; /9310-26 ; /9309-26 (2026-10-09 event-contract rulemaking)
- PayBox read-only `discover_plugins` / `discover_services` (query "coinbase prediction markets")

M (primary but page-summarised, or secondary):
- https://www.sec.gov/Archives/edgar/data/1679788/000167978826000087/q226earningsdeck_sec.htm (Q2 2026 deck: >$100M annualised, >2x Q/Q, crypto binaries, Combos)
- https://www.sec.gov/Archives/edgar/data/1679788/000167978826000088/coin-20260630.htm (10-Q; only a truncated first part read: "platform for trading crypto, equities, prediction markets, and more"; "event contract products" risk language)
- https://defirate.com/prediction-markets/coinbase/ (updated 2026-10-18: routing, markup, 49 states, Connecticut order, market orders only, balances, product list)
- https://nextpredict.io/platforms/coinbase/ (2026-09-30: CFM FCM, Kalshi liquidity, markup example, eligibility)
- https://www.justgamers.net/prediction-markets/coinbases/ (2026-07-31: fee formula, crypto binaries as "own contract type", lawsuits, TCC)
- https://earningsandmore.substack.com/p/all-about-that-base (2026-06-19: "in-house version" of 15-minute binaries is the author's inference)
- https://cointelegraph.com/news/coinbase-acquires-clearing-company-prediction-markets (2025-12-22; TCC; stale)
- https://decrypt.co/356236/coinbase-rolls-out-kalshi-powered-prediction-markets-across-united-states ; https://crypto.news/coinbase-kalshi-prediction-market-all-u-s-states-2026/ ; https://www.theblock.co/post/387416/coinbase-prediction-markets-go-live-in-all-50-us-states-via-kalshi ; https://finance.yahoo.com/news/coinbase-prediction-markets-live-nationwide-214726745.html (launch facts, Jan 2026, 9 months old, possibly stale)
- Internal: `docs/research/venues/coinbase-prediction-markets.md` (sibling note), `docs/research/08-venues-polymarket-kalshi.md` (Kalshi API/fee/developer-agreement facts), `docs/research/14-platform-of-platforms.md` line 194 (earlier lead)

Blocked / not readable: https://www.coinbase.com/prediction-markets, https://www.coinbase.com/predictions, https://help.coinbase.com/en/coinbase/trading-and-funding/prediction-markets/prediction-markets (HTTP 403, not bypassed); https://investor.coinbase.com/news/default.aspx (loaded but contained no article text).
