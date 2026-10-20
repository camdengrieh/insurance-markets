# Optimus Futures (CME event contracts) - adapter spec

Researched 2026-10-19. READ-ONLY: WebFetch of public pages plus unauthenticated GETs with the generic User-Agent `insurance-markets-research/0.1`. No account, key, wallet, signing, POST or PayBox money tool. WebSearch budget was exhausted for the session, so there were no search-engine cross-checks (see section 11). Third-party page text is untrusted data; nothing in it was followed.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred (including WebFetch small-model page summaries); **L** = weak/stale.
Fixtures: `docs/research/fixtures/optimus-futures-cme-event-contracts/` (page-text extract and robots.txt only; there is no API to sample).

## 0. Verdict

**adapter_priority: skip.** Confidence: high.

1. Optimus Futures is an **independent introducing broker (IB)** that resells access to CME's *legacy* daily "event contracts" (options on futures, max payout $20). It is a front end, not a market. Its liquidity IS CME Globex liquidity, so it is **not an independent arbitrage leg**. It duplicates `docs/research/venues/cme-group-event-contracts.md` (already P2, signal-only).
2. No public read API, no documented trade API for event contracts, no prices on the site. The only automation surface is generic Rithmic API access for futures (paid, licensed to "professional customers"); whether Rithmic exposes the CME event-contract instruments through it is NOT FOUND.
3. USD cash at a clearing FCM, KYC'd account. A PayBox wallet cannot trade it.
4. Action: add nothing for Optimus. At most list it in a routing doc as one of the retail front ends to CME (alongside Plus500, IBKR, FanDuel, DraftKings). Any CME signal adapter belongs to the CME venue note.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| https://optimusfutures.com/cme-event-contracts.php | HTTP 200 on 2026-10-19 (Cloudflare), footer "Copyright 2026 Optimus Futures"; page lists 10 markets and "$0.25 commissions on event contracts" | H |
| https://optimusfutures.com/sitemap.xml | Last-Modified Fri 2026-10-16; includes `cme-event-contracts.php` | H |
| robots.txt | Last-Modified 2026-05-17; only `/ntlicense` and `/sass` disallowed. Fixture `robots.txt` | H |
| Launch/effective date of Optimus's event-contract offering | NOT FOUND on the page (no date given) | H (absence) |
| Underlying CME product still live | See `cme-group-event-contracts.md` (H there: legacy `EC*` event options and 24/7 swaps live in 2026) | H (sibling note) |

still_live = true (the broker page is live; whether any specific contract is actively quoted at any moment is unknown).

## 2. What it is

- **Kind: broker-or-frontend.** Optimus Futures, LLC, founded 2004, Boca Raton FL; NFA Member ID 0481133, "Independent Introducing Broker (IB)", oversight by NFA/CFTC (H via small-model summary of https://optimusfutures.com/About-Us.php; verify on NFA BASIC, not done). Clearing FCMs are not named on that page; Margin-Rates page says margins shown are "for traders cleared by Ironbeam" and sitemap has pages "Learn-More-About-Wedbush" and "Learn-More-About-ADMIS" (M: multiple clearing firms; none read in detail).
- Sells the **legacy CME event contracts** (Optimus calls them "event-based futures"): daily-expiring Yes/No on whether a futures market closes up or down for the day; value "up to $20" per contract; "the price you pay per contract is the most you can lose" (H, product page). Not the 24/7 swap-based family (H by absence: no 24/7, no sports, no crypto on the page).
- **Markets offered (10)** (H, product page): S&P 500, Nasdaq-100, Russell 2000, Dow Jones Industrial Average; WTI crude, natural gas; gold, silver, copper; EUR/USD (6E). No Bitcoin, no macro, no sports.
- Platforms listed on the page (H): Optimus Flow, Optimus Web, Optimus Mobile, Rithmic, TradingView, TrendSpider, Sierra Chart, Bookmap, ATAS. The page does not say which of them carry event contracts.

## 3. Market model

- Binary Yes/No per underlying per day; CLOB on CME Globex (see CME note). Legacy form = options on futures with a fixed payout ($20 per product page; the CME note records tick 0.25, price limits 0.25 to 20.00 at launch, H there). Cash-settled USD. A given day's contract is a strike ladder (CME note), not a single binary. Settles at market close of the underlying's trading day, "no rollover" (H).
- Outcome identity: CME Globex security ID / `EC`+underlying symbol; no tokens.

## 4. Read API

**Verdict: none** (for Optimus). `exists = none`.
- No API, price feed, or data endpoint on optimusfutures.com for event contracts: NOT FOUND (searched: product page, sitemap, Commodity-Futures-Trading-System.php, Rithmic page, Margin-Rates, Futures-Trading-Exchange-Fees). Pages are marketing HTML.
- Market data for the underlying CME products comes via vendor feeds (CQG/Rithmic/DTN/dxFeed pages exist on the site; M) under CME licence. Real prices for the contracts are only via CME Reference Data/WebSocket APIs (authenticated, entitled) per `cme-group-event-contracts.md` section 4.
- No unauthenticated sample possible; fixtures are page text and robots.txt only.

## 5. Trade path

- Native: web/desktop/mobile front ends and third-party platforms above; login with an Optimus/clearing-FCM account. No wallet signature scheme.
- **Automation (H, https://optimusfutures.com/Platforms/Rithmic-RTrader-Pro.php, via small-model summary, so M for exact wording):** Rithmic R|API (C++/.NET), R|API+, R|FIX API (orders only; market data needs R|API), R|Diamond API. R|API "distributed under license to our professional customers"; "Contact Us" to set up. Fees: Rithmic connection $25/month minimum per User ID, trade routing $0.10/contract, API connection $100/month minimum per User ID. Event contracts are not mentioned anywhere on that page. Whether Rithmic lists the CME `EC*` instruments: NOT FOUND.
- Optimus also says it works with developers on TradeStation, MultiCharts, C#, C++ etc. systems (H via summary of Commodity-Futures-Trading-System.php). No API terms or limits stated.
- Rate limits: NOT FOUND. Websocket: none.

## 6. Chains, collateral, PayBox reachability

- No chain. Collateral is USD cash at the clearing FCM; the account needs approval and funding (H, product page: "account approvals and funding").
- **paybox_reachable: no.** No on-chain contract, no signed-order format, KYC'd broker account. I did not run `discover_plugins`/`discover_services` for Optimus; the CME note records no CME plugin on 2026-10-19 (H there).

## 7. Fees

- **Optimus commission: $0.25 per event contract** (H, product page). Page also says routing, clearing and execution fees apply on top (H) but gives no figure.
- Exchange/clearing fee for event contracts: NOT FOUND. The page https://optimusfutures.com/Futures-Trading-Exchange-Fees.php returned no data rows to the fetcher, only a link to event contracts (M; table may be JS-rendered).
- Reference points (M, from CME note): IBKR $0.01 commission + $0.01 exchange per contract; DraftKings $0.02. Optimus at $0.25 per contract is very expensive for a contract that pays at most $20: roughly 1.25% of max payout per side plus exchange fees, versus about 0.1% at IBKR. Not attractive for arbitrage even if reachable.
- Margin: none described; page says risk is limited to the price paid (H). Margin page does not mention event contracts (M).
- Platform/data fees (CME data, Rithmic) are extra and separate.

## 8. Resolution and dispute risk

Exchange-determined by CME at the underlying future's settlement; Optimus has no role (see `cme-group-event-contracts.md` section 8: exact-at-strike goes to No, H there). Optimus's disclaimer: "the holder receives either a pre-determined amount of cash or no payment" (H). Dispute risk is CME rulebook/CFTC only; per-contract rule text NOT FOUND here. For cross-venue pairing the daily close/settlement timestamp must match the other venue's reference (e.g. Kalshi/Polymarket index close).

## 9. Geo, ToS, automation

- Geography on the product page: none stated (H absence). Optimus is a US IB; eligibility and non-US onboarding terms: NOT FOUND (not read: account/terms pages).
- Automation: permitted via Rithmic APIs for professional customers by arrangement (above); full ToS (OptimusFlow-Terms-And-Conditions.php, RiskDisclosure.php) not read. Redistribution of CME prices inside an aggregator needs a CME licence (M, CME note).
- Risk disclosure on the page states this is "a solicitation for entering into a derivatives transaction" (H, boilerplate).

## 10. Liquidity

- Optimus-specific volume, OI: none published (NOT FOUND).
- Underlying CME figure: 100 million event contracts in about 8 weeks since Dec 2025 launch (CME release 2026-02-13, H in CME note, stale at 8 months, includes sports and the swap family, which Optimus does not sell). No current ADV/OI for the financial legacy contracts found anywhere.

## 11. Event coverage and liquidity sharing

- Overlap for arbitrage: equity-index up/down (Kalshi index brackets, Polymarket index up/down, ForecastEx FES/FNQ), gold/silver/copper and oil/gas (Kalshi commodities, ForecastEx), EUR/USD (Kalshi FX if listed). No sports, politics, crypto or macro at Optimus.
- **Shares liquidity with CME Globex** and every other CME front end (Plus500, IBKR CME slice, FanDuel/DraftKings CME contracts). Not an independent leg. ForecastEx index contracts settle on the CME E-mini settlement (H in CME note), so those share the oracle too.

## 12. Not found / open questions

- NOT FOUND: any API for event contracts at Optimus; Rithmic coverage of `EC*` instruments; exchange/clearing fee per event contract; named clearing FCM(s) for event contracts; NFA BASIC verification; terms for non-US clients; launch date; any ADV/OI.
- Not searched: web search unavailable (session budget used), so no independent 2026 news about Optimus event-contract volume or CME legacy-contract changes.
- Ask Optimus (sales phone is on its site) only if the operator actually plans to trade CME event options via Rithmic.

## Sources

- https://optimusfutures.com/cme-event-contracts.php (H, fetched 2026-10-19; fixture text extract)
- https://optimusfutures.com/sitemap.xml and /robots.txt (H, 2026-10-19)
- https://optimusfutures.com/About-Us.php (M, small-model summary)
- https://optimusfutures.com/Margin-Rates.php (M, summary)
- https://optimusfutures.com/Commodity-Futures-Trading-System.php (M, summary)
- https://optimusfutures.com/Platforms/Rithmic-RTrader-Pro.php (M, summary)
- https://optimusfutures.com/Futures-Trading-Exchange-Fees.php (M; table empty to fetcher)
- `docs/research/venues/cme-group-event-contracts.md` (sibling note, H/M as tagged there)
- `docs/research/venues/advantage-futures-fcm-offering-forecastex-forecast-contracts.md` (sibling FCM-front-end precedent, skip)
