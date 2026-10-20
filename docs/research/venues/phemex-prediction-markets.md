# Phemex Prediction Markets (phemex.com/prediction) - venue adapter spec

Researched 2026-10-19 (about 03:00-03:30 UTC). READ-ONLY: WebFetch of Phemex pages and help-center articles, raw HTML/JS of public Phemex pages read as text, unauthenticated GETs to Polymarket's documented public hosts (`data-api.polymarket.com`, `gamma-api.polymarket.com`) and `api.llama.fi`, `gh api` reads of `phemex/*` repos. No account, wallet, key, signature, POST/PUT/DELETE, PayBox call, browser automation or WebSocket. No request was made to any Phemex prediction API path (reason in section 5). Scripted requests used the User-Agent `insurance-markets-research/0.1` only. The web-search budget was exhausted before this task started, so no news/launch-announcement search was possible (stated in section 14).
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or my inference from first-hand data; **L** = weak or stale (older than 6 months).
Fixtures: `docs/research/fixtures/phemex-prediction-markets/` (5 files, largest 24 KB).

## 0. Verdict

- **adapter_priority: skip** as a venue or arbitrage leg. Keep a registry record: kind `broker-or-frontend`, `alias_of: polymarket`.
- **It is a custodial exchange front end for Polymarket, not a venue.** Same events, same prices (rounded up), same conditional-token and order identifiers, same resolution process (H, sections 2 and 9). It is registered with Polymarket as a verified Builder named "Phemex" (H). There is no independent book, oracle or price.
- **Not an independent arbitrage leg.** It shares 100% of liquidity with Polymarket International. Any Phemex quote is a Polymarket quote plus a rounding step and an undisclosed Phemex fee, so it can only be worse than trading Polymarket directly (H for rounding and fee-field existence; M for "only worse").
- **No official or public API.** Phemex's official API docs and CLI cover futures, spot and transfers only (H). The web app uses an undocumented gateway (`/phemex-predict/...`) that requires a Phemex login session for orders (H, from front-end JS). Orders go through a KYC'd Phemex main account, USDT in the spot account, with IP geo-blocking. A PayBox EVM wallet cannot sign anything for it.
- **Small and shrinking.** Polymarket's own builder data attributes $10.6M all-time to Phemex (rank 59), $0.55M for 2026-10-01..10-19, and about $10-60k per day in the last two weeks (H). `activeUsers` is 1 in every window, which points to one omnibus Polymarket account behind all Phemex users (M).
- Revisit only if Phemex publishes an API or a distinct product (own markets, own liquidity) - triggers in section 13.

## 1. Is it live (2026)?

| Evidence | Result | Tag |
|---|---|---|
| https://phemex.com/prediction fetched 2026-10-19 03:15 UTC | HTTP 200, `cache-control: no-store`, title "Prediction Markets \| Trade Real-World Events \| Phemex"; server-rendered cards with Yes/No buttons, percentages, "$187.8M VoL."; live crypto series "BTC Up or Down Hourly", "ETH Up or Down 5m" | H |
| Meta description of the page | "Trade crypto, politics, sports & global events on Phemex Prediction Markets. Access real-time pricing powered by Polymarket data and participate in on-chain event contracts." | H |
| Polymarket Data API `/v1/builders/volume?timePeriod=DAY` | Builder "Phemex" has daily volume rows from 2026-04-17 to 2026-10-19 (a few days missing); last full day 2026-10-18 = $10,132; volume near zero 2026-08-11..08-30 (see Pause row) | H |
| Help center "Prediction Market: Available Regions" | "Updated: May 11, 2026"; "Phemex has entered into a strategic collaboration with Polymarket to bring prediction market services to our users." | H |
| Help center "Prediction Market User Guide" | "Updated: Apr 23, 2026" (about 6 months old on 2026-10-19: borderline stale, but consistent with the builder data) | H |
| Launch date | Builder volume starts 2026-04-17 ($43), first four-figure day 2026-04-22 ($2.1k). No launch announcement found. | H (volume) / NOT FOUND (announcement) |
| Pause | 2026-08-11..2026-08-30: builder volume collapsed to $14-$863 on the few days with a row (most days have none), then resumed 2026-08-31 ($15.6k). Cause not found (maintenance, geo change or UI removal are all possible). | H (data) / NOT FOUND (cause) |

**still_live = true**, with reduced and uneven activity.

## 2. Kind and market model

- **Kind:** broker or front end. Phemex lists Polymarket events and routes orders to Polymarket; the user holds no Polymarket tokens (positions are rows in Phemex's system, M).
- **Evidence that it is Polymarket under the hood (all H unless marked):**
  - The Phemex card for "Republican Presidential Nominee 2028" shows "$713.5M VoL."; Polymarket's Gamma API event `republican-presidential-nominee-2028` has `volume` = 713,459,333 (2026-10-19). "Brazil Presidential Election" shows "$187.8M"; Gamma has 187,776,719. Phemex shows Polymarket's global event volume, not its own (fixture `polymarket_gamma_crosscheck_2026-10-19.json`).
  - Phemex shows Lula 22% / Flávio Bolsonaro 79% (sum 101%); Polymarket's `outcomePrices` at 03:13 UTC were 0.215 / 0.7865. Phemex's front-end code rounds Yes/No prices **up** to the next 0.1 cent and percentages up to the next whole percent (`Math.ceil`) (fixtures `phemex_prediction_page_cards_2026-10-19.json`, `phemex_frontend_api_inventory_2026-10-19.json`).
  - Market images are served from `polymarket-upload.s3.us-east-2.amazonaws.com` (H, page HTML).
  - Front-end JS: market objects carry `conditionId`, `tokenIdYes`, `tokenIdNo`, `resolutionSource`, `groupItemTitle`, `rtds{...}`, and `predictionUrl = https://polymarket.com/event/{slug}`; the order estimate returns `polymarketFee` and `phemexFee` separately; orders are keyed by `tokenId` (H, JS read as text; not an official doc).
  - Phemex is listed as a verified Builder on Polymarket's leaderboard (builder code `0x0b4528991194951b3570dd3578d1c5b3ad700ff3ca9b7c945306f2a91f490bab`, public data; fixture `polymarket_builder_phemex_volume_2026-10-19.json`). Polymarket docs: "Volume is credited to your builder account for every matched trade where your code is attached" and the code is "serialized onchain as part of the signed order" (H, https://docs.polymarket.com/developers/builders/builder-intro).
- **Market model:** inherited from Polymarket: binary YES/NO shares, multi-outcome events as sets of binary markets (neg-risk), plus crypto up/down series (5-minute, 15-minute, hourly, daily, "CRYPTO_LIVE"). Covered by the Polymarket spec; not re-verified here.
- **Order types exposed by Phemex:** market-style only. Buy takes a currency amount plus `slippage`; sell takes a share count; a `quick-buy` route exists. No limit-order route is visible in the front-end code (H, JS; absence in code, not a statement from Phemex). The user guide lists no order types and no min/max (H).
- **Tokenisation:** Polymarket CTF ERC-1155 position tokens on Polygon, held by Phemex or Polymarket-side accounts, not by the user (M). Phemex marketing says "on-chain event contracts"; I found nothing that gives users on-chain custody.

## 3. Chains and collateral

- **User collateral:** USDT in the Phemex **spot** account of the **main** account (sub-accounts are not supported) (H, user guide, 2026-04-23). The order body also carries a `currency` field and the config route returns `supportedCurrencies`; values NOT FOUND (not called).
- **Underlying chain and collateral:** Polymarket on Polygon (covered by the Polymarket spec). How Phemex converts USDT to Polymarket collateral and which wallet(s) hold the positions is NOT FOUND. The single `activeUsers: 1` per builder window suggests one omnibus trading account (M).
- **Phemex deposit chains:** DefiLlama lists Phemex as a CEX with reserves across Ethereum, Bitcoin, Solana, Ripple, Tron, Sui, BNB, Base, Arbitrum, Polygon, Avalanche, Polkadot, zkSync Era, Optimism, Linea, Fantom (H, https://api.llama.fi/protocols, 2026-10-19). That says nothing about prediction-specific funding; deposit addresses were not checked.

## 4. Read API

- **Exists: none official.** (`exists = none`; an undocumented internal gateway exists.)
  - Official docs: `phemex/phemex-api-docs` (last push 2024-06-17) has Contract, Hedged-Perpetual, Spot, Transfer and Generic docs; a `grep -i -c 'predict|polymarket'` over all seven markdown files returned 0 in each (H). `phemex/phemex-cli` (pushed 2026-03-19) lists "USDT-M futures, Coin-M futures, and Spot markets" and its README has no prediction/polymarket hit (H).
  - Undocumented front-end gateway (H that the paths exist in Phemex's public JS; shapes unverified): base `https://api10.phemex.com`, prefix `/phemex-predict/public/data/api/v2/polymarket/market/` with `categories`, `discovery`, `events`, `events/{slug}`, `events/search`, `crypto-live/{series}`, `markets/{id}/chart`, `config`. Full inventory in `phemex_frontend_api_inventory_2026-10-19.json`.
  - No order book, trade-tape or resolution endpoint is visible in the prediction client; it shows only prices (`priceYes`/`priceNo`), volume, liquidity, a price-history chart and event metadata. Depth is whatever Polymarket's CLOB has.
- **Auth and limits:** not documented. WebSocket: not used by the prediction client as far as the code read shows.
- **Recommendation for the aggregator:** read Polymarket directly (Gamma, CLOB, Data API). Use the Data API builder endpoints below only to monitor Phemex's share:
  - `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL|MONTH|WEEK|DAY&limit=50&offset=N` (H, 200 on 2026-10-19; Phemex is on page offset=50)
  - `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH|WEEK|DAY` (H; DAY returns a daily series back to 2025-10-10, 17 MB for all builders, so filter to `builder == "Phemex"`)

## 5. Trade path and PayBox reachability

- **Programmatic trading: none supported.** Orders (`POST /phemex-predict/api/v2/polymarket/order/buy|sell|quick-buy`, `GET .../order/estimate`) need a Phemex web login session; Phemex's API keys are documented for futures/spot only and no prediction scope is documented (H for docs coverage; M for the session requirement, inferred from the `/api/` vs `/public/` path split and the client checking for a logged-in state before calling position and favorites routes). Using it from a bot would be "automated means or interface not provided by us", which the Terms of Use ban (section 8).
- **I did not call the gateway.** The ground rule allows GETs to documented API hosts; this gateway is undocumented and the ToS bans automated use of non-provided interfaces. A response-shape fixture for it therefore does not exist. If the project ever needs it, ask Phemex for permission first.
- **PayBox:** `paybox_reachable = no`. There is no signed-order or transaction-proposal path: no on-chain contract, no EIP-712 order for the user's key, no custody the user controls. The only conceivable flow is "PayBox sends USDT to a Phemex deposit address, then a human trades in the Phemex web UI", which needs a KYC'd Phemex account, is geo-blocked in many jurisdictions and is not automatable. For the same exposure, a PayBox EVM wallet can trade Polymarket directly (covered by the Polymarket spec).

## 6. Fees

- **Structure (H, JS field names; rates NOT FOUND):** the estimate response splits `totalFee` into `polymarketFee` and `phemexFee`/`platformFee`. The user guide says only "Fees may include trading fees and implicit costs from bid-ask spreads. Review the fee information shown on the confirmation screen before placing an order." (H, 2026-04-23). No formula, no rate card, no fee-payer breakdown published. The front-end code hard-codes `feeRate: 0` in its mapper, which is a placeholder, not a statement (M).
- **Implicit cost:** displayed Yes/No prices are rounded up to 0.1 cent and probabilities to 1 percent (H), so a buyer pays at least the rounding on top of Polymarket's ask. For arbitrage scoring, treat Phemex's price as Polymarket's ask + 0.1 cent + the confirmation-screen fee.
- Polymarket's own fee schedule is covered by the Polymarket spec.

## 7. Resolution and dispute risk

- **Resolution:** Polymarket's process (UMA-based, per the Polymarket spec). Phemex: "Outcomes are determined by the published resolution criteria and designated public sources - not by Phemex or any single user ... any disputes are handled under Polymarket's resolution process." (H, user guide). Market states shown: Pending, Resolving, Under Review, Finalized. The help-center "Settlement Rules" and "FAQ" article lists are empty ("No articles found") (H).
- **Extra risk vs trading Polymarket directly (M):** (a) settlement is delayed by Phemex's own crediting ("Settlement may not happen immediately after the market end time"); (b) near resolution "trading may be restricted or unavailable"; (c) exchange counterparty risk (positions are not user-held); (d) Phemex can pause the product or restrict a region at any time (the 2026-08-11..08-30 volume gap shows a real pause); (e) no documented treatment of 50-50 or voided markets on the Phemex side.

## 8. Geo, ToS and automation

- **Restricted:** "Access is determined by your current physical location, not your country of residence"; IP-based check on login and orders. Fully restricted list (non-exhaustive, updated May 11, 2026): AE, AU, BE, BY, BI, CF, CD, CU, DE, ET, FR, GB, IR, IQ, IT, KP, LB, LY, MM, NI, PL, RU, SG, SO, SS, SD, SY, TH, TW, UM, US, VE, YE, ZW (H, https://phemex.com/help-center/available-regions-phemex-prediction-market). The generic Terms of Use (updated Jul 10, 2025, so L for prediction coverage) also name UAE, US, UK, Ontario, Quebec, Alberta, Saskatchewan, Hong Kong, India and others as Restricted Territories (H).
- **Automation:** Terms of Use: "without our prior written consent, you shall not use any automated means or interface not provided by us to access Phemex Exchange or extract data on Phemex Exchange" and a ban on "a web crawler or similar technique to access our Services or to extract data" (H, https://phemex.com/help-center/phemex-terms-of-use). No prediction-specific terms found; the ToU text has no mention of prediction markets (H).
- **robots.txt:** allows AI crawlers (GPTBot, ClaudeBot and others) and disallows only account/asset paths and some query patterns (H). This does not override the ToU.
- Sub-accounts cannot trade predictions; KYC applies (H, ToU 'passed all compliance checks ... KYC').

## 9. Liquidity

- **Phemex-originated flow (H, Polymarket Data API, fetched 2026-10-19):** all-time $10,624,241 (rank 59 of builders); calendar-month buckets 2026-04 $104.7k, 05 $1.46M, 06 $2.88M, 07 $4.20M (peak, rank 36), 08 $0.40M, 09 $1.03M, 2026-10-01..10-19 $0.55M; weeks starting 2026-10-04 $337k, 10-11 $133k, 10-18 (partial) $11k; days 2026-10-12..10-18 $4.7k-$58k, 2026-10-19 (partial) $846. `activeUsers` = 1 in every row. Fixture: `polymarket_builder_phemex_volume_2026-10-19.json`.
- **Displayed "VoL."** on Phemex cards is Polymarket's global figure ($713.5M, $187.8M ...), not Phemex's; the page header "24h Volume" showed "$0.00" (placeholder, H). Do not use displayed volume as a Phemex metric.
- **Depth:** Polymarket's. Phemex adds no resting liquidity (M).
- DefiLlama has no prediction listing for Phemex; only the CEX record "Phemex" (reserves $280.9M on 2026-10-19, H) which is exchange assets, not prediction TVL.

## 10. Event categories and overlap

- Page tabs/cards (2026-10-19, H): politics and elections (Brazil, France 2027, Israel PM, US 2028 nominee), geopolitics (US-Iran / Israel-Iran ceasefire), sports (NFL 2027 champion, UEFA Champions League 2027, Ballon d'Or, cricket), crypto price (BTC/ETH up-down 5m/hourly, BTC above X, BTC hit price), tech/novelty (Tesla Roadster). All are Polymarket events, so every overlap with Kalshi, XO, Limitless, Predict.fun and others is an overlap with Polymarket only. Cross-venue arbitrage should be computed from the Polymarket leg.
- Phemex's `categories` route would give the exact category list; not called (section 5).

## 11. Liquidity shared with another venue

**Yes, 100% with Polymarket International (CLOB on Polygon).** `liquidity_shared_with = polymarket`. Do not count Phemex as an independent leg, and do not double-count its volume (Phemex's builder volume is a subset of Polymarket's).

## 12. Fixtures (docs/research/fixtures/phemex-prediction-markets/)

| File | What |
|---|---|
| `phemex_prediction_page_cards_2026-10-19.json` | 17 market cards parsed from the SSR HTML of /prediction (titles, shown percentages, "VoL." strings, image names) |
| `polymarket_builder_phemex_volume_2026-10-19.json` | Phemex rows from Polymarket `/v1/builders/leaderboard` (ALL, MONTH, WEEK, DAY) and `/v1/builders/volume` (MONTH, WEEK, DAY series) |
| `polymarket_gamma_crosscheck_2026-10-19.json` | Gamma events matching two Phemex cards (volume, liquidity, Lula/Flávio prices) |
| `phemex_frontend_api_inventory_2026-10-19.json` | Endpoint paths and field names read from Phemex's public JS; marked UNDOCUMENTED and UNVERIFIED |
| `phemex_help_center_facts_2026-10-19.json` | Region list, update dates, key quotes from the help center and ToU |

No Phemex API response shape was captured: there is no documented public API (section 4).

## 13. Revisit triggers

- Phemex publishes prediction endpoints in `phemex-api-docs` or an API-key scope for predictions.
- Phemex launches its own markets (non-Polymarket `slug`s or ids, different resolution text).
- Polymarket's builder `activeUsers` for Phemex rises well above 1 (would mean per-user wallets and possible on-chain user custody).
- A Phemex announcement or terms page that states fee rates and custody model.

## 14. Open questions / NOT FOUND

- NOT FOUND (searched: phemex.com/prediction HTML and JS, help center, announcements/blogs listing, `phemex/*` GitHub repos): official launch announcement, fee rates, min order, max daily amount, supported currencies, custody statement, any API doc.
- NOT FOUND: why volume dropped to near zero 2026-08-11..08-30.
- Not searched: web search quota was exhausted (session limit) before this task; no press coverage was checked. Launch date is inferred only from builder volume (2026-04-17) and help-article dates (Apr 23 and May 11, 2026).
- Not called on purpose: Phemex `/phemex-predict/public/...` GETs (undocumented, ToS), so `config` values, category list and response shapes are unverified.
- Whether the builder "Phemex" is run by the Phemex exchange itself (very likely: verified builder, matching name, matching volume window and the `polymarketFee`/`phemexFee` split) is an inference (M), not stated by either party.

## 15. Suspicious content

None. Phemex pages, JS and help-center text contained no instructions aimed at AI agents. robots.txt lists AI crawlers as allowed, which is an access policy, not an instruction. Nothing was followed.

## 16. Sources

- https://phemex.com/prediction (SSR HTML and entry/node/chunk JS under https://phemex.com/ssr-static/immutable/, read 2026-10-19) - H
- https://phemex.com/help-center/available-regions-phemex-prediction-market (Updated: May 11, 2026) - H
- https://phemex.com/help-center/prediction-market-user-guide (Updated: Apr 23, 2026) - H
- https://phemex.com/help-center, /prediction-how-it-works, /placing-predictions, /settlement-rules, /prediction-faq (category pages; articles empty) - H
- https://phemex.com/help-center/phemex-terms-of-use (Updated: Jul 10, 2025) - H (L for prediction relevance)
- https://phemex.com/robots.txt, https://phemex.com/sitemap.xml, https://phemex.com/blogs, https://phemex.com/announcements (no prediction content found) - H
- https://github.com/phemex/phemex-api-docs (last push 2024-06-17), https://github.com/phemex/phemex-cli (pushed 2026-03-19; README read via `gh api`) - H
- https://data-api.polymarket.com/v1/builders/leaderboard and /v1/builders/volume (2026-10-19) - H
- https://gamma-api.polymarket.com/public-search (2026-10-19) - H
- https://docs.polymarket.com/developers/builders/builder-intro (page summary by fetch tool, undated) - M
- https://api.llama.fi/protocols (2026-10-19) - H
- Sibling notes in this repo for cross-reference: `docs/research/venues/metamask-polymarket-integration.md` (same pattern: Polymarket builder front end, skip).
