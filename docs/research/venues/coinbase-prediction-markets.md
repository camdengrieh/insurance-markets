# Coinbase Prediction Markets - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: official-doc reads, unauthenticated GETs to documented hosts (`docs.cdp.coinbase.com`, `api.coinbase.com`, `external-api.kalshi.com`, `docs.kalshi.com`, `data.sec.gov`), read-only `discover_plugins` / `discover_services` on PayBox, and `gh api` repo search. No account, API key, wallet, signature, POST/PUT/DELETE, or money-moving PayBox tool was used. Third-party pages were treated as untrusted data.

Method limits you should know about:
- The session's shared WebSearch budget was exhausted before I started (one earlier query's results were visible; every later query returned "budget used up"). I did not work around it. Discovery used WebFetch on known URLs, official doc/spec files, SEC filings, and GitHub search.
- Every `coinbase.com` and `help.coinbase.com` URL (including the help article named in the task, `/blog`, `/predictions`, `/derivatives`, `/legal/derivatives`) returned HTTP 403 to WebFetch and curl. I did not bypass it and did not use archive services. So **Coinbase's own consumer help/legal text is NOT FOUND**; consumer-product facts below come from news and aggregator sites (M).
- `www.sec.gov/Archives` refuses curl with the generic User-Agent ("Undeclared Automated Tool"): **blocked: requires a contact address**; I did not supply one. `data.sec.gov` submissions JSON worked with the generic UA. The 10-K / 10-Q text was read through WebFetch (its own fetcher, page-summarised and truncated), so SEC-derived facts are tagged M even though the source is primary.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, page summariser output, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real, each <= 50 KB): `docs/research/fixtures/coinbase-prediction-markets/` (section 13).

---

## 0. Bottom line

1. **Live, but it is a storefront, not a venue.** Coinbase Financial Markets (an FCM) offers Kalshi's contracts to US customers inside the Coinbase app; at launch "all contracts and liquidity" came from Kalshi and prices and settlement rules match Kalshi's (M, nextpredict + crypto.news). It is **not an independent arbitrage leg**: any Coinbase price is Kalshi's book plus a Coinbase markup. Dedupe it against Kalshi.
2. **No public read API for it.** Coinbase's own docs list no prediction-market market-data endpoint (public market data is "for spot crypto and US futures", H). The only official surface is **authenticated and undocumented in prose**: the Advanced Trade OpenAPI spec carries prediction fields on order create/preview/get and on portfolio positions (section 5, H), and the user WebSocket marks prediction positions "Beta; currently returned as an empty array", enabled "through CDP Discord" (H). There is no way found to list prediction products, no product_id format, no guide page.
3. **PayBox cannot trade it.** It is a custodial, KYC'd, USD/USDC brokerage account. No on-chain order path, no signed-order scheme, no transaction proposal. PayBox could at most fund the user's own Coinbase account by a transfer (section 6).
4. **One genuinely open item:** Coinbase also lists its own "crypto binaries" (M, single secondary source). Where those trade (its own DCM, The Clearing Company, or Kalshi) is NOT FOUND. If they are an independent book they would be the only independent-liquidity piece of this venue; it is unverified.
5. **adapter_priority = skip** for aggregation and arbitrage (duplicate Kalshi liquidity, no public API). Revisit only if (a) Coinbase documents a public prediction-market feed, (b) the Advanced Trade prediction beta goes GA and is wanted as an execution route for users without a Kalshi account, or (c) the crypto binaries prove to be a separate book.

---

## 1. Is it still live? (2026)

| Evidence | Tag |
|---|---|
| Launched nationwide on 2026-01-28 after a limited December 2025 pilot; funding in USD or USDC from the Coinbase account (Decrypt, crypto.news, nextpredict, Yahoo Finance) | M |
| Coinbase 10-K for FY2025 (filed 2026-02-12): "Coinbase Financial Markets began offering [event contracts] in December 2025"; prediction markets offered in both Simple and Advanced trade (WebFetch summary of the filing) | M (primary, summarised) |
| Coinbase 10-Q for Q2 2026 (filed 2026-07-30): Note 1 describes the platform as "trading crypto, equities, prediction markets, and more"; risk factor on "our event contract products" (WebFetch summary; `data.sec.gov` confirms the filing exists: accession 0001679788-26-000088) | M (primary, summarised) |
| Q2 2026 results: prediction-market revenue +106% QoQ, annualised revenue above $100M, Coinbase "crypto binaries" added late in the quarter (JustGamers, single secondary source; I could not read the earnings exhibit) | M/L |
| Coinbase's official OpenAPI spec (fetched 2026-10-19) still ships prediction-market order and position schemas, and the Coinbase App changelog's latest entry is 2026-OCT-01 | H |
| Legal risk (live): Nevada injunction (March 2026), New York AG suit (April 2026, >$2.2B sought), Coinbase suing gaming regulators in Michigan, Illinois, Connecticut (nextpredict, JustGamers). 10-K risk factors say Coinbase "is a party to litigation" over event contracts. | M |

Verdict: **still_live = true** (confidence medium: I could not load any Coinbase consumer page to see the product live).

---

## 2. Kind and market model

- **Kind (M):** broker front end. Coinbase Financial Markets, Inc. is "a CFTC-registered futures commission merchant and NFA member" (nextpredict); the 10-K calls it the FCM and the Coinbase Derivatives Exchange (ex-LMX Labs) a separate CFTC-regulated DCM. The Advanced Trade spec names account types `ACCOUNT_TYPE_PREDICTION_MARKETS_CFM`, `..._TRANSFER`, `..._EQUITY` (H), consistent with an FCM-held account.
- **Contracts (M):** yes/no binaries priced $0.01-$0.99; winning side pays $1, losing side $0; can sell before settlement.
- **Book (H, official spec):** "Under the hood, there is only a YES order book; NO orders are technically short positions on the YES order book." (`PredictionSide` description in `advanced-trade-spec.yaml`.) This matches Kalshi's yes/no book (a NO bid at X is a YES ask at 1-X).
- **Order types visible in the schema (H):** `prediction_side` YES/NO; sizing by `base_size` (contracts) or `quote_size` (USD); preview returns `slippage_percentage` "based on price tier", `minimum_contracts`, `maximum_total` etc. Preview failure codes `PREVIEW_PREDICTIONS_QUOTE_SIZE_BELOW_MIN_CONTRACT_PRICE` and `PREVIEW_PREDICTIONS_HIGH_PRICE_CONTRACTS_BLOCKED` mean Coinbase blocks some high-price contracts and enforces a minimum, i.e. extreme-price arbitrage may not be executable here. Threshold values NOT FOUND.
- **Scalar / categorical:** only binary seen on Coinbase. Kalshi has multi-market events (mutually exclusive sets) that appear as separate yes/no contracts.
- **Tokenisation:** none. Positions are FCM account entries (`contracts_owned`, `side` LONG/SHORT, `average_entry_price`, `cbrn` resource id) (H, `PredictionMarketPositionMetadata`).
- **Categories (M):** sports, politics, culture/entertainment, economics (e.g. Fed decisions), crypto. Coinbase says all of Kalshi's markets are accessible (Decrypt, M). Coinbase's own short-dated "crypto binaries" (price thresholds) were added by Q2 2026 (JustGamers, L/M).

---

## 3. Chains and collateral

- **No chain.** Collateral is USD or USDC held in the Coinbase account (Decrypt, nextpredict: M). Settled funds go back to that account. Trading and settlement are off-chain bookkeeping at the FCM / Kalshi clearing; nothing is minted on any chain.
- Which networks Coinbase accepts for USDC deposits into this account: NOT FOUND for this product (generic Coinbase deposit behaviour, not researched; help pages 403).

---

## 4. Liquidity and shared-liquidity verdict

| Item | Value | Date | Tag |
|---|---|---|---|
| Coinbase-specific prediction volume / OI | **Not disclosed.** 10-K: Coinbase's reported "Trading Volume" excludes "derivatives, equities, or event contracts" (may include later). 10-Q: no breakdown. Coinbase had not disclosed a user count as of Sept 2026 (nextpredict). | 2026-10-19 | M |
| Coinbase prediction revenue | Q2 2026 +106% QoQ, >$100M annualised (JustGamers, single source; verify against the Q2 earnings presentation, Exhibit 99.1 of accession 0001679788-26-000087, which I could not read) | 2026-07-30 | M/L |
| Underlying Kalshi example (what Coinbase shows) | Market `KXNFLGAME-26OCT19WASSF-SF`: `volume_fp` 534,711 contracts, `volume_24h_fp` 333,102, `open_interest_fp` 488,131, best yes 0.78/0.79. Units are contracts, not dollars. | 2026-10-19 | H |
| Kalshi cumulative notional | $34.5B as of 2026-01-27 (Yahoo citing Dune). Stale (>8 months). | 2026-01-27 | L |

**Shared liquidity: yes, with Kalshi.** Evidence:
- "At launch, all contracts and liquidity came from Kalshi's CFTC-designated exchange. Contract prices and settlement rules match Kalshi's" (nextpredict, M). crypto.news: "Kalshi provides all contracts and liquidity. Coinbase says it plans to add other providers over time" (M).
- Kalshi's public API docs include an **FCM member surface** (Create/List FCM Subtraders, Get FCM Orders/Fills/Positions, per-subtrader daily premium caps and blocked categories) and a fee-rounding rule for "non-direct members" aligned to $0.01 (H, docs.kalshi.com). Kalshi's docs do not name Coinbase (searched `llms.txt`), so "Coinbase routes through this FCM path" is my inference (M), but it is the mechanism that fits an FCM sub-account model.
- Coinbase's single-YES-book statement (H) matches Kalshi's book structure.

Consequence for the scanner: **Coinbase must not be counted as a second leg against Kalshi.** Treat it as `venue_alias_of = kalshi` for price discovery, with a per-market execution-cost overlay (markup + slippage tolerance + blocked high-price contracts).

---

## 5. Read API

**Official surface that exists (H, `docs.cdp.coinbase.com`, fetched 2026-10-19):**

| Item | Value |
|---|---|
| Docs | https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/rest-api ; spec https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/advanced-trade-spec.yaml ; WS spec `.../advanced-trade-asyncapi.json` |
| REST base | `https://api.coinbase.com/api/v3/brokerage` (public and private share it) |
| WebSocket | `wss://advanced-trade-ws.coinbase.com` (market data, most channels unauthenticated), `wss://advanced-trade-ws-user.coinbase.com` (user orders/positions, JWT per subscribe message) |
| Prediction-related reads | `GET /portfolios/{portfolio_uuid}` -> `PortfolioBreakdown.prediction_markets_positions[]` (`side`, `average_entry_price`, `current_price`, `unrealized_pnl`, `notional_value`, `cost_basis`, `contracts_owned`, `last_traded_at`, `cbrn`, `quote_cbrn`); `POST /orders/preview` -> `prediction_order_metadata` (`contract_subtotal`, `user_net_total` "accounting for ... fees", `slippage_percentage`, min/max contracts and totals); `GET /orders/historical/{order_id}` -> `prediction_side`. All authenticated. |
| Beta flag | User WS `Positions`: "This object is beta and empty by default; enable it through CDP Discord"; `prediction_market_positions`: "Beta; currently returned as an empty array." |
| Auth | CDP API key, **ES256** (ECDSA P-256) JWT, 2-minute expiry, `uri` claim = `METHOD host/path`. Ed25519 keys are NOT supported for Coinbase App APIs. Alternatively OAuth2 scope `wallet:buys:create` for order creation. |
| Rate limits | WS: connections and unauthenticated messages "8 per second per IP" (H). REST per-endpoint limits: NOT FOUND in the pages I could reach (searched the Advanced Trade REST overview, WS pages, llms.txt). |

**What does not exist (H):**
- Products API `product_type` enum is `SPOT, FUTURE, EQUITY, OPTION_GROUP, FUTURE_GROUP`; no prediction value. The order-response `ProductType` enum is the same. Public market endpoints are described as "Public market data for spot crypto and US futures." A live probe `GET /market/products?product_type=PREDICTION` returned HTTP 400 `"PREDICTION" is not a valid value`.
- No guide page, changelog entry or llms.txt hit for prediction markets (grep of the whole index and the Coinbase App and Derivatives changelogs). Equities have prose docs; prediction markets do not.
- Coinbase for Agents (remote MCP `https://agents.coinbase.com/mcp`, skill doc) covers crypto, US equities, US derivatives and x402 payments only.
- No Coinbase-org GitHub repo for prediction markets (`gh api orgs/coinbase/repos` filtered on predict/kalshi/event/binary: none).

**Where an aggregator should actually read prices: Kalshi's public API** (same prices, no Coinbase markup). Key facts, confirmed 2026-10-19 (H, see also `docs/research/08-venues-polymarket-kalshi.md` section 4):
- REST base `https://external-api.kalshi.com/trade-api/v2` (also `api.elections.kalshi.com`). Public GETs: `/exchange/status`, `/markets?status=open&series_ticker=`, `/markets/{ticker}`, `/markets/{ticker}/orderbook`, `/events/{event_ticker}`, `/series/{series_ticker}`, `/markets/trades`.
- Orderbook shape: `{"orderbook_fp": {"yes_dollars": [["0.7800","1234.00"], ...], "no_dollars": [...]}}`, bids only, price/size as strings, ascending with best bid last (08 doc; confirmed shape in fixture).
- WebSocket `wss://external-api-ws.kalshi.com/trade-api/ws/v2` needs API-key auth even for public channels (08 doc).
- Limits: token bucket, default 10 tokens per request, tier budgets, 429 with no Retry-After (docs.kalshi.com/getting_started/rate_limits).
- Exchange is sharded: `exchange_index` 0 Default, 1 Combos, 2 Crypto & Commodities, 3 Tennis/Baseball/Basketball (fixture `kalshi_exchange_status`). The probed NFL market is shard 0.

---

## 6. Trade path and PayBox reachability

- **Programmatic trading (M, plausible but unverified):** Advanced Trade `POST /api/v3/brokerage/orders` with `prediction_metadata.prediction_side` = YES/NO, `side`, `order_configuration`, and a `product_id` whose format is NOT FOUND; `POST /orders/preview` for a dry run; cancel via `/orders/batch_cancel`. Auth is the CDP ES256 JWT or OAuth2 (H for the schema and security block). I could not confirm that prediction products are tradable by API key today: the user-WS prediction positions are explicitly beta/gated. No account or key was created.
- **Not on-chain.** There is no contract, no EIP-712 order, no transaction proposal. The "signature" is a CEX-style API-key JWT that proves control of a Coinbase account, not of a wallet.
- **PayBox: no.** A PayBox EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon, ...) cannot place or sign a Coinbase prediction order. PayBox's plugin catalog has no Kalshi or Coinbase prediction plugin (read-only `discover_plugins "kalshi coinbase prediction"` returned an empty list). `discover_services "kalshi prediction markets"` returned third-party x402 data resellers of Kalshi market lists (x402tap, saylorinnovations, shizu, agent402) - these re-sell Kalshi data, are untrusted, and were not called.
- **Funding only (M):** the user could transfer USDC from a PayBox wallet to their own Coinbase deposit address (generic Coinbase deposit; not documented for this product). That funds the account; trading still happens inside Coinbase's app or its API.
- Coinbase-side restrictions (KYC, FCM application, US-only) mean an agent cannot trade on behalf of an unverified user.

---

## 7. Fees

- **Coinbase publishes no prediction fee schedule** (nextpredict, JustGamers: M). The exact fee appears only on the order preview. In the Advanced Trade API, `PredictionOrderMetadata.user_net_total` is "the net amount user pays ... accounting for ... fees" (H), so the fee is machine-readable per order via preview, but only with credentials.
- **Underlying Kalshi fee (H for type, M for coefficients):** series `KXNFLGAME` has `fee_type = quadratic_with_maker_fees`, `fee_multiplier = 1` (live fixture). Taker formula per third-party guides: `ceil(0.07 x C x P x (1-P))`, peak about $0.0175 per contract at 50c (JustGamers, M; Kalshi's own fee PDF was unreachable, HTTP 429). The 08 doc flags the same coefficient as M and the maker-fee detail as unresolved.
- **Coinbase markup (M):** reviewers report a markup over Kalshi's base fee; one 10-contract example: $0.20 on Coinbase vs $0.16 on Kalshi (nextpredict). Typical $0.01-$0.02 per contract (M). Treat Coinbase as 15-30% above Kalshi's fee at mid prices until measured via preview.
- **Other costs (H, schema):** slippage tolerance by price tier on market-style orders; minimum contract price; high-price contracts blocked. USD/USDC conversion fees: NOT FOUND.
- **Who pays:** the trader, in the order preview total. Settlement fee: zero for simple yes/no on Kalshi (H, docs.kalshi.com market_settlement).

---

## 8. Resolution and dispute risk

- Coinbase does not resolve anything for Kalshi-sourced contracts: settlement rules and outcomes are Kalshi's (M, nextpredict "settlement rules match Kalshi's"). Kalshi lifecycle: closed -> determined (settlement timer, seen `settlement_timer_seconds` 60 on the probed market) -> possible dispute/amend -> finalized, with early-determination paths (see 08 doc section 4; Rulebook dispute procedure NOT FOUND there either). Example rule text (H, fixture): "If San Francisco wins the WAS Commanders vs SF 49ers Pro Football game originally scheduled for Oct 19, 2026, then the market resolves to Yes."
- Extra layer of risk specific to Coinbase: you are exposed to Coinbase Financial Markets as FCM counterparty/custodian, plus state-law risk (Nevada injunction, NY suit) that could force delisting of sports/election categories in a state (10-K risk factor, M).
- Resolution rules for Coinbase's own crypto binaries: NOT FOUND (settlement source and venue unknown).

---

## 9. Geo, ToS and automation

- **Eligibility (M, nextpredict):** US residents 18+, verified Coinbase account, plus a Coinbase Financial Markets application reviewing age, experience, occupation, income and net worth. Nevada excluded (injunction March 2026; sports, election, entertainment contracts blocked). nextpredict's own FAQ says "49 states" while launch coverage said 50 (internal conflict, M).
- **Automation rule for Coinbase prediction trading:** NOT FOUND (legal pages 403). The API side requires an API key tied to the user's own account; scope is the user's own trading.
- **Aggregation rule that matters (from the Kalshi side, H per the 08 doc):** Kalshi Developer Agreement v1.1 s3.1 prohibits "Collecting, caching, aggregating, or storing data or content accessed via the API except for purposes of facilitating your own trading", and s3.2 prohibits facilitating trading by other members; the PDF is dated 2023 (possibly superseded, L). Because Coinbase prices are Kalshi prices, the same flag applies to any hosted multi-user aggregator that stores Kalshi data.
- Coinbase cannot be used by non-US users, so this venue is outside the reach of the non-US Polymarket-global arbitrage population (see 08 doc section 8 matrix).

---

## 10. Event-category overlap (arbitrage relevance)

Everything on the Coinbase menu is a Kalshi contract, so overlap is Kalshi's overlap: sports (NFL game winners etc.), US politics (control of chambers, elections), economics and Fed decisions, crypto price thresholds, culture/mentions. Overlap venues: Polymarket (global and US), Limitless, Myriad, Manifold, PredictIt and others. **None of these edges are Coinbase-specific**: Coinbase adds no independent price; it only adds a worse execution price for US retail. Coinbase's own crypto binaries would overlap Limitless/Predict.fun/Hyperliquid-style short-dated crypto markets if they are a separate book (unverified).

---

## 11. Adapter priority

**skip** (as an independent venue). Reasons: duplicate Kalshi liquidity (M, strong), no public read API (H), PayBox cannot trade it (H), US-KYC-only (M), fee schedule and product IDs undocumented. Revisit triggers listed in section 0 item 5. Do add `coinbase` to the venue registry as an **alias of `kalshi`** with an `execution_overlay` (markup, slippage tier, blocked high-price contracts) so the UI can say "also available on Coinbase" without double-counting depth.

---

## 12. Not found / open questions

- Coinbase's own help/legal text (403): fee schedule, eligibility, ToS automation clause, trading hours, position limits, dispute handling.
- How to enumerate prediction products or what `product_id` looks like in the Advanced Trade API; whether API keys can place prediction orders outside the beta.
- Where Coinbase's "crypto binaries" trade and who settles them.
- Whether Coinbase's order flow reaches Kalshi through an FCM subtrader (Kalshi's docs never name Coinbase) or through another arrangement (The Clearing Company acquisition: JustGamers says "agreed" Dec 2025, Yahoo says "acquired"; unverified).
- Coinbase-specific volume and OI (not disclosed); Q2 2026 earnings presentation not read.
- REST rate limits for Advanced Trade private endpoints (pages reached did not state them).
- Whether Coinbase mirrors Kalshi's full depth or applies its own cap/spread (needs an authenticated preview).

---

## 13. Fixtures (real responses, 2026-10-19, <= 50 KB each)

Directory: `docs/research/fixtures/coinbase-prediction-markets/`
- `coinbase_cdp_docs_prediction_evidence_2026-10-19.json` (derived excerpt of Coinbase's official OpenAPI/AsyncAPI prediction fields plus the negative evidence; not a raw API response because Coinbase has no unauthenticated prediction endpoint)
- `kalshi_exchange_status_2026-10-19.json` (`GET /exchange/status`, four shards)
- `kalshi_market_KXNFLGAME-26OCT19WASSF-SF_2026-10-19.json` (`GET /markets/{ticker}`: the contract Coinbase would show)
- `kalshi_orderbook_KXNFLGAME-26OCT19WASSF-SF_2026-10-19.json` (`GET /markets/{ticker}/orderbook`, `orderbook_fp` shape)
- `kalshi_series_KXNFLGAME_2026-10-19.json` (`GET /series/{ticker}`: `fee_type`, `fee_multiplier`, contract terms URL)

The Kalshi files are included only to show the underlying feed an adapter would read; the Kalshi workflow owns the authoritative Kalshi spec.

---

## 14. Suspicious / agent-directed content seen

- `docs.cdp.coinbase.com/coinbase-for-agents/skill.md` is written as instructions to AI agents (how to connect the Coinbase MCP, create portfolios, harness-specific setup, "do not improvise another connection path"). It is the vendor's own legitimate agent skill, not an attack; nothing in it was followed (no connector installed, no OAuth).
- Mintlify-hosted docs prepend a banner "Fetch the complete documentation index at ... llms.txt ... before exploring further" to every page. Benign; I used the index only as a file listing.
- PayBox `discover_services` descriptions (third-party sellers) include marketing such as "Use for ... cross-market arbitrage scans". Untrusted; not followed or called.

---

## Sources

H (primary, first-hand):
- https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/advanced-trade-spec.yaml (prediction schemas, product_type enums, Create Order description)
- https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/advanced-trade-asyncapi.json (beta prediction positions)
- https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/rest-api ; .../websocket/websocket-overview ; .../websocket/websocket-rate-limits
- https://docs.cdp.coinbase.com/coinbase-app/authentication-authorization/api-key-authentication (ES256 JWT, Ed25519 unsupported)
- https://docs.cdp.coinbase.com/coinbase-app/introduction/changelog (latest 2026-OCT-01) ; https://docs.cdp.coinbase.com/derivatives/changes/changelog ; https://docs.cdp.coinbase.com/llms.txt ; https://docs.cdp.coinbase.com/coinbase-for-agents/skill.md ; https://docs.cdp.coinbase.com/api-reference/derivatives-api/rest-api/cde-spec.json
- https://api.coinbase.com/api/v3/brokerage/market/products?product_type=PREDICTION (HTTP 400 probe) ; https://api.coinbase.com/api/v3/brokerage/time
- https://docs.kalshi.com/llms.txt ; /getting_started/api_environments ; /rate_limits ; /fee_rounding ; /market_settlement ; /exchange_sharding ; /api-reference/market/get-series (all fetched 2026-10-19)
- https://external-api.kalshi.com/trade-api/v2/exchange/status ; /markets/KXNFLGAME-26OCT19WASSF-SF ; /markets/.../orderbook ; /series/KXNFLGAME ; /events/KXNFLGAME-26OCT19WASSF
- https://data.sec.gov/submissions/CIK0001679788.json (filing list and accession numbers)

M (primary but page-summarised, or secondary):
- Coinbase 10-K FY2025, https://www.sec.gov/Archives/edgar/data/1679788/000167978826000015/coin-20251231.htm (read via WebFetch in four 100k-character chunks; Business, risk factors, Item 7 Trading Volume definition)
- Coinbase 10-Q Q2 2026, https://www.sec.gov/Archives/edgar/data/1679788/000167978826000088/coin-20260630.htm (truncated at ~77k characters)
- https://nextpredict.io/platforms/coinbase/ (broker entity, Kalshi liquidity, markup example, Nevada, eligibility; mentions Sept 2026 so reasonably fresh)
- https://www.justgamers.net/prediction-markets/coinbases/ (fee formula, crypto binaries, Q2 2026 numbers, NY suit; single source)
- https://decrypt.co/356236/coinbase-rolls-out-kalshi-powered-prediction-markets-across-united-states ; https://crypto.news/coinbase-kalshi-prediction-market-all-u-s-states-2026/ ; https://genfinity.io/2026/02/02/coinbase-prediction-markets-launch-kalshi/ ; https://finance.yahoo.com/news/coinbase-prediction-markets-live-nationwide-214726745.html ; https://www.sportsbookreview.com/news/coinbase-launches-kalshi-prediction-markets-across-all-states-jan-30-2026/ (launch facts; >8 months old, treat product details as possibly stale)
- Internal: `docs/research/08-venues-polymarket-kalshi.md` (Kalshi API, fee, developer-agreement facts), `docs/research/14-platform-of-platforms.md` line 194 (earlier lead: "Coinbase Predict -> Kalshi via an FCM", L)

Blocked / not readable: https://help.coinbase.com/coinbase/prediction-markets/buy-sell, https://www.coinbase.com/predictions, /blog, /derivatives, /legal/derivatives (HTTP 403, not bypassed); https://kalshi.com/docs/kalshi-fee-schedule.pdf (HTTP 429); https://www.sec.gov/Archives/* via curl ("blocked: requires a contact address"); https://tribuna.com/... (403); https://www.theclearingcompany.com (DNS failure).
