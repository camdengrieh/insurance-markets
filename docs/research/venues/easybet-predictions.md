# easyBet Predictions (www.easybet.net) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes about 02:05-02:20 UTC). READ-ONLY. Tags: **H** = read first-hand in a primary source this session (URL cited), **M** = secondary source or my inference from first-hand data, **L** = weak or stale.

What I did: fetched public web pages and the public Matchbook developer docs, read the site's public JS bundle as text (never executed), and sent about 25 unauthenticated GETs with the generic User-Agent `insurance-markets-research/0.1` to `www.easybet.net` and `www.matchbook.mx`. These are the same anonymous calls the public web app makes for every visitor. No account, no login, no key, no wallet, no POST/PUT/DELETE, no payment, no WebSocket connection, no browser automation. Third-party text was treated as untrusted data. The WebSearch budget ran out after two searches, so press context comes from direct page fetches only.

Disclosure on terms: easyBet's Terms (section 5) forbid automated interaction, scraping and "probing" by API users without written authorisation. I am not a member and made a small, anonymous, read-only number of calls, but any production adapter against this brand needs that authorisation (section 9).

Fixtures (each <= 50 KB, unauthenticated GETs, no personal data): `docs/research/fixtures/easybet-predictions/` (listed at the end).

---

## 0. Bottom line

1. **Live, regulated (UK + Alderney), fiat-only, white-label front end of Matchbook's "Predictions" product.** easyBet Predictions is not its own book. The same backend (`edge-api`, host header `ui-exchange-easybet-predictions`) serves easybet.net and matchbook.mx, and the PREDICTIONS ladder for the same event was **byte-identical on both brands** (H, `cross-brand-same-book-check.json`). It is **one venue family: Matchbook Predictions (operator Triplebet Ltd)**. For arbitrage it is **one leg, not several**, and it is **not** the same book as Matchbook's own back/lay exchange (separate liquidity, section 11).
2. **Read API exists and is anonymous on the brand host**: Matchbook "edge" REST (`/edge/rest/v2/events?product=PREDICTIONS&exchange-type=binary&odds-type=PROBABILITY`), JSON, percent prices, YES/NO ladders (`win`/`lose` sides), 246 events and 3,290 markets today (H). Official docs are public at developers.matchbook.com. Note the official docs do not document the `product` parameter, `win`/`lose` semantics or the WebSocket (section 5).
3. **Trade path is not agent-friendly**: username/password session (KYC, GBP, UK/Ireland), and easyBet's Terms say any automated use needs prior written API authorisation at easyBet's sole discretion, plus a ban on redistributing or benchmarking its market data (H, section 9).
4. **Not reachable through PayBox**: no crypto rails at all, no on-chain representation (section 6).
5. **Costs**: commission 5% of net profit for accounts registered on/after 2026-01-14 (2% for earlier ones), plus 100 GBP per million GET requests on the API tier (H, section 7). The 5% is a heavy edge hurdle for thin binary markets.
6. **Liquidity is retail-sized**: median top-of-book about 11 GBP per side, median YES spread 2 points, 35% of 3,290 markets have any quote, and cumulative matched volume across all Predictions markets is about 453k GBP, of which **429k GBP is one market** (Super Bowl LXI Winner); the other 34 non-zero markets total about 24k GBP (H, derived 2026-10-19).
7. **adapter_priority = P2**: cheap read-only signal adapter (UK sports exchange-style prices for soccer, NFL, tennis, UK/US politics), never a trade leg. If an arbitrage leg on this family is ever wanted, integrate via Matchbook's own brand/API terms, not easyBet's.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Site | `https://www.easybet.net/` HTTP 200, title "easyBet - Bet Yes or No on Trending Markets", description "Part of the easy Group", `last-modified: Fri, 09 Oct 2026`, backend header `x-hap-be: ui-exchange-easybet-predictions/...prod` | H https://www.easybet.net/ |
| Live data | `GET /edge/rest/v2/events?...&product=PREDICTIONS` -> `total: 246` events; NFL game Dallas Cowboys at Green Bay Packers was in-play with `last-price-update-time: 2026-10-19T02:09:35Z` | H (fixtures `events-list-sample-2.json`, `event-detail-nfl-predictions.json`) |
| Operator | Triplebet Limited (Alderney co. no. 1827), GB Gambling Commission account 39504: five Active remote licences (Betting Intermediary, Casino, General Betting Standard real and virtual event, Pool Betting). The register page shows "2 trading names and 5 domain names" but the names themselves were not readable in the fetched extract | H https://www.gamblingcommission.gov.uk/public-register/business/detail/39504 ; Terms definitions |
| Launch | Matchbook launched its UK Predictions product in January 2026 with easyBet as first white-label (press, M); easyBet's sportsbook then became Predictions (GamblingIQ dated 28-29 May 2026; MyBettingSites dated 8 Jun 2026, both M). The Terms' commission step on 2026-01-14 (section 7) fits a January start (M). Exact launch date: NOT FOUND | M |
| Press on the Matchbook link | "Matchbook already white-labels easyBet Predictions" (NextPredict, 11 Jun 2026); GamblingIQ: "powered by Matchbook"; Register lists easyBet as a white-label domain alongside Matchbook (per GamblingIQ) | M |

Verdict: **still_live = true** (H).

Domain confusion to avoid: `easybet.com` is an unrelated affiliate review site that says it is "not owned, managed, or controlled by any betting operator" (H, fetched). `www.easybet.co.uk` presents a TLS certificate for an unrelated domain (`spyeyeloots3.online`), so it is not the product and should not be visited or used (H, curl error, `response-headers-and-host-checks.txt`). The real product is `easybet.net`.

---

## 2. Kind and market model

- **Kind: sportsbook-exchange variant (fiat, centralised, peer-to-peer matching).** FAQ: "All Prediction Market bets are matched between users... You are always betting against other participants, never against the house" (H, `easybet-prediction-faqs.txt`, from the site's CMS). Central limit order book per runner; no AMM, no parimutuel.
- **Binary framing over an exchange engine.** Each market has `type: "binary"` and runners (2 for a match winner, up to about 32 for an outright). The UI shows YES/NO with probability percentages; the API shows `win` and `lose` price lists per runner in `odds-type=PROBABILITY` (H, fixtures).
- **Categorical = several runners in one market** (`number-of-winners`: 1; e.g. Super Bowl LXI Winner has 32 runners, EPL outright, US House control has 2). Market types seen (counts of 3,290 markets): handicap 1,564; total 975; one_x_two 133; both_to_score 127; correct_score 127; other 127; half_time_full_time 119; money_line 84; outright 20; place 12 (H, `catalogue-stats.json`). Handicap and total lines are separate markets per line.
- **Price semantics (M, inferred from comparing with the same event's back/lay exchange market and the mirrored runner):** a runner's `win` ladder is the cost in percent (cents per 1 payout) of buying YES, best first (lowest). Its `lose` ladder is the cost of buying NO, best first. So YES bid = 100 minus best `lose`; the spread in points = best `win` + best `lose` - 100. Example: Cowboys `win` 16.0 and `lose` 85.0 gives a YES ask 16 and bid 15; these line up with the exchange market's back 6.2 (16.1%) and lay 6.6 (15.2%). The official docs list `win`/`lose` as `side` values but never define them.
- **Mirrored prices (H that the flag exists; M on meaning):** by default the binary view also shows prices mirrored from the complementary runner, so the `win` ladder of runner A equals the `lose` ladder of runner B. Passing `exclude-mirrored-prices=true` returns originator orders only (docs: "only originator prices, as non-binary markets do"); in my test the originator-only amounts were smaller than the merged ones (e.g. 96 vs 101.9 at 22%). For depth and anti-double-counting use `exclude-mirrored-prices=true`.
- **Tick:** probability steps of 0.1 percentage point at the extremes (0.1..99.9 seen) and coarser mid-range (e.g. 2.5 then 2.7), following the decimal-odds ladder (H, 7,071 price levels sampled; the docs page https://developers.matchbook.com/docs/probability-odds-ladder.md is a conversion table only).
- **No fixed contract size**: "There are no fixed contract sizes, bet any amount you choose" (H, FAQ). Return = stake / price. Positions are closed by taking the opposite side; this works only if there is liquidity (H, FAQ). A "Cash Out" feature exists (H, Terms 8.3).
- **Outcome tokenisation: none.** Positions are rows in an internal ledger in GBP (H by absence: no wallet, chain or contract references anywhere in the site, docs or Terms; NOT FOUND, searched: site bundle, developers.matchbook.com, Terms, FAQ).
- **Lifecycle:** market `status` open/suspended/closed; sports event settlement by the operator per published sports rules (section 8). In-play betting is supported (`in-running-flag`, `allow-live-betting`, `keep-in-play`) with bet delays (H, docs; `delayed` offer status).

---

## 3. Chains and collateral

- **No chain.** Fiat only. Currencies exposed by the platform: GBP, USD, EUR, CAD, AUD (and some private ones) at account level (H, bundle; `currency` parameter docs list USD, EUR, GBP, AUD, CAD, HKD). UK/IE easyBet accounts are presumably GBP (M; the Terms say "depending on account currency").
- Payments are via card/bank rails (the CSP allows `cdn.safecharge.com`, a Nuvei payment script). The NEXT.io guide lists "no crypto payment option" as the only con (H, https://next.io/prediction-markets-uk/). Token, bridge and on-chain settlement: not applicable.

---

## 4. Identity and relation to other venues

- easyBet Predictions = **white-label skin** of the Matchbook platform. Evidence: (a) the web bundle is the Matchbook UI build with host lists `www.matchbook.com`, `www.matchbook.mx`, `www.easybet.net`, `predictions.matchbook.com`, `www.blueprint.net` and a South African `betmatch` brand (H, public bundle); (b) the same `edge-api` backend answers on easybet.net and matchbook.mx with identical Predictions ladders and event volumes (H, `cross-brand-same-book-check.json`); (c) Terms name Triplebet Ltd as "easyBet"; the Gambling Commission account 39504 is Triplebet "trading as Matchbook" (M, GamblingIQ).
- The UI string for Matchbook's own predictions site reads "{{name}} Predictions Betting | Predict Street x Matchbook" (H, bundle). That is a co-branding with **ADI Predictstreet** (announced 11 Jun 2026: World Cup Yes/No markets for UK, Ireland, Brazil, ADI Predictstreet's CEO crediting Matchbook's "technical infrastructure") (M, NextPredict). The ADI Predictstreet venue has its own on-chain CLOB (see `docs/research/venues/adi-predictstreet.md`); nothing I found shows the two order books are merged (NOT FOUND, searched: easyBet FAQ and Terms, bundle, press). Treat as distribution/branding, not shared liquidity (M).
- Terms 12.8: "easyBet partners with liquidity providers (including our shareholders)" (H). So some resting liquidity is probably market-maker liquidity from the owners; the headline 429k GBP Super Bowl market volume may include such flow (M).

---

## 5. Read API

**Official docs (H): https://developers.matchbook.com/** (ReadMe site, `llms.txt` index at https://developers.matchbook.com/llms.txt). It documents the Matchbook "edge" REST API: Security (login, logout, session), Account and Wallet, Event and Market Data (sports, navigation, events, markets, runners, prices, popular), Betting v2 (submit/edit/cancel/get offers, positions, aggregated matched bets), Reports, Reference Data, Heartbeat, changelog (H). It documents **no streaming API**.

**Base URLs:**
- Official: `https://api.matchbook.com/edge/rest/...` and login at `https://api.matchbook.com/bpapi/rest/security/session` (H, docs). Today `api.matchbook.com`, `www.matchbook.com` and `predictions.matchbook.com` all return HTTP 403 with `cf-mitigated: challenge` (Cloudflare managed challenge) to scripted unauthenticated requests (H, `response-headers-and-host-checks.txt`).
- Brand hosts answer the same paths without a challenge: `https://www.easybet.net/edge/rest/...` and `https://www.matchbook.mx/edge/rest/...` returned HTTP 200 JSON anonymously (H). Backend header `x-hap-be: edge-api/ed-edgeNNNprod`.

**Key endpoints (all unauthenticated GET unless noted; H = observed 200 on easybet.net):**

| Purpose | Request | Notes |
|---|---|---|
| Sports taxonomy | `GET /edge/rest/lookups/sports?per-page=100` | 49 sports incl. Soccer (15), Tennis (9), American Football (1), Politics (385227477790005), TV Specials, Current Events (H) |
| Event list with books | `GET /edge/rest/v2/events?currency=GBP&exchange-type=binary&odds-type=PROBABILITY&product=PREDICTIONS&price-depth=3&price-order=price%20desc&include-event-participants=true&per-page=100&offset=0&market-states=open,suspended&runner-states=open,suspended&market-auto-sequence=true` | Parameters copied from the public web bundle (the official docs page for `GET /edge/rest/events` lists `exchange-type`, `price-depth`, `side`, `minimum-liquidity`, `exclude-mirrored-prices`, `markets-limit`, `sport-ids`, `category-ids`, `states`, `after`/`before`, but **not `product`**). Response `total: 246`, `events[].markets[].runners[].prices[]` (H) |
| One event, all markets | `GET /edge/rest/v2/events/{eventId}?...&include-markets=true&include-prices=true&include-runners=true&market-per-page=500&product=PREDICTIONS` | H |
| Filtering | `sport-ids=`, `category-ids=`, `tag-url-names=`, `ids=`, `markets-limit=`, `market-types=` | `sport-ids=385227477790005` returned the 5 politics events (H) |
| Per-runner prices | `GET /edge/rest/events/{eventId}/markets/{marketId}/runners/{runnerId}/prices?exchange-type=binary&odds-type=%25...` | documented, not exercised (H docs) |
| Positions, offers, balance | authenticated (`/edge/rest/v2/offers`, `/edge/rest/account/balance`, reports) | section 6 |

**Response shape (H, `event-detail-nfl-predictions.json`):** event `{id, name, sport-id, start, status, volume, in-running-flag, category-id[], event-participants[], markets[], meta-tags[]}`; market `{id, name, product:"PREDICTIONS", type:"binary", market-type, status, volume, back-overround, lay-overround, number-of-winners, handicap?, runners[]}`; runner `{id, name, status, handicap?, volume, prices[], last-price-update-time}`; price `{side:"win"|"lose", odds (percent), decimal-odds, available-amount, currency, odds-type:"PROBABILITY", exchange-type:"binary"}`.

**Gotchas for the adapter:**
- **IDs exceed JavaScript's safe integer range** (about 3.3e16). Send header `X-Id-Type: String` (the web app does) to receive ids as strings (H: with the header, `"id":"34438307757000081"`; without it, numbers).
- **One event carries two products**: the same `event id` holds EXCHANGE markets (back/lay) and PREDICTIONS markets with different market ids. Event `volume` is the sum of both products (Super Bowl: exchange market 305,126 + Predictions market 429,130 = 734,256 GBP, H). Always filter `product=PREDICTIONS` and read market-level volume.
- `minimum-liquidity`: the docs say default 2; the changelog (undated, old) says 10 for non-racing; observed levels as small as 0.9987 GBP appear in default responses (601 of 7,071 levels under 2). Pass the value explicitly.
- Amounts are in the request `currency` (converted), unit semantics of `available-amount` for each side are not documented (M: taker stake).
- Percent odds are floats (e.g. 91.4); keep as decimals or convert via `decimal-odds`.
- Politics and outrights are `markets-limit`-light, but soccer events have dozens of handicap/total markets (3,290 markets over 246 events); page with `per-page` <= 100 (the three-page walk was about 4.4 MB).

**Rate limits (H, https://developers.matchbook.com/docs/fair-usage-policy.md):** per customer user id or unique IP, per minute: Account 300, Events 700, Security 200, Navigation 100, Reports 40, Betting Write 3,000; default block 10 minutes. These are the Matchbook values; easyBet gives each authorised API user its own pre-agreed limits (Terms 5.3).

**WebSocket (M, reverse-engineered from the public bundle, not in the official docs, not connected):** `wss://{host}/edge/messages?X-Id-Type=String&interval=<ms>` with JSON control messages `parameters` (currency, exchange-type, odds-type, price-depth, price-mode) and `subscriptions` (`interested`: `{type:"event"|"market"|"cashouts", id}` plus `volumes`/`overrounds`). The web app uses it for live price pushes. The REST poll is the documented route.

**Price/trade history:** the UI calls `/ui/api/v1/price-graphs?runner-ids=..&view=day` (M, bundle). Public trade tape: NOT FOUND (searched: docs index, bundle). Resolution/settlement status via `status` on markets/runners and authenticated settled-bet reports.

---

## 6. Trade path and PayBox reachability

**Trade path (H, docs):** log in with `POST https://api.matchbook.com/bpapi/rest/security/session` `{username, password, mfa-code?}` -> `session-token` (cookie or header named `session-token`; session about 6 hours). Place orders with `POST /edge/rest/v2/offers` body `{"odds-type":"DECIMAL","exchange-type":"back-lay","offers":[{"runner-id","side":"back|lay|win|lose","odds","stake","keep-in-play","use-bonus"}]}`; edit with `PUT /edge/rest/v2/offers`, cancel via the documented cancel-offers endpoints; read offers, positions, wallet via the Reports and Account endpoints. The Submit Offers page says **"binary mode is no longer supported for new offer submissions"** (H), so how a Predictions YES/NO order maps to back/lay on a PREDICTIONS runner is **unverified** (the web app posts to the same `/edge/rest/v2/offers`, but I did not observe a predictions order and will not place one).
- Auth is **username + password (+ optional MFA)**; no wallet signature, no API key, no EIP-712. Every order is an authenticated HTTPS call on a KYC'd account.
- Matchbook's own docs: "Any registered Matchbook customer can use the API immediately with their standard login credentials" (H, pricing page). **easyBet's Terms differ** (section 9).

**PayBox / EVM reachability: NO.** There is no on-chain contract, no token, no EVM/Solana address and no crypto deposit path, so transaction proposals or signed orders from a PayBox wallet cannot reach this venue. Funding is GBP card/bank into a KYC'd account (identity, address, source-of-funds checks, Terms 2.4). A PayBox x402 or service route is also not applicable. (H by absence; NOT FOUND, searched: site, docs, Terms, FAQ for any wallet or crypto reference.)

---

## 7. Fees

- **Commission (H, easyBet Terms 6.4, https://www.easybet.net/page/rules_and_regulations/terms-and-conditions, CMS item modified 2026-04-27):** "easyBet customers located in the United Kingdom and Ireland shall be charged a commission rate on net profits as follows: registered on or after January 14th, 2026 - 5% commission. registered prior to January 14th, 2026 - 2% commission." Paid by the winning side (net profit per settled market, standard exchange convention, M). The Terms are general to the "Exchange"; they do not carve out Predictions, so I assume the same rates apply (M). The press says only "a small commission on matched bets" (M).
- **Commercial Members** (Terms 6.5): "Transactional Rate" (percent of each bet), "Market Commission Rate", and "Revenue Share" can be added (H). A market-making or arbitrage account would likely be classed as commercial (Terms 4.4: accounts used "for commercial purposes without easyBet's approval" can be suspended).
- **API charges (H, Terms 5.4 and developers.matchbook.com/docs/pricing.md):** 100 GBP per set of 1 million READ (GET) requests per month; WRITE requests free at reasonable frequency; "Trader" and "Commercial" tier fee amounts are referred to but not published.
- **Processing fee** if deposit/withdrawal activity is not matched by sufficient play (Terms 6.2, H).
- **Edge impact (M, simple math):** at a 5% net-profit commission, buying YES at 60% costs 60 and nets 40 x 0.95 = 38 if it wins, so the break-even true probability is 61.0%, about 1 point worse than the price; at 10% it is 10.5%. Add the typical 2-point spread: cross-venue edges below roughly 3-4 points are not capturable here.

---

## 8. Resolution mechanism and dispute risk

- **Centralised, operator-run.** Triplebet lists and settles markets itself (FAQ: "Additional events curated by the easyBet team"; Prediction Market rules "refer to the Market Rules" for cancellations and postponements, H). No oracle, no on-chain dispute window.
- **Rule text (H, easyBet sports rules, CMS item `sports-rules`, about 66k characters):** sports markets settle on official results/statistics (e.g. NFL props "settled on official statistics provided by the NFL"; moneyline void on a tie after overtime; fixtures cancelled and refunded if moved to a different date or venue; abandoned matches void unless 55 minutes or an official result); politics: "Political nomination markets are settled based on official announcements at the relevant party convention"; results are not changed by later disqualification "except if an amendment is announced within 24 hours of the initial settlement... to correct an error". easyBet "reserves the right to void all bets" in listed abandonment cases (H).
- **Void/push risk is non-trivial for arbitrage:** moneyline voids on ties (NFL), per-sport quirks (tennis retirement rules, soccer 90 minutes only unless stated), and the operator's right to void make cross-venue hedges against Polymarket/Kalshi resolution wording risky. Use the exact market rules, not the title.
- **Disputes (H, Terms 14-15):** internal complaint -> IBAS (Independent Betting Adjudication Service) for GB customers, or the Alderney Gambling Control Commission for others; complaints must be raised within 6 months. No community dispute.
- **Counterparty risk:** custodial fiat account at a UK-licensed operator (Gambling Commission licence 039504, Alderney head office); a Trust Deed page exists (`/page/none/trust-deed`, referenced in the bundle, text not read). Reputation: Matchbook is a two-decade-old exchange (M, press).

---

## 9. Geo, ToS and automation (quoted sparingly)

- **Geo:** the bundle's market list is `GB, IE, MX, CA` for the Matchbook family; easyBet's own Terms refer to UK and Ireland customers and bar anyone for whom gambling is illegal in their jurisdiction (H, Terms 2.5). The platform geolocates (`/edge/rest/locale`). US users are not offered the product (the US route is a separate pending RSBIX/CFTC plan, M). KYC with ID, address and source-of-funds is required (H, Terms 2.4).
- **Automation:** "any interaction with the easyBet platform... in an automated way (e.g. not by a human operator) is only permitted where API users have completed the API Usage Inquiry Form and undergone an authorisation process and where easyBet has given express permission... easyBet shall have total discretion" (H, Terms 5). Forbidden examples: "odds scraping, browser impersonation, browser automation... any attempt to reverse engineer or probe the functionality of the easyBet exchange platform" (H).
- **Data redistribution and benchmarking:** "You may not forward, sell or otherwise distribute any information coming out of the easyBet platform to third parties" and "may not use the API, and any data derived from the consumption of it, to benchmark or compare easyBet's products, markets, prices and liquidity... in the public domain" (H, Terms 5.3). Matchbook's Fair Usage Policy similarly bars redistribution/syndication and "benchmarking or competitive purposes" (H, section 4 of that policy). **An aggregator that republishes easyBet prices to its own users, or publishes cross-venue comparisons, is in breach territory; internal signal use under a granted API licence is the only clean mode.**
- **Recreational-use clause:** "easyBet is made available to its Members for recreational betting and gaming purposes only"; commercial use needs approval (H, Terms 4.3-4.4).
- **Account risk:** exchange-style operators limit or close arbitrageurs; easyBet may suspend, cancel trades and seek injunctions for misuse of the API (H, Terms 5.1).

---

## 10. Liquidity (all GBP, 2026-10-19 ~02:10 UTC unless stated)

Source: three paged GETs of the Predictions event list (price-depth 1) plus detail fetches; derived stats in `catalogue-stats.json` (H for the numbers, M for what "volume" means; the docs do not define it).

| Metric | Value |
|---|---|
| Events / markets | 246 events, 3,290 markets (all open) |
| Markets with any resting quote | 1,156 (35%): outright 15/20, one_x_two 124/133, money_line 78/84, handicap 522/1,564, total 284/975 |
| Cumulative matched volume, all Predictions markets | about 453,142 GBP (not 24h), over 35 markets with non-zero volume |
| Largest single market | "Super Bowl LXI Winner" / Winner: 429,130 GBP (event total 734,256 = Predictions 429,130 + exchange 305,126) |
| Next largest Predictions markets | Ballon d'Or Winner 2026: 7,858; Strictly Come Dancing 2026 Winner: 2,913; Tottenham finish Top 4: 2,149; BBC Sports Personality of the Year 2026: 1,861 (`catalogue-stats.json` lists the top 8 by market id and event name) |
| Typical depth | median min(YES-side, NO-side) top-of-book size 11 GBP, p90 100 GBP |
| Spread | median 2 points between YES ask and YES bid, 66% of runners <= 2 points, 94% <= 5 points |
| Examples of resting size | US House control: Democratic Party YES ask 91.0 with 1,058 GBP; Republican Party YES ask 9.6 with 17 GBP (H, `event-detail-us-house-control-predictions.json`); NFL moneyline levels 5-475 GBP |

Event-level `volume` (for example 734k Super Bowl, 338k EPL 2026/27 outright, 124k Champions League winner) mixes the back/lay exchange and Predictions; do not use it as a Predictions metric. No TVL/OI figures exist (centralised). Liquidity is **thin and retail-scale** and the single large market looks atypical.

---

## 11. Event categories and overlap (where arbitrage could exist)

Events by sport (H): Soccer 149, Tennis 58, American Football 20, Ice Hockey 5, Politics 5, TV Specials 3, Basketball 2, Cricket, Baseball, Rugby Union, Boxing 1 each.

| Category | What is listed | Overlap with other venues |
|---|---|---|
| Soccer | Match Odds, Double Chance, BTTS, Correct Score, HT/FT, handicap/total lines, EPL/UCL/Europa/La Liga/Serie A; outrights (EPL winner, top 4/6, relegation, UCL winner, "World Cup 2027 - Winner") | High with Polymarket/Kalshi/Limitless sports and ADI Predictstreet; note 90-minute settlement and draw handling |
| American Football | NFL moneyline/handicap/total, Super Bowl LXI Winner | High with Kalshi/Polymarket; moneyline voids on ties |
| Tennis | 58 ATP/WTA events (R1 etc.) | Medium |
| Politics | US 2026 midterms House and Senate control, US Presidential 2028, UK Next Prime Minister ("after Andy Burnham"), Johannesburg mayor 2026 | High for US midterms and 2028 with Polymarket/Kalshi; UK PM overlaps Polymarket |
| Entertainment | Ballon d'Or 2026, BBC SPOTY 2026, Strictly 2026 | Low (Polymarket sometimes) |
| Crypto price, macro, weather, science | **None listed** | None |

Resolution wording differs from US venues, so identical titles are not identical contracts.

---

## 12. Shared liquidity

- **Shared across brands (H):** easybet.net and matchbook.mx (and, by the shared UI host list, matchbook.com / predictions.matchbook.com, M because Cloudflare blocks me there) show the same PREDICTIONS book. They are **one liquidity pool, one arbitrage leg**.
- **Not shared with Matchbook's back/lay exchange (H):** the site FAQ says "Do Prediction Markets share liquidity with the main Exchange? No. Prediction Markets have their own liquidity and matching separate from the easyBet Exchange." Verified in data: for the same event the Predictions market (id ending 679700023, volume 0) and Exchange "Moneyline" (id ending 679400023, volume 29,161) have different books and volumes. They do share the wallet and account.
- **Prices cross-reference the exchange:** both products quote near each other (Cowboys 16% vs 16.1% in my sample), so an in-house arbitrage between Predictions and exchange is possible for a member, but irrelevant to the aggregator.
- **ADI Predictstreet:** co-branded distribution, no evidence of a shared book (section 4).

---

## 13. Adapter plan (if built)

- **Scope:** read-only signal adapter. Poll `GET /edge/rest/v2/events?...product=PREDICTIONS` every 30-60 s per sport filter; or use per-event fetches for tracked events. At 3 pages x 1.3-2.3 MB per full catalogue walk, restrict by `sport-ids`, `markets-limit`, `price-depth=1..3` and `market-types=money_line,one_x_two,outright` to stay inside the 700 requests/min Events limit and the 100 GBP per million GETs tier.
- **Normalisation:** YES ask = best `win`; NO ask = best `lose`; YES bid = 100 - best `lose`; size = `available-amount` (GBP, taker-side semantics M). Request `exclude-mirrored-prices=true` for originator depth. Cache ids as strings. Treat `handicap`/`total` markets as separate binary contracts keyed by line.
- **Linking to other venues:** use event names, `start`, `meta-tags` (COMPETITION, COUNTRY, DATE) and `event-participants` names; there are no external ids (no ISIN-style, no Polymarket slug).
- **Compliance gate:** do not enable until easyBet (or Matchbook) grants written API authorisation; keep data internal; do not republish prices.

---

## 14. Suspicious content, NOT FOUND and open questions

**Suspicious content:** none aimed at AI agents. Notes for the registry: (1) `www.easybet.co.uk` serves a certificate for `spyeyeloots3.online` (parked or hostile domain, do not use); (2) `easybet.com` is an unrelated affiliate site; (3) NEXT.io's guide shows a promo code "YES30" (an affiliate offer, ignored); (4) `developers.matchbook.com` advertises `/.well-known/agent-skills/index.json` and `/.well-known/api-catalog` via `Link` headers; I did not fetch them.

**NOT FOUND:**
- Exact easyBet Predictions launch date (searched: NEXT.io, GamblingIQ, SBC News (403), MyBettingSites, NextPredict).
- Predictions-specific commission or any maker/taker split (searched: Terms, FAQ, rules, bundle, developer docs; the offer schema has `originator-commission-rate` and `acceptor-commission-rate`, but values are only visible after login).
- Official docs for `product=PREDICTIONS`, `win`/`lose` semantics, mirrored prices, the WebSocket, and how a binary order is submitted (searched: developers.matchbook.com all reference pages and llms.txt).
- Public trade tape, 24h volume, open interest (searched: docs, API surface).
- Whether easyBet (as opposed to Matchbook-branded) accounts can obtain API access, and the form URL ("API Usage Inquiry Form" text only).
- The Gambling Commission domain-name list for account 39504 (page links `/public-register/business/detail/domain-names/39504`, not read).
- Matchbook.com Predictions parity (Cloudflare challenge blocked my probes).

**Open questions:** What do prediction orders look like on the wire? Does the 5% apply on net profit per market or per day for Predictions? Are market-maker accounts exempt from the recreational-use clause? Is the 429k GBP Super Bowl market real two-sided flow or house/shareholder liquidity?

---

## Sources

- easyBet site and public JS/CSS: https://www.easybet.net/ (H; also `/assets/js/boot.87c9c25c37a240e5fcc9.js` read as text only)
- easyBet Terms and Conditions (CMS, modified 2026-04-27): https://www.easybet.net/ui/api/v1/cms/content?urlTitle=terms-and-conditions&contentType=StaticPage (H); site path https://www.easybet.net/page/rules_and_regulations/terms-and-conditions
- easyBet static pages (prediction-faqs, sports-rules): https://www.easybet.net/ui/api/v1/cms/content?contentType=StaticPage (H)
- easyBet / Matchbook edge REST (anonymous GETs): https://www.easybet.net/edge/rest/lookups/sports , https://www.easybet.net/edge/rest/v2/events , https://www.matchbook.mx/edge/rest/v2/events/{id} (H)
- Matchbook developer docs: https://developers.matchbook.com/ , https://developers.matchbook.com/llms.txt , docs: getting-started, pricing, faq, fair-usage-policy, probability-odds-ladder; reference: login, get-events, get-prices, get-account, submit-offers-v2; changelog: new-default-minimum-liquidity-parameter, v2-offer-endpoint-released (all https://developers.matchbook.com/..., H)
- Gambling Commission register, Triplebet Limited: https://www.gamblingcommission.gov.uk/public-register/business/detail/39504 (H)
- NEXT.io UK prediction markets guide: https://next.io/prediction-markets-uk/ (H for what it says: markets, offer, no crypto; no operator or licence detail)
- GamblingIQ, "Sir Stelios' easyBet pivots into World Cup prediction markets powered by Matchbook" (28-29 May 2026): https://www.gamblingiq.co.uk/post/sir-stelios-easybet-pivots-into-prediction-markets-powered-by-matchbook (M, trade press)
- MyBettingSites (8 Jun 2026): https://mybettingsites.com/news/easybet-launch-regulated-prediction-market-platform (M)
- NextPredict, Matchbook x ADI Predictstreet World Cup (11 Jun 2026): https://nextpredict.io/market-news/industry/matchbook-launches-world-cup-prediction-markets/ (M)
- Yogonet, Matchbook UK launch plan (12 Dec 2025): https://www.yogonet.com/international/news/2025/12/12/116747-matchbook-to-launch-uk-prediction-markets-in-january-as-it-eyes-us-expansion (M; older than 6 months only for the plan, not for the facts used)
- SBC News (403 to my fetch, appeared only in a search summary): https://sbcnews.co.uk/sportsbook/2026/06/11/world-cup-uk-predictions/ (L)
- Affiliate site (not the product): https://www.easybet.com/ (H that it is unrelated)

## Fixtures (docs/research/fixtures/easybet-predictions/)

`lookups-sports.json` (49 sports), `events-list-sample-2.json` (list envelope, 2 events, string ids), `event-detail-nfl-predictions.json` (11 PREDICTIONS markets, 3-deep win/lose ladders), `event-detail-nfl-exchange-product-for-comparison.json` (same event, EXCHANGE back/lay markets, first 3), `event-detail-superbowl-outright-predictions.json` (32-runner outright, 429k GBP market), `event-detail-us-house-control-predictions.json` (2-runner politics market), `cross-brand-same-book-check.json` (easybet.net vs matchbook.mx identical ladder), `catalogue-stats.json` (derived from the 246-event walk), `easybet-prediction-faqs.txt` (site FAQ text, includes the "no shared liquidity" answer), `response-headers-and-host-checks.txt` (backend headers, Cloudflare challenges on matchbook.com hosts, bad TLS on easybet.co.uk).

## Privacy check

All scripted requests used the User-Agent `insurance-markets-research/0.1`; no email, name, username or path was placed in any request, header, URL or search query. Fixtures were scanned for "@" and personal names with no hits.
