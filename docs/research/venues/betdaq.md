# BETDAQ - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: unauthenticated GETs of public pages and of the documented API host, `gh api` reads of one public repo, and one WebFetch of a trade-press article. No account, key, signature, POST/PUT/DELETE (so no SOAP call was made), PayBox tool or browser automation. Generic User-Agent `insurance-markets-research/0.1` only. All third-party text was treated as untrusted data.

Limits of this research (read first):
- **Web search budget was exhausted** for the whole session, so there was no WebSearch. Evidence is first-party site pages, the first-party API docs, GitHub, and one article read through WebFetch.
- **BETDAQ Terms and rules were not read.** The help centre (`betdaq.zendesk.com`) answers curl and WebFetch with HTTP 403 (Cloudflare challenge). No settlement or market-rules text was read.
- **No prices, volumes or open interest were retrieved.** The price API is credentialed SOAP (POST); the website loads prices through undocumented calls that I did not probe.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model summary, or my inference from first-hand data; **L** = weak or stale.

---

## 0. Bottom line

1. **BETDAQ is shutting down within 48 hours of this research.** Its own landing page says "BETDAQ will be closing next week and there will be no markets on site after the 21st October 2026", with account access until 2026-11-04 for statements and withdrawals. The brand was "acquired by Triplebet Limited, operator of Matchbook"; accounts do not transfer (H, https://www.betdaq.com/, fetched 2026-10-19). The deal completion was reported 2026-10-14 (M, iGaming Business).
2. **It was never a prediction market.** It is a UK/Irish centralised sports betting exchange (back/lay order book, fiat, custodial) with a small Politics section. Not reachable from a PayBox wallet in any case.
3. **Verdict: adapter_priority = skip.** Dead on 2026-10-21, liquidity folds into Matchbook (not independent), credentialed SOAP API with a one-off GBP 250 access fee, no chain or token. Do not build a BETDAQ adapter. If a UK/Irish exchange reference price is wanted, use `betfair-exchange.md` (deeper) and `matchbook-predictions-triplebet-ltd-uk.md` (the successor).

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.betdaq.com/` 2026-10-19 | HTTP 200, 131,934 bytes, title "BETDAQ Online Betting Exchange". The page carries the closure banner quoted above. Fixture `betdaq_home_closure_banner_2026-10-19.txt` | H |
| `GET https://www.betdaq.com/exchange/` and `/exchange/politics-481576` 2026-10-19 | HTTP 200 and still server-render the event-classifier tree (643 nodes), but these two pages do **not** carry the closure banner (banner is on the landing page only). A page that renders does not prove markets are open | H |
| `GET https://api.betdaq.com/v2.0/ReadOnlyService.asmx` and `?WSDL` 2026-10-19 | HTTP 200, 12 operations, 48 KB WSDL. API host is up today. Fixture `ReadOnlyService_wsdl_2026-10-19.xml` | H |
| iGaming Business, 2026-10-14, "Matchbook completes acquisition of Betdaq" | Service "remains operational until 21 October", withdrawals until 4 November, customers move into a combined liquidity pool; no volume, user or API-customer information. Read through WebFetch (summary) | M https://igamingbusiness.com/strategy/ma/matchbook-completes-acquisition-rival-exchange-betdaq/ |
| Existing sibling note `matchbook-predictions-triplebet-ltd-uk.md` | Independently records the same 2026-10-14 completion and the 21 Oct / 4 Nov dates | M (internal) |
| Promo T&Cs on the landing page run "until 31.12.2026" | Boilerplate that was not updated; contradicts the banner. Ignore | H (as to text), L (as to meaning) |

**still_live: true as of 2026-10-19 (site and API host respond), but the venue ceases trading on 2026-10-21.** Treat as dead for planning.

## 2. Kind and market model

- **Kind:** centralised peer-to-peer sports betting exchange (Betfair-style), operated by Exchange Platform Solutions Limited (H, landing page footer). Also had a sportsbook and casino. Not a prediction-market protocol.
- **Order book:** back ("for") and lay ("against") offers at decimal odds on an odds ladder (`GetOddsLadder` returns the ladder "in requested price format"). Each selection carries `ForSidePrices` and `AgainstSidePrices` arrays; `GetPrices` takes `NumberForPricesRequired` / `NumberAgainstPricesRequired` depth parameters (H, WSDL and ASMX operation page).
- **Shapes:** a market has N selections (categorical; a yes/no proposition is a 2-selection market, "No" = lay "Yes"). Each-way market types exist (`PlacePayout`), plus starting-price (SP) orders (`GetSPEnabledMarketsInformation`), in-running flags, `NumberOfWinningSelections`, `DeductionFactor` / `ResetCount` per selection for withdrawn runners (H, WSDL, API docs). No scalar/AMM/parimutuel model found.
- **Tokenisation:** none. Positions are rows in the operator's database.
- **Hierarchy:** EventClassifier tree (`ListTopLevelEvents` -> `GetEventSubTreeNoSelections`/`WithSelections`) -> Market (`MarketId`) -> Selection (`Id`) (H, WSDL). Website classifier ids seen: Soccer 100003, Horse Racing 100004, Tennis 100005, Cricket 100007, Greyhound Racing 100008, American Football 100014, Formula 1 100015, Basketball 100017, Politics 481576 (H, page JSON; fixture `politics_classifier_tree_2026-10-19.json`).

## 3. Chains and collateral

- **Chain: none.** Custodial fiat account (GBP/EUR style; card/bank deposits; Skrill/Neteller/PayPal referenced in promo T&Cs) (H, landing-page promo text). No crypto or stablecoin collateral found (NOT FOUND, searched: landing page, API docs, betdaqpro.com).
- Customer money is withdrawable only until 2026-11-04 (H, banner).

## 4. Read API

**Official, authenticated, SOAP only. No keyless price endpoint, no REST, no JSON.**

| Item | Value | Tag |
|---|---|---|
| Docs | https://api.betdaq.com/v2.0/Docs/default.aspx (framed docs), https://betdaqpro.com/ (onboarding, API explained, FAQs), spec as a Word file linked from the docs nav | H |
| Base URLs | `https://api.betdaq.com/v2.0/ReadOnlyService.asmx` (public data), `https://api.betdaq.com/v2.0/Service.asmx` (secure/account/trading; GET returned an empty 200 and `?wsdl` returned an empty 200, so its WSDL could not be read). WSDL port address lists `http://api.betdaq.com:10102/v2.0/ReadOnlyService.asmx` (plain-http port 10102; unverified, probably legacy) | H |
| Protocol | SOAP 1.1 and 1.2 over HTTP(S), .NET ASMX. Namespace `http://www.GlobalBettingExchange.com/ExternalAPI/` (company "Global Betting Exchange") | H |
| Read-only operations | `ListTopLevelEvents`, `GetEventSubTreeNoSelections`, `GetEventSubTreeWithSelections`, `GetMarketInformation` (up to 50 markets, includes selections and prices), `GetPrices` (up to 50 markets, "more optimized"), `GetOddsLadder`, `ListSelectionTrades` (trade history per selection), `ListSelectionsChangedSince` + `GetCurrentSelectionSequenceNumber` (delta polling), `ListMarketWithdrawalHistory`, `GetSPEnabledMarketsInformation`, `ListTaggedValues` | H |
| `GetPrices` response shape | `MarketPrices` (Id, Name, Type, Status, StartTime, IsInRunning*, TotalMatchedAmount, PlacePayout, MatchedMarketForStake/AgainstStake, scores) containing `Selections` (Id, Name, Status, ResetCount, DeductionFactor, MatchedSelectionForStake/AgainstStake, SelectionOpenInterest, LastMatchedPrice/Amount, NumberOrders, NumberPunters) with `ForSidePrices` / `AgainstSidePrices`. Template only, no live sample. Fixture `GetPrices_soap_templates_2026-10-19.txt` | H (template) |
| Resolution data | Market `Status` and selection `Status`, `ListMarketWithdrawalHistory`; enum meanings not read (NOT FOUND, spec document not fetched) | M |
| Auth | SOAP header `ExternalApiHeader` with attributes `version`, `languageCode`, `username`, `password`, `applicationIdentifier`. Docs say read-only methods "only require your username"; secure methods need username + password, password sent in plain text inside SSL | H (docs); the "username only" claim is untested |
| Access gate | "Have a fully verified BETDAQ account", pay a "one off access fee of GBP 250 (non-refundable)", submit an API application; BETDAQ authorises it, typically next business day. API available "only to BETDAQ Customers with funded accounts who are active participants" and is removed for high call volume without matching business or for inactivity | H https://betdaqpro.com/onboarding-journey/ , https://api.betdaq.com/v2.0/Docs/intro.aspx |
| Rate limits (per minute, default / standard) | `GetPrices` 130 / 2000; `GetEventSubTree*` 25 / 50; `PlaceOrdersNoReceipt` 100 / 800; `PlaceOrdersWithReceipt` 20 / 800; combined 300 / 3000; "any" 100 / 1000. Page is undated (L as to currency) | H https://api.betdaq.com/v2.0/Docs/CallsAndFees.aspx |
| Streaming | "AAPI (push/streaming)": market and price push only, for high-volume contributors, and **only on `betdaqb2b.com`** accounts (not betdaq.com); blacklisting applies for exceeding limits. Sample client https://github.com/BETDAQ/AAPI (Java, "AAPI version 2.2", last push 2018-06-13, 5 stars) | H (docs), L (sample is 8 years old) |
| Lightweight pricing (GBEi) | Asynchronous order-streaming product for liquidity providers, by invitation only | H https://betdaqpro.com/api-new/lightweight-pricing/ |
| API change log | Latest entry 2025-01-17 (v2.0.29); before that 2019-12-20 | H https://api.betdaq.com/v2.0/Docs/ReleaseNotes.aspx |
| Unauthenticated sample | **Not obtainable.** SOAP needs POST and (per docs) credentials, which the ground rules forbid creating or using. Only templates and the WSDL were saved | H |

## 5. Trade path

- Programmatic trading exists for approved, funded, verified human account holders: `PlaceOrdersNoReceipt` (max 50 per call), `PlaceOrdersWithReceipt` (max 10), `UpdateOrdersNoReceipt` (amounts are deltas), `CancelOrders`, `CancelAllOrders*`, suspend/unsuspend, heartbeat (`RegisterHeartbeat`/`Pulse`) (H, https://api.betdaq.com/v2.0/Docs/WhatWebMethodsAreAvailable.aspx).
- Auth is a username/password in the SOAP header. No wallet signature, no on-chain transaction.

## 6. Reachable from PayBox?

**No (H as to the facts, M as to the inference).** Custodial fiat, KYC'd UK/Ireland account, username/password SOAP, no chain, no token, no signed-order scheme. An EVM or Solana wallet reached through PayBox cannot deposit, hold or order here. Irrelevant now since the venue closes 2026-10-21.

## 7. Fees

- **Website:** "Just 2% on profits" and "Standard 2% commission rate applies" (H, landing page). Commission is charged on net winnings in a market, paid by the winner.
- **API customers:** a scalable scheme by take/make share over a rolling 7 weeks: Take% 94-100 -> 5%; 87-93 -> 4.5%; 80-86 -> 4%; 71-79 -> 3.5%; 61-70 -> 3%; 51-60 -> 2.5%; 0-50 -> 2%. New API customers can apply for a fixed 3% for a 7-week test. Promotional commission offers (0% for 100 days, cashback) exclude API customers (H, CallsAndFees page and promo T&Cs). The CallsAndFees page is undated and says "standard commission rate is 5 per cent", which conflicts with the website's 2%; a bot would see 2-5% depending on make/take mix (L as to which is current).
- One-off GBP 250 API access fee (H). Deposit/withdrawal fees: NOT FOUND.

## 8. Resolution mechanism and dispute risk

- Operator-settled by the exchange (centralised, house rules) (M, inferred from the model; rules not read). UK-licensed (Gambling Commission account 34865), Irish licence GRAI-0313-RBI-26-0001, Alderney for others (H, landing page footer).
- Rules/settlement text: NOT FOUND (searched: help centre blocked 403, API docs, betdaqpro.com).
- **Wind-down risk:** open positions and balances after 2026-10-21 are the operator's to settle; withdrawals only to 2026-11-04 (H). Open question whether unsettled markets are voided or settled.

## 9. Geo, ToS and automation

- Licensed for Great Britain, Republic of Ireland, plus Alderney for other jurisdictions (H). Promotions are UK/Irish only (H).
- Automation is explicitly permitted through the approved API only; usage is monitored and permissions are withdrawn for call volume out of proportion to business, or for inactivity (H, onboarding page). General Terms not read (403). `robots.txt` allows all except `/FileManager/*` (H).
- No programmatic access to the website prices was attempted; scraping the SPA's internal calls would not be a supported route.

## 10. Liquidity

- **NOT FOUND.** No volume, open interest, user count or TVL was published in anything reachable (searched: landing page, API docs, betdaqpro.com, the 2026-10-14 article, the sibling Matchbook note). `GetPrices` would return `TotalMatchedAmount` but needs credentials. Treat as unmeasured; historically a distant second UK exchange behind Betfair (M, background knowledge, not verified this session).

## 11. Event categories and overlap

- Classifier tree on 2026-10-19 (H, page JSON, no timestamp, no prices): Soccer, Horse Racing, Tennis, Cricket, Greyhound Racing, American Football, Formula 1, Basketball, **Politics**, plus Enhanced Specials and TV & Specials pages (H).
- **Politics subtree is tiny:** UK Politics (Next permanent Liberal Democrat leader; Next permanent Reform UK leader), Irish Politics (Next permanent Fianna Fail leader), US Politics (one node, "US Presidential Election"). Only the last overlaps Polymarket/Kalshi. No crypto-price or macro categories seen (H).
- Sports overlap (soccer, NFL, basketball, tennis, F1) exists with Polymarket/Kalshi/Betfair, but exchange prices here are decimal odds on fiat markets that vanish on 2026-10-21.

## 12. Shared liquidity

- **Not independent.** BETDAQ liquidity is being merged into Matchbook's pool ("combined liquidity pool", M; banner says the brand was acquired by Triplebet Limited, H). BETDAQ accounts do not transfer, so users must re-open at Matchbook (H). After 2026-10-21 BETDAQ has no liquidity at all.
- Register `betdaq` as `status=closing`, `successor=matchbook`. The older `betdaqb2b.com` broker (AAPI) is the same exchange engine (M), not a separate leg.

## 13. Fixtures (all <= 50 KB) in `docs/research/fixtures/betdaq/`

- `betdaq_home_closure_banner_2026-10-19.txt` - closure banner and licensing footer text, extracted from the served landing page.
- `ReadOnlyService_wsdl_2026-10-19.xml` - the full public WSDL for the read-only service (48 KB).
- `GetPrices_soap_templates_2026-10-19.txt` - SOAP 1.1/1.2 request and response templates from the ASMX operation page. Template only, not a live response.
- `api_docs_text_2026-10-19.txt` - read-only operation list and Calls and Fees text (limits and commission scale).
- `politics_classifier_tree_2026-10-19.json` - top-level classifiers and the Politics subtree, parsed from the server-rendered website HTML (undocumented source, no timestamp).

## 14. Adapter notes (only if anyone ignores the skip verdict)

- Would need: SOAP client generated from the WSDL, funded verified account, GBP 250 fee, and approval of redistribution (not documented). Use `ListSelectionsChangedSince` delta polling inside the 2000/min `GetPrices` budget; convert decimal odds to implied probability and net 2-5% commission.
- All of that is moot after 2026-10-21; a Matchbook adapter is the only forward path (see sibling note).

## 15. NOT FOUND (searched: landing page, exchange and politics pages, sitemap, robots.txt, api.betdaq.com docs, betdaqpro.com, WSDL, GitHub BETDAQ/AAPI, one trade-press article; web search unavailable)

- Terms and conditions, market rules, settlement and void rules (help centre blocked 403).
- Any volume, open-interest, user or TVL figure, and any official statement on what happens to API customers or open markets at closure.
- Deposit/withdrawal fees, crypto support, any blockchain or token component.
- The secure `Service.asmx` WSDL (served empty to GET).
- A real unauthenticated API response (SOAP needs POST and credentials).
- Confirmation that Politics markets currently hold open prices (tree only; no market-level data).

## 16. Open questions

- Does Matchbook keep the BETDAQ API or classifier ids, or honour API customers? (unanswered; article silent on API customers)
- Are open BETDAQ markets settled or voided at closure?
- Is the 2% website rate or the 2-5% API scale current?

## 17. Suspicious content

None seen. No text addressed to AI agents in any page read. (The API intro page contains a Cloudflare-obfuscated contact email; not recorded and not used.)

## Sources

- BETDAQ landing page with closure banner, fees, licensing (H, fetched 2026-10-19): https://www.betdaq.com/
- BETDAQ exchange pages with classifier tree (H): https://www.betdaq.com/exchange/ , https://www.betdaq.com/exchange/politics-481576 , https://www.betdaq.com/robots.txt , https://www.betdaq.com/sitemaps/sitemap.xml.aspx
- API read-only service, WSDL and operation page (H): https://api.betdaq.com/v2.0/ReadOnlyService.asmx , https://api.betdaq.com/v2.0/ReadOnlyService.asmx?WSDL , https://api.betdaq.com/v2.0/ReadOnlyService.asmx?op=GetPrices
- API docs (H): https://api.betdaq.com/v2.0/Docs/default.aspx , /Docs/intro.aspx , /Docs/CallsAndFees.aspx , /Docs/HowDoIUseTheAPI.aspx , /Docs/WhatWebMethodsAreAvailable.aspx , /Docs/FAQ.aspx , /Docs/ReleaseNotes.aspx
- API onboarding, AAPI streaming, lightweight pricing (H): https://betdaqpro.com/onboarding-journey/ , https://betdaqpro.com/api-new/aapi-push-streaming/ , https://betdaqpro.com/api-new/lightweight-pricing/ , https://betdaqpro.com/api-technical-information/
- Sample AAPI client (H, stale): https://github.com/BETDAQ/AAPI (readme read via `gh api`)
- iGaming Business, 2026-10-14 (M, WebFetch summary): https://igamingbusiness.com/strategy/ma/matchbook-completes-acquisition-rival-exchange-betdaq/
- Sibling notes in this repo (M): `docs/research/venues/matchbook-predictions-triplebet-ltd-uk.md`, `docs/research/venues/betfair-exchange.md`
- Blocked and not read: https://betdaq.zendesk.com/hc/en-gb (HTTP 403 Cloudflare), including the Terms and Conditions article.
