# Plus500 (Kalshi markets) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 03:34-03:40 UTC). READ-ONLY: public page and PDF fetches, unauthenticated GETs to the JSON feed that Plus500's own marketing page calls, and unauthenticated GETs to Kalshi's documented public market-data API for comparison. No account, key, wallet, signature, POST/PUT/DELETE, payment or PayBox tool. Third-party text was treated as untrusted data; I found no instruction-like text aimed at AI agents anywhere. All scripted requests used `User-Agent: insurance-markets-research/0.1` and no contact data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Research limit: the shared WebSearch budget was exhausted before my first query, so there was no news search. Discovery evidence and secondary sources came from WebFetch of specific URLs only.

Overlap warning: this venue already has four sibling notes in `docs/research/venues/` (`plus500-futures-us-event-contracts.md`, `plus500-prediction-markets.md`, `plus500us-plus500-futures.md`, `moomoo-and-plus500-us-event-contracts.md`). I re-verified their central claims independently (section 11) and add a live in-play comparison and the H1 2026 results. The registry should carry ONE record, `plus500_us`, as an alias of Kalshi.

Fixtures (all <= 14 KB): `docs/research/fixtures/plus500-kalshi-markets/`.

---

## 0. Verdict

**adapter_priority = skip** (confidence: high).

1. **Live, but a retail front door, not a venue (H).** Plus500US Financial Services LLC (CFTC-registered FCM, NFA ID 0001398) sells Kalshi-listed event contracts in its own app. Its Combined Account Disclosures say it clears event contracts "as a clearing member of a registered derivatives clearing organization ... including but not limited to Kalshi Klear LLC".
2. **Same order book as Kalshi, to the cent (H data, M architecture inference).** I matched all 28 markets of one live NFL spread event 1:1 by title against Kalshi `KXNFLSPREAD-26OCT18DALGB` and 4 of 5 markets of the Fed October event; quotes are identical or one tick apart and volumes are identical on inactive markets (section 11). It is **not an independent arbitrage leg**.
3. **No usable API (H).** No documented customer API. The only machine-readable data is an undocumented, Cloudflare-fronted JSON feed behind the marketing page (top of book only, no depth, no Kalshi ticker). Kalshi's own public API is strictly better for every field.
4. **Not reachable from a PayBox wallet (H).** Fiat, KYC'd, US-only brokerage account; no chain, no token, no signed-order endpoint.
5. **Terms are hostile to a multi-user or agent integration (H):** "provide access to the System or the Plus500 App to any third party" is prohibited; access codes are personal.
6. **Registry treatment:** `plus500_us = alias_of(kalshi)`, `independent_liquidity = false`, "execution route for US residents who hold a Plus500 account, +$0.01 per contract per side". Drop Plus500 rows whenever the Kalshi row for the same contract exists; any Plus500-vs-Kalshi "spread" is feed lag, not edge.

---

## 1. Is it still live? (2026)

| Evidence | Date | Tag |
|---|---|---|
| `https://us.plus500.com/en/prediction-markets` returns HTTP 200, title "Trade Live Prediction Markets", banner "Trade $10, Get $20 Use code PLUSPM20". Visible page text never names Kalshi; the footer disclaimer is the generic futures one. | fetched 2026-10-19 | H |
| Feed returns live in-play data: event 437130 "Dallas vs Green Bay: Spread", `LiveEvent.IsLive=true`, status `inprogress`, 4th quarter 2:00 left, 28 markets quoted (fixture). | 2026-10-19 03:37Z | H |
| Plus500 Ltd H1 2026 interim results (RNS dated 10 Aug 2026): "launched its CFTC-regulated B2C prediction markets offering in February 2026 and introduced sports event-based contracts in June 2026". https://cdn.plus500.com/Media/Investors/Reports/Plus500_Interim_Results_1H2026.pdf | 2026-08-10 | H |
| Same results: "Building on the clearing memberships secured in 2025, including ICE Clear US, ICE Clear Europe and Kalshi Klear"; "clearing relationships across multiple exchanges and platforms, including CME Group and Kalshi". | 2026-08-10 | H |
| Account Agreement "V.10 September 2026" has a dedicated Section 12 "EVENT CONTRACTS"; Firm Disclosure states facts "as of September 15, 2026". | Sep 2026 | H |
| Finance Magnates: "Plus500 launches predictions markets in the US", 2026-02-03; Kalshi "delivers the offering"; Plus500 clears "as a member of Kalshi's clearing unit". https://www.financemagnates.com/forex/plus500-launches-predictions-markets-in-the-us/ | 2026-02-03 | M |
| Fox Sports "websites like Kalshi" (discovery evidence): Plus500 is "a broker that offers Kalshi's own event contracts through its Plus500 Futures platform ... the prices and liquidity you see on Plus500 come from Kalshi's order book". Its claim that sports come "later" is **stale/wrong** (sports launched June 2026 per H1 results, and live NFL is in the feed). https://www.foxsports.com/stories/betting/websites-like-kalshi | 2026-10-07 | M |

**still_live = true.** Stale flag: the discovery hint "US-only" is right but the Finance Magnates article does not itself say so; US-only follows from the Plus500US entity, geolocation clause and CFTC FCM status (section 9).

---

## 2. Kind and market model

- **Kind (H):** retail futures broker / FCM front end ("Plus500 Futures", Itasca IL, wholly owned by Plus500US Inc., subsidiary of LSE-listed Plus500 Ltd). Group results also describe a B2B2C sub-line "that enables strategic partners to seamlessly power their own customer trading experiences via Plus500's end-to-end institutional solution" (H1 2026 results), and the Firm Disclosure lists agreements with "30 domestic independent introducing brokers" (as of 2026-09-15). So Plus500 is itself a clearing/routing layer under other front ends (FanDuel Predicts for CME contracts, per H1 results and sibling notes).
- **Contract model (H, Combined Account Disclosures p.8-9, Account Agreement s.12):** binary "Yes"/"No" event contracts; "Yes" and "No" are two separate contracts, bids between $0.01 and $0.99; settlement value $1.00; fully collateralised, no margin, not marked-to-market; exits only by offsetting position; legally cleared swaps; the clearinghouse is the original counterparty. Central limit order book at the exchange (Kalshi), not at Plus500.
- **Feed structure (H):** Event (`EventId`, Plus500-own integer) -> Markets (`MarketId`), each binary with `YesBid/YesAsk/NoBid/NoAsk` in **cents as floats**. Categorical and ladder events are sets of binary markets (Fed event: maintain / hike 25 / cut 25 / hike >25; NFL spread ladder: 28 thresholds).
- **Tokenisation:** none. Positions are FCM account entries cleared at the DCO. No on-chain representation.
- **IDs:** Plus500 `EventId`/`MarketId` are not Kalshi tickers; no Kalshi ticker is exposed. Matching needs title/rules text matching, and it is easy (titles are copied from Kalshi, section 11).
- **Subset listing (H):** Plus500 lists only some Kalshi markets in an event. Kalshi `KXFEDDECISION-26OCT` has 5 markets (H0, H25, C25, C26, H26); Plus500 event 33620 returned 4 (no "Cut >25bps"). The NFL spread event showed all 28. Do not assume completeness.

---

## 3. Chains and collateral

None on-chain. Collateral is USD cash in a Plus500 Futures account. Deposit methods (H, https://us.plus500.com/en/feescharges FAQ): Google Pay, Apple Pay, debit cards, bank transfer; $10 minimum per transaction; "Prepaid and credit cards are not accepted"; no deposit fee; deposits can take up to three business days to settle ("Funds in Transit"). Withdrawals: first of each calendar month free, then 1.75% (min $1, max $150). NextPredict (M) says no crypto is needed; nothing on Plus500's pages offers crypto funding.

---

## 4. Read API

**Official public API: none found.** (H for the absence of anything I could find)

Searched: `us.plus500.com` home, prediction-markets, fees, about and terms pages (no developer/API link); the five legal PDFs; `api.plus500.com` (HTTP 404); `developers.plus500.com`, `docs.plus500.com` (do not resolve); `futures.plus500.com` (HTTP 200, a login SPA whose inline config points at a private backend `api-futures.plus500.com`, which I did not call); guessed `/en/institutional`, `/en/partners` (redirect to the home page). The EULA defines the licensed "System" as including "the API for the Plus500 software and system" (H), so an API exists internally or for B2B clients, but no public documentation, host or onboarding path exists. NOT FOUND (searched: all of the above): any retail API, FIX, WebSocket or API-key page. The H1 results name "Plus500 Cosmos" as the B2B introducing-broker offering and "T4-Pro" as a B2C platform; whether either exposes an API for event contracts: NOT FOUND (not investigated beyond the results text).

**Unofficial marketing-page feed (the only machine-readable data), all unauthenticated GET, all HTTP 200 on 2026-10-19 (H):**

Base: `https://sat.plus500.com` (the page sets `PM_HOST = 'https://sat.plus500.com'` in its inline script).

| Purpose | Request | Observed |
|---|---|---|
| Category tree | `GET /prediction-markets/api/categories?minEventsPerSubCategory=2` | 9.7 KB `{Categories:[{Id,Name,SubCategories:[{Id,Name,IsAggregation}]}]}`; 12 top-level entries incl. a "Popular" pseudo-category |
| Event ids in a category | `GET /prediction-markets/api/categories/{categoryId}/events?maxEvents=N` | `{"EventIds":[33620,42664,...]}`; ids like `economics_fed`, `crypto_btc`, `live` |
| One event | `GET /prediction-markets/api/events/{eventId}` | 1.9 KB (4 markets) to 12 KB (28 markets) |
| Batch events | `GET /prediction-markets/api/events?ids=1,2,3` | `{"Events":[...]}`; 5 live NFL events = 76 KB |
| Search | `GET /website-search/api/PredictionSearch?query={q}&take={n}` | `{results:[{id,name,subTitle,categoryPath[],url,imageUrl,score}],totalCount,query}` |

Event fields: `EventId, Title, SubTitle, ImageUrl, VolumeInDollars, VolumeInDollarsFormatted, TopMarkets[], LiveEvent, CategoryHierarchy{Id,Name,SubCategoryIds[]}, IsSportEvent, IsMatch, IsValid`. Market fields: `MarketId, FullTitle, Title, YesBid, YesAsk, NoBid, NoAsk, LatestTradeRate, ChangeInTradeRate, VolumeInDollars, VolumeInDollarsFormatted, Volume, Status, ImageUrl`. `LiveEvent` (sports): `IsLive, StartDate, Title, Type, Category, Status, StatusText, WidgetStatus, Details{Quarter, Clock, Situation, scores, team ids}`.

Shape quirks that matter to an adapter (H unless noted):
- **No book depth, no sizes, no close/expiry time, no rules text, no resolution status, no Kalshi ticker, no pagination fields.** `SubTitle` carries a human date ("On Oct 28, 2026").
- **A side with no quote is `null`.** Kalshi's 100c ask is shown as `null` (e.g. Plus500 "GB wins by over 7.5": YesBid 99 / YesAsk null vs Kalshi 98/99 a moment later; "by over 1.5": 99/null vs Kalshi 99/100).
- **`VolumeInDollars` is mislabelled (M):** it equals Kalshi's lifetime `volume_fp` (contracts), e.g. Fed H0 5,686,169 vs Kalshi 5,686,169.65; it lags on actively traded markets (live NFL: Plus500 642,512 vs Kalshi 829,688 for one threshold; worst case about 53% low). `Volume` tracks roughly Kalshi's 24h count.
- **Freshness (M):** in-play, Plus500 quotes lagged Kalshi by about one tick on moving markets (e.g. "GB wins by over 13.5": Plus500 54/55 vs Kalshi 53/54). Responses carry `cache-control: no-store` and `server: cloudflare`. The site's own widget polls an event every ~3 s (sibling note, read from widget JS, M).
- Auth: none. Rate limits: NOT FOUND (no rate-limit headers; Cloudflare in front). `https://sat.plus500.com/robots.txt` returned a Cloudflare block page (HTTP 403) to curl and I did not try to get around it. `https://us.plus500.com/robots.txt` disallows `/api`, `/*api/LiveData/*`, `/*?*` for all agents; those paths are on a different host from the feed, so its applicability to `sat.plus500.com` is unclear.
- WebSocket / streaming: NOT FOUND (page uses HTTP polling).
- Status: undocumented and not offered as an API. **Do not build on it.**

Saved samples: `sat-categories.json`, `sat-category-events-economics_fed.json`, `sat-category-events-live.json`, `sat-event-33620-fed-oct-2026.json`, `sat-events-batch-midterms-btc.json`, `sat-event-437130-live-nfl-spread-trimmed.json`, `sat-search-bitcoin.json`.

---

## 5. Trade path

- **Programmatic: none documented.** Orders are placed in the proprietary web/app platform at `https://futures.plus500.com/` (login; the page title is "Futures | Global Fintech App for Futures Trading") or the mobile apps. Auth is a personal user id + password ("Access Codes", Account Agreement s.21): "Customer accepts full responsibility for ... all orders entered into a Platform using the Access Codes". (H)
- Order types, tick size, minimum size, position limits for event contracts: NOT FOUND in the Plus500 documents I read (searched: Account Agreement, Combined Account Disclosures, fees page). The disclosure says prices run $0.01 to $0.99 (H).
- To trade these contracts programmatically use Kalshi's own API (parallel workflow; `docs/research/08-venues-polymarket-kalshi.md`), subject to Kalshi eligibility.

---

## 6. PayBox reachability

**paybox_reachable = no.** There is no chain, token, contract or signed-order endpoint, so no transaction proposal or signed order from an EVM or Solana wallet can touch it. Funding is fiat (debit card, Apple/Google Pay, bank transfer) into a KYC'd US account; a card credential could in principle fund a human's own account, but placing and cancelling orders stays manual and the user agreement forbids giving third parties access. I called no PayBox tool.

---

## 7. Fees

- **Plus500 commission:** "Prediction Markets contract commission 0.01 ... Per side. Not including Exchange and NFA fees as applicable. NFA fees apply only to Futures contracts." (H, https://us.plus500.com/en/feescharges, 2026-10-19). So $0.01 per contract per side, paid by the customer, on top of the exchange fee. NFA's $0.02/side applies to futures only, not event contracts (H, by that sentence).
- **Exchange fee:** set by Kalshi, not stated on Plus500's page. Whether Plus500 passes Kalshi's exact fee through or marks it up: NOT FOUND (searched: fees page, Account Agreement, Combined Account Disclosures). Kalshi's taker formula is quadratic, `~0.07 x C x P x (1-P) x fee_multiplier` per series with the 0.07 coefficient only **M** (see doc 08 sections 4.x and the verifier pass A7).
- Other: no deposit, routing, inactivity, data or platform fees; 1.75% withdrawal fee after the first free one each month (H). The $0.89/$0.49 per-contract commissions and $10 auto-liquidation fee on the same page are futures charges and do not obviously apply to event contracts (M).
- **For a scanner:** the same contract costs a Plus500 customer about $0.01 per contract per side more than Kalshi direct. A cost, never an edge.

---

## 8. Resolution mechanism and dispute risk

Settlement "is determined under the rules of the listing exchange and/or its clearinghouse" (Account Agreement s.12, H). That is **Kalshi's** rulebook (Plus500 points customers to it: https://kalshi.com/regulatory/rulebook, in the Combined Account Disclosures, H; the Rulebook itself was blocked in earlier workflows and I did not retry, NOT FOUND). Kalshi market lifecycle `closed -> determined -> disputed -> amended -> finalized` is in doc 08 (H there). Resolution-source risk is disclosed ("Source Agency Risk": third-party agencies may report late or inaccurately).

Broker-layer risks added by Plus500 (H, Account Agreement s.12):
- Plus500 "may, in its sole discretion and without prior notice, condition, suspend or restrict your ability to view, quote, enter, withdraw, liquidate, or otherwise access or transact in any Contract".
- If the exchange or Plus500 halts trading, "there may not be a market to close your position ... This could result in any open position that you hold in the event contract to become worthless."
- A regulator or court may force suspension or termination of sports and other event contracts before settlement; Plus500 may liquidate at then-available prices or via an exchange resolution process and is not liable. Combined Account Disclosures say sports contracts "are currently the subject" of legal challenge. NextPredict (M, 2026-09-07) counts at least 16 states with lawsuits, cease-and-desist letters or gaming-board actions as of 2026-09-04.
- Insolvency: customer rights fall under US commodity-broker liquidation rules and CFTC Part 190 (H, Combined Account Disclosures "Other Risks").

Spelling: Plus500's own documents and results use both "Kalshi Klear LLC" and "Kalshi Clear LLC"; the H1 results and Firm Disclosure say "Kalshi Klear". Treat as one entity.

---

## 9. Geo / ToS / automation (quotes sparingly)

All from Account Agreement V.10 September 2026 and EULA V.5 July 2026 unless noted (H).

- **US only, geolocation enforced.** Plus500 "may employ geolocation technology", may disable specific contracts "for any location, jurisdiction, IP range, or device", and customers "shall not circumvent ... through the use of VPNs, proxies, anonymization services, or other technical means" (Acct Agmt s.12). Disclosures: "Eligibility to trade event contracts vary by jurisdiction, residence, physical location, and customer type and may change without notice." NextPredict (M) says "all 50 states" subject to Kalshi's state-level exposure; no official state list: NOT FOUND.
- **Insider and professional bans:** no trading with material non-public information or where an employment contract or sports-governing-body rule bars it (s.12).
- **Automation:** no clause explicitly bans or permits bots (NOT FOUND; searched both PDFs for automated/algorithm/bot/script/robot). But EULA s.1.1(iii) forbids you to "sublicense, distribute, sell, assign, transfer, lease, rent, disclose, or provide access to the System or the Plus500 App to any third party", and Acct Agmt s.21 says the customer "shall not resell or permit access to any Platform to others". A hosted multi-user aggregator, or an agent running on someone else's login, would breach these.
- **Data:** EULA s.7 binds users to third-party data providers' policies and forbids redistribution of data feeds. Scraping the `sat.plus500.com` feed is not addressed (NOT FOUND); it is an undocumented endpoint behind bot protection.
- `www.plus500.com` (the group site in the task) returned HTTP 403 to scripted clients; `us.plus500.com` works.

---

## 10. Liquidity

- **Plus500-specific prediction-market volume, open interest or customer counts: NOT FOUND** (searched: IR homepage, H1 2026 interim results PDF, Plus500 pages). The results give only group figures: H1 2026 revenue $462.9m, 197,294 active customers (both group-wide, OTC plus non-OTC); non-OTC revenue growth c.30% YoY, c.15% of group revenue, "on track to generate annualised revenue of approximately $140m in FY 2026" (non-OTC = futures + prediction markets + share dealing, not PM alone). (H, results dated 2026-08-10.)
- **Displayed numbers are Kalshi's, not Plus500's** (2026-10-19, H as displayed, M as to meaning): "Fed decision in Oct 2026?" $12.44m "VolumeInDollars" (Kalshi event total, closes 2026-10-28); "2026 Midterms: Congress Balance of Power?" $42.2m; Dallas-Green Bay spread $12.66m (Plus500) vs $14.06m (Kalshi sum, same minute); BTC above $200k by 2027 $11.97m. Do not count any of this as Plus500 liquidity.
- Whether Plus500 customer orders rest in Kalshi's book (adding depth) or are internalised: NOT FOUND. Identical quotes and a matching "100c = no quote" convention make internalisation unlikely (M).

---

## 11. Event-category overlap and shared liquidity

**Shares liquidity with Kalshi: completely** (verified this session, H data / M inference):

| Check (2026-10-19) | Result |
|---|---|
| Fed Oct 2026 event, Plus500 33620 vs Kalshi `KXFEDDECISION-26OCT`, within seconds | Yes bid/ask H0 86/87 vs 0.86/0.87, H25 12/13 vs 0.12/0.13, C25 null/1 vs 0/1, H26 null/1 vs 0/1; volumes H0 5,686,169 vs 5,686,169.65, H25 4,094,420 vs 4,094,435.44, H26 988,241 vs 988,241.80. Plus500 omits Kalshi's 5th market (C26). |
| Live NFL spread, Plus500 437130 vs Kalshi `KXNFLSPREAD-26OCT18DALGB`, fetched 1 s apart | 28/28 markets matched by title. Quotes (null treated as 0c bid / 100c ask): 24 of 28 identical, 4 differ by one tick. Volume: 12 of 28 within 1% (idle thresholds, e.g. 254,351 vs 254,351.26); the active ones lag Kalshi, up to about 53% on one threshold (computed from the fixture) |

Fixtures: `kalshi-compare-KXFEDDECISION-26OCT.json`, `compare-live-nfl-spread-437130-vs-KXNFLSPREAD-26OCT18DALGB.json`.

Category tree (H, `sat-categories.json`) mirrors Kalshi's: Sports (baseball, basketball, cricket, darts, esports, football, golf, hockey, MMA, motorsport, soccer, tennis), Politics, Elections (2028, governor, house, senate, combos), Economics (Fed, GDP, inflation, jobs, oil), Financials (indices, rates, FX, S&P, IPOs, KPIs), Crypto (BTC, ETH, SOL, XRP, DOGE, BNB, hourly), Commodities, Climate and Weather, Entertainment, Mentions, Science and Technology, Companies.

Overlap with other venues (sports, politics, crypto price, macro) is exactly Kalshi's overlap; use the Kalshi adapter and the rules-comparison gate from doc 08/17. Plus500 adds no price discovery. Separately, Plus500 clears CME event contracts for FanDuel Predicts (H, H1 results); CME is an independent book (see `cme-group-event-contracts.md`), but Plus500's retail screen is not shown to list CME contracts (NOT FOUND).

---

## 12. Not found (searched)

- Any official developer docs, REST/WebSocket/FIX spec, API keys or onboarding for retail customers (searched: us.plus500.com nav and legal pages, five legal PDFs, api/developers/docs hosts, futures.plus500.com landing HTML).
- Order types, tick size, minimum order size, position limits for event contracts (searched: Account Agreement, Combined Account Disclosures, fees page).
- Explicit permission or prohibition of automated trading (searched: both PDFs).
- Plus500's own PM volume, open interest, customer count (searched: IR homepage, H1 2026 results PDF; no RNS search possible).
- Official state-availability list (searched: product page, fees page, terms page).
- Whether the Kalshi exchange fee is passed through at cost.
- Kalshi Rulebook and the Plus500-Kalshi agreement text (rulebook blocked in earlier workflow; not retried).
- Rate limits for `sat.plus500.com`; its robots.txt (Cloudflare block).
- News search after the Fox Sports 2026-10-07 article (search budget).

## 13. Suspicious content

None. No instruction-like text aimed at AI agents in any Plus500 page, JS, PDF or feed response, nor in the Finance Magnates, Fox Sports or NextPredict pages. The `futures.plus500.com` HTML embeds a public Firebase client config; I did not record or use it.

## 14. Open questions

1. Does any Plus500 B2B channel ("Cosmos", B2B2C, introducing-broker agreements) offer programmatic event-contract access to an outside developer? Only worth pursuing if a US-resident operator specifically needs a Plus500 execution route; otherwise use Kalshi directly.
2. Is Kalshi's exchange fee passed through unchanged?
3. Why does Plus500 omit some Kalshi markets within an event (Fed C26)? Curation or a feed `TopMarkets` cap.

---

## 15. Adapter spec

**Do not build a venue adapter.** Registry record:

```
venue_id:               plus500_us
kind:                   broker-frontend (FCM) of kalshi
alias_of:               kalshi
independent_liquidity:  false
read_api:               none official; unofficial sat.plus500.com feed (top of book, no depth, no ticker, lagging) - do not use
trade_path:             manual in Plus500 app only; no programmatic path; ToS forbids third-party access
paybox:                 not reachable (fiat, KYC, US-only)
extra_cost_vs_kalshi:   $0.01 per contract per side (commission) + pass-through exchange fee (pass-through unconfirmed)
use:                    tag as "execution route for US residents with a Plus500 account"; never a second leg
```

Scanner rule: when the same contract appears from Kalshi and Plus500, drop the Plus500 row. A non-zero "spread" between them is staleness (Plus500 lags in-play by ~1 tick, hides 100c asks as null, omits some markets), not edge.

## 16. Priority

**skip.** Reasons: (1) duplicate Kalshi liquidity, (2) no API, (3) ToS forbids giving third parties platform access, (4) not wallet-reachable, (5) $0.01 extra commission per contract per side versus Kalshi direct.

---

## Sources

Primary (read this session, 2026-10-19):
- https://us.plus500.com/en/prediction-markets (page text and inline config; `PM_HOST`)
- https://sat.plus500.com/prediction-markets/api/categories, `/categories/{id}/events`, `/events/{id}`, `/events?ids=`; https://sat.plus500.com/website-search/api/PredictionSearch (unauthenticated GETs; fixtures)
- https://us.plus500.com/en/feescharges (fees, deposit methods, FAQ)
- https://us.plus500.com/en/support//termsandagreements (index of legal PDFs)
- Account Agreement V.10 Sep 2026: https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1790084354/7/UserAgreement.pdf (text extracted locally)
- EULA V.5 Jul 2026: https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1784816616/3/EndUserLicenseAgreement.pdf
- Combined Account Disclosures V.7 Jul 2026 (Event Contracts Risk Disclosure): https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1784816752/5/CombinedAccountDisclosures.pdf
- Firm Disclosure (as of 2026-09-15): https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1790575895/7/CCFirmDisclosure.pdf
- Plus500 Ltd H1 2026 interim results, 2026-08-10: https://cdn.plus500.com/Media/Investors/Reports/Plus500_Interim_Results_1H2026.pdf (linked from https://investors.plus500.com/)
- https://us.plus500.com/robots.txt, https://www.plus500.com/robots.txt, https://futures.plus500.com/ (landing HTML only)
- Kalshi public market data for comparison: https://external-api.kalshi.com/trade-api/v2/markets?event_ticker=KXFEDDECISION-26OCT ; https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=KXNFLSPREAD-26OCT18DALGB
- In-repo (earlier workflow, read as M for claims I did not re-verify): `docs/research/08-venues-polymarket-kalshi.md`, `docs/research/venues/plus500-futures-us-event-contracts.md`, `docs/research/venues/cme-group-event-contracts.md`

Secondary (M, WebFetch small-model summaries):
- https://www.financemagnates.com/forex/plus500-launches-predictions-markets-in-the-us/ (2026-02-03)
- https://www.foxsports.com/stories/betting/websites-like-kalshi (2026-10-07; discovery evidence)
- https://nextpredict.io/platforms/plus500/ (2026-09-07; state counts, sports list, fees)
