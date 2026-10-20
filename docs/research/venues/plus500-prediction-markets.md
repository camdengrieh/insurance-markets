# Plus500 prediction markets - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~01:33-01:50 UTC). READ-ONLY: public page fetches, public PDFs, unauthenticated GETs to the JSON feed that Plus500's own marketing page calls (about 40 throttled GETs), and two comparison GETs to Kalshi's documented public market-data endpoint. One non-mutating `OPTIONS` request was sent to the feed to see allowed methods (answer: `405`, `allow: GET`). No account, wallet, key, signature, POST/PUT/DELETE, browser automation or money-moving PayBox tool was used. Two read-only PayBox discovery calls were made (section 6). Third-party text was treated as untrusted data. I found no instruction-like text aimed at AI agents.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Note on overlap: a sibling workflow already wrote `docs/research/venues/plus500-futures-us-event-contracts.md` on the same product (it was discovered under two names). I re-verified its main claims independently (liveness, feed shape, Kalshi price/volume identity, fees, ToS) and added new primary evidence (Plus500's own H1 2026 results, the Event Contracts Risk Disclosure naming the clearing membership, a 436-event provenance scan, a second event cross-check). The two notes agree on the verdict. Consolidate them in the registry; keep one venue row.

Fixtures (all <= 50 KB): `docs/research/fixtures/plus500-prediction-markets/` (section 12).

---

## 0. Bottom line

1. **Live (2026), but it is a retail broker front door to Kalshi, not a venue.** "Plus500 Futures" (Plus500US Financial Services LLC, CFTC-registered FCM, NFA ID 0001398) sells Kalshi-listed event contracts to US retail customers and clears them as a member of Kalshi's clearing house. Plus500's own risk disclosure says it "may clear 'Event Contracts' for its clients as a clearing member of a registered derivatives clearing organization ... including but not limited to Kalshi Klear LLC" (Combined Account Disclosures V.7 July 2026, H). Plus500's H1 2026 results (10 Aug 2026) say it launched a "CFTC-regulated B2C prediction markets offering in February 2026" and "sports event-based contracts in June 2026" (H).
2. **Same book as Kalshi, proven twice.** On 2026-10-19 the Plus500 feed and Kalshi's public API agreed to the cent on 6 of 6 markets across two unrelated events (Fed October decision; live Dallas vs Green Bay NFL game), and lifetime volume for non-live markets matched Kalshi's `volume_fp` to the contract (Fed "Hike 25bps": 4,094,053 vs 4,094,053.28). A provenance scan of 436 events in Plus500's catalog found 423 with Kalshi-branded image names and none with any other exchange tag (H data, M inference). **NOT an independent arbitrage leg.**
3. **No usable API.** No official developer docs, host, keys or onboarding exist. The only machine-readable source is an undocumented, unauthenticated, Cloudflare-fronted JSON feed that backs the marketing page (top-of-book only, no depth, no Kalshi ticker, no rules, no close times). The EULA forbids giving third parties access to the platform. Everything in the feed is available with depth and tickers from Kalshi's own API.
4. **Not reachable from a PayBox wallet.** USD cash in a KYC'd, US-only FCM account funded by Apple Pay, Google Pay, debit card or bank transfer. No chain, token, contract or wallet-signed order. PayBox plugin discovery for "plus500" returned nothing.
5. **adapter_priority = skip.** Duplicate liquidity, no API, ToS hostile to third-party access, extra $0.01/contract/side vs Kalshi direct. In the platform registry model it as an `execution_route` alias of Kalshi for US residents, never a second leg.

---

## 1. Is it still live? (2026)

| Evidence | Date | Tag |
|---|---|---|
| `https://us.plus500.com/en/prediction-markets` returns HTTP 200; title "Trade Live Prediction Markets \| Plus500"; promo "Trade $10, Get $20, Use code PLUSPM20"; the site nav has "Prediction Markets" under "Futures on:" | 2026-10-19 | H |
| Feed returns real quotes; NFL game "DAL Cowboys vs GB Packers" has `LiveEvent.IsLive = true` with a 71/72 vs 28/29 book; Fed-October book 86/87; response `last-modified` = request time | 2026-10-19 01:33-01:35 UTC | H |
| Plus500 H1 2026 results: "launched its CFTC-regulated B2C prediction markets offering in February 2026 and introduced sports event-based contracts in June 2026"; "scaling of the prediction markets offering" listed as a priority | 2026-08-10 | H (https://cdn.plus500.com/Media/Investors/Reports/Plus500_Interim_Results_1H2026.pdf) |
| Account Agreement V.10 (September 2026) has a dedicated "12. EVENT CONTRACTS" section and a Cleared Swaps Addendum pointing at the Kalshi rulebook | 2026-09 | H |
| About-us milestones: "Plus500 adds Prediction Markets to its U.S. trading platform, allowing customers to trade on global event outcomes"; "Plus500 becomes the clearing partner for FanDuel Prediction Markets (CME Group event contracts)" | 2026-10-19 | H (https://us.plus500.com/en/aboutus) |
| Press: launch 2026-02-03 (Finance Magnates via TradingView and MLQ); sports added ~2026-06-30 (Structured Retail Products) | 2026-02 / 2026-06 | M |

Verdict: **still_live = true.** Nothing found older than 6 months that is load-bearing, except the launch date (Feb 2026, ~8.5 months ago) which is corroborated by Plus500's own results.

---

## 2. Kind and market model

- **Kind (H):** retail futures broker front end and clearing member. "Plus500 Futures" is the US B2C brand of Plus500US Financial Services LLC (Itasca, IL), wholly owned by Plus500US Inc., part of LSE-listed Plus500 Ltd. H1 2026 results describe the B2C platforms as "Plus500 Futures" and "T4-Pro", and a B2B "Plus500 Cosmos" for Introducing Brokers (H). Plus500 also clears CME/FanDuel event contracts as a B2B service, but its retail prediction-markets feed shows only Kalshi-sourced events (below).
- **Contract model (H, Combined Account Disclosures V.7):** exchange-traded event contracts classed by the CFTC as cleared swaps. A Yes/No proposition where "the 'Yes' contract and 'No' contract are two separate Event Contracts each with a unique contract ID"; bids "between $0.01 and $0.99"; settlement value $1.00 to the winning side, nothing to the other; fully collateralised, no margin, not marked to market; positions cannot be transferred and are exited by offsetting.
- **Structure in the feed (H data):** Event (`EventId`, Plus500's own integer) -> Markets (`MarketId`), every market binary with `YesBid/YesAsk/NoBid/NoAsk` in **cents as floats** (e.g. 86.0000; sub-cent values occur, e.g. 0.7/0.8 on the "R-House, D-Senate" midterm market). Categorical events are sets of binary markets (Fed decision = 4 markets; midterms = 4; 2028 nominee events = up to 66). Scalar-like ladders are sets of binary strikes. Same shape as Kalshi `event_ticker` -> `ticker`.
- **Order book:** the CLOB lives at the exchange (Kalshi). Plus500 exposes only top of book plus `LatestTradeRate`, `ChangeInTradeRate`, `Volume` and `VolumeInDollars`. No depth, no sizes, no open interest. (H)
- **Tokenisation:** none. Positions are FCM account entries cleared at the DCO. Nothing on-chain.
- **IDs:** no Kalshi ticker is exposed. The only provenance marker is the image file name prefix, `kalshi_event_{EventId}.webp` / `kalshi_market_{MarketId}.webp` (the numbers are Plus500's own `EventId`/`MarketId`, e.g. `kalshi_event_33620`, `kalshi_market_10526740`, so they do not reveal Kalshi ids). Matching to Kalshi needs title + date matching (the Fed and NFL titles matched Kalshi's exactly). (H)

---

## 3. Chains and collateral

None on-chain. Collateral is USD cash in a Plus500 Futures account. Deposit methods: Google Pay, Apple Pay, debit cards, bank transfer; $10 minimum per transaction; prepaid and credit cards not accepted; deposits can show as "Funds in Transit" for up to three business days (https://us.plus500.com/en/feescharges, H). Withdrawal: first of each calendar month free, then 1.75% (min $1, max $150) (H). A third-party review says no crypto is required (M, NEXTPredict 2026-09-07).

---

## 4. Read API

**Official/public API: none found.** `exists = unofficial-only`.

Searched (H for the absence of anything I could find): `us.plus500.com` nav, legal index (`/en/support/termsandagreements`), fees, about pages; no developer link anywhere. Sibling note also found `api.plus500.com` 404 and no `docs/developers.plus500.com`. The EULA defines "System" as including "the API for the Plus500 software and system" (H), so an internal API exists, but nothing is published and its use by third parties is barred (section 9). I deliberately did not open the logged-in web app's bundle (`futures.plus500.com`, a login-gated SPA): that would be reverse engineering, which the EULA forbids and which is out of scope for read-only research.

**Undocumented marketing-page feed.** The page loads `https://cdn-main.plus500.com/1.0.0.138645/Resources/Scripts/prediction-markets.bundle.min.js`, whose config sets the host `https://sat.plus500.com` and these routes (read from the JS, H; the starred ones I called):

| Purpose | Request | Observed |
|---|---|---|
| Category tree* | `GET https://sat.plus500.com/prediction-markets/api/categories?minEventsPerSubCategory=2` | 200, 9.7 KB: `{Categories:[{Id,Name,SubCategories:[{Id,Name,IsAggregation}]}]}` |
| Event ids in a category* | `GET .../prediction-markets/api/categories/{id}/events?maxEvents=N` | 200 `{"EventIds":[...]}`; server returned at most 40 ids per category even with `maxEvents=100` |
| Event detail* | `GET .../prediction-markets/api/events/{eventId}` | 200 JSON, fields below |
| Batch event detail* | `GET .../prediction-markets/api/events?ids=1,2,3` | 200 `{"Events":[...]}`; 25 ids per call worked |
| Widget wrapper* | `GET .../tools/prediction-markets-events-widget/events/{id}?visibility=4` | 200 `{"html":"<marco-widget-pm-event ... api-url=.../prediction-markets/api/events ...>","script":...}` |
| Exists / category of event | `.../api/events/{id}/exists`, `.../api/events/{id}/category` | in JS only, not called |
| Search | `GET .../website-search/api/PredictionSearch?query={q}&take=100` | in JS only, not called |

Event fields (H): `EventId, Title, SubTitle, ImageUrl, VolumeInDollars, VolumeInDollarsFormatted, TopMarkets[], LiveEvent, CategoryHierarchy, IsSportEvent, IsMatch, IsValid`. Market fields (H): `MarketId, FullTitle, Title, YesBid, YesAsk, NoBid, NoAsk, LatestTradeRate, ChangeInTradeRate, VolumeInDollars, VolumeInDollarsFormatted, Volume, Status, ImageUrl`. Live sports add `LiveEvent{IsLive, StartDate, Type, Status, WidgetStatus, Details{Quarter, Clock, scores, team names}}`. Nulls mean no quote on that side. Ten of 436 sampled ids returned empty shells (`IsValid=false`, no title, no markets).

Caveats:
- `TopMarkets` is a subset (BTC event 50808 returned 1 market). No rules text, close time, ticker, depth, sizes, open interest, or pagination fields. (H)
- `VolumeInDollars` is mislabeled: it equals Kalshi's lifetime `volume_fp` (a contract count). `Volume` tracks Kalshi's 24h count loosely (23,263 vs 22,244 for Fed "H0"). For a live NFL game Plus500's number lagged Kalshi's by ~7% in the same minute (10.82M vs 11.57M), so volume here is cached or delayed (M).
- Auth: none. Rate limits: NOT FOUND (no rate-limit headers; `cache-control: no-store`, `server: cloudflare`, bot-management cookie set). The site's own widget polls an event every 3000 ms (`setInterval(..., 3e3)` in `prediction-markets-events-widget.min.js`, H) and the page grid refreshes every 15 minutes (`REFRESH_INTERVAL_MINUTES:15`, H). No WebSocket or SSE in the bundles I read; polling only.
- Legal status: undocumented, not offered as an API (section 9). Do not build on it.

---

## 5. Trade path

- **Programmatic: none documented.** Orders are entered in the Plus500 Futures web app (`https://futures.plus500.com/`, login required), the mobile apps, or "T4-Pro" (H1 2026 results). Access is by personal credentials ("Access Codes"). No order-signing scheme, API key flow, FIX or WebSocket entry is published for individual customers. (H for absence.)
- B2B/B2B2C: Plus500 offers "institutional-grade clearing, order routing and risk management infrastructure" to partners (CME/FanDuel, Topstep, Wealthsimple, Nelogica) and "Plus500 Cosmos" for Introducing Brokers (H1 2026 results, H). That is a commercial integration, not a public API, and not open to an individual aggregator.
- Order types, tick, minimum size, position limits for event contracts: NOT FOUND in Plus500 documents. Kalshi's own market object reports `price_level_structure: "linear_cent"` and `market_type: "binary"` (H, fixtures).
- Practical consequence: to trade these contracts programmatically use **Kalshi's own API** (see `docs/research/08-venues-polymarket-kalshi.md`), subject to Kalshi's eligibility. Kalshi's docs list FCM endpoints (subtraders, caps, blocked categories, position transfers; https://docs.kalshi.com/llms.txt, H), which fits Plus500 reaching Kalshi's book as an FCM clearing member; how Plus500 routes (internalise vs rest in Kalshi's book) is NOT FOUND, but identical quotes make internalisation unlikely (M).

---

## 6. PayBox reachability

**paybox_reachable = no.** No chain, token, contract or signed-order endpoint exists. Funding is fiat into a KYC'd, US-only FCM account. A PayBox EVM or Solana wallet cannot propose or sign anything that touches this venue. (H, section 3.)

Read-only PayBox checks on 2026-10-19: `discover_plugins("plus500")` returned an empty list; `discover_services("plus500 prediction markets")` first page returned only unrelated paid Polymarket data proxies (x402, not called, nothing paid). So no PayBox route to Plus500 exists.

---

## 7. Fees

- Plus500 commission: **$0.01 per contract per side** for prediction markets. Fees page row "Prediction Markets contract commission* 0.01", footnote "*Per side. Not including Exchange and NFA fees as applicable. NFA fees apply only to Futures contracts." (https://us.plus500.com/en/feescharges, H)
- Exchange fee: set by Kalshi and charged on top, but Plus500 does not publish the formula or say whether it passes Kalshi's schedule through unchanged: NOT FOUND. Kalshi's formula is in `docs/research/08-venues-polymarket-kalshi.md`.
- Zero fees for deposits, routing, inactivity, data, platform; withdrawal 1.75% after the first free one each month (H). The $0.89/$0.49 futures commissions and $10 liquidation fee on the same page apply to futures, not event contracts (M).
- Net effect for a scanner: the same contract costs a Plus500 customer ~1 cent per contract per side more than Kalshi direct (plus the same exchange fee). A cost, not an edge.

---

## 8. Resolution mechanism and dispute risk

Event contracts "are typically settled by cash payment based on the occurrence, non-occurrence or outcome of an event, as determined under the rules of the listing exchange and/or its clearinghouse" (Account Agreement V.10 s.12, H). Resolution is Kalshi's (single accountable DCM/DCO; rulebook `kalshi.com/regulatory/rulebook`, linked by Plus500; Kalshi resolution is covered by the Kalshi workflow, see doc 08). Plus500's disclosure adds "Source Agency Risk": outcomes depend on third-party source agencies' data. Added broker-layer risks written into Plus500's terms (H):
- Plus500 "may, in its sole discretion and without prior notice, condition, suspend or restrict your ability to view, quote, enter, withdraw, liquidate, or otherwise access or transact in any Contract".
- If the exchange or Plus500 halts trading "you may not be able to close out of your position ... This could result in any open position that you hold in the event contract to become worthless."
- Courts or regulators may force suspension or termination of sports and other event contracts before settlement; Plus500 may liquidate at then-available prices and is not liable. The disclosure calls out sports contracts as "currently the subject of various litigations".
- FCM risk: Plus500 outage or insolvency (CFTC Part 190 treatment) on top of Kalshi's.
Naming: the Account Agreement addendum says "Kalshi Clear LLC"; Plus500's Combined Account Disclosures and H1 2026 results say "Kalshi Klear LLC" (H, so "Clear" in the addendum looks like a typo).

---

## 9. Geo / ToS / automation

Quotes from Account Agreement V.10 (September 2026), EULA V.5 (July 2026) and Combined Account Disclosures V.7 (July 2026); H.

- **US only, geolocation enforced.** PFS "may employ geolocation technology", may refuse specific contracts "for any location, jurisdiction, IP range, or device", and customers "shall not circumvent ... through the use of VPNs, proxies, anonymization services, or other technical means" (Acct Agmt s.12). "Eligibility to trade event contracts vary by jurisdiction, residence, physical location, and customer type and may change without notice" (Disclosures). Page footer: "Sports predictions availability varies by location." A third-party review says "all 50 states" while at least 16 states had taken legal or regulatory action as of 2026-09-04 (M, NEXTPredict); no state list from Plus500 (NOT FOUND). Non-US availability of a Plus500 prediction-markets product: NOT FOUND; every Plus500 source says "U.S." (the global `www.plus500.com` returns 403 to curl and WebFetch, and search budget was exhausted, so I could not check other jurisdictions' sites).
- **Insider ban:** customers may not trade with material non-public information or if barred by employment or a sports body's rules (s.12).
- **Automation:** no clause explicitly bans or permits bots, scripts or algorithmic trading (searched "API", "automat", "algorithm", "bot", "script" in all three documents). But: EULA s.1.1(iii) prohibits you from "sublicens[ing], distribut[ing] ... disclos[ing], or provid[ing] access to the System or the Plus500 App to any third party"; Account Agreement says the customer "shall not resell or permit access to any Platform to others and agrees not to copy any materials appearing on any Platform for resale to others". A hosted multi-user aggregator or an agent trading other people's money on one login would breach these. EULA s.7 binds users to third-party data providers' data policies (no redistribution). The Account Agreement does allow a customer to appoint a third-party manager for discretionary accounts, but that is a regulated managed-account arrangement, not an API.
- **Scraping the marketing feed:** not addressed in the documents I read (website terms of use not retrieved: NOT FOUND). `us.plus500.com/robots.txt` and `www.plus500.com/robots.txt` (both HTTP 200) disallow `/api`, `/*api/LiveData/*`, and `/*?*` for all agents; `https://sat.plus500.com/robots.txt` returns 403 (Cloudflare), so the feed host's policy is unknown. The category route used here has a query string, which the main-site robots would disallow. Treat the feed as off-limits for production.

---

## 10. Liquidity

- **Plus500's own prediction-market volume, open interest, or customer count: NOT FOUND.** Plus500's H1 2026 results give only group figures: revenue $462.9m, ~197k active customers (company-wide, mostly OTC CFDs), and "non-OTC" (futures + prediction markets + share dealing) revenue growth of c.30% YoY to about 15% of group revenue, "on track to generate annualised revenue of approximately $140m in FY 2026" (H, 10 Aug 2026). Prediction markets are not broken out. Management says customer acquisition for prediction markets is "expected to build progressively", i.e. early-stage.
- **The volumes displayed on the page are Kalshi's.** Sum of `VolumeInDollars` over 436 sampled events is ~$1.67bn (contract-count basis), dominated by long-dated markets such as "2028 Democratic presidential nominee" (242.2M), "2027 Pro Football Champion" (185.6M), "Pro Baseball Champion" (130.6M). This is Kalshi lifetime volume, not Plus500 flow; do not count it as Plus500 liquidity (fixture `plus500-scan-summary.json`). (H data, M meaning)
- Kalshi's own book depth is available from Kalshi's API (`yes_bid_size_fp`, `open_interest_fp` in the Kalshi market object); Plus500's feed has none of these.

---

## 11. Event-category overlap and shared liquidity

- **Shares liquidity with Kalshi: yes, completely** (section 0.2). Therefore **not an independent arbitrage leg**; it adds nothing to a scanner that already ingests Kalshi.
- Category tree (H, `plus500-categories.json`) mirrors Kalshi's: Sports (baseball, basketball, cricket, darts, esports, football, golf, hockey, MMA, motorsport, soccer, tennis, plus "Live"), Politics, Elections, Economics (Fed, CPI/GDP/jobs, oil), Financials, Crypto (BTC, ETH, SOL, XRP, DOGE, BNB, hourly), Commodities, Climate and Weather, Entertainment, Mentions, Science and Technology, Companies.
- Sample mix (436 events; 40 returned per category, so a sample, not the catalog): Sports 59, Elections 40, Economics 40, Entertainment 40, Crypto 40, Financials 39, Politics 39, Climate/Weather 38, Mentions 38, Sci/Tech 35, Commodities 17, Companies 1, 10 empty. 41 events had a live sports game in progress.
- Overlap with other venues (Polymarket, Limitless, Opinion, XO, etc.) is exactly Kalshi's overlap (sports, US politics, Fed/macro, crypto price ladders). Use the Kalshi adapter plus cross-venue rule checks (docs 08, 17).
- CME note: Plus500 clears FanDuel Prediction Markets (CME Group event contracts) as a B2B service (H, H1 2026 results), but the retail feed I scanned shows no CME-sourced events. Do not model FanDuel or Plus500 as separate CME legs (see `docs/research/venues/cme-group-event-contracts.md`).
- Distribution note: Plus500 is another US-retail on-ramp to Kalshi liquidity (and Plus500 also provides clearing for Wealthsimple in Canada, announced after 30 June 2026, H). Useful only if a user's account is at Plus500; legal execution route for the Kalshi leg for a US resident, but manual only.

---

## 12. Fixtures

All captured 2026-10-19 with `User-Agent: insurance-markets-research/0.1`, no cookies kept. Directory: `docs/research/fixtures/plus500-prediction-markets/`.

| File | Source | Captured (UTC) |
|---|---|---|
| `plus500-categories.json` | raw categories tree (9.7 KB) | ~01:33 |
| `plus500-category-events-crypto_btc.json` | raw event ids for `crypto_btc` | ~01:34 |
| `plus500-event-33620-fed-oct-2026.json` | raw single event detail, Fed Oct 2026 | ~01:33 |
| `plus500-events-batch-nfl-btc-midterms.json` | raw batch: live NFL game 423796, BTC 50808, midterms 81440 | ~01:35 |
| `kalshi-compare-KXFEDDECISION-26OCT.json` | Kalshi public API, trimmed fields | ~01:33 |
| `kalshi-compare-KXNFLGAME-26OCT18DALGB.json` | Kalshi public API, trimmed fields | ~01:35 |
| `plus500-scan-summary.json` | counts and top-10 from the 436-event scan (no raw dump) | ~01:40 |

Side-by-side (cents vs dollars, fetched within ~2 minutes):

| Market | Plus500 YesBid / YesAsk | Kalshi yes_bid / yes_ask |
|---|---|---|
| Fed maintains (H0) | 86 / 87 | 0.86 / 0.87 |
| Hike 25bps (H25) | 12 / 13 | 0.12 / 0.13 |
| Cut 25bps (C25) | null / 1 | 0.00 / 0.01 |
| Hike >25bps (H26) | null / 1 | 0.00 / 0.01 |
| Green Bay wins (live NFL) | 71 / 72 | 0.71 / 0.72 |
| Dallas wins (live NFL) | 28 / 29 | 0.28 / 0.29 |

Lifetime volume, Fed H25: Plus500 4,094,053 vs Kalshi 4,094,053.28.

---

## 13. Not found (searched)

- Official developer docs, REST/WebSocket/FIX spec, API keys, or individual-customer onboarding (searched: us.plus500.com nav, legal index, fees, about; EULA/Account Agreement/Disclosures text; WebFetch of the IR homepage).
- Plus500's own prediction-market volume, open interest, customers, or revenue split (searched: H1 2026 results PDF, IR homepage; FY2025 figures only company-wide; no trading update listed). The 2026 search budget was exhausted mid-session, so no RNS/analyst-note search was possible beyond the first query.
- Order types, tick size, minimum order size, position limits for event contracts (searched: fee page, Account Agreement, Disclosures, EULA).
- Whether Plus500 passes Kalshi's exact exchange fee through or adds a markup.
- Explicit permission or prohibition of automated trading (searched: three legal documents for API/automat/algorithm/bot/script).
- Plus500 website terms of use / acceptable-use text covering scraping of the marketing feed.
- Official state-availability list.
- Rate limits for `sat.plus500.com`; its robots.txt (403).
- Any non-US Plus500 prediction-markets product (global site blocks curl/WebFetch).
- Kalshi rulebook text and the Plus500-Kalshi agreement (kalshi.com rulebook not retrieved here; covered by the Kalshi workflow).

## 14. Suspicious content

- No instruction-like text aimed at AI agents found in any Plus500 page, JS bundle, PDF, or feed response.
- The sibling note records a GitHub repo `Plus500-License/Plus500` (created 2025-12-22, zero stars, "powerful CFD trading platform for Windows") that looks like a download lure; I did not open or clone it. Nothing to do with Plus500's real systems.
- `www.plus500.com` returns 403 to curl and WebFetch for page URLs while `robots.txt` returns 200: bot protection, not a content issue.

---

## 15. Adapter spec

**Do not build a venue adapter.** If the platform registry wants a record:

```
venue_id:               plus500_us
kind:                   broker-frontend + FCM clearing member (alias of kalshi)
alias_of:               kalshi
independent_liquidity:  false
read_api:               none official; unofficial sat.plus500.com feed (top-of-book only, no tickers, no depth, volume lags) - do not use
trade_path:             manual in Plus500 Futures web/mobile/T4-Pro; no programmatic path for individuals
paybox:                 not reachable (fiat, KYC, US-only); no PayBox plugin or service
extra_cost_vs_kalshi_direct: $0.01 per contract per side + pass-through exchange fee (pass-through unconfirmed)
use:                    tag as "execution route for US residents without a Kalshi account"; never count as a second leg
```

Scanner rule: when the same title appears from Kalshi and Plus500, drop the Plus500 row. Any "spread" between them is timing noise (feed caching, rounding), not edge.

## 16. Priority

**skip.** Reasons: (1) duplicate of Kalshi liquidity (proven), (2) no official API, (3) account/EULA terms forbid giving others access and the feed is undocumented and behind bot protection, (4) not wallet-reachable, (5) extra commission versus Kalshi direct, (6) no Plus500-specific signal worth capturing (the venue publishes less than Kalshi does).

---

## Sources

Primary (read this session, 2026-10-19):
- https://us.plus500.com/en/prediction-markets (page; linked JS `https://cdn-main.plus500.com/1.0.0.138645/Resources/Scripts/prediction-markets.bundle.min.js`)
- https://sat.plus500.com/tools/js/prediction-markets-events-widget.min.js (3000 ms poller)
- Unauthenticated GETs: `https://sat.plus500.com/prediction-markets/api/categories`, `.../categories/{id}/events`, `.../events/{id}`, `.../events?ids=`, `https://sat.plus500.com/tools/prediction-markets-events-widget/events/{id}?visibility=4`
- https://us.plus500.com/en/feescharges
- https://us.plus500.com/en/aboutus
- https://us.plus500.com/en/support/termsandagreements (index of legal PDFs)
- Account Agreement V.10 September 2026: https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1790084354/7/UserAgreement.pdf
- End-User License Agreement V.5 July 2026: https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1784816616/3/EndUserLicenseAgreement.pdf
- Combined Account Disclosures V.7 July 2026 (Event Contracts Risk Disclosure): https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1784816752/5/CombinedAccountDisclosures.pdf
- Plus500 H1 2026 Interim Results (10 Aug 2026): https://cdn.plus500.com/Media/Investors/Reports/Plus500_Interim_Results_1H2026.pdf
- https://investors.plus500.com/ (homepage; FY2025 key metrics)
- https://us.plus500.com/robots.txt and https://www.plus500.com/robots.txt
- https://external-api.kalshi.com/trade-api/v2/markets?event_ticker=KXFEDDECISION-26OCT&limit=10 and `...event_ticker=KXNFLGAME-26OCT18DALGB&limit=10` (Kalshi public market data, comparison only)
- https://docs.kalshi.com/llms.txt (FCM endpoint list)
- PayBox `discover_plugins` / `discover_services` (read-only discovery, no results for Plus500)
- Repo: `docs/research/08-venues-polymarket-kalshi.md`, `docs/research/venues/plus500-futures-us-event-contracts.md`, `docs/research/venues/cme-group-event-contracts.md`

Secondary (M):
- https://www.financemagnates.com/forex/plus500-launches-predictions-markets-in-the-us/ (2026-02-03; Kalshi supplies products; "member of Kalshi's clearing unit")
- https://mlq.ai/news/plus500-launches-us-prediction-markets-offering-through-kalshi-partnership/ (2026-02-03; cleared by Kalshi Klear LLC)
- https://www.structuredretailproducts.com/insights/83939/plus500-enters-sports-prediction-contracts-market-in-us (2026-06-30; paywalled)
- https://nextpredict.io/platforms/plus500/ (published 2026-09-07; fees, "all 50 states" vs 16+ state actions as of 2026-09-04)
- Search result titles only (one WebSearch query): tradingview, liquidityfinder, research-tree (403 on fetch), sharecast (403), tribuna (403), coindesk 2026-07-14 industry volume, blockonomi.
