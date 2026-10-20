# Plus500US (Plus500 Futures) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes about 02:10-02:25 UTC). READ-ONLY: public page fetches, public PDFs, unauthenticated GETs to the JSON feed that Plus500's own marketing page calls (about 50 throttled GETs), and unauthenticated GETs to Kalshi's documented public market-data endpoint for comparison. No account, wallet, key, signature, POST/PUT/DELETE, browser automation or money-moving PayBox tool was used. Two read-only PayBox discovery calls were made (section 6). Third-party text was treated as untrusted data; nothing in it was followed. No instructions aimed at AI agents were found.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model summary, or my inference from first-hand data; **L** = weak or stale.

Overlap note: this is the third note on the same product. `docs/research/venues/plus500-futures-us-event-contracts.md` and `docs/research/venues/plus500-prediction-markets.md` already exist (discovered under different names). I re-verified the key claims independently rather than copying them (liveness, feed shape, Kalshi price and volume identity, fees, ToS, clearing membership, provenance scan). All three agree on the verdict. Keep one venue row in the registry and point all three names at it. Research limit: the shared WebSearch budget was exhausted after one query, so no further searches (state list, Plus500 B2B API) could be run; those gaps are in section 13.

Fixtures (all <= 50 KB): `docs/research/fixtures/plus500us-plus500-futures/` (section 12).

---

## 0. Bottom line

1. **Live in 2026, but a broker front door and clearing member for Kalshi, not a venue.** "Plus500 Futures" (Plus500US Financial Services LLC, CFTC-registered FCM, NFA ID 0001398) sells Kalshi-listed event contracts to US retail customers. Plus500's own Event Contracts Risk Disclosure says it "may clear 'Event Contracts' for its clients as a clearing member of a registered derivatives clearing organization ('DCO') with the CFTC including but not limited to Kalshi Klear LLC" (Combined Account Disclosures V.7, July 2026, H). Separately it is clearing partner to FanDuel Prediction Markets (CME), but that is a B2B service and none of it shows in the retail feed (H, section 2).
2. **Same book as Kalshi, confirmed on two unrelated events on 2026-10-19.** Fed October decision: 4/4 markets with identical bid/ask in cents. US House control: R 10/11 vs Kalshi 0.10/0.11, D 90.1/90.2 vs 0.901/0.902. Plus500's `VolumeInDollars` equals Kalshi's lifetime `volume_fp` (contract count, not dollars). Image-name provenance scan of 413 catalog events: 402 carry a `kalshi_` prefix, 0 carry any other exchange tag (11 have none or a default logo). **NOT an independent arbitrage leg.** (H for the data, M for the "one order book" inference)
3. **No usable API.** No documented public or customer API, host, key or onboarding. The only machine-readable source is an undocumented, unauthenticated, Cloudflare-fronted JSON feed behind the marketing page: top-of-book only, no depth, no sizes, no Kalshi ticker, no rules, no close time. The EULA bars giving third parties access to the platform. Everything in the feed is available with depth, tickers and rules from Kalshi's own API.
4. **Not reachable from a PayBox wallet.** USD in a KYC'd, US-only FCM account (Apple Pay, Google Pay, debit card, bank transfer). No chain, token, contract or wallet-signed order. PayBox plugin and x402 service discovery for "plus500" returned nothing.
5. **adapter_priority = skip.** Duplicate liquidity, no API, ToS hostile to third-party access, about 1 to 2 cents per contract per side dearer than Kalshi direct. In the platform registry model it as an `execution_route` alias of Kalshi for US residents, never a second leg.

---

## 1. Is it still live? (2026)

| Evidence | Date | Tag |
|---|---|---|
| `https://us.plus500.com/en/prediction-markets` HTTP 200, 73 KB; nav lists "Prediction Markets" under "Futures on:"; popup text "Sports predictions availability varies by location." | 2026-10-19 | H |
| Public feed returns live quotes; 18 of 413 collected events carry a `LiveEvent` object (sports in play); Fed October book 86/87 | 2026-10-19 02:10 UTC | H |
| Plus500 interim results, six months to 30 June 2026 (published 2026-08-10): "launched its CFTC-regulated B2C prediction markets offering in February 2026 and introduced sports event-based contracts in June 2026"; "continued scaling of the prediction markets offering" is a stated priority | 2026-08-10 | H (https://cdn.plus500.com/Media/Investors/Reports/Plus500_Interim_Results_1H2026.pdf) |
| Account Agreement V.10 "September 2026" has a dedicated "12. EVENT CONTRACTS" section and a Cleared Swaps addendum naming the "Rules of Kalshi Clear LLC" | 2026-09 | H |
| Support FAQ has a 7-question "Prediction Markets" topic | 2026-10-19 | H (https://us.plus500.com/en/support/predictionmarkets) |
| Press: B2C launch 2026-02-03 (Finance Magnates and others); sports added June 2026 | 2026-02 / 2026-06 | M |

**still_live = true.** Nothing load-bearing is older than 6 months except the Feb 2026 launch date (about 8.5 months), which Plus500's own results corroborate. The Dec 2025 FanDuel clearing item is about 10 months old and historical context only.

---

## 2. Kind and market model

- **Kind (H):** retail futures broker front end plus clearing member. "Plus500 Futures" is the US B2C brand of Plus500US Financial Services LLC (Itasca, IL), part of LSE-listed Plus500 Ltd. Interim results describe B2C platforms "Plus500 Futures" and "T4-Pro" and a B2B product "Plus500 Cosmos" (H, same PDF).
- **Contract model (H, Combined Account Disclosures V.7 and Account Agreement s.12):** exchange-traded event contracts classed by the CFTC as cleared swaps. Each is a Yes/No proposition; "the 'Yes' contract and 'No' contract are two separate Event Contracts each with a unique contract ID"; bids "between $0.01 and $0.99"; the winning side settles at $1.00, the other at $0; fully collateralised, no margin, not marked to market; positions cannot be transferred and are exited by taking the opposite position. The FAQ adds: you cannot hold Yes and No on the same contract; IOC orders must match immediately or the unfilled part is cancelled (H, FAQ).
- **Structure in the feed (H):** Event (`EventId`, Plus500's own integer) to Markets (`MarketId`). Every market is binary with `YesBid/YesAsk/NoBid/NoAsk` in **cents as floats**, `null` where a side has no quote. Categorical events are sets of binary markets (Fed decision: 4; House control: 2). Scalar-like ladders are sets of binary strikes. Same shape as Kalshi `event_ticker` to `ticker`.
- **Order book:** the CLOB is at the exchange (Kalshi). Plus500 exposes top of book only plus `LatestTradeRate`, `ChangeInTradeRate`, `Volume`, `VolumeInDollars`. No depth, sizes or open interest in the feed (the app's number under an event is open interest per the FAQ, but the feed does not carry it). (H)
- **Tokenisation:** none. Positions are FCM account entries cleared at the DCO. Nothing on-chain.
- **IDs:** no Kalshi ticker anywhere in the feed. Only provenance marker is the image file name `kalshi_event_{EventId}.webp` / `kalshi_market_{MarketId}.webp`, where the numbers are Plus500's own ids. Matching to Kalshi needs title and date matching (Fed and House titles matched Kalshi's exactly). (H)
- **CME/FanDuel slice:** the retail feed shows no CME- or CDNA-sourced events (0 non-Kalshi prefixes in 413). Plus500's FanDuel role is brokerage-execution and clearing for FanDuel Prediction Markets (H, interim results), so those CME contracts are reached through FanDuel's front end, not this feed. See `docs/research/venues/cme-group-event-contracts.md` and `fanduel-predicts.md`.

---

## 3. Chains and collateral

None on-chain. Collateral is USD cash in a Plus500 Futures account. Deposits: Google Pay, Apple Pay, debit cards, bank transfer; $10 minimum per transaction; prepaid and credit cards not accepted; "Funds in Transit" up to three business days. Withdrawals: first of each calendar month free, then 1.75% of the amount (min $1, max $150). Zero fees listed for deposits, routing, inactivity, data and platform. (https://us.plus500.com/en/feescharges, H)

---

## 4. Read API

**Official API: none found.** `exists = unofficial-only`.

Searched (H for absence of anything I could find): us.plus500.com nav, support, fees, about and legal index pages (no developer link); `api.plus500.com` and docs/developer hostnames per the sibling notes (404 / no DNS); GitHub (per siblings, only stale unofficial CFD scrapers and a likely malware lure, see section 14). The EULA defines "System" as including "the API for the Plus500 software and system" (H, https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1784816616/3/EndUserLicenseAgreement.pdf, V.5 July 2026), so some API exists internally, but nothing is published and third-party use is barred (section 9). I did not open the login-gated trading app bundle: that would be reverse engineering, which the EULA bars.

**Undocumented marketing-page feed.** The page loads `prediction-markets.bundle.min.js` with `PM_HOST = 'https://sat.plus500.com'` (H, inline config in the page). Unauthenticated GETs I ran on 2026-10-19:

| Purpose | Request | Observed |
|---|---|---|
| Category tree | `GET https://sat.plus500.com/prediction-markets/api/categories?minEventsPerSubCategory=2` | 200 JSON, 9.7 KB: `{Categories:[{Id,Name,SubCategories:[{Id,Name,IsAggregation}]}]}`; 12 top-level groups (H) |
| Event ids per category | `GET .../prediction-markets/api/categories/{id}/events?maxEvents=40` | 200 `{"EventIds":[33620,42664,...]}` (H); ids are category slugs such as `economics_fed`, `crypto_btc`, `elections_senate`, `live` |
| Event detail | `GET .../prediction-markets/api/events/{eventId}` | 200 JSON (H) |
| Batch detail | `GET .../prediction-markets/api/events?ids=1,2,3` (20 per call worked) | 200 `{"Events":[...]}`; unknown or dead ids come back as stub objects with `Title:null, IsValid:false` (H) |

Event fields (H): `EventId, Title, SubTitle ("On Oct 28, 2026"), ImageUrl, VolumeInDollars, VolumeInDollarsFormatted, TopMarkets[], LiveEvent, CategoryHierarchy{Id,Name,SubCategoryIds[]}, IsSportEvent, IsMatch, IsValid`. Market fields (H): `MarketId, FullTitle, Title, YesBid, YesAsk, NoBid, NoAsk, LatestTradeRate, ChangeInTradeRate, VolumeInDollars, VolumeInDollarsFormatted, Volume, Status ("Active"), ImageUrl`. The sibling notes also found a search route and a widget wrapper route, read from the JS only.

Caveats:
- `TopMarkets` is a subset for big events. No rules text, close time, ticker, pagination or depth. (H)
- Volume semantics (M, from the two cross-checks): `VolumeInDollars` equals Kalshi lifetime `volume_fp` (Fed Hike 25bps: 4,094,053 vs 4,094,262.64; House R: 40,242,572 vs 40,262,655.21 about two minutes later), `Volume` tracks Kalshi `volume_24h_fp` order of magnitude. The "InDollars" label is misleading: these are contract counts.
- Auth: none. Rate limits: NOT FOUND (no rate-limit headers seen; Cloudflare in front; the site's own widget polls an event every 3 s per sibling notes, M). WebSocket: NOT FOUND.
- Legal status: undocumented, not offered as an API. Treat as unofficial-only and do not build on it.

---

## 5. Trade path

- **Programmatic: none documented.** Orders go through Plus500's proprietary web and mobile apps (login with username/password "Access Codes", Account Agreement s.21). Auth and signing scheme: not applicable.
- Order types: the FAQ confirms IOC exists; full list, tick size, minimum size, position limits: NOT FOUND in primary sources.
- To trade these contracts programmatically use **Kalshi's own API** (see `docs/research/08-venues-polymarket-kalshi.md`), subject to Kalshi's eligibility. Plus500 adds nothing there.

---

## 6. PayBox reachability

**paybox_reachable = no.** No chain, token, contract or signed-order endpoint; funding is fiat into a KYC'd US brokerage account. An EVM or Solana wallet reached through PayBox could not propose a transaction or sign an order that touches this venue. `discover_plugins` and `discover_services` (default and curated catalogs) for "plus500" returned empty on 2026-10-19 (H).

---

## 7. Fees

- **Plus500 commission: $0.01 per contract per side** for prediction markets, "*Per side. Not including Exchange and NFA fees as applicable. NFA fees apply only to Futures contracts." (https://us.plus500.com/en/feescharges, H)
- **Exchange fee:** the support FAQ says "A small commission ($0.01 per contract) applies, and the exchange will charge additional fee of $0.01." (https://us.plus500.com/en/support/predictionmarkets/howdopayoutsandfeeswork, H). That reads as a flat 1 cent, which does not match Kalshi's published curve (taker about `0.07 x C x p x (1-p)` rounded up per `docs/research/08-venues-polymarket-kalshi.md`, M). Whether Plus500 passes Kalshi's actual fee through, caps it, or the FAQ is simplified: **NOT FOUND**. Model fees as "Kalshi fee + $0.01/contract commission" conservatively.
- Other: the $0.89 / $0.49 futures commissions and $10 liquidation fee on the same page are for futures, not event contracts (M, inferred from labels). Withdrawal fee 1.75% after the first free one per month (H).
- Net for a scanner: the same contract costs a Plus500 customer at least about 1 cent per contract per side more than Kalshi direct. It is a cost, not an edge. The FAQ also admits "Small differences in pricing may occur due to exchange mechanics" (H, howarecontractspriced).

---

## 8. Resolution mechanism and dispute risk

Event contracts "are typically settled by cash payment based on the occurrence, non-occurrence or outcome of an event, as determined under the rules of the listing exchange and/or its clearinghouse" (Account Agreement s.12, H, https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1790084354/7/UserAgreement.pdf). Resolution is therefore **Kalshi's** (single accountable DCM/DCO; Kalshi's market objects carry `rules_primary`, `rules_secondary`, `settlement_timer_seconds`, `expiration_value`, `result`, H from the Kalshi API response I fetched). The Kalshi rulebook (https://kalshi.com/regulatory/rulebook) was not retrieved by me; see doc 08. FAQ: "Data sources are selected by exchange and are provided within the contract details" (H).

Broker-layer risks written into the agreement (H):
- Plus500 "may, in its sole discretion and without prior notice, condition, suspend or restrict your ability to view, quote, enter, withdraw, liquidate, or otherwise access or transact in any Contract".
- If the exchange or Plus500 halts trading "there may not be a market to close your position ... This could result in any open position that you hold in the event contract to become worthless."
- Regulators or courts may force suspension or termination of sports or other event contracts before settlement; Plus500 may liquidate at then-available prices with no liability.
- Spelling: Plus500's own documents say "Kalshi Clear LLC" (agreement) and "Kalshi Klear LLC" (disclosure and results); not resolved which is the legal name (H that both appear).

---

## 9. Geo / ToS / automation

Quotes from Account Agreement V.10 (September 2026), EULA V.5 (July 2026); H unless noted.

- **US only, geolocation enforced.** Plus500 "may employ geolocation technology", "may refuse access to, or disable functionality for, one or more specific Contracts or exchanges for any location, jurisdiction, IP range, or device", and the customer "shall not circumvent ... through the use of VPNs, proxies, anonymization services, or other technical means" (s.12). Sports availability "varies by location". Official state list: NOT FOUND. A third party says many states had acted against sports contracts by Sept 2026 (M, per sibling).
- **Insider ban:** may not transact with material non-public information, or when barred by an employment contract or sports-body rule (s.12).
- **Automation:** no clause explicitly bans or permits bots (NOT FOUND; I searched the agreement text for automat/algorithm/bot/API/script). But EULA s.1.1 forbids you to "sublicense, distribute, sell, assign, transfer, lease, rent, disclose, or provide access to the System or the Plus500 App to any third party" and also reverse engineering/decompiling; Account Agreement s.21: "Customer shall not resell or permit access to any Platform to others." Access Codes are personal and the customer is responsible for all orders entered with them. A hosted multi-user aggregator or an agent trading on others' behalf on one login would breach these.
- **Data redistribution:** EULA s.7 binds users to Third Party Data Provider policies and bars transferring, reselling or storing the data feeds for later use without approval.
- The `sat.plus500.com` feed is not addressed explicitly (NOT FOUND); it is undocumented and behind bot protection. `https://www.plus500.com` returned 403 to curl and WebFetch; the US site `us.plus500.com` works. WebFetch also failed on some `us.plus500.com` pages with "Header overflow" (cookie header size), so I used curl for those.

---

## 10. Liquidity

- **Plus500's own prediction-market volume, OI, customers or revenue: NOT FOUND.** The interim results give group-wide figures only: 197,294 active customers (all products, H1 2026, up 10% YoY), non-OTC (futures + prediction markets + share dealing) revenue growth about 30% YoY, "on track to generate annualised revenue of approximately $140m in FY 2026" for the non-OTC business (H, interim results, 2026-08-10). Prediction markets are not broken out.
- **Displayed numbers are Kalshi's.** Event lifetime figures shown on 2026-10-19 (feed field `VolumeInDollars`, really Kalshi contract counts, M): "2028 Democratic presidential nominee" 242.2m, "2027 Pro Football Champion" 185.8m, "Pro Baseball Champion" 130.6m, "2028 U.S. Presidential Election winner?" 74.8m, "Which party will win the U.S. House?" 60.3m, "Bitcoin price at the end of 2026" 42.2m (H as displayed; see `p500-scan-summary.json`). Do not count them as Plus500 liquidity.
- Market-wide context only (M, one search snippet, aggregator sources, not verified): Kalshi weekly volume about $19bn and a daily record above $4bn on 2026-10-11.
- Whether Plus500 customer orders rest in Kalshi's book (adding to depth) or are internalised: NOT FOUND. Identical quotes on every sampled market make internalisation unlikely (M).

---

## 11. Event-category overlap and shared liquidity

- **Shares liquidity with Kalshi: yes, fully.** It adds no independent leg to a scanner already ingesting Kalshi.
- Category tree (H, `p500-categories.json`): Popular, Sports (baseball, basketball, cricket, darts, esports, football, golf, hockey, MMA, motorsport, soccer, tennis), Politics (Congress, international, Iran, SCOTUS, Trump), Elections (2028, governor, house, senate, combos), Economics (Fed, GDP, inflation, jobs, oil), Financials (indices, rates, S&P, IPOs, FX), Crypto (BTC, ETH, SOL, XRP, DOGE, BNB, hourly), Commodities, Climate and Weather, Entertainment, Mentions, Science and Technology, Companies.
- 413 events collected across 11 groups: 40 each in elections, economics, entertainment, crypto, climate-and-weather (capped by `maxEvents=40`), 35 science, 36 sports, 17 commodities.
- Overlap with Polymarket, Limitless, XO and others is exactly Kalshi's overlap (sports, US politics and elections, Fed and macro prints, BTC/ETH price brackets). Use the Kalshi adapter and the cross-venue rule checks in docs 08 and 17.
- Distribution role: another US-retail on-ramp to Kalshi liquidity. Useful only where a user's account is Plus500 rather than Kalshi, and not programmatic.

---

## 12. Fixtures

All captured 2026-10-19 with `User-Agent: insurance-markets-research/0.1`, no cookies kept.

| File | Source |
|---|---|
| `p500-categories.json` | category tree (14 KB pretty-printed) |
| `p500-category-events-economics_fed.json` | event ids for `economics_fed` |
| `p500-event-33620-fed-oct-2026.json` | single event detail, 4 markets |
| `p500-event-33587-house-control-2026.json` | single event detail, 2 markets |
| `kalshi-compare-KXFEDDECISION-26OCT.json` | trimmed Kalshi public API response, same event |
| `kalshi-compare-CONTROLH-2026.json` | trimmed Kalshi public API response, same event |
| `p500-scan-summary.json` | counts from the 413-event scan (image-source prefix, category, top-10 by volume) |

Side-by-side (cents vs dollars, fetched within about 2 minutes of each other):

| Market | Plus500 YesBid/YesAsk | Kalshi yes_bid/yes_ask |
|---|---|---|
| Fed maintains rate | 86 / 87 | 0.86 / 0.87 |
| Hike 25bps | 12 / 13 | 0.12 / 0.13 |
| Cut 25bps | null / 1 | 0.00 / 0.01 |
| Hike >25bps | null / 1 | 0.00 / 0.01 |
| House: Republicans | 10.0 / 11.0 | 0.10 / 0.11 |
| House: Democrats | 90.1 / 90.2 | 0.901 / 0.902 |

---

## 13. Not found (searched)

- Official developer docs, REST/WebSocket/FIX spec, API keys or onboarding for retail customers or for the B2B "Plus500 Cosmos" product (searched: us.plus500.com nav, support, legal PDFs, results PDF; the follow-up web searches could not run because the shared search budget was exhausted).
- Whether event contracts are reachable through the "T4-Pro" platform or any T4 API (searched: interim results text; no mention).
- Order types beyond IOC, tick size, minimum size, position limits for event contracts (searched: fees page, FAQ, agreement, disclosures).
- Explicit permission or prohibition of automated trading (searched: agreement and EULA text).
- Plus500's own prediction-market volume, open interest, customer count or revenue (searched: interim results; investors.plus500.com returned 403 to curl).
- Official state-availability list (searched: product page, fees page, FAQ, agreement).
- Kalshi Rulebook and the Plus500-Kalshi agreement text (not retrieved by me).
- Rate limits for `sat.plus500.com`.

## 14. Suspicious content

- No instruction-like text aimed at AI agents in any Plus500 page, FAQ, JS, PDF or feed response I read.
- Sibling note records that GitHub search for "plus500" returned a repo `Plus500-License/Plus500` (created 2025-12-22, zero stars) described as a CFD trading platform for Windows that looks like a download lure; not opened or cloned by anyone. Unrelated to Plus500's real systems. (M, via sibling note)

---

## 15. Adapter spec

**Do not build a venue adapter.** Registry entry:

```
venue_id:        plus500_us
kind:            broker-frontend + clearing member (alias of kalshi)
alias_of:        kalshi
independent_liquidity: false
read_api:        none official; unofficial sat.plus500.com feed (top-of-book, no tickers, no depth) - do not use
trade_path:      manual in Plus500 app only; no programmatic path
paybox:          not reachable (fiat, KYC, US-only)
extra_cost_vs_kalshi_direct: $0.01/contract/side commission (+ exchange fee, stated by Plus500 as $0.01)
use:             tag as "execution route for US residents without a Kalshi account"; never count as a second leg
```

Scanner rule: when the same title appears from Kalshi and Plus500, drop the Plus500 row; any "spread" between them is stale-data noise or fee difference, not edge.

## 16. Priority

**skip.** Duplicate of Kalshi liquidity; no API; account and license terms forbid giving others access; not wallet-reachable; extra commission versus Kalshi direct.

---

## Sources

Primary (read this session, 2026-10-19):
- https://us.plus500.com/en/prediction-markets (page and inline config; `PM_HOST`)
- https://sat.plus500.com/prediction-markets/api/categories ; `.../categories/{id}/events` ; `.../events/{id}` ; `.../events?ids=` (unauthenticated GETs)
- https://us.plus500.com/en/feescharges
- https://us.plus500.com/en/support/predictionmarkets and sub-pages `howarecontractspriced`, `howdopayoutsandfeeswork`, `whatarerulesfortrading`, `whatdonumbersundereventnameshow`, `whatisaneventcontract`
- https://us.plus500.com/en/support/termsandagreements (index of legal PDFs)
- Account Agreement V.10 September 2026: https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1790084354/7/UserAgreement.pdf (text extracted locally)
- End-User License Agreement V.5 July 2026: https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1784816616/3/EndUserLicenseAgreement.pdf
- Combined Account Disclosures V.7 July 2026: https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1784816752/5/CombinedAccountDisclosures.pdf
- Plus500 Ltd interim results, six months to 30 June 2026: https://cdn.plus500.com/Media/Investors/Reports/Plus500_Interim_Results_1H2026.pdf
- Kalshi public market data for comparison: https://external-api.kalshi.com/trade-api/v2/markets?event_ticker=KXFEDDECISION-26OCT&limit=10 and `...?event_ticker=CONTROLH-2026&limit=10`
- PayBox `discover_plugins` / `discover_services` queries for "plus500" (empty)

In-repo, read as M: `docs/research/venues/plus500-futures-us-event-contracts.md`, `docs/research/venues/plus500-prediction-markets.md`, `docs/research/venues/cme-group-event-contracts.md`, `docs/research/08-venues-polymarket-kalshi.md`.

Secondary (M): https://nextpredict.io/platforms/plus500/ (discovery evidence); single web search on 2026-10-19 returned launch coverage from defirate.com, tradeinformer.com, investing.com, financefeeds.com, goodmoneyguide.com, tradingview.com (Finance Magnates), liquidityfinder.com, mlq.ai, research-tree.com and blockonomi.com (titles and snippets only; Kalshi Klear clearing membership, Feb 2026 launch, Dec 2025 FanDuel clearing, flat $0.01 fee).
