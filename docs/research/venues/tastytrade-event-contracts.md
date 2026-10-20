# tastytrade event contracts (tastytrade "Prediction Markets") - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: first-party web pages and PDFs (WebFetch and plain GETs to tastytrade.com, developer.tastytrade.com, apexfintechsolutions.com, the contentstack asset host those sites link to), Kalshi's public unauthenticated API (3 series-list GETs and 3 market GETs, for corroboration only), and 3 unauthenticated GETs to tastytrade API hosts (all 401). No account, key, OAuth app, wallet, signature, POST/PUT/DELETE, payment or browser automation. No PayBox tool was called. All third-party text was treated as untrusted data. The shared WebSearch budget was exhausted before I started, so no news or review search was possible; every claim below comes from first-party fetches (gaps in section 13).

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale. Anything older than 6 months is flagged.

Fixtures: `docs/research/fixtures/tastytrade-event-contracts/` (no tastytrade event-contract API response exists to sample; the fixtures are the Orders OpenAPI enum excerpt, the 401 probes, a source index, and Kalshi-side corroboration).

---

## 0. Verdict

**adapter_priority = skip** (as a price/liquidity venue). Confidence: high on the verdict, medium on the exchange identity.

1. **Live (2026-10-19).** Launched 2026-07-27: "tastytrade, Inc. ... today launched Prediction Markets" (H, press release). Product page, fee schedule (updated 2026-07-30) and Apex disclosures are all current (H).
2. **Not an independent leg.** tastytrade is a broker front end (introducing broker on Apex Clearing Corporation, the FCM). The exchange is never named in any tastytrade or Apex disclosure I could read, but three signals point at Kalshi: image alt text "Phone showing kalshi on the tastytrade platform", the support-article URL slug `Kalshi-Event-Contracts` (both H, tastytrade.com/prediction-markets/), and Apex's 2026-08-13 release that Kalshi "is the first venue integrated into Apex's Prediction Markets Platform" with tastytrade "the first firm live on Apex's FCM infrastructure" (H, two Apex/tastytrade releases). Treat as **Kalshi liquidity re-sold through a broker** (M, high). Prices and depth are Kalshi's; tastytrade is one more execution route, same pattern as Webull, Robinhood, Alpaca (see `webull-event-contracts.md`, `alpaca-derivatives-llc.md`).
3. **No read API for event contracts.** The tastytrade Open API (OAuth2, REST + DXLink) documents equities, options, futures, future options and crypto only; the instruments, symbology, market-data specs and release notes never mention event contracts. The one trace: the **Orders OpenAPI lists `Event Contract` as a leg `instrument-type`** (H, fixture) but the Market Data spec's instrumentType enum does not, and no symbol format, quote source or event-contract instrument endpoint is documented. Kalshi's own public API is the correct read source and is covered by the parallel Kalshi workflow.
4. **Not reachable from a PayBox wallet.** USD in a KYC'd Apex-segregated futures/event account; no chain, no token, no on-chain signature (section 6).
5. **Narrower than Kalshi.** Launch catalogue is financial/macro/crypto/commodity only: no sports, politics, culture or weather (H, product page). That is exactly the slice where Kalshi's own depth is best and where on-chain venues overlap least except crypto price and Fed/CPI-type macro.
6. **Worth keeping:** a watch trigger (section 12) and the fee table, because a customer-held tastytrade account is a second Kalshi execution route with a different, flat fee.

---

## 1. Is it still live? (2026)

| Evidence | Date | Tag |
|---|---|---|
| https://tastytrade.com/prediction-markets/ serves "Prediction markets built for traders"; Predict screen on web and mobile; enable under Manage My Accounts > Trading Preferences | 2026-10-19 | H |
| Press release "tastytrade Launches Prediction Markets for Active Traders": launched 2026-07-27, "Powered by Apex Fintech Solutions and available 24/7", "first brokerage to launch on Apex's turnkey FCM infrastructure", contracts "from hourly to yearly" | 2026-07-27 | H |
| Apex release "Apex Fintech Solutions and Kalshi Power New Era of Prediction Markets Access": "Kalshi is the first venue integrated into Apex's Prediction Markets Platform" | 2026-08-13 | H |
| Commissions and Fees PDF carries an "EVENT CONTRACT COMMISSIONS" block, "Last updated July 30, 2026" | 2026-07-30 | H |
| Event Contract disclosure documents on Apex's site dated 2026-07-30 (filename `Event-Contract-Risk-Disclosure_20260730.pdf`, URL from Apex disclosures page) | 2026-07-30 | M (URL only; I read the tastytrade-hosted copy instead) |
| Apex first announced the platform on 2026-02-03 ("vendor agnostic", launch "Q2 2026"): older than 6 months, history only | 2026-02-03 | H, stale as status |

Verdict: **still_live = true.** Product is about 12 weeks old.

---

## 2. Kind and market model

- **Kind (H):** broker / front end. tastytrade, Inc. (FINRA/SIPC/NFA) sells; **Apex Clearing Corporation** is the "CFTC-registered Futures Commission Merchant and NFA member" and holds the segregated account: "All customer futures and event contract accounts are segregated by Apex Clearing Corporation" and "not protected by SIPC" (tastytrade.com/disclosures/, press release).
- **Exchange / DCO:** not named in tastytrade or Apex text (H, NOT FOUND in 3 PDFs + 3 pages). The Apex disclosure says only that contracts are "cleared through a derivatives clearing organization" and classified by the CFTC "as cleared swaps" (H). Kalshi is the inferred exchange (section 0).
- **Model (H):** binary YES/NO, fixed $1.00 payout ("Contracts resolve to a straightforward yes-or-no outcome"; "If your prediction is correct at settlement, the contract pays $1.00"). The Apex disclosure adds that event contracts "may also be structured with a variable payout structure" (generic boilerplate; none seen listed). Page example is a bracket ("Core CPI ... exactly 0.2% month-over-month", 100 YES at $0.44), so multi-strike families are listed as separate binary markets.
- **Venue type:** order-book exchange behind a broker; **not an AMM, not parimutuel, no tokens.** Positions are ledger entries on Apex's "Ascend Ledger" (H, 2026-02-03 Apex release); outcomes are not tokenised. Whether tastytrade shows a depth ladder or only best bid/ask is NOT FOUND (support article is a JS app that returned no text).
- **Hours (H):** "available 24/7"; Apex's Kalshi release footnotes "24/7 except during scheduled maintenance windows" (H). Contracts "from hourly to yearly" (H); the page names S&P 500 hourly, daily, weekly close.
- **Collateral rules (H, Apex disclosure):** fully collateralised, no margin, "collateral generally will not be available for withdrawal while a position remains open". Exits only by closing on the same exchange or settlement; you "may not offset, net, or hedge an Event Contract position by entering into a similar or opposite position on another exchange" (this is a risk statement, not a block on trading elsewhere).

---

## 3. Chains and collateral

None on-chain. Collateral is **USD cash** in an Apex-custodied, segregated futures/event-contract account at tastytrade (H). Funding rails are ordinary brokerage ones (ACH, wire; fee table lists ACH free, outgoing domestic wire $25, H). tastytrade's crypto product is Zero Hash-custodied (not self-custody) and **crypto trading through the API has been disabled since 20260629** (H, release notes); I found no crypto deposit/withdrawal path that funds event contracts (NOT FOUND, not exhaustively searched).

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Existence for event contracts | **none (documented).** Closest trace is the Orders OpenAPI enum value `Event Contract` | H |
| Generic tastytrade Open API | official-authenticated: REST/JSON, OAuth2, 15-min bearer token, `User-Agent: product/version` mandatory. Docs https://developer.tastytrade.com/ ; agent index https://developer.tastytrade.com/llms.txt ; OpenAPI per area at `/openapi/{orders,instruments,market-data,...}.json` | H |
| Base URLs | production `https://api.tastyworks.com`; sandbox `https://api.cert.tastyworks.com`; account stream `wss://streamer.tastyworks.com` (sandbox `wss://streamer.cert.tastyworks.com`); DXLink market-data WebSocket via `GET /api-quote-tokens` | H |
| Auth | create an OAuth application at my.tastytrade.com (Manage > My Profile > API), scopes `read`, `trade`, `openid`; refresh token never expires; `POST /oauth/token` mints 15-minute access tokens. Legacy `POST /sessions` decommissioned 20260211 | H |
| Rate limits | REST: "reasonable thresholds", no published per-endpoint quota, `429` carries no limit headers; ~8 h IP block after repeated failed logins. DXLink: 5 concurrent sessions, 25,000 subscriptions/session, 100 per-event cap for Candle/Order/Series, 10,000 subscription changes/min | H |
| Event-contract market data | NOT FOUND. Market Data spec instrumentType enum: Bond, Cryptocurrency, Equity, Equity Offering, Equity Option, Fixed Income Security, Future, Future Option, Index, Liquidity Pool, Mutual Fund, Unknown (no Event Contract). No event-contract instruments endpoint among the 20+ instruments paths. Symbology page lists equities, OCC options, futures, future options, crypto only | H |
| Unauthenticated | every probe returned 401 (`token_invalid` on sandbox) | H, fixture |

**Practical read source for the same prices is Kalshi's public API** (`https://api.elections.kalshi.com/trade-api/v2`), already handled by the Kalshi adapter. Corroboration saved: Kalshi lists the same families tastytrade advertises (Core CPI `KXCPICORE`, Fed rate `KXFED`, S&P hourly `KXINXU` and daily `KXINX`, Nasdaq-100 `KXNASDAQ100U`, WTI hourly `WTIH`, BTC/ETH hourly `KXBTCD`/`KXETHD`, ECB `KXECB`, BoE `KXCBDECISIONENGLAND`, BoJ `KXBOJDECISION`, payrolls `KXPAYROLLS`, GDP `KXGDP`, PCE, 10Y yield hourly `KX10YRRATEH`) (H for Kalshi's list, M as evidence for tastytrade routing; fixture is regex-matched and includes some noise such as `KXSOLAR`). I found no Kalshi series for VIX, Russell 2000 or copper in the Economics/Financials/Crypto category lists (searched title+ticker; categories could be mis-filed, M), and Brent and natural gas only as other forms (`KXNGAS`, `KXWTIVSBRENT`). So tastytrade may list contracts Kalshi's public list does not show, or the mapping is incomplete; unresolved.

---

## 5. Trade path

- **Programmatic placement for event contracts: unknown, probably possible only through the generic Orders API.** `POST /accounts/{account_number}/orders` (and `/orders/dry-run`) accepts legs with `instrument-type` `Event Contract` per the OpenAPI enum, with `order-type` Limit/Market/Marketable Limit/Notional Market/Stop/Stop Limit and `time-in-force` Day/Ext/GTC/GTD/IOC etc. (H, fixture). Whether the production gateway accepts such legs for retail OAuth apps, what the symbol looks like, and how price/quantity map to the $0.01-$0.99 ladder are all NOT FOUND. The enum may simply be a shared schema covering Apex-fed instruments.
- **Auth / signing:** OAuth2 bearer only. No cryptographic order signing, no wallet signature. Personal OAuth apps and grants are self-serve in the customer's tastytrade account (H) - that is account creation and credential minting, which I did not do.
- **Agent tooling:** official MCP server https://github.com/tastytrade/tastytrade-mcp (MIT; 84 tools; instruments named: equities, options, futures; "Prediction Markets" is not mentioned; dry-run-first confirmation token, 60 s expiry) (H, README summary via WebFetch, M for exact counts). Sandbox fills are synthetic (market orders fill at $1, limits under $3 fill) and the sandbox serves no market data (H), so it cannot be used to model event-contract behaviour.
- **Alternative sanctioned route for a third-party aggregator:** Apex's AscendOS Orders API (broker-dealer clients only, per `wedbush-futures-clear-street-apex-clearing-...routes.md`, M, a sibling note). Not available to individuals.

---

## 6. PayBox / EVM / Solana wallet reachability

**paybox_reachable = no.** No transaction proposal and no signed order can reach it: orders are authenticated HTTPS calls from a KYC'd brokerage account with OAuth tokens, and collateral is USD in an Apex segregated account funded by ACH/wire. There is no contract, no token and no chain. PayBox's wallet is irrelevant; at most a PayBox user could hold an unrelated tastytrade account and a separate agent could drive it via the Open API (outside PayBox's signing model, and event-contract order support unverified). Same conclusion as Webull and Alpaca.

---

## 7. Fees (who pays)

From the official PDF "Commissions & Fees", "Last updated July 30, 2026" (H):

> EVENT CONTRACT COMMISSIONS - $0.00 commission to open, $0.00 commission to close. All event contract trades incur a clearing fee of $0.01 per contract + regulatory and exchange fees of $0.01 per contract.

- **Reading (M):** about **$0.02 per contract per executed trade, paid by the customer**, flat (not a price-dependent formula). At a $0.44 price that is ~4.5% of notional per side; at $0.95 about 2.1%. Round trip to close early about $0.04 per contract; whether holding to settlement incurs a closing fee is NOT FOUND ("All event contract trades" is ambiguous).
- **Unknown (NOT FOUND):** whether Kalshi's own trading-fee formula is charged on top of the "$0.01 exchange fee" or replaced by it; the Kalshi formula is covered by the Kalshi workflow. If the $0.01 really is the full exchange charge, tastytrade is cheaper than Kalshi direct for mid-priced contracts, which would matter for arbitrage cost modelling. Treat as unverified until a fill statement is seen.
- Page example price is "not including fees" (H). No per-contract maker/taker split.
- Funding and withdrawal fees follow the general brokerage table (ACH free; domestic wire $25; H).

---

## 8. Resolution mechanism and dispute risk

- **Resolution is the exchange's** (H, Apex disclosure): outcome "typically as reported by one or more third-party sources or determined in accordance with applicable exchange rules"; "the exchange may have discretion under applicable rules to interpret contract terms, determine the final outcome ... modify contract specifications, change the expiration date, or determine settlement values", determinations "may be final and binding even if controversial or contested", and can "delay settlement and the availability of funds."
- **Sources for this catalogue (M):** government/central-bank prints (BLS CPI/NFP, Fed decision, BEA GDP) and market data for index/commodity/crypto closes. Example from the Kalshi side: Core CPI market rules reference the BLS seasonally adjusted series (H, Kalshi fixture, not tastytrade text).
- **Other risks (H):** DCO default or insolvency; trade rejected for clearing can be "void from inception"; exchange or CFTC trading halts, possibly followed by forced settlement; the 2026 disclosure stresses state gambling-law exposure for sports contracts (not offered at tastytrade).
- **Dispute risk for an arbitrage book:** low for numeric financial/macro prints, higher where a rule fixes a precise time-stamp or print revision (e.g. which release or revision of a CPI value counts). Another venue's wording may differ even for "the same" event, so leg-mapping must compare rules, not titles.
- No tastytrade-specific appeal channel documented (NOT FOUND).

---

## 9. Geo, ToS and automation

- **Geo (H/NOT FOUND):** US brokerage; the page lists no eligible states and says services are "not intended for any jurisdiction where tastytrade is not authorized to do business". State-level availability for event contracts is NOT FOUND. The 2026 disclosure warns that "state gambling, wagering, and gaming laws may apply" to sports contracts; tastytrade lists none.
- **Eligibility (H):** needs a tastytrade account, then Event Contracts enablement under Trading Preferences; users with limited income or limited futures experience must additionally accept the "Additional Risk Disclosure" (dated June 2026) before enabling. No minimum balance stated on the page.
- **Automation (H, partial):** tastytrade actively markets an Open API ("built for developers and AI agents") and an MCP server. Its MCP disclosures say the customer may run "an automated system you build and operate yourself" and is "responsible for ... any automated or unattended trading". Nothing I read either permits or forbids API trading of event contracts specifically. The main customer agreement was not read (NOT FOUND).
- **No cross-venue netting:** the Apex disclosure says event contracts are exchange-specific, non-fungible and cannot be netted across venues (risk statement, H). An arbitrage with a second venue is two independent positions, both fully collateralised.

---

## 10. Liquidity

- **tastytrade-specific volume, open interest, user counts: NOT FOUND.** The launch release and product page give no figures (H, searched for "million", "billion", "volume", "open interest").
- Depth should equal the underlying exchange's displayed depth if routed straight through (M, inference); not independently measured. The disclosure says "Liquidity varies by Event Contract" (H).
- Kalshi (the inferred exchange) volume and OI belong to the parallel Kalshi workflow; do not double count it.

---

## 11. Event categories and overlap (where arbitrage could exist)

Advertised catalogue (H, product page and press release, 2026-10-19):

| tastytrade family | Contracts named | Overlap with other venues |
|---|---|---|
| Crypto | BTC, ETH, SOL, XRP, DOGE price outcomes (hourly to yearly) | High: Polymarket, Limitless, Predict.fun, XO-style crypto price markets; but tastytrade hourly/daily strikes rarely match on-chain strike grids exactly |
| Economics - US | CPI and Core CPI, PCE, NFP, unemployment, FOMC decision, GDP, PPI, retail sales, ISM Manufacturing and Services PMI | High for Fed decision, CPI, NFP (Polymarket, Kalshi, Myriad, others) |
| Economics - international | ECB, Bank of England, Bank of Japan rate decisions | Medium (Polymarket lists some central-bank markets) |
| Financials | S&P 500 hourly/daily/weekly close, Nasdaq-100, Dow, Russell 2000, 2Y and 10Y yields, Fed funds, VIX at close, DXY | Low outside Kalshi; mostly TradFi-adjacent |
| Commodities | WTI, Brent, natural gas, gold, silver, copper | Low-medium (some on Polymarket/Kalshi) |
| Sports, politics, culture, weather | **not offered** | n/a |

Cross-venue link keys for a mapper: underlying + release/date + threshold + comparison operator (e.g. "Core CPI MoM above 0.2% for June 2026 release"). Because the exchange is likely Kalshi, the Kalshi ticker (`KXCPICORE-26DEC-T1.0`, `KXFED-27APR-T6.00`; see fixture) is the identity key and tastytrade needs no separate mapping if that holds.

---

## 12. Shared liquidity and adapter recommendation

- **Shares liquidity with Kalshi (M, high).** Not an independent arbitrage leg. Kalshi (price) vs tastytrade (price) differences would reflect only broker-level delays, hours (tastytrade says 24/7), min tick and fees, not an independent book.
- **Skip as a price source.** Reasons: duplicate liquidity; no documented event-contract data or order path; category set is a subset of Kalshi's; not reachable from PayBox.
- **Watch triggers (re-check after Q4 2026):**
  1. tastytrade or Apex names the exchange in a disclosure (confirms Kalshi) or adds a second venue (Apex says its platform is "vendor agnostic", and a sibling note records a non-binding Gemini LOI on 2026-08-24, M); a second, differently priced venue behind Apex would change this verdict.
  2. `developer.tastytrade.com` release notes or symbology gain an event-contract section, giving a real tastytrade-side quote and depth feed.
  3. Evidence that tastytrade's $0.02 flat charge undercuts Kalshi's own fee for the same market, making tastytrade a cost-optimised execution route for the user's Kalshi leg.
  4. Apex's AscendOS Orders API opens to non-broker developers (unlikely).
- If the product ever wants to execute Kalshi legs from a user's tastytrade account, the only candidate is the customer's own Open API OAuth app; this sits entirely outside PayBox signing and needs a live feasibility test by the account holder.

---

## 13. NOT FOUND / open questions

- Exchange and DCO named by tastytrade or Apex: NOT FOUND (searched: product page text, press releases x3, Apex disclosures page and the 6-page Event Contracts Risk Disclosure, Commissions and Fees PDF, tastytrade disclosures page).
- Support article `support.tastytrade.com/support/s/solutions/articles/Kalshi-Event-Contracts/`: fetched but it is a JavaScript-rendered help-center app; only a "CSS Error" shell returned (H). Its content (likely hours, symbols, rules) is unread. A user with a browser should read it.
- Event-contract symbol format, quote feed, depth, and whether the Open API accepts `Event Contract` legs: NOT FOUND.
- Per-state availability, trading-halt hours, position limits, tick size, minimum order: NOT FOUND.
- Whether Kalshi's fee stacks on the $0.01 exchange fee; settlement-close fee: NOT FOUND.
- Volume, OI, customer counts: NOT FOUND.
- News and reviews after launch: not searched (WebSearch budget exhausted; no use of third-party search workarounds).

---

## 14. Suspicious content / embedded instructions

- `https://developer.tastytrade.com/llms.txt` carries an `## Instructions` block "for agents using the tastytrade Open API" (use sandbox first, dry-run before submit, get human approval before production orders, set `external-identifier`, respect rate limits). It is benign API guidance and was not followed or needed; recorded because it is text addressed to AI agents. The same file's links point at `http://localhost:3000/...` (docs-build artefact), which I did not fetch.
- The MCP README summary says the server's MCP `instructions` field is "written for agents"; I did not read or run it.
- tastytrade.com pages and the PDFs contained no text aimed at agents.

---

## Sources

All fetched 2026-10-19 unless stated.

1. https://tastytrade.com/prediction-markets/ (H; page text and HTML alt text)
2. https://tastytrade.com/newsroom/press-releases/tastytrade-launches-prediction-markets-for-active-traders/ (H; 2026-07-27)
3. https://apexfintechsolutions.com/press-releases/tastytrade-launches-prediction-markets-giving-active-traders-a-direct-way-to-trade-real-world-market-events/ (H; Apex copy of #2)
4. https://apexfintechsolutions.com/press-releases/apex-fintech-solutions-and-kalshi-power-new-era-of-prediction-markets-access/ (H; 2026-08-13)
5. https://apexfintechsolutions.com/press-releases/unlocking-the-future-of-trading-apex-fintech-solutions-announces-seamless-turnkey-prediction-markets-integration/ (H; 2026-02-03, stale as status)
6. https://assets.contentstack.io/v3/assets/blt7dc2e3d4a7071563/blt2b752fef372188fe/commissions-and-fees (H; PDF, updated 2026-07-30)
7. https://assets.contentstack.io/v3/assets/blt7dc2e3d4a7071563/blt23588c85dc42803b/ascend-event-contracts-risk-disclosure (H; Apex Clearing Event Contracts Risk Disclosure Statement, 6 pp.)
8. https://assets.contentstack.io/v3/assets/blt7dc2e3d4a7071563/blt315f991a0d431b12/event-contracts-additional-risk-disclosures-2026 (H; dated June 2026)
9. https://tastytrade.com/disclosures/ (H via WebFetch summary, M for exact wording) and https://apexfintechsolutions.com/legal/disclosures/apex-clearing-futures-disclosures/ (M)
10. https://developer.tastytrade.com/ , `/llms.txt`, `/docs/release-notes.md`, `/docs/authentication/oauth2.md`, `/docs/sandbox.md`, `/docs/guides/rate-limits-and-backoff.md`, `/docs/concepts/instruments-and-symbology.md`, `/openapi/orders.json`, `/openapi/market-data.json`, `/openapi/instruments.json` (H)
11. https://tastytrade.com/mcp-server/ , https://github.com/tastytrade/tastytrade-mcp/ , https://developer.tastytrade.com/disclosures/tastytrade-mcp-server-disclosures.pdf (H for the PDF; M for the page/README summaries)
12. https://tastytrade.com/api/ (M, small-model summary)
13. https://api.elections.kalshi.com/trade-api/v2/series?category=Economics|Financials|Crypto and `/markets?series_ticker=KXCPICORE|KXFED|WTIH&status=open&limit=3` (H for Kalshi data; used only as corroboration)
14. https://api.tastyworks.com and https://api.cert.tastyworks.com unauthenticated GETs (H; 401)
15. Sibling note `docs/research/venues/wedbush-futures-clear-street-apex-clearing-salttrade-signal-markets-bitmart-us-minor-fcm-ib-tech-partner-routes.md` (M; second-hand, consistent with #4)
