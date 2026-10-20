# Public.com prediction markets (Open to the Public Investing, Inc.) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: Public's marketing pages, API docs, SDK/MCP repos (via `gh api`, nothing cloned or run), help-center articles, disclosure PDFs (text extracted locally with Apple PDFKit), and unauthenticated GETs to `public.com`, `api.public.com` (401) and one Kalshi public market-data host for a price/volume cross-check. No account, key, token, wallet, signature, POST/PUT/DELETE, payment or browser automation. No PayBox tool was called. All third-party text was treated as untrusted data; nothing in it tried to instruct an agent (the pages promote connecting Claude/ChatGPT via MCP; that is product marketing, not an instruction I followed). The shared WebSearch budget was exhausted before I could use it, so news coverage of the launch was not searched (section 12).

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary (WebFetch), or my inference from first-hand data; **L** = weak or stale.

Fixtures: `docs/research/fixtures/public-com-prediction-markets/` (5 files, all <10KB). There is **no unauthenticated read API**, so no live API response could be sampled. The fixtures are (a) the 401 probe log, (b) response shapes copied from the official docs (labelled as doc examples, not live), (c) two excerpts of the JSON that Public's own public web pages embed (unofficial payload, but real), and (d) a Kalshi public-API response used for the cross-check in section 11.

---

## 0. Verdict

**adapter_priority = skip** (watch trigger below). Confidence: high on "same liquidity as Kalshi" and "no open read API"; medium on everything about future multi-exchange routing.

1. **Live, and newly API-enabled.** Event contracts are tradable on Public today; the Public API gained prediction-market endpoints on 2026-10-13, six days ago (H, section 1).
2. **Not an independent leg: it is Kalshi liquidity.** Every event I could see is `exchange: KALSHI`. For the one event I cross-checked, Public's displayed event volume (24,881,023.92) equals exactly 2 x the sum of Kalshi's own `volume_fp` for the same five markets, and the per-outcome prices match Kalshi's bid/ask (H, section 11). Public is an introducing FCM that routes through Apex Clearing, a KalshiEX member (H). Same pattern as Webull, Robinhood, Moomoo, Alpaca (see `webull-event-contracts.md`, `alpaca-derivatives-llc.md`).
3. **No public read API.** Everything, including event browsing, needs a bearer token minted from a secret key that only a funded, prediction-markets-enabled Public customer can create (H). Public offers no order-book depth, no trade tape and no websocket (H/M, section 4). Kalshi's own public API is strictly better for reads.
4. **ToS blocks building a multi-user service on it.** The Individual Trader API Agreement (June 2026) limits use to the developer's own personal use and forbids wrapping the API, making it available through third-party software, or building apps that "offer or promote services to third parties" (H, section 9). A PayBox plugin or aggregator that proxies Public for other people would breach it; a user running their own bot on their own account is allowed.
5. **Not reachable from a PayBox wallet.** USD in a KYC'd US FCM account, no chain, no token, no signature scheme (section 6).
6. **Watch trigger.** The API's `exchange` enum already contains `KALSHI, PMUS, CDNA, EMULATOR` (H, official Python SDK). If Public starts listing `PMUS` (most likely Polymarket US) or `CDNA` (most likely Crypto.com Derivatives North America) events, it would become a single-account route to several DCMs and deserve a P2 re-rating as an execution route for a user's own account. As of 2026-10-19 the public hub data contains 182 `KALSHI.` symbol references and zero `PMUS.`/`CDNA.` ones (H, fixture `web-embedded-hub-2026-10-19.json`).

---

## 1. Is it still live? (2026)

| Evidence | Date | Tag |
|---|---|---|
| Public product page https://public.com/prediction-markets is live, lists 14 categories and 20 most-traded events with live percentages; disclosure: event contracts are offered by Open to the Public Investing, Inc. and Apex Clearing Corp. "through KalshiEX LLC". No launch date on the page. | 2026-10-19 | H |
| Public "Event Contracts Risk Disclosure" PDF exists, dated **August 20, 2026**: Open to the Public Investing is a CFTC-registered FCM, NFA ID 0465334, "is offering Event Contracts" (https://public.com/disclosures/eventcontractsrisk). Earliest dated first-party artifact I found, so the launch was on or before 2026-08-20. | 2026-08-20 | H (document) / M (launch inference) |
| API changelog: "October 13, 2026 - Prediction markets now available in the API": three endpoints (categories, summary, details) plus a trading guide. https://public.com/api/docs/changelog | 2026-10-13 | H |
| Python SDK `publicdotcom-py` >= 0.1.26 "added prediction market support"; repo pushed 2026-10-09, Apache-2.0. | 2026-10-09 | H |
| Help center has a ten-article prediction-markets section (enable, hours, fees, order types, taxes, API/MCP/Agents). https://help.public.com | 2026-10-19 | H |
| Event pages show resolution dates up to Nov 2029 and trading data current to the day (Fed Oct-2026 event: $24.88M volume). | 2026-10-19 | H |

**still_live = true.** Launch date: NOT FOUND (searched: product page, API changelog, help center, disclosures, discovery tracker mickbransfield.com/cftc-regulated-pms, which does not mention Public at all; WebSearch budget exhausted so news was not searched).

---

## 2. Kind and market model

- **Kind (H):** broker / FCM front end. Open to the Public Investing, Inc. (introducing FCM and NFA member) routes event-contract orders to **Apex Clearing Corporation** (clearing FCM, "a member of KalshiEx LLC"), which trades on **KalshiEx** (DCM) and clears at **Kalshi Klear LLC** (DCO). Source: Event Contracts Risk Disclosure, 2026-08-20.
- **Instrument (H):** "cleared swaps" regulated by the CFTC. Each outcome has two separate contracts, YES and NO, priced $0.01 to $0.99, settling at $1.00 or $0.00. Fully collateralised, no margin, not marked to market. "Event Contracts cannot be sold or transferred to another DCM"; early exit is by selling/offsetting.
- **Model (H, API guide):** three levels. *Event* (`eventSymbol`, e.g. `KALSHI.KXFEDDECISION-26OCT`) has one or more *outcomes* (`outcomeId`, e.g. `KXFEDDECISION-26OCT-H0`), each with a YES contract (symbol suffix `.Y`) and a NO contract (`.N`). Binary per outcome; categorical events are sets of mutually exclusive binary outcomes ("at most one can resolve to Yes"). Price-band / range markets exist (BTC and ETH year-end price). The `settledOutcome` enum includes `SETTLED_OUTCOME_OTHER` besides YES/NO.
- **Order book (M):** a central limit order book at Kalshi; Public exposes only best bid/ask plus sizes (section 4).
- **Tokenisation:** none. Positions are cleared-swap positions in an FCM account; they "can't be moved through an account transfer" to another brokerage (M, help center).
- **Symbols (H):** trading/quotes use `KALSHI.<kalshi-market-ticker>.Y|.N` with instrument type `EVENTCONTRACT`; price history uses `<eventSymbol>-EVENT` and `<contractSymbol>-EVENTCONTRACT`. The Kalshi ticker is embedded verbatim, so mapping to Kalshi is mechanical: strip `KALSHI.` and the `.Y/.N` suffix.

---

## 3. Chains and collateral

- **Chains: none.** Collateral is **USD cash** in the customer's event-contract account at Open to the Public Investing, funded by linking a bank account (H, event-page "How to trade" text: "Securely link your bank account to deposit funds"). The FCM rejects any order not fully collateralised (H, risk disclosure). Event-contract accounts are **not SIPC protected** (M, help center summary).
- No crypto, stablecoin or on-chain funding route for event contracts is documented (NOT FOUND, searched: product page, help-center article list, fee schedule, API guide). Public's crypto product (Zero Hash) is separate and not documented as funding event contracts.

---

## 4. Read API

`exists = official-authenticated`. Everything below needs a bearer token.

**Base URL (H):** `https://api.public.com` (docs https://public.com/api/docs ; SDK constant `PROD_BASE_URL`). Unauthenticated GETs to the event endpoints return **401** with `www-authenticate: Bearer resource_metadata=...` (H, fixture `unauthenticated-probes-2026-10-19.txt`). `public.com/api/docs/{llms.txt,openapi.json,openapi.yaml}` return 403 AccessDenied, so there is no downloadable OpenAPI spec (H).

**Auth (H):** `POST /userapiauthservice/personal/access-tokens` with `{"validityInMinutes": n, "secret": "<secret key>"}` returns `{"accessToken": "<JWT>"}`; send `Authorization: Bearer <accessToken>`. Default validity 15 minutes. The secret key is generated in the app (Account Settings > Security > API); "No approval is required for Public members" (product page). Prediction markets must be enabled on the account first (onboarding flow with a manual-review path), "requests fail if the feature isn't enabled" (M, help center).

**Key endpoints (H, official reference + guide https://public.com/api/docs/templates/trade-prediction-markets):**

| Purpose | Endpoint | Notes |
|---|---|---|
| Categories | `GET /userapigateway/eventcontract/summary/categories` | category, subcategories, supported `eventFrequency` filters |
| Event list | `POST /userapigateway/eventcontract/summary` | body `{category, subcategory, sortingMode (VOLUME\|EXPIRATION\|RECENTLY_ADDED, required), displayResolvedEvents, createdWithinDays, nextToken, filters}`; <=100 events/page, `nextToken` cursor. Returns title, `eventSymbol`, `volume`, `resolutionTime`, `resolved`, `halted`, category. No prices. |
| Event detail + prices | `GET /userapigateway/eventcontract/details/{eventSymbol}?includeAllOutcomes=` | all outcomes, per-contract `bid, ask, last, openInterest, probability, dailyGain*`, `state`, `trading` (BUY_AND_SELL\|LIQUIDATION_ONLY\|DISABLED), `timeline` (open/close/expected+latest expiration/settlement times, `settlementDelaySeconds`), `rules`, `cftcContract` (terms URL, prohibitions, resolution sources), `exchange` enum |
| Live quote with sizes | `POST /userapigateway/marketdata/{accountId}/quotes` with `type: "EVENTCONTRACT"` | bid, ask, `bidSize`, `askSize`, last, openInterest, previousClose. **Top of book only**; needs an account id |
| Price history | `GET /userapigateway/historicdata/event-contracts/{eventSymbol}-EVENT/bars/{DAY\|WEEK\|MONTH\|ALL}?symbols=...-EVENTCONTRACT` | up to 8 contracts per call, OHLC + volume bars |
| Own orders/positions | `GET .../trading/{accountId}/order/{orderId}` (30-day window), orders search (up to 500, 30 days), `GET .../trading/{accountId}/portfolio/v2`, `GET .../account/.../history` | own account only |

**Not available (NOT FOUND, searched: API reference sidebar, guide, SDK source, MCP source):** order-book depth beyond best bid/ask, public trade tape / fills for the market, resolution-event feed, websocket or SSE. The SDK's "price stream" is a **polling loop** (0.1 s to 60 s configurable), not a socket (H, `subscription_manager.py`). Settlement is observable from `state: STATE_SETTLED` + `settledOutcome` on the details endpoint.

**Rate limits:** "Double API rate limit from 5 reqs/sec to 10 reqs/sec ... global and applies to all endpoints ... rate limits are per account" (H, changelog entry 2026-02-02; **8+ months old, possibly stale**). The June 2026 Individual API Agreement instead speaks of "a limited number of API requests per minute depending on the type of request" with throttles per Application or account and changeable without notice (H). Treat 10 req/s per account as the working number, event-specific limits NOT FOUND. 429 is documented on the token endpoint; SDK honours `Retry-After`.

**Doc inconsistencies to expect (H):** (1) the Get quotes reference page lists only `EQUITY, OPTION, CRYPTO, INDEX` but the prediction-markets guide and SDK use `EVENTCONTRACT`; (2) the summary `filters` field is `eventIds` in the guide but `eventSymbols` in the SDK; (3) the website's embedded payload calls the id `eventId` and appends `-EVENT` (e.g. `KALSHI.KXFEDDECISION-26OCT-EVENT`) while the API detail path uses the bare `eventSymbol`. Validate against a live call before coding.

**Unofficial but unauthenticated:** Public's own web pages embed Next.js `__NEXT_DATA__` JSON with event id, exchange, outcomes, per-contract `price`/`probability`/`volume`, the CFTC terms block and chart bars (fixtures `web-embedded-*.json`). It carries last-trade price only (no bid/ask/size) and is HTML scraping of a consumer site, so it is not a supported interface; not recommended, and unnecessary because Kalshi's public API gives the same prices with depth.

---

## 5. Trade path

Programmatic trading **exists** via REST for the account owner (H, guide):

1. `POST /userapigateway/trading/{accountId}/preflight/single-leg` returns commission, exchange fee, order value, estimated cost, buying-power requirement.
2. `POST /userapigateway/trading/{accountId}/order` with `{orderId (client UUID, idempotency key), instrument {symbol, type: EVENTCONTRACT}, orderSide BUY|SELL, orderType LIMIT|MARKET, limitPrice, expiration {timeInForce}, quantity}` returns only `{orderId}`; placement is **asynchronous**, poll `GET .../order/{orderId}` for `FILLED/CANCELLED/REJECTED/EXPIRED`.
3. `DELETE .../order/{orderId}` cancels (async, "not guaranteed"). `PUT` replace is documented for equity/crypto/options; event-contract support NOT FOUND.

Order rules (M, help center): market and limit orders, limit is default, limit TIF day or good-till-cancelled; Public may restrict illiquid contracts to limit-only; dollar-based orders convert to whole contracts. Bracket/OCO/OTO are equities and options only (H, Place order reference). Min/max event-contract order size: NOT FOUND (the Order Limits page covers equities, options, crypto only). Sell to close works while `trading` is BUY_AND_SELL or LIQUIDATION_ONLY.

Signing scheme: none beyond the bearer JWT. Orders are brokerage instructions, not signed messages. SDK: `publicdotcom-py` (Apache-2.0). A hosted MCP server (`https://mcp.public.com/mcp`, OAuth for Claude/ChatGPT/Perplexity/Grok, API key for Meta Muse) can also place trades; the docs do not list its tools (M) though the open-source MCP repo has event-contract tests.

---

## 6. PayBox reachability

`paybox_reachable = no`. A PayBox EVM or Solana wallet cannot hold, fund or trade this: there is no contract, chain, token or signed-order scheme. Access requires a KYC'd US brokerage customer relationship with Open to the Public Investing, bank-linked USD funding, manual enabling of prediction markets, and a secret key from the Public app. PayBox transaction proposals / `request_wallet_sign` have nothing to sign. A user could in principle run their own script against their own Public account, but that is outside what a PayBox plugin can do on-chain, and the plugin would have to hold the user's Public secret key and act as a third-party service, which the API agreement forbids (section 9).

---

## 7. Fees

All **H** (https://public.com/disclosures/fee-schedule, Section 2 and Section 6; help article "Are there fees to trade Prediction Markets?").

- Public transaction fee: **$0.01 per contract**.
- Exchange fee: **$0.01 per contract**, "set by KalshiEx LLC and ... subject to change without notice", passed through. Total **2 cents per contract**, paid by the customer, shown in preflight before ordering. The doc's preflight example confirms it: 10 contracts at $0.80 -> commission 0.10 + exchange fee 0.10 + order value 8.00 = estimated cost 8.20.
- Appears to apply to both buys and sells and to maker and taker alike (the schedule distinguishes neither; not explicitly stated). Settlement, withdrawal and inactivity fees for event contracts: NOT FOUND (the schedule's event-contract section lists only the two items above).
- The API itself is free "currently"; Public "may ... charge for the API Products" in future (H, agreement 3.d).
- Open question: this flat 2c structure differs from Kalshi's own published fee formula (covered in the parallel Kalshi spec); I did not reconcile them. For net-edge maths use the preflight response, not a formula.

---

## 8. Resolution and dispute risk

- Resolution is Kalshi's: per-outcome `rules` text, a `cftcContract.contractTermsUrl` (Kalshi contract-terms PDF), named `resolutionSources` (e.g. Federal Reserve), and Kalshi Klear rules (H, API detail response and risk disclosure). Public does not resolve anything.
- Timeline is explicit in the API: `closeTime`, `expectedExpirationTime`, `latestExpirationTime`, `settlementTime` with a `settlementDelaySeconds` buffer (docs example: ~5 minutes after the expected expiration). Payouts arrive after `settlementTime` (H, guide). Payout/funds-availability timing at the broker: NOT FOUND.
- Risks Public itself discloses (H, 2026-08-20 disclosure): source-agency data errors or delays, trading halts directed by the DCM or CFTC, thin liquidity, FCM risk at Public **and** Apex (customer rights under Bankruptcy Code / CFTC Part 190), litigation risk (court rulings could force liquidation of open contracts), and platform outages. Contracts carry insider-trading prohibitions (`cftcContract.prohibitions`).
- Dispute process beyond the Kalshi rulebook: NOT FOUND. Two-layer risk: Kalshi rule interpretation plus the FCM chain (Public -> Apex -> Kalshi Klear).

---

## 9. Geo, ToS, automation

- **Eligibility:** product page says only "Restrictions and eligibility requirements apply". Help article "How do I enable Prediction Markets?" describes an onboarding flow (intro, experience questions, profile review, terms) and a "manual review" status for people with disclosed affiliations (M). Country / state exclusion list: NOT FOUND (searched: product page, enable article, disclosure, event page). Open to the Public Investing is a US broker-dealer and FCM, so a US brokerage account is presumably required (M, inference). The disclosure's litigation paragraph concerns sports contracts, but Public currently lists no sports category (section 11).
- **Hours:** 24/7 except a weekly maintenance window **Thursdays 3:00-5:00 a.m. ET** (M, help center summary).
- **Automation is allowed, but only for personal use** (H, https://public.com/disclosures/individual-API-program, "Individual Trader API Program Terms and Conditions", June 2026). Quoted sparingly: access is "solely for Developer's own personal use"; the developer "shall not wrap any of Public's ... APIs, or further distribute the APIs ... to other platforms and/or businesses"; and may not "use the API Products to create Applications that offer or promote services to third parties" (4.a.x) nor engage in "automatic mirroring of trades across different users" (4.a.xxii). Public can revoke the license "at any time and for any reason" and change throttles without notice. API docs footer repeats "for your own personal, non-commercial use".
- **Consequence for this project:** read-only polling of Public from a shared aggregator is not offered (no unauthenticated reads) and would need one user's key serving other people, which violates the terms. Treat Public strictly as a *user-owned execution venue* a person may drive with their own key; never as a data source for the shared scanner.
- The separate "API Policy" (https://public.com/disclosures/api-policy, last updated 2025-10-24, **possibly stale**) covers third-party API licensees who access customer data with the customer's consent; it is not the individual-trader program.
- Public also promotes "AI Agents" inside the app that can monitor prediction-market odds and take actions (H, event page copy); irrelevant for integration.

---

## 10. Liquidity

- Public-originated volume / OI / TVL: **no separate figure published** (NOT FOUND). Every number Public shows is Kalshi's (section 11).
- Displayed headline volumes on 2026-10-19 (H, hub page): 2028 Democratic nominee $484.6M, 2028 presidential winner $149.6M, 2028 Republican nominee $139.3M, US House control $120.7M, BTC year-end $84.4M; Fed Oct-2026 decision $24.9M. These are Public's rendering of Kalshi event volume and, per the tie-out below, are **2x Kalshi's contract-count volume** (likely both sides counted; interpretation M), so do not add them to Kalshi's own volume.
- Public prediction-market user count / share of Kalshi flow: NOT FOUND.
- Docs-example top of book for the Fed "maintains rate" YES contract on 2026-10-13: 0.79 x 265 bid, 0.80 x 335 ask (H, doc example, not a live sample).

---

## 11. Event categories, overlap and shared liquidity

**Categories on Public (H, hub data 2026-10-19):** Popular, Climate and Weather, Commodities, Companies, Crypto, Economics, Elections, Financials, Health, Industries, Markets, Politics, Science and Technology, World. **No Sports category** (Kalshi's largest by volume), and the help center says Public "focuses on events that move financial markets" (M). So Public's catalog is a **subset** of Kalshi's.

**Arbitrage-relevant overlap (all via Kalshi):** US politics/elections (2028 nominees, House/Senate control), Fed decisions and rate-cut counts, crypto price (BTC/ETH year-end, bands, 15-minute to yearly frequencies per the categories payload), commodities, company/AI events. These overlap Polymarket, XO, Limitless, Opinion etc., but the arbitrage leg to model is **Kalshi**.

**Shared liquidity: YES, 100% with Kalshi.** Cross-check performed 2026-10-19 ~03:20 UTC:
- Public event page `KALSHI.KXFEDDECISION-26OCT-EVENT`: event volume `24881023.92`; Fed-maintains YES 87c, Hike-25 YES 13c, Cut-25 YES 1c (H, https://public.com/prediction-markets/fed-decision-in-oct-2026-i8lfdgs).
- Kalshi public API `GET https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=KXFEDDECISION-26OCT` (unauthenticated): sum of `volume_fp` over the five markets = `12440511.96`; x2 = **`24881023.92`**, an exact match. Prices: H0 bid 0.86 / ask 0.87 / last 0.86; H25 0.12 / 0.13 / 0.13; C25, C26, H26 0.00 / 0.01 (H, fixture `kalshi-api-KXFEDDECISION-26OCT-markets-2026-10-19.json`).
- Per-outcome check: Public H0 contract volume `$11.37M` = 2 x Kalshi `volume_fp` 5,686,169.65 (H).

Conclusion: Public is another **execution route to Kalshi's book**, not another price. For the scanner, quote Kalshi directly; if a user wants to execute the Kalshi leg through their own Public account, the cost delta is the flat $0.02/contract above.

---

## 12. Not found / open questions

- Exact launch date (earliest dated first-party artifact: risk disclosure 2026-08-20). WebSearch budget exhausted; no news searched.
- Country / US-state eligibility list; account-type restrictions.
- Event-contract-specific rate limits, order size limits, minimum order size.
- Whether Public orders rest visibly in Kalshi's central book (agency via Apex) or can be internalised; the disclosure suggests agency routing (M), no execution-quality statement found.
- Whether and when `PMUS` / `CDNA` events appear (enum exists; no events seen). Meaning of the two codes is my inference from names (L/M), not documented.
- Live `bid/ask/size` of Public's quote endpoint vs Kalshi's order book (needs a token; not obtainable read-only without an account).
- Settlement / payout timing at the broker; any fees on settlement or withdrawal.
- Whether the REST `PUT` replace-order works for event contracts.
- Whether the hosted MCP exposes event-contract tools (docs silent).

## Sources

- Public prediction markets hub (disclosures, categories, embedded data): https://public.com/prediction-markets (H, 2026-10-19)
- Example event page: https://public.com/prediction-markets/fed-decision-in-oct-2026-i8lfdgs (H, 2026-10-19)
- Public API home / docs: https://public.com/api , https://public.com/api/docs , https://public.com/api/docs/quickstart (H)
- Prediction-markets API guide: https://public.com/api/docs/templates/trade-prediction-markets (H)
- Endpoint references: https://public.com/api/docs/resources/event-contracts/get-event-categories , .../get-event-summary , .../get-event-details , .../market-data/get-quotes , .../authorization/create-personal-access-token , .../order-placement/place-order , .../cancel-order , .../get-order (H)
- API changelog (2026-02-02 rate limit, 2026-10-13 launch): https://public.com/api/docs/changelog (H)
- Order Limits page (no event-contract entry): https://public.com/api/docs/additional-info/order-limits (H)
- Individual Trader API Program T&Cs, June 2026 (PDF): https://public.com/disclosures/individual-API-program (H)
- API Policy, updated 2025-10-24 (PDF, possibly stale): https://public.com/disclosures/api-policy (H)
- Event Contracts Risk Disclosure, 2026-08-20 (PDF): https://public.com/disclosures/eventcontractsrisk (H)
- Fee Schedule (PDF): https://public.com/disclosures/fee-schedule (H)
- Help center (WebFetch summaries): https://help.public.com/en/articles/17150651-how-do-i-enable-prediction-markets , .../17150801-when-are-prediction-markets-trading-hours , .../17150727-are-there-fees-to-trade-prediction-markets , .../17599457-can-i-trade-prediction-markets-through-the-public-api-mcp-or-agents , .../17150629-what-are-prediction-markets-on-public , .../17151053-market-vs-limit-orders-for-prediction-markets , .../17150941-can-i-transfer-my-prediction-markets-positions-to-another-brokerage (M)
- Hosted MCP page: https://public.com/api/docs/templates/hosted-mcp (M)
- Python SDK (read via `gh api`): https://github.com/PublicDotCom/publicdotcom-py , files `src/public_api_sdk/models/event_contract.py`, `models/instrument_type.py`, `subscription_manager.py`, `api_client.py`, `public_api_client.py`, README (H)
- MCP server repo (file list, tool decorators only): https://github.com/PublicDotCom/publicdotcom-mcp-server (H)
- Kalshi public market data used for the cross-check: https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=KXFEDDECISION-26OCT (H)
- Discovery tracker (does not mention Public): https://mickbransfield.com/cftc-regulated-pms/ (M)
