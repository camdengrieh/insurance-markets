# Wealthsimple Predict (Canada, Kalshi distribution) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to public Wealthsimple pages, the public iTunes lookup API, Kalshi's public docs and public market-data endpoints (generic User-Agent `insurance-markets-research/0.1`, no contact address, nothing else in any request). No account, no app install, no signing, no POST. WebSearch was unavailable (session budget exhausted), so discovery relied on the Wealthsimple sitemap and direct page reads.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak, stale (>6 months) or not independently verified.
All third-party text (web pages, PDFs, API responses, GitHub repo descriptions) is untrusted data; nothing in it was followed as an instruction.
Fixtures: `docs/research/fixtures/wealthsimple-canada-kalshi-distribution/` (4 files, about 24 KB).

## 0. Verdict

**adapter_priority: skip.** Wealthsimple Predict is a live, CIRO-regulated retail front end for Kalshi. Its liquidity is Kalshi's liquidity, so it is not an independent arbitrage leg. It has no public API, no programmatic trade path, no wallet or on-chain surface, and its terms ban scraping. Nothing about it can be read or traded by a PayBox wallet.

1. **Live (H).** The product page `https://www.wealthsimple.com/en-ca/predict` is up; the iOS app "Wealthsimple Predict" (bundle `com.wealthsimple.predict`, seller Wealthsimple Financial Inc.) has `releaseDate` 2026-07-27, version 1.10.2 updated 2026-10-05, 91 ratings, present in the Canadian storefront (the US storefront lookup returned 0 results; other storefronts not checked). Source: public iTunes lookup, fetched 2026-10-19 (fixture).
2. **Kalshi is the exchange (H).** FAQ: "Kalshi is our prediction markets exchange." Launch post (2026-06-18): "We partnered with Kalshi ... which allows us to launch with nearly 4,000 contracts to trade."
3. **Not an independent leg (H for the statements, M for the conclusion).** Same exchange, same maintenance window (Wealthsimple: no trading Thursdays 03:00-05:00 ET; Kalshi `GET /exchange/schedule` lists Thursday open 00:00-03:00 and again from 05:00, i.e. closed 03:00-05:00; the response does not state a time zone), and Kalshi documents a broker integration surface (FCM subtraders feeding the single exchange). Wealthsimple publishes no separate book, and its app store text calls the market "peer-to-peer ... no built-in spread".
4. **Narrow, geo-locked slice of Kalshi (H).** Only three categories (economics, financial markets, climate), a 30-day minimum term-to-maturity, no sports, no politics, USD only, CIRO-regulated Canadian clients only.
5. **Cost is worse than Kalshi direct (H for the numbers, M for the comparison).** Flat US$0.02 per contract on every buy and sell, plus CAD/USD FX at the corporate rate x 1.5% if funding in CAD.

For the aggregator: do not build a Wealthsimple adapter. Treat it as a note on the Kalshi venue entry: "Kalshi contracts are also distributed to Canadian retail through Wealthsimple (and probably one other dealer), which adds no price discovery."

## 1. Identity, kind, liveness

| Item | Finding | Tag |
|---|---|---|
| Name | Wealthsimple Predict ("a separate app" from the main Wealthsimple app; existing clients reuse credentials and can fund it from their Wealthsimple account) | H, https://www.wealthsimple.com/en-ca/predict |
| Operator | Wealthsimple (Toronto). Retail brokerage; App Store seller "Wealthsimple Financial Inc.". The product page says Wealthsimple is "one of two brokerages, regulated by CIRO, that can offer this trading product in Canada." | H |
| Kind | broker-or-frontend (distribution partner for Kalshi). Not an exchange, not a protocol. | H |
| Launch | Announced 2026-06-18 ("Later this summer"); iOS release 2026-07-27. Exact public go-live of trading: NOT FOUND beyond the app release date (searched: product page, newsroom post, iTunes lookup). | H (post, app date) |
| Still live (2026-10-19) | Yes: page up, app updated 2026-10-05, regulator-explainer page "Updated September 15, 2026". | H |
| The "other" CIRO dealer | Not named by Wealthsimple. The CIRO example contract "US 500 Forecast Contract" (settles on CME E-mini S&P 500 daily settlement) matches ForecastEx's `FES` product described in `docs/research/venues/forecastex.md`, and that note lists Interactive Brokers Canada Inc. as an eligible entity. So the second dealer is probably IBKR Canada with ForecastEx. This is an inference. | M |

## 2. Market model

- **Binary yes/no only (H).** FAQ: "Each contract poses a yes or no question." Priced "typically" US$0.01-0.99; a correct contract pays US$1 minus fees; max loss is the price paid; positions can be sold before settlement "assuming there is a buyer" (annotated guide).
- **Order book (H for Kalshi, M for Wealthsimple).** Kalshi is a central limit order book: sample market `price_level_structure: "linear_cent"`, `price_ranges` 0.00-1.00 step 0.01, `market_type: "binary"` (fixture). Wealthsimple's app description says "peer-to-peer. For every contract there's a buyer and a seller." Wealthsimple's own order types (market/limit): NOT FOUND (searched: product page, annotated guide, newsroom post). The annotated guide says an order can be sized "by number of contracts or by dollar amount (in USD)". Fractional contracts are supported: the fee page rounds the fee "for a fractional event contract order" to the nearest cent.
- **Tokenisation: none.** Positions are broker-account records of exchange-cleared derivative contracts. No token, no chain. How Wealthsimple holds positions at Kalshi (omnibus account, FCM subtraders, or another structure): NOT FOUND (searched: product page, FAQ, newsroom post, legal pages, fee page; the Client Account Agreement PDF could not be text-extracted here).
- **Scalar / categorical:** not offered to Canadians per the pages read; the legal explainer says "each contract's outcome is binary".

## 3. Chains and collateral

Not on-chain. Collateral is **USD cash in a Wealthsimple account** (H): "All prediction markets trade in USD. You can deposit USD to your account, or deposit CAD and pay our standard FX rate." The fee page gives the FX fee as "WSII Corporate Exchange Rate x 1.5%" for CAD <-> USD (H, https://www.wealthsimple.com/en-ca/legal/fees/trade). No leverage or margin is allowed for event contracts under CIRO's terms (H, per Wealthsimple's explainer of CIRO Administrative Bulletin 26-0076; the bulletin itself was not fetched: ciro.ca returned 403).

## 4. Read API

**exists: none (for Wealthsimple Predict).**

- No developer portal, no API docs, no OpenAPI. The sitemap (1,649 URLs, fetched 2026-10-19) has no developer/API pages; the only prediction URLs are marketing, `/learn/*` explainers, the legal-landscape page and `/predict`. NOT FOUND (searched: sitemap.xml for `developer|api|open-api`, product page, footer links, terms).
- No public per-market pages: the sitemap has no market URLs, and the hypothetical-prediction ticker on the product page is labelled illustrative ("hypothetical predictions"), so those prices are not data.
- Unofficial: GitHub search (`gh api search/repositories`, two queries, 2026-10-19) found only unofficial clients for the main Wealthsimple Trade API (last pushed 2017-2023, plus one 2026 read-only portfolio toolkit and a Help-Center-only MCP server). None targets Predict. Untrusted, and using them would hit the ToS restriction in section 9.
- **Substitute read path = Kalshi's public API** (not a Wealthsimple API). Base `https://external-api.kalshi.com/trade-api/v2` (H, 200 on `/exchange/status` and `/exchange/schedule` today; details in `docs/research/08-venues-polymarket-kalshi.md`). Docs index `https://docs.kalshi.com/llms.txt`, OpenAPI `https://docs.kalshi.com/openapi.yaml`. Endpoints used here (all unauthenticated GET, H):
  - `GET /series?category=Economics|Financials|Climate%20and%20Weather` (the `limit` parameter was ignored: 869 / 1,017 / 444 series came back in one 0.4-1.0 MB response each, not saved).
  - `GET /markets?event_ticker=KXFED-26DEC&limit=10` -> `{cursor, markets:[...]}` (fixture `kalshi_markets_KXFED-26DEC_2026-10-19.json`). Fields seen: `ticker`, `event_ticker`, `status` ("active"), `market_type` ("binary"), `yes_bid_dollars`/`yes_ask_dollars`/`no_bid_dollars`/`no_ask_dollars` (string dollars), `yes_bid_size_fp`, `volume_fp`, `volume_24h_fp`, `open_interest_fp` (string fixed-point contract counts), `close_time`, `expiration_time`, `rules_primary`, `rules_secondary`, `can_close_early`, `price_level_structure`, `price_ranges`, `settlement_timer_seconds`.
  - `GET /markets/{ticker}/orderbook` -> `{orderbook_fp:{yes_dollars:[[price,size],...], no_dollars:[...]}}`, ascending, **best bid is the last element** (verified: `yes_dollars` last = 0.14, matching `yes_bid_dollars` 0.14 on the market row) (fixture `kalshi_orderbook_KXFED-26DEC-T4.25_2026-10-19.json`).
  - Kalshi's WebSocket needs an API key even for public channels (note 08), so a live feed is not unauthenticated.
- **No flag identifies "available on Wealthsimple".** The OpenAPI has no broker/country/region availability field on markets or series (searched `broker|countr|region|jurisdic|canad|intermediar|partner`: only `api_key_region_expiration_ts` and the partner OAuth scope text). Note 08 records that `available_on_brokers` was removed from the API on 2026-09-10 (M, quoted from that note, not re-verified). So an aggregator can only approximate the Wealthsimple-eligible subset by rule: category in {Economics, Financials, Climate and Weather}, term-to-maturity >= 30 days, no sports/politics/entertainment.
- Rate limits for any of this: Wealthsimple none documented (no API). Kalshi anonymous limits: NOT FOUND (note 08).

## 5. Trade path

**none.** No order API, no signing scheme. Orders are placed only in the Wealthsimple Predict mobile app by a verified, KYC'd Canadian client (H: "Getting started means verifying your identity first"; mandatory in-app onboarding before the first trade). Web trading: NOT FOUND (the page says "Get the app" and links only to the App Store and Google Play).

Kalshi's own docs describe how institutions connect: FCM members create "subtraders" on the exchange (`/fcm/subtraders`, subtrader-bound API keys, per-subtrader daily premium cap, blocked categories) and "registered partners" can read fills and positions with a `read::compliance_partner` OAuth scope (H, https://docs.kalshi.com/llms.txt and `openapi.yaml`). That shows the mechanism by which a broker's order flow reaches Kalshi's single book. It does not show that Wealthsimple uses it: Wealthsimple's clearing/executing structure for Predict is NOT FOUND. It is also not a path available to an outside agent: those endpoints are for FCM members only.

## 6. PayBox / EVM wallet reachability

**paybox_reachable: no.** There is no on-chain contract, no signed-order endpoint and no transaction to propose. The venue is fiat-funded (CAD/USD bank transfer) inside a Canadian retail brokerage, KYC-gated, app-only. A Base/Ethereum/BNB/Arbitrum/Polygon/Solana wallet cannot deposit to it, place orders on it or receive payouts from it. Even Kalshi itself, the underlying exchange, is not wallet-reachable beyond its fiat/crypto-on-ramp deposits (note 08).

## 7. Fees

| Fee | Value | Who pays | Tag |
|---|---|---|---|
| Event contract fee | "US$0.02 per contract*"; "*The fee for a fractional event contract order is rounded to the nearest cent." Charged on **every buy and every sell** ("Each trade - buy or sell - carries a fee of $0.02 USD per contract") | Client, to Wealthsimple | H, https://www.wealthsimple.com/en-ca/legal/fees/trade and https://www.wealthsimple.com/en-ca/predict |
| CAD <-> USD conversion | "WSII Corporate Exchange Rate x 1.5%" | Client funding in CAD | H, same fee page |
| Deposit / withdrawal by bank transfer (EFT) | $0 | - | H, same fee page |
| Kalshi exchange fee | Whether it is included in, or charged on top of, the US$0.02: NOT FOUND (searched: predict page, fee page, annotated guide, newsroom post). Kalshi's schedule is `quadratic` (series `fee_type`, fixture sample series `KXNHHOMEPRICE`/`AAAGAS`; coefficient 0.07 per note 08, M). | unknown | - |
| Settlement fee | NOT FOUND | unknown | - |

Arithmetic for edge modelling (M, derived): at price 0.50 the flat fee is 4% of notional per side; at 0.95 it is about 2.1%. Round trip (buy then sell before expiry) costs US$0.04 per contract; a hold-to-settlement costs at least US$0.02 plus any FX. For a 1-3 cent cross-venue gap this fee alone removes the edge, and the Kalshi-direct leg (no US$0.02 flat fee) is strictly cheaper for anyone who can use it. Canadians, per note 08's M-grade snippet, are on Kalshi's restricted-country list for direct accounts, which is why the broker route exists.

## 8. Resolution and dispute risk

- "It's determined at the exchange level. Each contract has unique settlement criteria, which you can find in our app" (H, FAQ). Resolution is therefore Kalshi's rulebook, source agencies and timing, the same as for Kalshi direct; the sample market shows `rules_primary` / `rules_secondary` and `settlement_timer_seconds: 300`, and Kalshi series carry `settlement_sources` (for example Federal Reserve Bank of New York, AAA) and `contract_terms_url` PDFs (H, public API).
- The app store text claims "Every market has a clear resolution source ... No ambiguity, no discretion" (marketing, L). Kalshi markets can still have `can_close_early: true` (H, sample) and Kalshi decides disputes; the Wealthsimple FAQ itself warns to check definitions "especially for closely related outcomes".
- Wealthsimple-specific dispute path: CIRO's Office of the Investor and Wealthsimple's complaint process are named (H, legal-landscape explainer and footer "How to File a Complaint"); the Wealthsimple Client Account Agreement may have event-contract clauses, but the PDF was not text-extractable here: NOT FOUND.
- Cross-venue basis risk for an arbitrageur: because it is the same Kalshi contract, there is no resolution divergence versus Kalshi; versus other venues the usual divergence applies (see notes 08 and 17).

## 9. Geo, ToS, automation

- **Who may trade:** Canadian clients of a CIRO-authorised dealer. CIRO Administrative Bulletin 26-0076 (2026-03-26) and the CSA notice (2026-04-02) are described in Wealthsimple's explainer: "no prediction market has been recognized as an exchange or registered as a dealer by the CSA" and unauthorised foreign platforms carry "legal risk" (H that the page says so, M for the regulator text itself; ciro.ca and CSA pages not fetched). Provinces served: NOT FOUND (searched: predict page, explainer, newsroom post, App Store text). The explainer notes MI 91-102 is adopted in every province except British Columbia.
- **Contract rules for Canada (H, explainer + FAQ):** permitted categories are economic forecasts, environmental forecasts (average global temperature), and financial indicators (S&P 500 futures-based); prohibited are elections/referendums/party leadership, unlawful-activity events, sports and entertainment; every contract must have a term to maturity of 30 days or longer ("If a new threshold is introduced on an existing contract, it's treated as a new contract that must independently satisfy the 30-day minimum"); no leverage or margin. Whether the 30 days is measured at listing or at order time: NOT FOUND (the explainer's wording points to listing).
- **Automation:** the Wealthsimple terms (https://www.wealthsimple.com/en-ca/legal/terms) say users will not "copy, scrape, crawl, or data-mine the Platform or Content in any form or by any method" and will not "frame, mirror, or otherwise incorporate the Platform, Services, or Content into another website, application, or service". The site clause says "scraping or data-mining of the Site ... is strictly prohibited". No clause on bots, API keys or algorithmic trading found in the terms (searched: `automat|bot|api|scrap|robot|algorithm`: only the two scrape lines). No sanctioned API means any automation is unsupported.
- **Data:** if the aggregator takes Kalshi data to model this venue, Kalshi's Developer Agreement terms in note 08 (own-trading only, no aggregation or redistribution without written authorisation) apply, not Wealthsimple's.
- **Employee / insider rules:** Kalshi series carry `additional_prohibitions` (for example source-agency employees); Wealthsimple says it has "controls in place to monitor, detect and report potential insider trading activity" (H, newsroom post).

## 10. Liquidity

- **Wealthsimple-specific volume, OI, user count for Predict: NOT FOUND** (searched: product page, newsroom post, iTunes lookup, sitemap). Weak proxies: App Store CA shows 91 ratings, average 3.25 (H, fetched 2026-10-19; thin and new); Wealthsimple company-wide has "more than 4 million Canadians" and "approximately $155 billion in assets under administration, as of June 30, 2026" (H, newsroom post), which says nothing about Predict flow.
- **Underlying Kalshi liquidity in the eligible categories (H, Kalshi public API, 2026-10-19):** Fed-funds event `KXFED-26DEC` (FOMC 2026-12-09, 51 days out, so it satisfies a 30-day rule) shows 11 strike markets with total `volume_fp` 423,867 contracts and `open_interest_fp` 265,322 contracts (one contract = US$1 notional at settlement); busiest strike `KXFED-26DEC-T4.50` volume 172,880, OI 158,861; the `T4.25` strike shows a 0.14/0.15 yes spread. The book is deep at the extremes and sparse in the middle (13 yes levels, 36 no levels), so the depth is Kalshi's, and Wealthsimple's retail flow is a fraction of it. Do not attribute any of this to Wealthsimple.
- Wealthsimple itself says it will warn on low-liquidity markets ("liquidity warnings"; "if you ever try to purchase a contract in a low-liquidity market ... you'll see a warning"), so some of the roughly 4,000 listed contracts are thin.

## 11. Event coverage and overlap (where arbitrage could exist)

Wealthsimple categories at launch: economic indicators, financial markets, climate (H). Mapping against the Kalshi series available through the public API (H, series counts from `GET /series`, 2026-10-19): Economics 862 series, Financials 1,010, Climate and Weather 444 in the pages fetched (many dormant; not all would pass the 30-day rule).

| Category | Overlap with other venues | Note |
|---|---|---|
| Central bank rates (Fed, Bank of Canada) | Yes: Polymarket, ForecastEx (`FFDEC`), Kalshi | Strongest overlap. Cross-venue edge belongs on Kalshi vs others, not Kalshi vs Wealthsimple |
| CPI, GDP, jobs, housing | Polymarket, ForecastEx, Kalshi | Same |
| S&P 500 / index levels | ForecastEx (`FES` = CME E-mini settle), Kalshi `INX*` | Likely the CIRO "US 500" example (M) |
| Global temperature | Kalshi `KXTEMPMON`/`TEMPMON` | Mostly Kalshi-only |
| Crypto price | Polymarket, Kalshi, many on-chain venues | **Not** among CIRO-permitted categories as described; a "bitcoin below $50k" line appears only in the marketing ticker, which is labelled hypothetical. Treat as unavailable (L) |
| Sports, politics, entertainment | Everywhere | **Prohibited** for Canadian dealers (H). Zero overlap on this venue |

Net: the only arbitrage the Wealthsimple slice could add is a Kalshi price seen from Canada, which is the same price. There is no unique market and no price discovery.

## 12. Shared liquidity

**liquidity_shared_with: Kalshi (the entire book).** Evidence: (a) "Kalshi is our prediction markets exchange" (FAQ, H); (b) Wealthsimple's Thursday 03:00-05:00 ET gap matches the closed window in Kalshi's `GET /exchange/schedule` (H, H; time zone of the Kalshi response not stated); (c) Wealthsimple lists "nearly 4,000 contracts" from Kalshi's catalogue (H) and lets "Kalshi evaluate" new listings daily; (d) Kalshi documents FCM subtrader accounts and partner OAuth for brokers feeding the single exchange (H for the docs, M for the application to Wealthsimple). Not proven by a side-by-side quote (the Predict app is not readable without an account), so the one residual uncertainty is whether Wealthsimple shows any internalised or marked-up price. Their own description says no built-in spread; the flat US$0.02 per contract is the only disclosed charge. NOT an independent arbitrage leg.

## 13. Adapter notes (if anyone revisits)

- If a future task needs Canada-relevant signals, derive them from the Kalshi adapter with a filter `category in {Economics, Financials, Climate and Weather}`, `close_time - now >= 30 days`, excluding sports, politics and entertainment, and subtract `0.02 * 2` USD per contract of round-trip fees plus FX when modelling a Wealthsimple-user execution. Label the output "approximate eligibility" because the true eligible set is not published.
- Monitor three public signals: the `/en-ca/predict` page and `sitemap.xml` for a developer or API page, the CIRO authorised-dealer list, and Kalshi's changelog RSS (`https://docs.kalshi.com/changelog/rss.xml`) for broker-related field changes.
- Store nothing from Wealthsimple pages beyond what is in the fixtures (marketing/legal text, short).

## 14. NOT FOUND (with where searched)

- Any public or partner API, developer docs, or webhook for Wealthsimple Predict (sitemap, product page, footer, terms, GitHub repo search).
- Predict volume, open interest, active users, per-market pricing, spreads (product page, newsroom, App Store).
- Provinces served and account types (product page, explainer, newsroom, App Store text).
- Order types (market/limit), per-order and position limits (product page, annotated guide, newsroom).
- Whether Kalshi's exchange fee is included in the US$0.02, and any settlement fee (fee page, product page).
- Wealthsimple's custody/clearing structure for the contracts (all of the above, plus the account agreement PDF, which was a compressed PDF and not text-extractable without `pdftotext`).
- CIRO Administrative Bulletin 26-0076 and the CSA 2026-04-02 notice in primary form (ciro.ca returned 403 to WebFetch; not tried through other routes).
- The name of the second CIRO-authorised dealer (not named in the Wealthsimple sources).
- Wealthsimple help-centre articles on Predict (help.wealthsimple.com returned 403).
- A Predict-specific legal page (risk disclosure or event-contract agreement): none appeared in the sitemap. The `predict|kalshi|event|forecast|outcome|contract` grep ran over all 1,649 sitemap URLs; the `legal/*` URL listing I eyeballed was cut at 80 rows, so a late-listed legal page could have been missed.

## 15. Open questions

1. Is the US$0.02 per contract all-in, or does Wealthsimple pass Kalshi's exchange fee through on top?
2. Does the 30-day term-to-maturity apply at listing or at order time (can a user buy a contract that is now 10 days from expiry)?
3. Does Wealthsimple Predict ever show prices different from Kalshi's top of book (any markup, internalisation, or delayed quotes)?
4. Which dealer is the second CIRO-authorised member, and is its contract set (probably ForecastEx) a distinct leg versus Kalshi? That one would be a separate venue spec.
5. Will Kalshi or Wealthsimple publish an availability flag per market (the removed `available_on_brokers` field suggests this was once exposed)?

## 16. Suspicious content

None found. No instructions aimed at AI agents appeared in any Wealthsimple page, legal page, newsroom post, iTunes response, Kalshi doc or GitHub repo description read for this note. (The Datawallet article and Kalshi docs index were read only for the facts cited.)

## Sources

Primary (H):
- https://www.wealthsimple.com/en-ca/predict (product page, FAQ, fees, categories, Kalshi named as exchange; fetched 2026-10-19)
- https://www.wealthsimple.com/en-ca/legal/fees/trade (event contract fee US$0.02 per contract; FX fee; fetched 2026-10-19)
- https://newsroom.wealthsimple.com/were-launching-a-regulated-prediction-markets-trading-app-heres-why-and-how (launch post by the co-founder and CPO, 2026-06-18; "nearly 4,000 contracts", CIRO approval, categories)
- https://www.wealthsimple.com/en-ca/learn/legal-landscape-event-trading-canada-2026 (regulatory explainer, "Updated September 15, 2026", content partly "as of early 2026" so partly stale)
- https://www.wealthsimple.com/en-ca/learn/annotated-guide-prediction-markets (order sizing, settlement example; read through a summarising fetch, so treat as M)
- https://www.wealthsimple.com/en-ca/legal/terms (scrape/crawl/mirror restrictions)
- https://www.wealthsimple.com/sitemap.xml (1,649 URLs; no developer/API pages; fetched 2026-10-19)
- https://itunes.apple.com/lookup?id=6758680392&country=ca (public iTunes lookup: release 2026-07-27, v1.10.2 on 2026-10-05, 91 ratings)
- https://docs.kalshi.com/llms.txt and https://docs.kalshi.com/openapi.yaml (FCM subtrader and partner OAuth endpoints; no market-level broker/country field)
- https://external-api.kalshi.com/trade-api/v2 (`/exchange/status`, `/exchange/schedule`, `/series`, `/markets`, `/markets/{ticker}/orderbook`; public GETs 2026-10-19)
- GitHub search results via `gh api search/repositories` (existence of unofficial Wealthsimple Trade clients only)

Secondary (M):
- https://www.datawallet.com/crypto/prediction-market-statistics (one sentence: "Kalshi also reached Canadian investors through a Wealthsimple partnership"; undated; also cites Kalshi July 2026 US visits)
- Repo notes: `docs/research/08-venues-polymarket-kalshi.md` (Kalshi API, fees, restricted countries, `available_on_brokers` removal) and `docs/research/venues/forecastex.md` (ForecastEx `FES`, IBKR Canada eligibility)

Not reachable: ciro.ca (403), help.wealthsimple.com (403), apps.apple.com US page (404), Wealthsimple Client Account Agreement PDF (not text-extractable here), web search (budget exhausted).

## Fixtures (docs/research/fixtures/wealthsimple-canada-kalshi-distribution/)

- `kalshi_markets_KXFED-26DEC_2026-10-19.json` - `GET /markets?event_ticker=KXFED-26DEC&limit=10` (18.9 KB, full response, shows fields and string-dollar format).
- `kalshi_orderbook_KXFED-26DEC-T4.25_2026-10-19.json` - `GET /markets/KXFED-26DEC-T4.25/orderbook` (1 KB, shows `orderbook_fp` ascending arrays, best bid last).
- `apple_itunes_lookup_ca_wealthsimple-predict_2026-10-19.json` - selected fields of the public iTunes lookup (liveness evidence).
- `wealthsimple_predict_faq_and_fee_2026-10-19.txt` - verbatim FAQ text from the product page plus the two event-contract fee lines (evidence for fees, categories, hours, Kalshi, 30-day rule).
