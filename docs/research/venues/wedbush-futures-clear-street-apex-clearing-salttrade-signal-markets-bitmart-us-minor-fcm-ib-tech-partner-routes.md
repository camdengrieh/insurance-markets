# Minor FCM / IB / tech-partner routes (Wedbush Futures, Clear Street, Apex Clearing, SaltTrade, Signal Markets, BitMart US) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: first-party page reads (WebFetch), sitemaps and raw HTML/JS bundles fetched with plain GETs (generic User-Agent `insurance-markets-research/0.1`), one public Kalshi status GET, DNS lookups, Apple iTunes Search API. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool was used. The Apex developer portal answered with an Okta SSO login page; nothing was entered or followed. Third-party text was treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session (cited; "wf" = read through the WebFetch summariser, not as raw text); **M** = secondary source, sibling in-repo note, or my inference; **L** = weak or stale.

Method limit: the shared WebSearch budget was exhausted before this task started (every query returned "budget used up"; I did not work around it). Discovery therefore used known URLs, company sitemaps and press-release indexes. News written after these pages, and anything not reachable from them, was not searched.

Fixtures (all <= 50 KB, section 13): `docs/research/fixtures/wedbush-futures-clear-street-apex-clearing-salttrade-signal-markets-bitmart-us-minor-fcm-ib-tech-partner-routes/`. **No route in this group has a public API, so the fixtures are evidence files plus one real response from the underlying shared venue (Kalshi), not response samples of these routes.**

---

## 0. Bottom line

1. **These six names are plumbing, not venues. None has its own order book, none is an independent arbitrage leg.** Each is an FCM, introducing broker or white-label front end whose orders end up on someone else's exchange. Key the scanner on the exchange's `liquidity_pool_id`, never on the brand.
2. **Where each one routes (best evidence):**

| Route | Role | Routes to | Evidence | Live on 2026-10-19? |
|---|---|---|---|---|
| Wedbush Futures (Wedbush Securities Inc.) | Clearing FCM for institutions and for retail front ends (e.g. DraftKings Predictions per sibling note) | CME Globex event contracts, CDNA, DKeX (DraftKings' exchange), Bitnomial; not Kalshi (nothing found) | H (wf): Wedbush press releases 2026-02-11, 06-05, 06-15, 06-29; og.com/regulatory lists "Wedbush Futures" as an intermediary | Yes: clearing prediction contracts since Dec 2025 |
| Clear Street LLC | Institutional FCM | Kalshi | H (wf): Clear Street release 2026-05-01, "first institutional Futures Commission Merchant (FCM) to join Kalshi's exchange and clearing house" | Announced 2026-05-01; no evidence of live client flow or volume |
| Apex Clearing Corporation (Apex Fintech Solutions) | Clearing FCM + turnkey platform for broker-dealers | Kalshi (first venue; live with tastytrade); Gemini Titan only a non-binding LOI | H (wf): Apex releases 2026-02-03, 07-27, 08-13, 08-24 | Yes via tastytrade (launched 2026-07-27) |
| SaltTrade Derivatives | Tribal-owned storefront on a CFTC no-action "passive software provider" position | Kalshi only | H (wf): Kalshi blog 2026-09-18; sibling note | Announced 2026-09-18; no app-store listing found |
| Signal Markets | CDNA-routed front end / introducing broker (blog claims IB guaranteed by Foris DAX FCM) | CDNA (M) | M: third-party blog row; `signalmarkets.com` header "Powered by Crypto.com" (H on the text, not on the regulatory status) | Unclear: marketing prototype with mock data (section 1) |
| BitMart US | White-label front end via Plaee, said to route to CDNA | CDNA (L) | L: one blog row, "launch status not independently verified" | **No**: `www.bitmart.us` returns Cloudflare error 1016 (origin DNS error) |

3. **No public read API, no public trade API, no EVM/PayBox path** for any of them (sections 4-6). The only programmatic surfaces are (a) Apex's AscendOS APIs, behind SSO and for Apex's broker-dealer clients; (b) the FCM-member tier of the Kalshi API, usable only by a clearing FCM; (c) the exchanges' own APIs (Kalshi public API, CDNA public REST, CME licensed feed), each covered by its own note.
4. **adapter_priority = skip for all six.** Build adapters for the pools they feed: Kalshi (parallel workflow), CDNA (`crypto-com-derivatives-north-america-...md`, P0 read adapter), CME (`cme-group-event-contracts.md`, P2 signal-only), DKeX (`railbird-exchange-dkex-draftkings-owned-dcm.md`). Add registry rows (section 11) so the scanner never double-counts.
5. **Corrections to the discovery hints:** (a) the hint says Wedbush routes to "CME and Small Exchange". The blog row says that; Wedbush's own futures site lists CME, CFE, ICE and The Small Exchange as exchanges it clears, but its prediction-market releases name CME, CDNA, Coinbase Derivatives (existing support), DKeX and Bitnomial and never mention Small Exchange prediction markets (H wf). (b) Two unrelated sites use the name "Signal": `signalmarkets.com` and `signal.markets` (section 1). (c) SaltTrade is not "Live" in any sense I could verify (sibling note).

---

## 1. Is each route still live? (2026)

| Route | Evidence | Verdict | Tag |
|---|---|---|---|
| Wedbush | Press releases: 2026-02-11 "cleared 'tens of millions' of prediction market contracts" on Super Bowl Sunday across 350+ CME products; 2026-06-15 ">1 billion prediction market contracts cleared" cumulatively as of 2026-05-31 "across multiple exchanges"; 2026-06-29 joined DKeX and Bitnomial Clearinghouse; 2026-07-08 text "24/7 prediction markets and perpetual futures". Wedbush sitemap lastmod 2026-10-15. | Live, active clearing FCM | H (wf) |
| Clear Street | Release 2026-05-01 announces the Kalshi FCM partnership (institutional, 24/7 event contracts, block trades, swaps for ETF issuers). Homepage and `/legal/clear-street-fcm` (copyright 2026) say Clear Street LLC is a CFTC-registered FCM and NFA member but do not mention prediction markets. No volume, client or fee figures anywhere. | Partnership announced and not defunct; actual flow unverified | H (wf) |
| Apex | `apexfintechsolutions.com`: "Access 10 asset classes, including alternatives, crypto, options, and prediction markets"; releases 2026-02-03 (turnkey, exchange-agnostic), 2026-07-27 (tastytrade launch "offered through Apex Clearing"), 2026-08-13 (Kalshi first venue, tastytrade "first firm live"), 2026-08-24 (Gemini LOI, "non-binding", not live). | Live for Kalshi via tastytrade; Gemini not live | H (wf) |
| SaltTrade | Kalshi blog 2026-09-18 says the Tribe launched the app but gives no download link or states; Kalshi blog 2026-10-07 lists four further tribal apps "launching" and does not mention SaltTrade; iTunes search `salttrade` (US) 2026-10-19 returns no such app. See `salttrade-derivatives-tunica-biloxi-tribe.md`. | Announced, availability unverified | H (wf) / M |
| Signal Markets | Two sites. **`signalmarkets.com`** (HTTP 200; Lovable-style SPA; title "Signal Markets | Prediction Markets for What Happens Next"; header "Powered by Crypto.com"; footer "(c) 2024 Signal Markets"; hard-coded demo markets dated 2025 labelled "Kalshi"/"Polymarket"; Supabase tables `markets`, `trades`, `user_picks`, `promo_codes`, `event_registrations`; claim "CFTC-regulated exchange • Bank-grade security • $250,000 FDIC insured") reads like a pre-launch/contest prototype, not a live broker. **`signal.markets`** (HTTP 200; "Signal - Trade what you believe") is a different product: Vercel project `signal-git-main-busha`, Busha auth callback, Nigerian NIN identity-verification routes, API host `api.signal.markets`. The CDNA IB claim comes only from the blog row ("Signal Markets LLC IB guarantor Foris Dax FCM LLC (CDNA) · registered Sep 2026 · NFA ID 0580098"); I could not verify it because NFA BASIC returned a "Page not found" for the direct URL and its search is interactive. Foris DAX FCM LLC is, however, CDNA's affiliate FCM (H, og.com/regulatory via sibling note). | Registered IB plausible (M); product not demonstrably live | M / L |
| BitMart US | `bitmart.us` apex has no A record; `www.bitmart.us` is on Cloudflare and returns **HTTP 530 "error code: 1016"** (origin DNS error); MX points at a Microsoft 365 tenant named `bitmart-us`. `www.bitmart.com/en-US` homepage does not mention BitMart US, prediction markets or CDNA. iTunes search `bitmart us` returns only the main BitMart app ("BitMart: Buy Crypto & Stocks"). `plaee.com` does not name BitMart. Blog: "Routes to CDNA via Plaee white-label infrastructure · launch status not independently verified". | Not live (site down); route unverified | H (DNS/HTTP), L (route) |
| Plaee (vendor behind BitMart US per blog) | `plaee.com` (page dated 2026-10-18): "turnkey, prediction-native infrastructure to launch and run your own prediction market"; news items "ProphetX Partners with Plaee", Axcera (Oct 1), Optimove (Sep 24); regulatory wording "US markets under a CFTC-licensed framework, and globally via Plaee's DPM exchange". `plaee.io` is an older sweepstakes-casino site (copyright 2025). No exchange named for the US side other than ProphetX in the news item. The blog's "Prediction Trader" and "PlaeeOS" product names did not appear on either page. | Live B2B vendor; CDNA link not confirmed (the page points to ProphetX) | H (wf) |

---

## 2. Kind and market model

- **Kind: broker-or-frontend for all six**, in three flavours: clearing FCM (Wedbush, Clear Street, Apex), storefront / software provider (SaltTrade), introducing broker or white-label UI (Signal Markets, BitMart US/Plaee). Apex also sells a turnkey platform and requires the client to register as an introducing broker with NFA and employ a Series 3 holder (H wf, Apex blog 2026-02-19).
- **Market model: inherited from the exchange.** All the contracts are binary Yes/No event contracts paying exactly $1.00 or $0.00 (H wf, Apex FAQ), central-limit order books on the DCM; some Kalshi scalar/combo markets exist (Kalshi note). Outcome tokenisation: **none**. Positions are FCM account entries, held in a segregated event-contract account separate from securities (H wf, Apex FAQ).
- Wedbush's CME-side products also include index futures that are NOT prediction markets (CME FSPI Hockey Futures, release 2026-09-28, H wf); ignore them for event-contract matching.

---

## 3. Chains and collateral

- **Chains: none.** No source for any of the six mentions a blockchain, token, contract address or wallet. (NOT FOUND; searched: all pages in section 12. The only chain-adjacent item is Gemini's crypto contracts in the Apex LOI, which are cash-settled event contracts on Gemini Titan, not on-chain.)
- **Collateral: USD** in a KYC'd FCM/brokerage account (Apex: "Apex custodies the event contracts"; Kalshi/CME/CDNA clear in USD). Crypto *deposits* may exist at specific brokers but are outside these routes.

---

## 4. Read API

| Route | Public read API? | What exists instead | Tag |
|---|---|---|---|
| Wedbush Futures | **None** | Institutional trading platforms (CQG, Rithmic, TT, CTS) listed on wedbushfutures.com; no API/FIX text for prediction markets; no market-data page | H (wf) |
| Clear Street | **None** | Release says nothing about connectivity; blog posts about "APIs in prime brokerage" are unrelated to event contracts | H (wf) |
| Apex | **Authenticated only** | AscendOS APIs for order management, position tracking and market data (release 2026-08-13); APIs named in the FAQ: Ascend Orders, Ascend Events, Ascend Position and Activity, Asset Master; "API documentation is coming soon" (blog 2026-02-19, updated 2026-06-24); `developer.apexclearing.com` redirects to an Okta login. These are for Apex's broker-dealer clients, not for end users or third-party aggregators. | H (wf) |
| SaltTrade | **None** | Underlying data = Kalshi's public API | H (sibling) |
| Signal Markets | **None found** | `signalmarkets.com` talks only to its own Supabase backend; `api.signal.markets` belongs to the other Signal | H (bundle) |
| BitMart US | **None** | site down | H |

**Where the data actually lives (use these adapters instead):**

- **Kalshi** (the pool behind Clear Street, Apex, SaltTrade): public REST `https://api.elections.kalshi.com/trade-api/v2` (shared) and `https://external-api.kalshi.com/trade-api/v2`; docs `https://docs.kalshi.com` (index `llms.txt`). Real response confirmed 2026-10-19: `GET /exchange/status` returned HTTP 200 with `exchange_active:true`, `trading_active:true` on all four exchange indexes ("Default", "Combos", "Crypto & Commodities", "Tennis, Baseball, Basketball") (fixture `kalshi_exchange_status_2026-10-19.json`, H). A one-row `GET /markets?limit=1&status=open` also returned HTTP 200 with a binary combo market (`market_type:"binary"`, `last_price_dollars`, `exchange_index`, `mve_selected_legs`) (H, not saved: the row is a long combo and adds nothing; see the Kalshi note for shapes). Auth, rate limits (token buckets, e.g. 30 tokens for some calls, 2 tokens for others, `GET /account/endpoint_costs`), WebSocket: Kalshi note (`docs/research/08-venues-polymarket-kalshi.md`).
- **CDNA** (Wedbush, Signal Markets, BitMart US): keyless public REST `https://api.crypto.com/dcm/v1/public/get-events` etc.; see `crypto-com-derivatives-north-america-...md` (H there).
- **CME** (Wedbush): licensed, authenticated feed only; `cme-group-event-contracts.md`.
- **DKeX** (Wedbush): no public API found; `railbird-exchange-dkex-draftkings-owned-dcm.md`.

---

## 5. Trade path

- **Programmatic order placement for an outside agent: none** for all six routes.
- **What exists for institutions (H, Kalshi docs `llms.txt`, fixture `kalshi_fcm_member_endpoints_from_llms_txt_2026-10-19.txt`):** Kalshi's API has an **FCM member tier**: create/list FCM subtraders, per-subtrader daily premium caps and blocked categories, FCM orders/fills/positions, position transfers into an FCM error account, and "FCM clearing members only" subtrader-bound API keys (RSA or Ed25519 public key supplied by the FCM). That is how an FCM such as Clear Street or Apex would carry client orders into Kalshi (M: Kalshi's docs never name Clear Street or Apex, and I did not read an FCM agreement). Using it requires being a Kalshi FCM clearing member.
- **Apex clients** (broker-dealers) send orders to Apex through the Ascend Orders API; Apex FCM then routes to the DCM (H wf). A retail account is opened at the broker (tastytrade etc.), not at Apex.
- **Wedbush/Clear Street clients** are institutions or introducing brokers; access is via the FCM's platforms or exchange-specific FIX; no public docs.

---

## 6. PayBox / EVM reachability

**paybox_reachable = no.** No on-chain component, no signed-order scheme, no transaction-proposal target. Money path is fiat/KYC into a broker account, then an FCM, then a DCM/DCO. A PayBox EVM or Solana wallet could at best fund a user's own broker account by a normal transfer, which is outside this project. (H by absence in all sources read.)

---

## 7. Fees

| Fee | Finding | Tag |
|---|---|---|
| Exchange fee | Set by the DCM. Kalshi: fee types `quadratic`, `quadratic_with_maker_fees`, `flat` per series (Kalshi changelog text in `llms-full.txt`); coefficients per the Kalshi note. CDNA/CME: their notes. | H (types), M (coefficients, sibling) |
| Broker/FCM commission | **NOT FOUND** for Wedbush, Clear Street, Apex-as-FCM (searched: all pages in section 12; none publishes a schedule; Clear Street and Wedbush releases have no fee text). | H for the absence |
| Introducing-broker markup | Apex: firms "can charge a small fee for each contract bought or sold" (H wf, FAQ). SaltTrade: the CFTC PSP position permits a user fee and revenue share; existence unknown (sibling note). Signal Markets / BitMart US: NOT FOUND. | H (permission), NOT FOUND (amounts) |

For edge maths, take the exchange fee model and add a broker term of 0 until a schedule is found. Do not assume any front end is cheaper than going direct.

---

## 8. Resolution and dispute risk

- **Resolution belongs to the exchange**, not to these routes: Kalshi (Clear Street, Apex, SaltTrade), CME/CDNA/DKeX (Wedbush), CDNA (Signal, BitMart). Rules, sources and settlement times are in the per-exchange notes.
- **Route-specific risk:** counterparty and custody sit with the FCM. Apex's footer warns that event-contract legal status "continues to evolve" and that state or federal actions could cause "trading halts, mandatory liquidations, or position cancellations with little advance notice" (H wf). Apex also notes state gambling law "may apply to sports-related event contracts" (H wf, FAQ). A broker-level halt can strand a position even if the exchange is fine.
- SaltTrade additionally rests on a CFTC staff no-action position (Letter 26-25), not a rule (sibling note, H).

---

## 9. Geo, ToS and automation

- **Geography:** all US-regulated venues; consumer fronts are US-only and KYC'd. Clear Street and Wedbush serve institutions or professionals (H wf). State availability for Apex's tastytrade product is not stated (H wf: "53 states and territories" refers to Apex Clearing's broker-dealer licences).
- **Terms / automation:** NOT FOUND for every route (no consumer ToS read for SaltTrade, Signal, BitMart US; Apex/Clear Street/Wedbush publish no event-contract customer terms on the pages I read). For automation the sanctioned programmatic paths are the exchanges' own APIs and member agreements, not these routes.
- **Compliance obligations for would-be partners (Apex):** register as an introducing broker with NFA, employ a Series 3 holder, give the event-contract risk disclosure (H wf).

---

## 10. Liquidity and event overlap

- **Route-specific volume/OI/TVL: none published** for any of the six. The only figures are Wedbush's: ">1 billion" prediction-market contracts cleared cumulatively as of 2026-05-31 across several unnamed exchanges (release 2026-06-15, H wf) and "tens of millions" on the Super Bowl LX Sunday across 350+ CME products (release dated 2026-02-11, H wf). Both mix venues and include sports; they say nothing about live depth.
- **Pool liquidity:** Kalshi was live on all four exchange indexes on 2026-10-19 (fixture, H). Kalshi, CDNA and CME volume/OI: see their notes.
- **Overlap with other venues** (where arbitrage exists): Kalshi pool = sports, politics, crypto price, macro, weather, economics (same contracts as Polymarket/XO/Limitless on matching events). Apex/tastytrade's launch list is financial-heavy: equity indices, Treasury yields, VIX, USD, central-bank decisions, CPI/PCE/NFP/GDP/ISM, BTC/ETH/SOL/XRP, crude/gas/gold/silver/copper, "hourly to yearly" (H wf), which are the crypto-price and macro categories where cross-venue edges are most testable. CME pool: financial/crypto/macro after sports moved to Crypto.com (CME note). CDNA pool: sports-deep, politics/macro thin (CDNA note).
- **Shares liquidity with:** Clear Street, Apex, SaltTrade -> Kalshi (Apex adds Gemini Titan only if the LOI is finalised). Wedbush -> CME, CDNA, DKeX, Bitnomial (it is an FCM, not a pool; a Wedbush price does not exist separately). Signal Markets, BitMart US -> CDNA (M/L). **None is independent.**

---

## 11. Adapter spec for the aggregator

**Priority: skip (all six).**

Registry rows to add so the scanner never double-counts. Vocabulary follows `docs/platform-registry-design.md` section 3.10 (`routes_to` is stored on the front end or broker, which is never a pool representative; a record that routes to several pools is excluded from pool-based consensus). Column names below are descriptive; map them onto that schema when populating:

| venue_id | kind | liquidity_pool_id | independent | read_api | trade_api | status |
|---|---|---|---|---|---|---|
| `wedbush-futures` | `fcm` | `routes_to` = `[cme-globex-event, cdna, dkex]` (multi; Bitnomial products are not prediction markets in the releases read) | false | none | none | live |
| `clear-street-fcm` | `fcm` | `kalshi-clob` | false | none | none | partnership announced 2026-05-01, flow unverified |
| `apex-clearing` | `fcm_platform` | `kalshi-clob` (+ `gemini-titan` if LOI finalised) | false | authenticated, broker clients only | authenticated, broker clients only | live via tastytrade since 2026-07-27 |
| `salttrade-derivatives` | `distribution_channel` | `kalshi-clob` | false | none | none | announced-2026-09-18, availability unverified |
| `signal-markets-llc` | `introducing_broker` | `cdna` | false | none | none | unverified (M) |
| `bitmart-us` | `white_label` | `cdna` (unverified) | false | none | none | site down 2026-10-19 |
| `plaee` | `tech_vendor` | n/a (ProphetX per its own news; CDNA unconfirmed) | n/a | none | none | live vendor |

General rule this group illustrates: any FCM, IB or white-label front end maps to its DCM's `liquidity_pool_id`; arbitrage detection compares pools, not brands.

**Revisit triggers (any one):**
1. Apex publishes the AscendOS prediction-markets API docs openly, or Apex adds a second venue that lists contracts not on Kalshi (the LOI with Gemini Titan becoming binding): then check whether the new venue is already covered (Gemini note).
2. Clear Street or Wedbush publish aggregate volume/OI by venue, giving a signal of institutional flow.
3. A route starts listing its own contracts on its own exchange (e.g. SaltTrade, Signal, or BitMart US obtaining a DCM). Today none does.
4. Signal Markets / BitMart US go live with verifiable regulatory disclosures (NFA BASIC record, terms naming the FCM).

---

## 12. Sources

All fetched 2026-10-19 unless noted.

- [H wf] Wedbush press releases: https://www.wedbush.com/wedbush-supports-cme-group-prediction-markets-as-volumes-surge-around-super-bowl-lx/ (2026-02-11); https://www.wedbush.com/wedbush-securities-launches-full-support-for-cme-groups-24-7-cryptocurrency-futures-trading/ (2026-06-05); https://www.wedbush.com/wedbush-surpasses-one-billion-prediction-market-contracts-cleared/ (2026-06-15); https://www.wedbush.com/wedbush-joins-dkex-and-bitnomial-clearinghouse-further-expanding-access-to-prediction-markets-and-digital-asset-derivatives/ (2026-06-29); https://www.wedbush.com/wedbush-rings-the-cboe-closing-bell-celebrating-a-longstanding-partnership-and-a-shared-commitment-to-market-innovation/ (2026-07-08); https://www.wedbush.com/wedbush-expands-market-access-with-launch-of-futuresports-performance-index-products/ (2026-09-28); sitemap https://www.wedbush.com/sitemap_index.xml
- [H wf] Wedbush Futures: https://www.wedbushfutures.com and https://www.wedbushfutures.com/products/ (exchanges CME, CFE, ICE, The Small Exchange; platforms CQG, Rithmic, TT, CTS; no prediction-market or API text)
- [H wf] Bitnomial news item mirroring the DKeX/Wedbush announcement: https://bitnomial.com/news/2026-06-29/wedbush-dkex-bitnomial-clearinghouse/
- [H wf] OG.com regulatory page (intermediaries list incl. "Wedbush Futures"; does not name Signal Markets, BitMart, Clear Street, Apex or Kalshi): https://og.com/regulatory
- [H wf] Crypto.com prediction partners page (names Underdog, Fanatics, Conmebol; not Signal, BitMart or Wedbush): https://www.crypto.com/en/prediction/partners
- [H wf] Clear Street: https://clearstreet.io/news/press-releases/clear-street-kalshi (2026-05-01); https://clearstreet.io/legal/clear-street-fcm; https://clearstreet.io/legal/regulatory-disclosures; https://clearstreet.io/ ; sitemap https://www.clearstreet.io/sitemap.xml (the Kalshi release is the only prediction-market entry)
- [H wf] Apex Fintech Solutions: https://apexfintechsolutions.com/press-releases/apex-fintech-solutions-and-kalshi-power-new-era-of-prediction-markets-access/ (2026-08-13); .../unlocking-the-future-of-trading-apex-fintech-solutions-announces-seamless-turnkey-prediction-markets-integration/ (2026-02-03); .../tastytrade-launches-prediction-markets-giving-active-traders-a-direct-way-to-trade-real-world-market-events/ (2026-07-27); .../gemini-and-apex-fintech-solutions-collaborate-to-bring-geminis-regulated-crypto-prediction-markets-to-apexs-distribution-network/ (2026-08-24); https://apexfintechsolutions.com/blog/prediction-markets-13-faqs-from-wealth-management-ceos-and-ctos/ ; https://apexfintechsolutions.com/blog/prediction-markets-are-attracting-attention-first-movers-take-note/ ; sitemap https://apexfintechsolutions.com/sitemap.xml
- [H] Apex developer portal behind SSO: https://developer.apexclearing.com (HTTP redirect to an Okta login; not followed further)
- [H] Kalshi API docs index and full text: https://docs.kalshi.com/llms.txt , https://docs.kalshi.com/llms-full.txt (FCM-member endpoints); public status: https://api.elections.kalshi.com/trade-api/v2/exchange/status ; markets: https://api.elections.kalshi.com/trade-api/v2/markets?limit=1&status=open
- [H wf] Kalshi news: https://news.kalshi.com/p/tunica-biloxi-tribe-salttrade-derivatives-kalshi (2026-09-18); https://news.kalshi.com/p/kalshi-four-tribes-pokketrades-sovereign-edge-greenville-air-markets (2026-10-07); https://news.kalshi.com/p/public-kalshi-prediction-markets-ai-agents (2026-09-24; does not name Apex or any FCM)
- [H] Signal Markets sites: https://signalmarkets.com (HTML + JS bundle), https://signal.markets (HTML + JS bundle); DNS via 1.1.1.1
- [H wf] Plaee: https://plaee.com , https://plaee.io
- [H] BitMart US probes: https://www.bitmart.us (HTTP 530, Cloudflare 1016), DNS/MX for bitmart.us, https://www.bitmart.com/en-US, https://www.bitmart.com/sitemap.xml (index only)
- [M] Apple iTunes Search API: `https://itunes.apple.com/search?term=salttrade|salt%20trade|signal%20markets|bitmart%20us&entity=software&country=us&limit=5`
- [M/L] Third-party index (single source of the Signal Markets IB claim, NFA IDs, the Wedbush "CME & Small Exchange" line, the BitMart US/Plaee line): https://mickbransfield.com/cftc-regulated-pms/ . Its date line says "Current as of May 2026" but it contains entries to Oct 2026. Rows saved in the blog fixture. NFA IDs it gives (Wedbush 0086156, Clear Street 0525317, Apex Clearing 0476618, Signal Markets 0580098) are **unverified**: NFA BASIC could not be queried.
- [M] Sibling in-repo notes (not re-verified except where stated): `docs/research/venues/salttrade-derivatives-tunica-biloxi-tribe.md`, `draftkings-predictions.md`, `crypto-com-derivatives-north-america-cdna-north-american-derivatives-exchange-inc-ex-nadex-hedgestreet.md`, `cme-group-event-contracts.md`, `railbird-exchange-dkex-draftkings-owned-dcm.md`, `coinbase-prediction-markets.md`, `gemini-predictions.md`, `robinhood-prediction-markets.md`

---

## 13. Fixtures

| File | What it is |
|---|---|
| `kalshi_exchange_status_2026-10-19.json` | Real `GET https://api.elections.kalshi.com/trade-api/v2/exchange/status` response (667 bytes) for the pool behind Clear Street, Apex and SaltTrade |
| `kalshi_fcm_member_endpoints_from_llms_txt_2026-10-19.txt` | Lines from the Kalshi docs index that describe the FCM-member API tier (8.9 KB) |
| `primary_source_index_2026-10-19.json` | Dated, URL-keyed index of the first-party facts used above (8.4 KB); paraphrase plus short quotes, evidence file not an API response |
| `blog_rows_mickbransfield_2026-10-19.txt` | The blog rows that are the only source for the Signal Markets IB claim, NFA IDs and BitMart US/Plaee routing (2.3 KB) |

---

## 14. Not found

- Any public API, docs, SDK or WebSocket for Wedbush, Clear Street, Signal Markets, BitMart US (searched: company sites, sitemaps, press releases).
- Apex AscendOS prediction-markets API documentation (behind Okta SSO; "coming soon" per Apex's own blog).
- Fee schedules for Wedbush, Clear Street and Apex-as-FCM; any IB markup for Signal Markets or BitMart US.
- Any customer-facing ToS, state list, or automation rule for the six.
- Evidence that Clear Street has live Kalshi client flow, or that Wedbush clears Kalshi (neither claimed in a primary source I read).
- A verified NFA BASIC record for Signal Markets, LLC (NFA ID 0580098 per the blog), including its guarantor FCM.
- Whether BitMart US ever launched, and whether it routes to CDNA or ProphetX.
- Which entity runs `signalmarkets.com` and whether it is the same firm as the blog's "Signal Markets, LLC".
- Per-route volume/OI/TVL.

## 15. Open questions

- Do Clear Street or Wedbush appear in Kalshi's or CDNA's own list of FCM members (check the exchange rulebooks/member lists; the CDNA rulebook was covered in its own note)?
- Will Apex's Gemini Titan LOI become binding, giving Apex a second pool?
- Is `signalmarkets.com` a prototype for a CDNA IB, or an unrelated aggregator? Re-check in a few weeks for terms and disclosures naming the FCM.
- Does the Plaee "DPM exchange" (global) become an independent venue worth its own note? Not researched.

## 16. Embedded-instruction / suspicious content log

- `signalmarkets.com` HTML carries `<meta name="geo:summary">`, `<meta name="ai:summary">` and `<meta name="geo:entities">` tags under an HTML comment "GEO - Generative Engine Optimization". They are descriptive text aimed at AI crawlers (a one-sentence description of the site), not instructions; nothing was followed.
- `signalmarkets.com` bundle claims "CFTC-regulated exchange • Bank-grade security • $250,000 FDIC insured" while being a demo with mock data and "(c) 2024" footer. FDIC insurance does not apply to event-contract positions; treat as unreliable marketing copy (L), not evidence of registration.
- Apex footer boilerplate (event-contract risk warnings) was read as data. No instructions to agents were found on any page read.
- The blog (`mickbransfield.com`) mixes dated and undated claims and contains a typo ("turkey FCM infrastructure"); treated as a lead index only.
