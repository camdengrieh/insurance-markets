# HyperDash (hyperdash.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs (site, docs, robots, llms.txt, DefiLlama API, one HEAD to the Hyperliquid stats bucket), a static text read of the public web-app JS bundle (downloaded to scratch, never executed), `gh api` file reads, web search. No account, wallet, key, signature, POST/PUT/DELETE, payment, browser automation or PayBox tool was used. All third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary, inferred, or my own computation / reading of minified code; **L** = weak or stale.

---

## 0. Bottom line

1. **HyperDash is not a venue. It is a trading terminal and analytics site for Hyperliquid whose prediction-market tab is a front-end onto Hyperliquid HIP-4 outcome markets.** Its own docs: "All underlying data for orders on the Platform is sourced directly from Hyperliquid and all trades are executed directly on Hyperliquid" (Terms 7.2). It earns a builder-code fee on those fills. It has no order book, no AMM, no market creation and no resolution logic of its own (H).
2. **Liquidity is 100% shared with Hyperliquid HIP-4** (same HyperCore books). Therefore **NOT an independent arbitrage leg.** Model it, at most, as `front_end = "hyperdash"` on the Hyperliquid HIP-4 adapter. Full venue spec: `docs/research/venues/hyperliquid-hip-4-outcome-markets.md` (same-day sibling note).
3. **Live but nearly dormant for outcomes.** Site, docs and predictions page are up (2026-10-19). DefiLlama attributes only **$3,800 all-time** HIP-4 volume to HyperDash's builder code (first non-zero day 2026-08-30; 24h = $0 and 7d = $0 as of the 2026-10-18 data point), against $47.0M 30d / $3.13M 24h for all of Hyperliquid Outcomes: about 0.007% of the 30-day total (H data, M ratio).
4. **No HyperDash API for predictions.** Its docs site ships only the Mintlify placeholder OpenAPI ("OpenAPI Plant Store"). The web app reads and writes `api.hyperliquid.xyz` directly (M, bundle). An aggregator should go to Hyperliquid, never through HyperDash.
5. **adapter_priority = skip** (duplicate liquidity, no API, trivial volume).

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `https://hyperdash.com/` returns HTTP 200 (Vercel), title "Hyperdash \| Advanced Trading Platform"; sitemap lastmod 2026-10-19 for learn/news shards | H |
| `https://hyperdash.com/predictions` and `/predictions/all` return 200; both are client-rendered shells ("Loading prediction markets... Live HIP-4 prices and market activity will appear shortly.") so live contents were not visible to a plain GET | H |
| `llms.txt` lists "Featured prediction markets: Highest-volume live HIP-4 prediction markets grouped by category" and "All prediction markets: Complete live HIP-4 prediction-market list with prices, closing times, 24-hour volume, and open interest" | H |
| Docs (`docs.hyperdash.com/about-hyperdash.md`): "Prediction markets. Outcome contracts on real-world events, listed by category at hyperdash.com/predictions." | H |
| Feature flag `predictions_enabled` defaults to `true` when the user has no explicit flag (bundle: `EM={...,[PREDICTIONS_ENABLED]:!0}`) | M (minified code) |
| DefiLlama lists "HyperDash Outcome" (id 8995, category "Interface", tag "Hyperliquid HIP4 Builder", listedAt 1791497895 = 2026-10-08, parent "HyperDash") | H |
| DefiLlama adapter config `"hyperdash-outcome": { builder: "hyperdash", market: "outcome", start: "2026-05-02" }` in `factory/hyperliquid.ts` (builder address `0xe966a12bf7b93838096e4519a684519ab22df618`, public builder code) | H |
| DefiLlama volume non-zero on 10 days between 2026-08-30 and 2026-10-11, zero on the other 40 of the 50 returned days; zero for the last 7 days | H data |
| Third-party coverage of HyperDash predictions: **NOT FOUND** (searched: WebSearch extended x2 for "HyperDash outcome markets", "hypurrdash predictions", HIP-4 launch coverage) | - |

Verdict: **still_live = true** as a front-end; outcome activity is negligible.

---

## 2. Kind and market model

- **Kind:** broker/front-end (terminal) over Hyperliquid HIP-4; builder-code monetised (H, DefiLlama tag + methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code").
- **Market model, tokenisation, categorical/scalar support, merged Yes/No book:** identical to Hyperliquid HIP-4 (on-chain CLOB on HyperCore; outcome coins `#<10*outcome+side>`, tokens `+<enc>`, asset id `100_000_000+enc`). See the sibling note sections 2-3; not re-verified here.
- **HyperDash UI category filter (M, i18n strings in bundle):** All, Crypto, Sports, Stocks, Commodities, Economics, Other. These are display buckets over the same HIP-4 universe, not HyperDash-specific markets.
- **HyperDash order types on predictions (M, bundle):** market, limit and scale orders are wired to `prediction_order_submitted`; a "convert" action exists (`prediction_convert_submitted`, likely split/merge). Irrelevant to the aggregator.

---

## 3. Chains and collateral

HyperCore (Hyperliquid L1), USDC collateral per the sibling note. HyperDash docs say users can "Fund your account from any chain, card, or fiat" (H, about page) and offer Turnkey-based non-custodial embedded wallets (H, Terms 3.3 and docs); the HIP-4 positions still live on the user's Hyperliquid account (H, Terms 7.2). No HyperDash-specific chain or contract exists for outcomes.

---

## 4. Read API

| Question | Answer | Tag |
|---|---|---|
| Official public prediction-market API from HyperDash | **None found.** Docs site `docs.hyperdash.com` has about 40 pages (orders, copy trading, widgets, fees...) and no API reference; the only OpenAPI file is Mintlify's sample (`info.title` "OpenAPI Plant Store", server `sandbox.mintlify.com`) | H |
| What HyperDash does publish for machines | `/llms.txt`, `/llms-full.txt`, `/AGENTS.md`, `/asset-index.json`, `GET /api/asset/{slug}?locale=en` (perps/spot/HIP-3 asset facts, not predictions); `robots.txt` disallows `/api/` except `/api/asset/`. No prediction endpoint is listed | H |
| Where the web app gets prediction data | Configured hosts: `api.hyperliquid.xyz` (Hyperliquid info/exchange/WS), `api.hyperdash.com` (own backend, undocumented), `api.hydromancer.xyz` (analytics vendor). Prediction code calls Hyperliquid info types `outcomeMeta`, `outcomeTemplates`, `settledOutcome` and WS `outcomeMetaUpdates`; volume and OI fields are computed client-side | M (minified bundle) |
| Correct integration point | **Hyperliquid directly:** REST `POST https://api.hyperliquid.xyz/info`, WS `wss://api.hyperliquid.xyz/ws`; keyless, 1200 weight/min/IP REST, 1000 WS subscriptions (sibling note section 4) | H (sibling) |
| Per-builder attribution data | Public daily files: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{lowercase builder address}/{YYYYMMDD}.csv.lz4` (documented on Hyperliquid's builder-codes page). HEAD for HyperDash's builder on 2026-10-10 returned 200, 90,498 bytes. The file covers all of that builder's tagged fills (perps, spot, outcomes) per DefiLlama's adapter comment (M), so it is only useful for attribution, not for pricing | H |

Live response shapes captured (fixtures, see section 14): DefiLlama `summary/dexs` and `summary/fees` for `hyperdash-outcome` (fields `total24h/7d/30d/1y/AllTime`, `totalDataChart` as `[unix_ts, usd]`, `methodology`). No HyperDash-native prediction response exists to capture. Hyperliquid's own POST-only responses are covered in the sibling note and `docs/research/fixtures/hyperliquid-hip-4-outcome-markets/`.

---

## 5. Trade path

- **Via HyperDash: none programmatic.** There is no public order API. The app trades with a browser-generated **agent (API) wallet**: "Hyperdash generates a fresh keypair in your browser, and your wallet signs an approval registering it as your trading agent. The agent key is valid for 180 days and is encrypted in your browser before it is stored." A second signature "enables trading on Hyperdash" (the builder approval). The agent "signs trading actions only"; withdrawals need the main wallet (H, docs `agent-wallets-security.md`). Keys sit in HyperDash's client/storage, which is the opposite of what a PayBox-held-key design wants.
- **Via Hyperliquid directly:** signed `POST /exchange` actions (L1 phantom-agent EIP-712 for orders; user-signed `approveAgent` / `approveBuilderFee`), builder code optional per order (`builder: {b, f}`), see sibling note section 5. An aggregator that trades HIP-4 should submit orders itself and simply **omit** HyperDash's builder code; attaching it would only add 3 bps and require the user to `approveBuilderFee` for that address (H, Hyperliquid builder-codes page: approval must be signed by the main wallet, max 10 active approvals per user).
- **Builder-approval inconsistency (M):** UI copy says "Approve a 0.05% builder fee to enable trading through Hyperdash"; docs say the charge is 1.5 bps perps / 3 bps predictions; one code path in the bundle calls `approveBuilderFee({maxFeeRate:"1%", builder:<HyperDash address>})`. The approved ceiling may therefore be higher than the fee actually charged. Not verified end to end (would need a signing flow).

---

## 6. Reachability from a PayBox wallet

- **HyperDash itself: no.** No API, and its signing model is a browser-held agent key.
- **Underlying Hyperliquid HIP-4: partial** (sibling note section 6): orders are HyperCore L1-action signatures, not EVM transaction proposals; PayBox lists Hyperliquid only as `eip155:999` (HyperEVM) and its official `hyperliquid` plugin was recorded as spot-oriented in `docs/research/06-paybox-platform.md`. Funding is USDC to HyperCore via Arbitrum (or other chains for email-wallet accounts). HyperDash adds nothing to this path.

---

## 7. Fees

| Layer | Rule | Who pays | Tag |
|---|---|---|---|
| HyperDash builder fee | "a builder fee of 1.5 basis points (0.015%) on perps and 3 basis points (0.03%) on spot and prediction markets, added to the base Hyperliquid fee schedule" (https://docs.hyperdash.com/fees-referrals-rewards.md). Referral-code users "pay 10% less"; "the lower fee is charged; discounts do not stack" with promotions. A `fee_holiday_enabled` flag exists (onboarding campaign), effect on predictions unknown | Trader, in quote token, on top of exchange fee | H (docs), M (flag) |
| Cross-check | DefiLlama: $1.15 builder fees on $3,800 volume = 3.0 bps (my computation) | - | M |
| Hyperliquid outcome fee | Charged only when closing or settling; minting free; no maker rebates (https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees, section "Outcome tokens"). Numeric base rate and `deployerFeeScale` multiplier: see sibling note section 7 (rate not in official docs; empirical all-in about 11-25 bps) | Trader | H (structure), M (rate) |
| Builder cap | Hyperliquid builder-codes page: at most 0.1% on perps and 1% on spot; builder fees apply "in the quote or collateral asset" | - | H |

Net: routing through HyperDash costs roughly **+3 bps** over trading the same book directly (less with a referral code).

---

## 8. Resolution and dispute risk

None of HyperDash's own. Resolution is Hyperliquid's (protocol-native for recurring BTC series; deployer-settled for most others, no documented trader dispute window) per the sibling note section 8. HyperDash's UI only shows states "Closed / Settling / Event based" (M, i18n) and fetches `settledOutcome`. Dispute risk for an arbitrage leg = Hyperliquid HIP-4 deployer risk. Rule text and void clauses must come from the `outcomeMeta` / template description, not from HyperDash.

---

## 9. Geo, ToS, automation

Source: https://hyperdash.com/terms, "Last updated Jun 27, 2025" (read 2026-10-19). **This pre-dates HIP-4 mainnet (2026-05-02): the Terms contain no occurrence of "prediction" and one unrelated use of "outcome"; no outcome-market clause exists (H, text search).** Treat the Terms as stale for predictions.

- **Eligibility:** an "Eligible Person" must not be physically in or resident of a "Prohibited Jurisdiction". The list includes the Province of Ontario, China, **the United States of America**, and dozens of other countries, plus sanctioned regions. Section 7.1 also says "U.S. Persons may access and use the Services solely for spot trading of Virtual Assets and are prohibited from engaging in perpetual futures trading", which conflicts with listing the US as prohibited. Whether HIP-4 outcome tokens (spot-like on HyperCore) count as "spot" is unresolved (H text; M conflict).
- **Automation:** users may not "use any deep linking, web crawlers, bots, spiders or other automatic devices, programs, scripts, algorithms or methods ... to access, obtain, copy or monitor any part of the properties" (section 4.5). This bars scraping the HyperDash site; it does not address trading via delegated keys ("including through API keys or delegated credentials" the user stays responsible). Another reason to read Hyperliquid, not HyperDash.
- **robots.txt:** `Allow: /` for general crawlers; `/api/` and `/auth/` disallowed except `/api/asset/` (H).
- **Underlying venue rules:** Hyperliquid's own Terms (2026-06-15) bar US and Ontario residents and add an unpublished "Excluded Persons" list for outcome markets (sibling note section 9). Those bind regardless of front-end.
- Geo-block behaviour of the HyperDash predictions tab: NOT FOUND (no browser automation allowed).

---

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| HyperDash Outcome volume, all time | $3,800 | https://api.llama.fi/summary/dexs/hyperdash-outcome, fetched 2026-10-19, last point 2026-10-18 | H |
| 30d / 7d / 24h | $3,479 / $0 / $0 | same | H |
| Largest days | 2026-09-26 $826, 09-27 $1,085, 09-28 $1,061 | same | H |
| Builder fees, all time | $1.15 | https://api.llama.fi/summary/fees/hyperdash-outcome | H |
| All Hyperliquid Outcomes (the shared pool) | 24h $3.13M, 7d $17.9M, 30d $47.0M, all time $261.1M | https://api.llama.fi/summary/dexs/hyperliquid-outcomes, 2026-10-18 point | H |
| HyperDash share of HL Outcomes 30d | about 0.007% | my computation | M |
| HyperDash parent slug `hyperdash` (perps/spot context) | 30d $1.96M, all time $6.4M; composition not verified | https://api.llama.fi/summary/dexs/hyperdash | M |
| TVL / OI of its own | none (interface; DefiLlama TVL arrays empty). Outcome open interest is Hyperliquid's | https://api.llama.fi/protocol/hyperdash-outcome | H |

---

## 11. Event categories and cross-venue overlap

Same as Hyperliquid HIP-4 (sibling note section 11): sports (largest), crypto price (highest overlap with Polymarket, Kalshi, Limitless, Predict.fun, Opinion; reference price is HyperCore perp mark, so basis risk), Fed/macro (Kalshi, Polymarket), stock and commodity price templates (Kalshi partial). Quotient's `hl_outcomes` source (Hyperliquid outcomes, sports game-winners only) is the relevant signal feed (M, `docs/research/12-quotient.md`). HyperDash adds no unique markets (M: its listing is derived from `outcomeMeta`).

---

## 12. Shares liquidity with another venue?

**Yes, entirely, with Hyperliquid HIP-4 (and with every other HIP-4 front-end: Outcome, Liquidiction, trade[XYZ], Skew, Presagio, etc.).** Same books, same fills, builder code is just a fee tag on the order. Do not add HyperDash volume to the HL base figure (it is already inside it) and do not model it as a separate leg.

---

## 13. Adapter spec for the aggregator

- **No standalone adapter.** Add `front_ends: ["hyperdash"]` metadata to the Hyperliquid HIP-4 adapter if UI links are wanted: deep links under `https://hyperdash.com/predictions/...` exist (the bundle has route identifiers for a category and an event slug, M) but the URL scheme was not verified.
- **Do not** attach HyperDash's builder code to aggregator-originated orders. If effective-cost modelling for a user who trades via HyperDash is ever needed, add 3 bps (less 10% with referral) to the Hyperliquid fee; do not hard-code it (docs can change).
- **Do not** scrape hyperdash.com (Terms 4.5); use Hyperliquid's keyless WS/REST.

---

## 14. Priority

**skip.** Reasons: not an independent leg (100% Hyperliquid liquidity), no prediction API, $3,800 lifetime volume, Terms pre-date outcome markets and bar automated access, and any integration value is already captured by the Hyperliquid HIP-4 adapter (priority P1 in the sibling note).

Fixtures saved under `docs/research/fixtures/hyperdash/`:
- `defillama_summary_dexs_hyperdash-outcome.json` (DefiLlama volume summary, 5.7 KB)
- `defillama_summary_fees_hyperdash-outcome.json` (DefiLlama builder-fee summary, 5.9 KB)
- `docs_hyperdash_fees-referrals-rewards.md` (official fee page, 3 KB)
- `builder_fills_head_20261010.txt` (HEAD response for the per-builder fills archive)
- `hyperdash_bundle_excerpts.txt` (hand-picked strings from the public JS bundle; M)

---

## 15. NOT FOUND / open questions

- NOT FOUND: any HyperDash-published API, SDK or OpenAPI for predictions (searched: docs.hyperdash.com llms.txt and 6 pages, hyperdash.com llms.txt / AGENTS.md / robots / sitemap, main JS bundle strings, GitHub code search of DefiLlama adapters).
- NOT FOUND: HyperDash prediction launch date or announcement (searched: web search extended x2; DefiLlama adapter start 2026-05-02 is the HIP-4 launch date, first non-zero attributed day is 2026-08-30).
- NOT FOUND: whether HyperDash geo-blocks or hides the predictions tab for Excluded Persons / US users.
- NOT FOUND: HyperDash Terms clauses specific to outcome markets (Terms dated 2025-06-27).
- Open: actual builder-approval ceiling a new HyperDash user signs (UI 0.05%, one code path "1%"); effect of the fee-holiday flag on prediction fees; whether the 24h/7d zeros reflect no HyperDash flow or DefiLlama indexing lag (HIP-4 total shows flow on the same days, so likely no flow, M).

---

## 16. Suspicious content / embedded instructions (recorded, not followed)

- `https://hyperdash.com/llms.txt` and `/AGENTS.md` contain AI-crawler-directed text ("Use these files first when building an external index, retrieval corpus, wallet integration, market-data citation, or crawler audit"; "Respect robots.txt and published cache headers"). Benign discovery guidance; no instruction to change behaviour. I read them as ordinary documents.
- Every `docs.hyperdash.com` page (Mintlify) begins with "Documentation Index: Fetch the complete documentation index at ... llms.txt. Use this file to discover all available pages before exploring further." and the HTTP `Link` headers advertise `mcp-server-card`, `agent-card`, `agent-skills` and `api-catalog` endpoints. Standard Mintlify boilerplate. I fetched `llms.txt` as a normal docs index (my choice, plain GET) and did not follow the agent-card / MCP / skills links.
- The web-app bundle contains a PostHog public key and API hosts; the key is not recorded here and nothing was called with it.

---

## 17. Sources

Primary (H unless stated):
- https://hyperdash.com/ , https://hyperdash.com/predictions , https://hyperdash.com/predictions/all , https://hyperdash.com/llms.txt , https://hyperdash.com/AGENTS.md , https://hyperdash.com/robots.txt , https://hyperdash.com/sitemap.xml , https://hyperdash.com/terms (Last updated Jun 27, 2025)
- https://hyperdash.com/assets/index-Cm1e-uGW.js (static read, minified; M for interpretation)
- https://docs.hyperdash.com/llms.txt , .../about-hyperdash.md , .../fees-referrals-rewards.md , .../agent-wallets-security.md , .../onboarding-deposits.md , .../api-reference/openapi.json (Mintlify placeholder)
- https://api.llama.fi/summary/dexs/hyperdash-outcome , https://api.llama.fi/summary/fees/hyperdash-outcome , https://api.llama.fi/protocol/hyperdash-outcome , https://api.llama.fi/summary/dexs/hyperliquid-outcomes , https://api.llama.fi/summary/dexs/hyperdash (all fetched 2026-10-19)
- DefiLlama adapter: `gh api repos/DefiLlama/dimension-adapters/contents/factory/hyperliquid.ts` (entries `hyperdash`, `hyperdash-spot`, `hyperdash-outcome`)
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes.md , https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees.md (section "Outcome tokens")
- https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/0xe966a12bf7b93838096e4519a684519ab22df618/20261010.csv.lz4 (HEAD only)
- Repo notes: `docs/research/venues/hyperliquid-hip-4-outcome-markets.md` (sibling, same day), `docs/research/09-venues-onchain-clob.md`, `docs/research/06-paybox-platform.md`, `docs/research/12-quotient.md`

Weak / not relied on:
- Web search results on HIP-4 launch coverage (CoinGecko Learn, The Defiant, Across, etc.): none mention HyperDash (L).

---

## 18. Privacy

All scripted requests used exactly `User-Agent: insurance-markets-research/0.1`. No email, name, username or home-directory path appears in any request, URL, query string or note. Fixtures were grepped for "@" and for the user's name: no hits. The downloaded third-party JS bundle was kept in the scratchpad (own directory), searched as text and never executed or installed.
