# RedotPay (Polymarket builder) - adapter spec

Researched 2026-10-19 (about 04:00-04:45 UTC). READ-ONLY: page reads (WebFetch), public `gh api` reads, unauthenticated GETs to `data-api.polymarket.com`, `clob.polymarket.com`, `gamma-api.polymarket.com`, `docs.polymarket.com`, `api.llama.fi`, `itunes.apple.com` (User-Agent `insurance-markets-research/0.1`, about 70 requests, no 429s). No account, wallet, key, signature, POST/PUT/DELETE, PayBox call or browser automation. `redotpay.com` itself returns 403 to curl (bot protection); I did not work around it and read it only through WebFetch. Third-party text was treated as untrusted data (section 14).

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary, summarised by the fetch tool, or my inference from first-hand data; **L** = weak or stale (older than 6 months).

Limitation: the shared WebSearch budget was exhausted before my first search, so there is **no third-party news coverage** of the integration in this note. Everything below comes from RedotPay's own pages, Polymarket's docs/APIs and DefiLlama.

Fixtures (6 files, each < 14 KB): `docs/research/fixtures/redotpay-polymarket-builder/` (section 12).

---

## 0. Verdict

**adapter_priority: skip** as a venue or an arbitrage leg. Keep a registry record only (section 13).

1. **Live, and confirmed by RedotPay itself**: its legal terms contain a "Prediction Market Access Services" document (last updated 2026-06-18) that names Polymarket as the market operator (H, section 1). The homepage, news feed, help-center categories, help-center search and App Store text say nothing about it (H negatives), so the feature is low-profile.
2. **Not a venue, a custodial front end.** RedotPay holds the assets and the private keys and routes orders into Polymarket's own central limit order book on Polygon (H, Terms cl. 3.1, 7.2, Part A). Same book, same tokens, same resolution. **100% shared liquidity with Polymarket International**, so never an independent arbitrage leg.
3. **No trading or data API.** RedotPay's only developer API (RedotPay Connect) is a merchant payments API. Nothing for prediction trading (H/M, section 4).
4. **Costs more than Polymarket direct.** Polymarket's own attribution feed reports a builder fee of exactly 4.00% of notional on every one of 5,400 sampled RedotPay-routed fills, on top of Polymarket's platform fee (H, section 6). That is four times the 1% taker cap in Polymarket's docs; the discrepancy is unresolved.
5. **Small.** Polymarket's leaderboard shows $27.2M all-time "volume" and 13.1K active users, but that unit is **shares, not dollars** (H, Polymarket Data API v2 OpenAPI; confirmed against fills). Estimated dollar notional is about $1.6M for 2026-10-01..10-19 (M), roughly 0.1% of Polymarket International's volume.
6. Restricted in the US, Hong Kong, Costa Rica and about 80 other jurisdictions (section 8).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://redotpay.com/en/terms/prediction (fetched 2026-10-19) | Title "PREDICTION MARKET ACCESS SERVICES TERMS & CONDITIONS", "Last Updated: 18 June 2026"; describes access to Polymarket markets | H (via fetch tool, quotes asked verbatim) |
| https://redotpay.com/terms index | "Last Updated: 15 October 2026"; lists the prediction document as item 18, link `/en/terms/prediction` | H (via fetch tool) |
| Polymarket `/v2/builders/volume?interval=day` | RedotPay rows every day 2026-09-20..2026-10-19; Oct 18: 588,190 (shares), 832 active users; Oct 19 partial 79,862 | H |
| Polymarket `/builder/trades` | newest fill 2026-10-19 04:13:54 UTC | H |
| First volume | Jun 2026: 67,215 (58 users), consistent with the 18 June terms date | H |
| Polymarket builder profile | name "RedotPay", `verified: true`, own logo | H |
| redotpay.com homepage, `/news` (12 items, 2026-08-19..2026-10-13), help-center categories, help-center search "prediction", `/predict`, `/prediction-markets`, App Store listing v3.14.3 (2026-09-28) | **no mention** of prediction markets or Polymarket | H (negatives; homepage/news/help via fetch tool) |
| DefiLlama | lists "RedotPay Card" (Crypto Card Issuer) only; no prediction entry | H |

Company context (M, one CoinDesk article read 2026-10-19, https://www.coindesk.com/business/2026/08/14/redotpay-said-to-put-usd1-billion-u-s-ipo-plan-on-hold-bloomberg): Bloomberg reported on 2026-08-14 that RedotPay put a $1B US IPO on hold; Binance is suing it in Hong Kong for $470M; RedotPay says it had 8.5M users in July. Counterparty-risk context for a custodial layer, not a venue signal.

**still_live = true.**

---

## 2. Kind and market model

- **Kind (H):** broker / front end, custodial. Terms cl. 3.1: the Provider supplies the "frontend interface", "eligibility and compliance screening", "customer support", "the holding or custody of Digital Assets", "the control of private keys", and "the movement or conversion of funds"; cl. 3.2: it "does not accept wagers" and does not operate markets, set prices or odds. Provider entity is 3-102-965325 S.R.L., Costa Rica (M, summary of cl. 14), not RedotPay's Hong Kong card business.
- **Market model:** Polymarket's. Binary and neg-risk categorical outcome tokens on Polymarket's CLOB, settled on Polygon (Part A: "matching effected through Polymarket's central limit order book and settlement effected on the Polygon blockchain") (H). No RedotPay-specific markets exist. Details belong to the Polymarket spec (`docs/research/08-venues-polymarket-kalshi.md`).
- **Curated subset?** Unknown. NOT FOUND (searched: terms, help center, homepage). The attributed fills below span 840 distinct markets in 20 hours, so the subset is broad (H).
- **Tokenisation:** Polymarket conditional tokens; each fill carries `assetId` (token id), `market` (condition id), `outcome`, `outcomeIndex` (H, fixture).
- **A separate RedotPay product, "RedotPay Trade (Beta Testing)", is perpetual trading** (help-center collection "High-Performance Perpetual Trading", 8 article titles read; no prediction articles) (M). Do not confuse the two.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Settlement chain | Polygon (Terms cl. 6.3, 6.4, 7.2, 7.3) | H |
| User-facing asset | "exclusively in USDC or such other stablecoins as may be supported"; "No fiat currency is handled by the Provider" (cl. 7.1) | H |
| On-chain collateral | Polymarket's (pUSD in current docs); RedotPay may convert funds "or outsource" the conversion (cl. 7.2) | H/M |
| Custody | Provider holds assets and controls keys; may outsource to affiliates (cl. 3.1(g)(h), 4.2) | H/M |
| Finality | settlement "final and irreversible"; Provider cannot reverse | M (summary) |
| How a RedotPay balance is funded or withdrawn (chains, minimums, fees) | NOT FOUND (searched: terms, help-center categories and search) | - |
| Wallet addresses | The 5,400 sampled fills used 562 distinct maker addresses in 20 hours (about 1 per active user), i.e. RedotPay-controlled per-user wallets on Polygon, not one omnibus address (M, inference) | M |

---

## 4. Read API

**Official public read API for RedotPay's prediction product: none.** NOT FOUND (searched: homepage nav and footer, `docs.redotpay.com`, GitHub org `redotpay`, help center).

- `https://docs.redotpay.com` documents **RedotPay Connect**, a merchant payments REST API (`appKey`, `X-R-AK` header, request signatures, sandbox and production) (M, fetch summary). No prediction endpoints.
- GitHub org `redotpay` (created 2026-03-12) has one repo, `redotpay-payment-skill` (pushed 2026-07-31): an installer that lets an AI agent pay HTTP 402 / MPP invoices from a RedotPay balance (H, README read via `gh api`). Not a trading tool; I did not run or install it.

**What does exist is Polymarket's attribution data about RedotPay's builder code**
`0x26185f3fedc906019d9f028e253fbea67fe212fb5b02a0cedc57c12ddc9c7805` (H, same value in every endpoint):

| Endpoint (all unauthenticated GET, H) | Shape |
|---|---|
| `https://data-api.polymarket.com/v2/builders/leaderboard?time_period=day\|week\|month\|all&limit=50` | `{data:[{rank, builder_name, builder_code, profile_image, verified, volume, active_users}], pagination:{limit, offset, has_more, next_cursor}}` |
| `https://data-api.polymarket.com/v2/builders/volume?interval=day\|week\|month\|all&limit=N` | `{data:[{date, rank, builder_name, builder_code, profile_image, verified, volume, active_users}]}`; newest bucket first; `limit` = number of buckets, default 30, cap 90 |
| `https://clob.polymarket.com/builder/trades?builder_code=0x...&next_cursor=` | `{data:[...300 fills...], next_cursor, limit:300, count}`; optional `id`, `market`, `asset_id`, `before`, `after` |
| v1 equivalents `https://data-api.polymarket.com/v1/builders/leaderboard` and `/v1/builders/volume` (`timePeriod`, `limit`, `offset`) | **Data API v1 is retired on 2026-10-24** (H, https://docs.polymarket.com/migrate/data-api-v1-to-v2). Build on v2 only. |

Notes for an adapter:
- Docs: v2 OpenAPI at `https://data-api.polymarket.com/v2/openapi.json` (H). Auth none; `429` + `Retry-After` is the busy signal; cursors are opaque; params accept snake_case and camelCase (H). Rate limits are not quantified; my roughly 25 sequential GETs spaced 1 s apart were never throttled.
- **Unit trap (H):** v2 docs say "`volume` is in SHARES, not USDC". Evidence it is taker-side shares: the 2026-10-19 day bucket (79,862 at about 04:14 UTC) matches the sum of `size` over `/builder/trades` fills for the same UTC day (81,356), whereas the summed `sizeUsdc` was only 18,543. Over the 20-hour sample USDC per share was 0.22 (fixture aggregates).
- `/builder/trades` is not marked as authenticated in the CLOB OpenAPI (no `security` entry; the spec's security schemes are only declared in components) and answered without credentials (H/M). It returns only `tradeType: TAKER` rows, includes the user's maker wallet, and has undocumented fields `builderFee` and `builderCode`; the documented `builder` field is an empty string in live rows (H). Expect this endpoint to change.
- WebSocket: none for RedotPay. Polymarket's own sockets apply (Polymarket spec).
- Windows look like calendar-to-date, not trailing: the `month` leaderboard value (7,189,981) equals the October bucket of the monthly series (7,189,855) to within refresh lag, and `week` (642K, 858 users) is far below the trailing-7-day sum of the daily series (3.30M) (M, inference).

---

## 5. Trade path

- **None via RedotPay.** There is no order API, no wallet export and no signing interface; trading happens inside the RedotPay app, where RedotPay "control[s] private keys" (H, Terms). Terms cl. 10(d) bars combining the app "into another programme or application" and 10(e) reverse engineering (M, summary of the general terms).
- **Reachable through PayBox? No** for RedotPay itself (no API; custodial). The same market exposure is reachable **only through Polymarket's own CLOB** on Polygon (EIP-712 signed orders, pUSD approvals), which is the Polymarket spec's job (`docs/research/08-venues-polymarket-kalshi.md`, `docs/research/06-paybox-platform.md`). I called no PayBox tool.
- **Do not reuse RedotPay's builder code on your own orders.** The code is a field in the signed order (Polymarket docs: `builder` bytes32), it would misattribute volume and trigger the builder fee below, and Polymarket "may disable a builder code at any time" (H, https://docs.polymarket.com/programs/builders/fees.md).

---

## 6. Fees

| Component | Formula / value | Payer -> receiver | Tag |
|---|---|---|---|
| Polymarket platform fee | `C x feeRate x p x (1-p)`, taker-only (docs). Implied `feeRate` in RedotPay fills: 0.07 on short-horizon crypto up/down (2,682 of 2,729 fills), 0.05 on most other markets (1,374 of 1,601), 0.03 on some | user -> Polymarket | H docs; M (my fit of `feeUsdc - builderFee`) |
| **Builder fee, observed** | `builderFee / sizeUsdc` = **0.0400 on all 5,400 fills** (sum $3,124 on $78,109 notional); BUY and SELL alike | user -> RedotPay (builder wallet) | H (API values); M (that it is actually charged) |
| Builder fee, documented cap | taker <= 100 bps, maker <= 50 bps, "additive" to platform fees | | H (https://docs.polymarket.com/programs/builders/fees.md) |
| RedotPay's own fees | "Fees may apply in connection with deposit, withdrawal, and conversion-related access"; no amounts given (cl. 8.1) | user -> RedotPay | H; amounts NOT FOUND |
| Gas | not user-visible in the app; Polymarket relayer is gasless for builders | | M |

**Discrepancy to resolve (not guessed):** observed 4.00% vs documented 1% taker cap. Cross-checks, all on the same endpoint on 2026-10-19: MetaMask's code also shows exactly 4.00% (its support page advertises "a 4% transaction fee"), while betmoar and Gate show 0.00%. So the field varies by builder and is not a constant bug (M). Either the cap in the docs is outdated or `builderFee` is not what is collected. This also contradicts the sibling MetaMask note's inference that an on-order builder fee cannot exceed 1%.

**Arbitrage consequence:** a RedotPay-routed leg costs about 4% of notional per fill (each side) plus the Polymarket platform fee, on an identical book. Polymarket direct strictly dominates it.

---

## 7. Resolution and dispute risk

- Polymarket resolves and settles (Terms cl. 6.4, 11.4(a): the Provider disclaims liability for Polymarket's "acts, resolutions, and settlements") (H/M). Polymarket's oracle process (UMA) is covered in the Polymarket spec; RedotPay can neither change nor appeal an outcome. Resolution and ambiguity risk is therefore perfectly correlated with the Polymarket leg.
- **Additional layers of risk specific to RedotPay (H/M, Terms):** the Provider may "suspend, restrict, or discontinue" the service at any time (cl. 3.3); it is "not licensed or supervised in Costa Rica for this service" and there is no compensation scheme (cl. 11.9, summary); stablecoins uninsured (cl. 11.7); "as is" service with a heavy liability limit and user indemnity (cl. 11.10, 11.12); disputes with RedotPay under Costa Rican law and courts (cl. 13.1), disputes with Polymarket under its terms (New York arbitration, cl. 13.2). Withdrawal and custody risk is on the Provider, not on-chain.

---

## 8. Geo, ToS, automation

- **Restricted jurisdictions (H, cl. 5.3 verbatim):** Costa Rica, the United States and territories, Hong Kong SAR, any comprehensively sanctioned jurisdiction, the Annex 2 schedule, and every jurisdiction restricted under the Polymarket Terms.
- **Annex 2 list (M, from the fetch tool's summary; not re-quoted):** Argentina, Australia, Austria, Bahrain, Belarus, Belgium, Brazil, BVI, Bulgaria, Burundi, Canada, CAR, DR Congo, Croatia, Cuba, Czech Republic, Denmark, Estonia, Ethiopia, Finland, France, Georgia, Germany, Greece, Hungary, India, Iran, Iraq, Ireland, Italy, Japan, Jordan, Korea, Kuwait, Latvia, Lebanon, Libya, Lithuania, Luxembourg, Macau, Malta, Myanmar, Nepal, Netherlands, New Zealand, Nicaragua, Nigeria, North Korea, Oman, Pakistan, Panama, China (PRC), Philippines, Poland, Portugal, Qatar, Cyprus, Russia, Singapore, Slovakia, Slovenia, Somalia, South Africa, South Sudan, Spain, Sudan, Sweden, Syria, Taiwan, Thailand, Ukraine, UAE, UK, Venezuela, Yemen, Zimbabwe. Enforcement: IP geo-blocking, residency checks, self-declaration; VPN or false location is prohibited (cl. 5.4, 5.5, M).
- **Automation:** the prediction terms contain no bot, API or arbitrage clause (H: the words "automated" and "builder" do not appear; "API" appears only as "application programming interfaces" in cl. 11.10). The general terms are silent on bots by name; cl. 5.2 grants a licence "for your own purposes" and 10(d)/(e) bar embedding or reverse engineering (M). Moot, because no programmatic interface exists.
- The Polymarket Terms apply on top (clickwrap, cl. 6.1-6.2); not read here (Polymarket workflow).

---

## 9. Liquidity

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| Builder-attributed "volume", all-time | 27,238,028 **shares**; 13,126 active users; rank 37 of the all-time board | `/v2/builders/leaderboard?time_period=all`, 2026-10-19 (v1 gave 27,212,181 / 13,124) | H |
| Monthly (shares; active users; rank) | Jun 67K (58; 134); Jul 4.51M (2,132; 35); Aug 6.84M (4,901; 19); Sep 8.63M (5,057; 17); **Oct 1-19 7.19M (4,502; 15)** | `/v2/builders/volume?interval=month`, 2026-10-19 | H |
| Daily, last 7 full days (shares) | Oct 12-18: 271K, 355K, 450K, 463K, 629K, 549K, 588K (sum 3.30M, avg 472K/day); trend up inside October | `/v2/builders/volume?interval=day` | H |
| **USD notional, 20-hour sample** | $78,109 taker notional on 5,400 fills, 354,554 shares (0.22 USDC per share), window 2026-10-18 16:33 to 2026-10-19 04:14 UTC; median fill $2.00, p90 $25, p99 $214, max $1,509; 562 wallets | `/builder/trades` paged 18 times; fixture aggregates | H (sample); M (extrapolation) |
| USD estimate, Oct 1-19 and all-time | about $1.6M and about $6M (shares x 0.22) | derived; the ratio varies with price mix and was measured on one weekend window | M |
| Scale vs Polymarket | Polymarket International 30d $2.25B (2026-10-19). RedotPay about $2.5M per 30 days at the October pace, about 0.1% | `api.llama.fi/summary/dexs/polymarket-international` | H / M |
| TVL / OI | not applicable; the book is Polymarket's | | H |
| Order-book depth | the Polymarket book | | H |

---

## 10. Event coverage and overlap

20-hour sample, by notional (my keyword classification of Gamma question text; Sunday evening into Monday, so sports-weighted and not representative of every day) (M):

| Category | Share of notional | Fills |
|---|---|---|
| Sports (soccer match, half-time, exact score and scorer props, tennis) | about 53% | 1,983 |
| Crypto short-horizon "Up or Down" (5-minute and 15-minute BTC/ETH) | about 46% | 3,356 |
| Everything else (crypto ladders, weather, macro, politics, other) | under 1% | 61 |

Overlap: all of it exists on Polymarket itself, and the crypto up/down and sports markets overlap Limitless, Predict.fun, Kalshi, Opinion and others, exactly as in the Polymarket spec. **Nothing exists only on RedotPay.** User flow is very small-ticket retail (median $2). (H data, M classification)

## 11. Shared liquidity

**Shares 100% of its liquidity with Polymarket International** (same CLOB, same token ids, same resolution; Terms Part A and cl. 7.2, fills reference Polymarket condition ids) (H). A RedotPay mid is the Polymarket mid; the executable price differs only by the fee wedge in section 6. Not an independent leg.

---

## 12. Fixtures

In `docs/research/fixtures/redotpay-polymarket-builder/` (all fetched 2026-10-19):

| File | Source | Shows |
|---|---|---|
| `polymarket_data-api_v1_builders_leaderboard_redotpay_rows_2026-10-19.json` | `GET /v1/builders/leaderboard?timePeriod=ALL\|MONTH\|WEEK\|DAY` (RedotPay row only) | v1 shape, builder code |
| `polymarket_data-api_v2_builders_leaderboard_all_head_2026-10-19.json` | `GET /v2/builders/leaderboard?time_period=all&limit=50` (2 top rows + RedotPay) | v2 envelope, snake_case |
| `polymarket_data-api_v2_builders_volume_redotpay_2026-10-19.json` | `GET /v2/builders/volume?interval=month\|day` filtered to RedotPay | monthly and 30-day daily series |
| `polymarket_clob_builder_trades_redotpay_sample_2026-10-19.json` | `GET https://clob.polymarket.com/builder/trades?builder_code=...` (7 of 300 rows; maker wallet truncated, `owner` UUID dropped, market title added from Gamma) | fill shape incl. `builderFee`, `feeUsdc` |
| `redotpay_20h_trade_sample_aggregates_2026-10-19.json` | derived from 5,400 paged fills (not raw) | USDC per share, fee ratios, category split |
| `redotpay_prediction_terms_excerpts_2026-10-19.txt` | https://redotpay.com/en/terms/prediction via WebFetch | short clause quotes |

---

## 13. Adapter recommendation

- **skip** for trading and for a market-data adapter: duplicate liquidity, no API, custodial, extra 4% wedge, restricted geographies, tiny size.
- **Registry record only** (per the pool-graph rule in `docs/platform-registry-design.md`): `kind: broker`, `routes_to: polymarket-international`, `pool: polymarket-international`, `independent_liquidity: false`, `custody: provider`, `builder_code: 0x26185f3f...c7805`, `fee_stack: {builder_fee_observed: 0.04 of notional, plus Polymarket platform fee, plus RedotPay deposit/withdraw/conversion fees unknown}`, `geo: Terms cl. 5.3 plus Annex 2`, `platform: RedotPay app only`, `state: live`, `since: 2026-06-18`.
- **Optional weak signal (M):** RedotPay-attributed fills (`/builder/trades`) are a public, per-fill feed of small retail flow, about half of it in 5-minute crypto up/down markets. It is not a fair-value input and not worth a dedicated adapter. If a generic "builder flow" signal is ever built, make it parametric on `builder_code` (RedotPay, MetaMask and others share the endpoint) and use v2 only.
- **Lesson for the generic Polymarket adapter (H):** leaderboard `volume` is in shares. Convert with fills (`sizeUsdc`) before comparing against DefiLlama dollar figures; this likely explains the 3-5x gap that the MetaMask note found between Polymarket builder volume and DefiLlama.

## 14. NOT FOUND

- Any RedotPay marketing page, help article, release note or announcement for prediction markets (searched: homepage, `/news`, help-center categories, help-center search "prediction", `/predict`, `/prediction-markets`, `/redotpay-pro`, App Store description and release notes, DefiLlama protocol list). The in-app name of the feature is unknown.
- Any RedotPay API, SDK or developer terms for prediction trading (searched: `docs.redotpay.com`, GitHub org `redotpay`).
- RedotPay's own deposit, withdrawal and conversion fee amounts for this service (Terms cl. 8.1 gives none).
- Third-party news coverage of the integration (WebSearch budget exhausted; not searched).
- A public builder-profile or builder-fee-rate endpoint on Polymarket (docs say builder profiles and fee rates are "publicly queryable"; searched the CLOB, Gamma, Relayer and Data v2 OpenAPI files for "builder": only `/auth/builder-api-key` (authenticated), `/builder/trades`, `/v2/builders/*`).
- Production confirmation of the 4% builder fee as a collected amount (only the API field).

## 15. Open questions

1. Why does `/builder/trades` report `builderFee` = 4.00% for RedotPay and MetaMask when the docs cap taker builder fees at 100 bps? Cap raised, field mis-scaled, or the fee split across several parties?
2. Is the feature available to every non-restricted RedotPay user or only a beta cohort? Where does it sit in the app?
3. Are the 562 per-user wallets Polymarket deposit wallets, proxy wallets or EOAs (signature type)? Not visible in `/builder/trades`.
4. After 2026-10-24 (v1 retirement), do the v2 builder endpoints keep the same field semantics? (v2 and v1 values already agree.)
5. Does RedotPay add its own spread or fee in the app price beyond the builder fee? Only the Polymarket-side data was inspected.

## 16. Suspicious content

- Every `docs.polymarket.com` page begins with a banner telling readers (and agents) to "Fetch the complete documentation index at https://docs.polymarket.com/llms.txt". I had already fetched `llms.txt` on my own plan before seeing the banner; it is benign, and I followed nothing else from it.
- `redotpay/redotpay-payment-skill` README tells the user or agent to run `curl ... | sh` to install a binary and register an MCP server in the agent host. Not run, not recommended for this repo.
- No instructions aimed at AI agents in any RedotPay page, Terms text, API response or Polymarket data.

## 17. Method note

The session scratchpad is shared between parallel research agents; two of my intermediate files were overwritten by another agent's same-named files (`lb_*.json`, `mkfix.py`). I detected it, moved my work into a private sub-directory and re-fetched the affected data, so no figure here depends on the clobbered files. No personal identifier appears in any request, script, fixture or this note (scripts were grepped for "@" before running).

## 18. Sources

- RedotPay Prediction Market Access Services Terms (last updated 2026-06-18): https://redotpay.com/en/terms/prediction (H, via fetch tool, quotes requested verbatim; wording as reported)
- RedotPay Terms and Conditions (last updated 2026-10-15): https://redotpay.com/terms (H index; M clause summaries)
- RedotPay homepage, news and help center: https://redotpay.com , https://redotpay.com/news , https://helpcenter.redotpay.com/en/ , https://helpcenter.redotpay.com/en/?q=prediction , https://helpcenter.redotpay.com/en/collections/19740050-trade (H negatives, via fetch tool)
- RedotPay Connect API docs: https://docs.redotpay.com (M, summary)
- RedotPay GitHub: org `redotpay`, repo `redotpay-payment-skill` README (H, `gh api`)
- Apple App Store lookup (iTunes search API, "RedotPay: Crypto Card & Pay", v3.14.3, 2026-09-28): https://itunes.apple.com/search?term=redotpay&entity=software (H)
- CoinDesk, 2026-08-14, IPO on hold: https://www.coindesk.com/business/2026/08/14/redotpay-said-to-put-usd1-billion-u-s-ipo-plan-on-hold-bloomberg (M, summary)
- Polymarket builder data: https://data-api.polymarket.com/v2/builders/leaderboard , https://data-api.polymarket.com/v2/builders/volume , https://data-api.polymarket.com/v1/builders/leaderboard , https://data-api.polymarket.com/v1/builders/volume , https://clob.polymarket.com/builder/trades (H)
- Polymarket specs and docs: https://data-api.polymarket.com/v2/openapi.json , https://docs.polymarket.com/api-spec/clob-openapi.yaml , https://docs.polymarket.com/programs/builders/overview.md , https://docs.polymarket.com/programs/builders/fees.md , https://docs.polymarket.com/programs/builders/tiers.md , https://docs.polymarket.com/migrate/data-api-v1-to-v2 , https://docs.polymarket.com/changelog/predictions.md , https://docs.polymarket.com/llms.txt , https://builders.polymarket.com (H; migrate page and builders page via fetch tool)
- Polymarket Gamma markets lookup by condition id: https://gamma-api.polymarket.com/markets (H)
- DefiLlama: https://api.llama.fi/summary/dexs/polymarket-international , https://api.llama.fi/protocols (H)
- Sibling notes in this repo: `docs/research/08-venues-polymarket-kalshi.md`, `docs/research/06-paybox-platform.md`, `docs/research/venues/metamask-polymarket-integration.md`, `docs/platform-registry-design.md` (M for anything not re-checked here)
