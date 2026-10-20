# Plus500 Futures (US event contracts) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~01:20-01:30 UTC). READ-ONLY: public page fetches, public PDFs, unauthenticated GETs to the JSON feed that Plus500's own marketing page calls, and one comparison GET to Kalshi's documented public API. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party text was treated as untrusted data; nothing in it was followed. I found no embedded instructions aimed at AI agents.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source (including WebFetch small-model summaries of news pages) or my inference from first-hand data; **L** = weak or stale.

Research limits: the shared WebSearch budget ran out after one query, so I could not search for Plus500 RNS / half-year results / state lists. Gaps caused by that are listed as NOT FOUND in section 13.

Fixtures (<= 50 KB each): `docs/research/fixtures/plus500-futures-us-event-contracts/` (section 12).

---

## 0. Bottom line

1. **Live, but it is a retail broker front door to Kalshi, not a venue.** Plus500US Financial Services LLC (a CFTC-registered FCM and NFA member) sells Kalshi-listed event contracts to US retail customers from its own app. Its account agreement says event contracts settle "under the rules of the listing exchange and/or its clearinghouse" and points customers to the rulebook of Kalshi Clear LLC. (H)
2. **Same liquidity as Kalshi, to the cent.** On 2026-10-19 the Plus500 feed for "Fed decision in Oct 2026?" showed 86/87, 12/13, null/1, null/1 (bid/ask in cents); Kalshi's public API for `KXFEDDECISION-26OCT` showed 0.86/0.87, 0.12/0.13, 0.00/0.01, 0.00/0.01 in the same minute. Plus500's "VolumeInDollars" is Kalshi's exchange-wide lifetime contract volume, not Plus500's own. So it is **NOT an independent arbitrage leg**. (H for the data, M for the "one order book" architecture inference.)
3. **No usable API.** There is no documented public or customer API. The only machine-readable data is an undocumented Cloudflare-fronted JSON feed behind Plus500's marketing page (top-of-book only, no depth), and the license terms forbid giving third parties access to the platform. Everything in it is already available, better and with depth, from Kalshi's own API. (H)
4. **Not reachable from a PayBox wallet.** It is a fiat, KYC'd, US-only brokerage account (cards, Apple/Google Pay, bank transfer). No on-chain deposits, no wallet-signed orders. (H)
5. **adapter_priority = skip.** Duplicate liquidity, no API, ToS hostile to automation and redistribution. In the platform registry, model it as an *execution route alias of Kalshi* for US persons (same contracts, +$0.01/contract commission), not as a venue adapter.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://us.plus500.com/en/prediction-markets` (fetched 2026-10-19, HTTP 200) | Title "Trade Live Prediction Markets"; meta "Predict in real-time about topics that matter most with a simple Yes or No"; promo banner "Trade $10, Get $20, use code PLUSPM20"; footer "Sports predictions availability varies by location" | H |
| About-us milestone timeline (`https://us.plus500.com/en/aboutus`) | 2026 slide: "Plus500 adds Prediction Markets to its U.S. trading platform, allowing customers to trade on global event outcomes." Prior-year slide: "Plus500 becomes the clearing partner for FanDuel Prediction Markets (CME Group event contracts)." | H |
| Live data right now | Event 423796 "DAL Cowboys vs GB Packers" showed `LiveEvent.IsLive=true`, 2nd quarter, 10-0, with a 74/75 vs 25/26 book at fetch time (fixture) | H |
| Account Agreement V.10 "September 2026" (PDF timestamp path 1790084354 = 2026-09-22) | Has a dedicated Section 12 "EVENT CONTRACTS" and a cleared-swaps addendum naming Kalshi Clear LLC | H |
| Launch dates | Launch of the Kalshi-based offering 2026-02-03; sports (NFL/NBA/MLB) added 2026-06-29 (TradeInformer); both from news pages | M |

Verdict: **still_live = true.** Stale flag: the Dec 2025 CME/FanDuel clearing item is ~10 months old but historical only.

---

## 2. Kind and market model

- **Kind (H):** retail futures broker / frontend ("Plus500 Futures", brand of Plus500US Financial Services LLC, Itasca IL, NFA ID 0001398, wholly owned by Plus500US Inc., subsidiary of LSE-listed Plus500 Ltd). Source: account agreement header and about-us page.
- **Contract model (H, account agreement s.12):** exchange-traded event contracts "typically presented as a 'Yes/No' trade", fully collateralised up front (orders rejected if funds are insufficient), cash-settled, legally "swaps" under the Commodity Exchange Act.
- **Structure (H data, M inference):** Event (Plus500 `EventId`) -> Markets (`MarketId`), each binary Yes/No, with Yes bid/ask and No bid/ask in **cents** (0-100 floats). Categorical events are sets of binary markets (e.g. the Fed event has four markets: maintain, hike 25, cut 25, hike >25). Same shape as Kalshi's `event_ticker` -> `ticker`. Scalar-style ladders ("above $200k") are likewise sets of binary strikes.
- **No outcome tokenisation:** positions are FCM account entries cleared at the DCO, not tokens. No on-chain representation.
- **Order book:** a central limit order book exists at the underlying exchange (Kalshi). The Plus500 feed exposes only top-of-book (`YesBid/YesAsk/NoBid/NoAsk`), `LatestTradeRate`, `ChangeInTradeRate`, two volume numbers. No depth. (H)
- **IDs:** Plus500's `EventId`/`MarketId` are its own integers (e.g. event 33620, market 13341). **No Kalshi ticker is exposed anywhere in the feed.** The only provenance hints are image file names such as `kalshi_event_33620.webp` and `kalshi_market_10526740.webp`. Matching to Kalshi therefore needs title/rules text matching. (H)

---

## 3. Chains and collateral

None on-chain. Collateral is USD cash in a Plus500 Futures brokerage account. Deposit methods listed: Google Pay, Apple Pay, debit cards, bank transfer; minimum $10 per transaction; prepaid and credit cards not accepted (https://us.plus500.com/en/feescharges, H). Withdrawals: first of each calendar month free, then 1.75% (min $1, max $150). Settlement of deposits can take up to three business days ("Funds in Transit"). (H)

---

## 4. Read API

**Official/public API: none found.** (H for absence of docs I could find)

Searched: `us.plus500.com` nav and terms pages (no developer link), probes of `api.plus500.com` (HTTP 404), `docs.plus500.com`, `developers.plus500.com`, `developer.plus500.com` (do not resolve), GitHub repo search "plus500" (only 2014-2021 unofficial repos, one of which looks like a malware lure, see section 14). The EULA defines "System" as "the Plus500 software and system (including the API for the Plus500 software and system)" (https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1784816616/3/EndUserLicenseAgreement.pdf, V.5 July 2026, H), so an API exists in some form, but no documentation, host or onboarding path is published. (H for the wording, NOT FOUND for anything else)

**Undocumented marketing-page feed (unofficial-only).** The public page `https://us.plus500.com/en/prediction-markets` loads `prediction-markets.bundle.min.js`, which sets `PM_HOST = 'https://sat.plus500.com'` and calls (read straight from the public JS, H):

| Purpose | Request | Observed |
|---|---|---|
| Category tree | `GET https://sat.plus500.com/prediction-markets/api/categories?minEventsPerSubCategory=2` | 200 JSON, 9.7 KB: `{Categories:[{Id,Name,SubCategories:[{Id,Name,IsAggregation}]}]}` (H) |
| Event ids in a category | `GET .../prediction-markets/api/categories/{id}/events?maxEvents=N` | 200 `{"EventIds":[...]}` (H); category ids include `economics_fed`, `crypto_btc`, `elections_senate`, `live`, `sports_*` |
| Event detail | `GET .../prediction-markets/api/events/{eventId}` | 200 JSON (H), fields below |
| Batch event detail | `GET .../prediction-markets/api/events?ids=1,2,3` | 200 `{"Events":[...]}` (H) |
| Exists / category of event | `.../api/events/{id}/exists`, `.../api/events/{id}/category` | read from JS only, not called |
| Search | `GET .../website-search/api/PredictionSearch?query={q}&take=100` | read from JS only, not called |
| Widget wrapper | `GET .../tools/prediction-markets-events-widget/events/{id}?visibility=4` | 200 `{"html":"<marco-widget-pm-event ...>","script":...}` (H) |

Event fields (H): `EventId, Title, SubTitle, ImageUrl, VolumeInDollars, VolumeInDollarsFormatted, TopMarkets[], LiveEvent, CategoryHierarchy{Id,Name,SubCategoryIds[]}, IsSportEvent, IsMatch, IsValid`. Market fields (H): `MarketId, FullTitle, Title, YesBid, YesAsk, NoBid, NoAsk, LatestTradeRate, ChangeInTradeRate, VolumeInDollars, VolumeInDollarsFormatted, Volume, Status ("Active"), ImageUrl`. `LiveEvent` for sports carries `IsLive, StartDate, Type, Status, WidgetStatus, Details{Quarter, Clock, HomeScore, AwayScore, team names}`. Prices are cents as floats; nulls mean no quote on that side.

Caveats on the feed:
- `TopMarkets` is a **subset** (BTC event 50808 returned 1 market; the widget uses `max-markets="2"`). No resolution rules, no close time, no ticker, no pagination fields. (H)
- Semantics of the two volume fields are inferred (M): `VolumeInDollars` equals Kalshi's lifetime `volume_fp` (e.g. H26: 988,241 vs 988,241.80; H0: 5,684,848 vs 5,685,674.93 two minutes later), and `Volume` tracks Kalshi's `volume_24h_fp` (22,539 vs 22,291.71). The "InDollars" label is therefore misleading: these are contract counts.
- Auth: none. Rate limits: NOT FOUND; responses carried no rate-limit headers, `cache-control: no-store`, Cloudflare in front (`set-cookie: __cf_bm`, which I discarded). The site's own client polls an event every 3 s (widget JS) and refreshes the page grid every 15 min (`REFRESH_INTERVAL_MINUTES:15`). `https://sat.plus500.com/robots.txt` returned a Cloudflare "Attention Required" page to curl; I did not try to get around it. (H)
- WebSocket / streaming: NOT FOUND (the page uses HTTP polling).
- Legal status: undocumented, not offered as an API, subject to the license restrictions in section 9. Treat as "unofficial-only" and do not build on it.

---

## 5. Trade path

- **Programmatic: none documented.** Orders are placed in Plus500's proprietary web app (`https://futures.plus500.com/`, login required) or its iOS/Android apps, with a username/password "Access Codes" model. Account Agreement s.21 makes the customer responsible for all orders entered with the Access Codes. (H)
- Auth/signing scheme: not applicable (no public API; no wallet signing).
- Order types / tick / min size: NOT FOUND in primary sources. A third-party review says unfilled orders can rest until filled, cancelled or resolved and partial fills occur (M, commodity.com). The same review mentions "T4 Mobile / T4 WebTrader", which does not match the Plus500 app shell I fetched (L, unverified).
- Practical consequence: to trade these contracts programmatically, use **Kalshi's own API** (see `docs/research/08-venues-polymarket-kalshi.md`), subject to Kalshi's eligibility, not Plus500.

---

## 6. PayBox reachability

**paybox_reachable = no.** There is no chain, no token, no contract and no signed-order endpoint. Funding is fiat via card/Apple Pay/Google Pay/bank transfer into a KYC'd US brokerage account. Nothing a PayBox EVM or Solana wallet can propose or sign touches this venue. (H, section 3.)

---

## 7. Fees

- Plus500 commission: **$0.01 per contract per side** for prediction markets (https://us.plus500.com/en/feescharges: "Prediction Markets contract commission* 0.01 ... *Per side. Not including Exchange and NFA fees as applicable. NFA fees apply only to Futures contracts."). (H)
- Exchange fee: on top, set by the listing exchange (Kalshi). The page does not state the formula. Kalshi's fee formula is in `docs/research/08-venues-polymarket-kalshi.md` (quadratic, taker about 0.07 x C x P x (1-P); coefficients M there). A third-party review also says commission is "1 cent per contract, exchange fees may apply" (M, commodity.com). Whether Plus500 passes Kalshi's exact fee through or adds a markup: NOT FOUND.
- Other: 0 fees for deposits, routing, inactivity, data, platform; 1.75% withdrawal fee after the first free one per month (H). The $10 "liquidation fee per contract" and $0.89/$0.49 futures commissions on the same page apply to futures, not (evidently) to event contracts (M).
- Net effect for an arbitrage scanner: the same contract costs Plus500 customers about 1 cent per contract per side more than Kalshi direct. It is a cost, not an edge.

---

## 8. Resolution mechanism and dispute risk

Event contracts "are typically settled by cash payment based on the occurrence, non-occurrence or outcome of an event, as determined under the rules of the listing exchange and/or its clearinghouse" (Account Agreement s.12, H). Resolution is therefore **Kalshi's** (single accountable DCM, rulebook at `kalshi.com/regulatory/rulebook`, which I could not retrieve; see doc 08). Added broker-layer risks written into the agreement (H):
- Plus500 "may, in its sole discretion and without prior notice, condition, suspend or restrict your ability to view, quote, enter, withdraw, liquidate, or otherwise access or transact in any Contract".
- If an exchange or Plus500 halts trading, "you may not be able to close out of your position ... This could result in any open position that you hold in the event contract to become worthless."
- Regulators or courts may force suspension/termination of sports and other event contracts before settlement; Plus500 may liquidate at then-available prices; no liability for losses.
Naming flag: the agreement says "Kalshi Clear LLC"; press coverage says "Kalshi Klear LLC" (M). Not resolved which is the legal spelling.

---

## 9. Geo / ToS / automation

All quotes from the Account Agreement V.10 (September 2026) and EULA V.5 (July 2026), H unless noted.

- **US only, geolocation enforced.** Plus500 "may employ geolocation technology", may refuse specific contracts "for any location jurisdiction IP range or device", and customers "shall not circumvent ... through the use of VPNs, proxies, anonymization services, or other technical means" (Acct Agmt s.12). Page footnote: "Sports predictions availability varies by location." A third party says "all 50 states" while 16+ states had taken legal or regulatory action as of 2026-09-04 (M, NEXTPredict); no state list from Plus500 (NOT FOUND).
- **Insider/professional trading ban:** customers may not trade if they hold material non-public information or are barred by an employment contract or sports-governing-body rule (s.12).
- **Automation:** no clause bans or permits bots explicitly (NOT FOUND in the two documents; I searched for automated/algorithmic/bot/API/script). But: EULA s.1.1(iii) prohibits you from "sublicens[ing], distribut[ing], ... disclos[ing], or provid[ing] access to the System or the Plus500 App to any third party", and Account Agreement s.21 says the customer "shall not resell or permit access to any Platform to others". Access Codes are personal. A hosted multi-user aggregator or an agent acting for other people on one login would breach these.
- **Data redistribution:** EULA s.7 binds users to third-party data providers' data policies and forbids misuse of data feeds.
- Scraping the `sat.plus500.com` feed is not addressed explicitly (NOT FOUND); it is an undocumented endpoint behind a bot-protection layer.
- `https://www.plus500.com/robots.txt` disallows `/api`, `/*api/LiveData/*`, `/*?*` for all agents (H). Note `www.plus500.com` itself returned HTTP 403 to curl and WebFetch; `us.plus500.com` is the working US site.

---

## 10. Liquidity

- **Plus500's own prediction-market volume/OI/customers: NOT FOUND.** The IR homepage (`investors.plus500.com`, fetched 2026-10-19) shows FY2025 company-wide figures only (242,440 active customers, $792.4m revenue) and no prediction-market numbers (H). Half-year results were not retrievable (search budget exhausted).
- Displayed numbers are **Kalshi's**, not Plus500's: lifetime volumes shown on 2026-10-19 include $12.4m for "Fed decision in Oct 2026?" (event 33620), $25.3m for DAL vs GB (event 423796), $42.1m for "2026 Midterms: Congress Balance of Power?" (event 81440), $12.0m for "Bitcoin above $200k by 2027?" (event 50808) (H as displayed, M as to meaning). Do not count them as Plus500 liquidity.
- Whether Plus500 customer orders rest in Kalshi's book (so they add to Kalshi depth) or are internalised: NOT FOUND. The identical quotes make internalisation unlikely (M).

---

## 11. Event-category overlap and shared liquidity

- **Shares liquidity with Kalshi: yes, completely** (evidence in section 0.2 and fixtures). It is therefore **not an independent arbitrage leg** and adds nothing to a scanner that already ingests Kalshi's feed.
- Category tree mirrors Kalshi's (H, `sat-categories.json`): Sports (baseball, basketball, cricket, darts, esports, football, golf, hockey, MMA, motorsport, soccer, tennis), Politics, Elections (2028, governor, house, senate, combos), Economics (Fed, GDP, inflation, jobs, oil), Financials, Crypto (BTC, ETH, SOL, XRP, DOGE, BNB, hourly), Commodities, Climate and Weather, Entertainment, Mentions, Science and Technology, Companies.
- Overlap with other venues (Polymarket, Limitless, XO, etc.) is exactly Kalshi's overlap; use the Kalshi adapter and cross-venue rule checks from docs 08/17 instead.
- Distribution note for the plan: Plus500 is another US-retail on-ramp to Kalshi liquidity, useful only if a user's account is Plus500 rather than Kalshi. For a US-resident user who cannot use Polymarket global, it is a legal execution route for the Kalshi leg, but not programmatic.

---

## 12. Fixtures

All captured 2026-10-19 with `User-Agent: insurance-markets-research/0.1`, no cookies kept.

| File | Source | Size |
|---|---|---|
| `sat-categories.json` | categories tree | ~14 KB (pretty-printed) |
| `sat-category-events-economics_fed.json` | event ids for `economics_fed` | <1 KB |
| `sat-event-33620-fed-oct-2026.json` | single event detail (Fed Oct 2026) | ~2 KB |
| `sat-widget-wrapper-33620.json` | widget wrapper (shows the polling `api-url`) | <1 KB |
| `sat-events-batch-btc-midterms.json` | batch detail: crypto and midterms events | ~4 KB |
| `sat-events-batch-live-nfl-trimmed.json` | batch detail, live NFL game with `LiveEvent` (first event only, trimmed) | ~2 KB |
| `kalshi-compare-KXFEDDECISION-26OCT.json` | trimmed Kalshi public API response for the same event, for the side-by-side | ~3 KB |

Side-by-side (cents vs dollars, fetched within ~2 minutes):

| Market | Plus500 YesBid/YesAsk | Kalshi yes_bid/yes_ask |
|---|---|---|
| Fed maintains rate (H0) | 86 / 87 | 0.86 / 0.87 |
| Hike 25bps (H25) | 12 / 13 | 0.12 / 0.13 |
| Cut 25bps (C25) | null / 1 | 0.00 / 0.01 |
| Hike >25bps (H26) | null / 1 | 0.00 / 0.01 |

---

## 13. Not found (searched)

- Official developer docs, REST/WebSocket/FIX spec, API keys or onboarding for retail or individual customers (searched: us.plus500.com nav and legal pages, api/docs/developers hosts, GitHub).
- Order types, tick size, minimum order size, position limits specific to event contracts (searched: fee page, account agreement, EULA).
- Any statement of explicit permission or prohibition of automated trading (searched: agreement text for automated/algorithm/API/bot/script).
- Plus500's own prediction-market volume, open interest, customer count (searched: IR homepage; RNS and H1 2026 results not reachable because the search budget was exhausted).
- Official state-availability list (searched: product page, fees page, terms page).
- Kalshi Rulebook and Plus500-Kalshi agreement text (kalshi.com blocked in the earlier workflow; not retried).
- Rate limits for `sat.plus500.com` (searched: response headers, page JS).

## 14. Suspicious content

- No instruction-like text aimed at AI agents found in any Plus500 page, JS, PDF or feed response.
- GitHub search for "plus500" returned `Plus500-License/Plus500` (created/pushed 2025-12-22, zero stars) described as "a powerful CFD trading platform for Windows"; it looks like a download lure. Not opened, not cloned. It has nothing to do with Plus500's real systems.
- Unofficial repos `aaronfc/plus500api` (2014), `deemount/plus500` (2021) are stale CFD scraping wrappers; ignored.

---

## 15. Adapter spec

**Do not build a venue adapter.** If the platform registry wants to know about it:

```
venue_id:        plus500_us
kind:            broker-frontend (alias of kalshi)
alias_of:        kalshi
independent_liquidity: false
read_api:        none official; unofficial sat.plus500.com feed (top-of-book only, no tickers) - do not use
trade_path:      manual in Plus500 app only; no programmatic path
paybox:          not reachable (fiat, KYC, US-only)
extra_cost_vs_kalshi_direct: $0.01 per contract per side (commission) + pass-through exchange fee
use:             tag as "execution route for US residents without a Kalshi account"; never count as a second leg
```

Cross-venue scanner rule: when the same title appears from Kalshi and Plus500, drop the Plus500 row; a positive "spread" between them is stale-data noise, not edge.

## 16. Priority

**skip.** Reasons: (1) duplicate of Kalshi liquidity, (2) no API, (3) account terms forbid giving others access to the platform, (4) not wallet-reachable, (5) extra commission versus Kalshi direct.

---

## Sources

Primary (read this session, 2026-10-19):
- https://us.plus500.com/en/prediction-markets (page, inline config, linked JS `https://cdn-main.plus500.com/1.0.0.138645/Resources/Scripts/prediction-markets.bundle.min.js`)
- https://sat.plus500.com/tools/js/prediction-markets-events-widget.min.js (polling interval, field names)
- https://sat.plus500.com/prediction-markets/api/categories, `.../categories/{id}/events`, `.../events/{id}`, `.../events?ids=`, `https://sat.plus500.com/tools/prediction-markets-events-widget/events/{id}?visibility=4` (unauthenticated GETs)
- https://us.plus500.com/en/feescharges
- https://us.plus500.com/en/aboutus
- https://us.plus500.com/en/support//termsandagreements (index of legal PDFs)
- Account Agreement V.10 September 2026: https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1790084354/7/UserAgreement.pdf (text extracted locally from the PDF)
- End-User License Agreement V.5 July 2026: https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1784816616/3/EndUserLicenseAgreement.pdf
- https://www.plus500.com/robots.txt
- https://investors.plus500.com/ (homepage)
- https://external-api.kalshi.com/trade-api/v2/markets?event_ticker=KXFEDDECISION-26OCT&limit=10 (Kalshi public market data, for comparison)
- `docs/research/08-venues-polymarket-kalshi.md` (Kalshi API, fees and resolution, earlier workflow)

Secondary (M):
- https://nextpredict.io/platforms/plus500/ (timeline, fees, 16-states note; also the discovery evidence)
- https://www.financemagnates.com/forex/plus500-launches-predictions-markets-in-the-us/ (launch 2026-02-03; Kalshi products cleared as a member of Kalshi's clearing unit; CME/FanDuel clearing)
- https://tradeinformer.com/broker-news/plus500-adds-sports-event-contracts-to-us-prediction-markets-offering (sports launch, 2026-06-29)
- https://commodity.com/brokers/plus500-review/us/prediction-markets/ (1 cent commission, same Kalshi contracts)
- Search results (single query): fxempire, liquidityfinder (page 404 when fetched), foxsports "best prediction markets"; titles/snippets only.
