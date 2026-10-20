# Backpack Exchange Prediction Markets (backpack.exchange/prediction) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: public docs pages, public PDFs (terms), unauthenticated GETs to `api.backpack.exchange` (documented API host) and one public Polymarket gamma-api GET per event for cross-checking. No account, wallet, API key, signature, POST/PUT/DELETE, PayBox tool, WebSocket session or browser automation. No third-party code cloned, installed or run (front-end JS bundles were downloaded as text and grepped only). Scripted requests used the User-Agent `insurance-markets-research/0.1` and nothing else identifying.
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale.
Fixtures: `docs/research/fixtures/backpack-exchange-prediction-markets/` (9 files, largest 24.8 KB). Third-party text is untrusted data; nothing in it was followed.
Web search budget ran out mid-session (one extended search done), so press coverage is thinner than usual; official pages were read directly instead.

## 0. Verdict

- **adapter_priority: skip** (revisit triggers in section 12). The venue is technically easy (public, unauthenticated, Binance-like REST; ED25519-signed trading) but economically near-dormant: the operator has created **no new prediction market since 2026-01-26** (H, `createdAt` max over 194 markets), all crypto-price and FOMC markets expired in January 2026, and the only live product today is **one event, "Extended FDV above ___ one day after launch?"** with 6 threshold markets, **$1.56k of lifetime volume in shares, about 1,800 shares of open interest, 24h volume 0** (H). The 6 books are live (depth timestamps 2026-10-19 03:10 UTC) but thin and wide: best sizes 5-708 shares, spreads of 3-16 cents on the five two-sided books (H).
- It is **not an independent leg for settlement**: the FDV markets state "The resolution source for this market will be Polymarket (https://polymarket.com/event/extended-fdv-above-one-day-after-launch)" (H). Liquidity itself is not shared with Polymarket (own book), but outcome is a 1:1 copy of Polymarket's. Backpack's quotes are wider than Polymarket's and no quote is crossed today (section 10).
- **Backpack decides resolution at its sole discretion** from a designated "Oracle Source" and the result is "final and binding" (H, Prediction Market Terms 1.1). Dispute path is arbitration (H, 6.2).
- Product is a **margin position in the unified cross-margin account**, not a token. No on-chain leg. A PayBox wallet can at most fund the account by transfer to a deposit address; it cannot place orders (section 6).
- Terms add friction for an aggregator: the User Agreement licenses the API "solely for the purposes of trading on the Platform" and forbids using API data "for any other purpose" (H, section 17.1), and forbids crawlers (23.1). Read-only price scraping for a third-party product is arguably outside the licence (M, my reading).

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| `GET /api/v1/markets?marketType=PREDICTION` returns 194 markets: 6 `Open`, 188 `Closed`; 139 `visible:true`, 55 `visible:false`; `createdAt` 2026-01-12..2026-01-26. Response is CloudFront-cached (`s-maxage=300`). | H | fixture `markets_PREDICTION_trimmed_2026-10-19.json` |
| `GET /api/v1/prediction` returns 53 events: 34 `resolved:true`, 19 `resolved:false`. Of the 19, 18 are zero-volume January 19-28 events whose markets are `Closed` with `activePrice 0.5` (never traded, never resolved), and 1 is the live Extended FDV event. | H | fixture `prediction_events_index_derived_2026-10-19.json` |
| Live books on 2026-10-19 03:10 UTC for all 6 open markets (depth `timestamp` in microseconds = 2026-10-19). Last trades: FDVEXTD300M 2026-10-15 (10 shares @0.34), FDVEXTD800M 2026-09-30, FDVEXTD500M 2026-06-12, the three others only on 2026-01-21. | H | fixtures `depth_open_markets_raw_2026-10-19.json`, `trades_FDVEXTD300M_USDC_PREDICTION_raw_2026-10-19.json` |
| Last resolution of any market: 2026-04-02 (edgeX FDV). Others: Infinex 2026-02-03, Paradex 2026-03-07, FOMC 2026-01-28. | H | `/api/v1/prediction`, fixture index |
| Backpack's own announcement: "Unified Prediction Portfolio", invite-only private beta announced 2026-01-13, "most active crypto traders", page updated 2026-07-16 and still says invite-only. | H (page) | https://learn.backpack.exchange/articles/unified-prediction-portfolio-backpack |
| Press: Coinspeaker 2026-01-14, 99Bitcoins 2026-01-15 (via Yahoo Finance) repeat the beta announcement; neither gives fees, resolution or geography. | M | https://finance.yahoo.com/news/backpack-exchange-launches-margin-based-114720783.html ; https://finance.yahoo.com/news/backpack-tests-prediction-markets-traders-215917913.html |
| The parent exchange is active: API changelog has entries to 2026-10-16; User Agreement "Last Updated: September 7, 2026"; Prediction Market Terms "Last Updated: February 15, 2026". Neither changelog nor docs mention a prediction-specific feature. | H | https://docs.backpack.exchange/ ; User Agreement PDF ; Terms PDF |

Verdict on "still live": the **exchange and the order books are live; the prediction product is in a low-activity, no-new-listings state** (the "no new listings" reading is M, an inference from creation dates and 9 months of nothing newer). No sign of an announced shutdown (NOT FOUND, searched: docs changelog, learn.backpack.exchange index, support llms.txt).

## 2. Market model

- **Kind:** central limit order book run by Backpack; one book per market symbol `<BASE>_USDC_PREDICTION`, e.g. `FDVEXTD300M_USDC_PREDICTION`. Price 0..1 USDC per share, `tickSize 0.001`, `minQuantity 1`, `stepSize 1`, `openInterestLimit 10000000` (units not documented; shares, M). Order types `Limit` and `Market`; time in force `GTC`/`IOC`/`FOK` per the generic docs enum (H; no prediction-specific order docs exist). Not AMM, not parimutuel.
- **Binary only** in what is listed. Multi-outcome questions are modelled as a family of independent binary markets: bracket sets for price ("between $89,000 - $94,000", exactly one resolves Yes), FOMC outcomes (cut 25, cut 50+, hold, hike 25+), FDV thresholds (nested, so not mutually exclusive). No categorical or scalar type seen (H, `/api/v1/prediction`).
- **Tokenisation: none.** There is no outcome token. A market is a single YES contract that settles at $1 or $0 ("Event Contracts generally expire at either full value ($1) or worthless ($0)", H, Terms 1.4(e)). The `yesOutcomeLabel`/`noOutcomeLabel` fields are display strings. Exiting early is by "acquiring an offsetting position", not by selling a token (H, Terms 1.4(f)), which implies a NO view is expressed as a short of the YES contract (M). No NO book exists; a NO price is `1 - YES price` (M).
- **Margining:** "All Event Contract positions are treated as Margin Trading Positions that must be fully collateralized at all times", and underlying margin positions can be liquidated to keep them collateralised (H, Terms 1.3). `imfFunction {base 1, factor 0}` and `mmfFunction {base 0.98, factor 0}` in the market record are consistent with full collateralisation (M, my reading).
- **Event structure** (`/api/v1/prediction`): event has `slug`, `title`, `series[]` (e.g. `btc-price-weekly`, `fdv`, `fomc`), `tags[]`, `resolved`, `resolutionDelaySecs` (28800 = 8 h), `resolution{endDate, outcome, closePrice, strikePrice, resolutionSource...}` (mostly null even when resolved, H) and nested `predictionMarkets[]` with `marketSymbol`, `question`, `groupLabel`, `rules`, `activePrice`, `quoteVolume` (24h), `quoteVolumeLifetime`, `resolvedAt`, `resolutionPrice` ("1" Yes / "0" No), `proposedResolution`, `proposedResolutionAt`, `resolutionCondition`.
- **Data-quality warnings (H):** `rules` text is double-escaped (`\\n`, `\\"`); `quoteVolumeLifetime` is the sum of **share quantity**, not quote notional (FDVEXTD300M: field 1356 = sum of trade quantity 1356; sum of `quoteQuantity` is 789.32 USDC); FOMC `question` strings say "Jan 2025 meeting" while rules say "January 27-28, 2026"; `activePrice` semantics undocumented (0.34 for FDVEXTD300M equals last trade, but 0.09 for FDVEXTD1B equals the current ask, not its January last trade).

## 3. Chains and collateral

- **Collateral:** USDC (`quoteSymbol USDC`, H) held in the account's single cross-margin balance, which also backs spot, margin, lending and perps ("single subaccount balance", H, learn article). No chain-level collateral or contracts.
- **Where it lives:** Backpack's centralised matching engine and ledger (operator: Trek Labs d/b/a Backpack Exchange, H, User Agreement preamble). No smart contract, no on-chain settlement, no explorer-verifiable position (NOT FOUND, searched: docs, learn, support index).
- **Funding chains for USDC deposit/withdraw** (`depositEnabled` and `withdrawEnabled` true on 2026-10-19, H, `GET /api/v1/assets`): Solana, Ethereum, Sui, Arbitrum, Base, Optimism, Polygon, Sei, Aptos, HyperEVM, Monad, Arc, Near. USDT also on Tron and Bsc among others. Deposit addresses come from the authenticated `GET /wapi/v1/capital/deposit/address` (H, docs list; not called).

## 4. Read API

- **Official public API: partly.** `exists = official-public` for exchange market data; the **prediction-specific `/api/v1/prediction` endpoint is NOT in the official docs**. I found it in the site's own front-end bundle (`useGetPredictionEvents`, params `resolved`, `eventSlug`, `symbol`) and confirmed it with unauthenticated GETs (M for stability: undocumented endpoints can change without notice). The official docs only list `PREDICTION` in the `MarketType` enum and note that the mark-price stream omits funding/index fields "for prediction markets" (H, https://docs.backpack.exchange/).
- **Docs:** https://docs.backpack.exchange/ (Redoc, "Download OpenAPI specification" link on the page; I did not find its URL). Support-site API pages: https://support.backpack.exchange/exchange/api-and-developer-docs.md.
- **Base URLs (H):** REST `https://api.backpack.exchange`; WebSocket `wss://ws.backpack.exchange`.
- **Key endpoints (all unauthenticated GET; confirmed 2026-10-19 unless noted):**
  - `GET /api/v1/markets?marketType=PREDICTION` (176.6 KB; state, filters, `visible`).
  - `GET /api/v1/prediction[?resolved=false|true][&eventSlug=...][&symbol=...]` (319 KB unfiltered, 8.4 KB for one event; events with nested markets, rules, volumes, resolution fields). Undocumented.
  - `GET /api/v1/depth?symbol=<SYM>` returns `{asks:[[price,qty]...], bids:[[price,qty]...], lastUpdateId:"...", timestamp:<microseconds>}`; both sides are sorted ascending, so **best bid is the last element of `bids`, best ask is the first of `asks`**. ~100 bytes for the thin books.
  - `GET /api/v1/trades?symbol=<SYM>&limit=<n>` returns `[{id, price, quantity, quoteQuantity, timestamp(ms), isBuyerMaker}]`, newest first. Returned all 84 trades for FDVEXTD300M with `limit=1000`.
  - `GET /api/v1/openInterest` (98 rows, includes the 6 prediction symbols; units shares). Total for prediction: 1,800 shares (FDVEXTD300M 1,594).
  - `GET /api/v1/ticker?symbol=<PREDICTION SYM>` returns **HTTP 204 empty**; `GET /api/v1/tickers` and `GET /api/v1/markPrices` contain **no prediction symbols** (H). Use `depth`/`trades`/`/prediction` instead.
  - `GET /api/v1/trades/history`, `GET /api/v1/klines` exist in the docs; not tested for prediction symbols.
  - WebSocket public streams from the docs: `bookTicker.<symbol>`, `depth.<symbol>` (also `depth.200ms|600ms|1000ms.<symbol>`), `trade.<symbol>`, `openInterest.<symbol>`, `kline.<interval>.<symbol>`; server pings every 60 s, closes if no Pong in 120 s. Not opened (H for docs, untested).
- **Auth and limits:** public market-data GETs need no key. Signed endpoints use ED25519 headers `X-API-Key`, `X-Signature`, `X-Timestamp`, `X-Window` (default 5000 ms, max 60000). Rate limits (support FAQ, H): standard REST up to 2,000 requests/min per subaccount; "historical market data" routes (candles/trades) 30 requests/min per subaccount; 429 on excess. The limit for anonymous IP traffic is NOT FOUND (searched: docs, support FAQ, llms.txt). Practical advice: poll `/prediction?resolved=false` and `/markets` no faster than the 300 s CloudFront TTL and use the WebSocket for books.
- **Resolution data:** per market `resolvedAt` + `resolutionPrice` ("1"/"0"); resolved events keep appearing in `/prediction` indefinitely (34 resolved present, oldest 2026-01-15).

## 5. Trade path

- Official, documented, programmatic: `POST /api/v1/order` (instruction `orderExecute`), `POST /api/v1/orders` (batch), `DELETE /api/v1/order` (`orderCancel`), `DELETE /api/v1/orders` (`orderCancelAll`), `GET /api/v1/order|orders|position|account` etc. (H, docs). Order fields per the generic docs: `symbol`, `side` (`Bid`/`Ask`), `orderType`, `price`, `quantity`, `timeInForce`, optional `clientId`, `selfTradePrevention`.
- **Signing:** build the string `instruction=<name>&<alphabetically sorted key=value pairs>&timestamp=<ms>&window=<ms>` (batch orders repeat the `instruction=orderExecute&...` prefix per order), sign with the ED25519 private key, base64 encode into `X-Signature`; public key base64 in `X-API-Key` (H, docs).
- **Keys are created by a logged-in human in Account Settings, API Keys** (H, docs intro). That needs a KYC'd, prediction-enabled account (see section 8); this research did not and must not create one.
- **Prediction-specific order behaviour is undocumented** (NOT FOUND, searched: docs, support FAQ, learn): whether shorting YES is allowed, margin reserve for a short, minimum notional, post-only, and behaviour at settlement are unknown. Confirm on a funded test account before building a trading leg.

## 6. PayBox reachability

- **partial: funding only.** A PayBox wallet on Base, Ethereum, Arbitrum, Polygon, Optimism or Solana could send USDC to the account's deposit address (USDC deposits enabled on those chains, H). That is an ordinary transfer to a custodial address.
- **No transaction-proposal or signed-order path exists.** Orders are accepted only as REST calls signed with an exchange-registered ED25519 API key; there is no EIP-712/EIP-191 order, no contract to call, no on-chain position. So PayBox `use_plugin`/`request_wallet_sign` style flows cannot trade it.
- L, untested and not attempted (signing tools are off-limits here): since the API key is a plain ED25519 key, a Solana-style key could in principle sign requests, but the 5 s default window, per-request approval latency and the need to register the public key through the logged-in UI make it impractical for an arbitrage loop.
- Withdrawals go only to pre-whitelisted addresses configured in account settings with 2FA (H, support FAQ), so unwinding also cannot be fully agent-driven.

## 7. Fees

- **Prediction-specific fee schedule: NOT FOUND** (searched: https://support.backpack.exchange/exchange/trading/trading-fees.md, https://support.backpack.exchange/technical-docs/trading/fees.md, https://support.backpack.exchange/exchange/trading/futures/fees.md, Prediction Market Terms, User Agreement section 13, learn.backpack.exchange index). The Terms say fees "may include, but are not limited to, market creation fees, trading fees, settlement fees, and withdrawal fees", "posted on the Platform", changeable "at any time" and "effective immediately upon posting" (H, Terms 4.1).
- For reference the generic schedule, which may or may not apply (H for numbers, M for applicability): Tier 1 spot 0.08% maker / 0.10% taker, futures 0.02% / 0.05%; VIP 5 spot 0% / 0.025%, futures 0% / 0.018%; tiers from staked BP, assets or 30-day volume, recalculated hourly; the USDT/USDC pair is 0%. The User Agreement says fee changes take effect 30 days after posting (13.2) while the Prediction Terms say immediately; Prediction Terms rank first in precedence (H).
- Payer: the user, deducted from account balance at the time of the transaction (H, Terms 4.1). No separate gas.

## 8. Resolution mechanism and dispute risk

- **Backpack resolves, from a Backpack-chosen oracle source.** "All Event Contracts must be based on objectively verifiable events... Backpack Exchange reserves the right to determine which Oracle Sources will be used... may, in its sole discretion, amend or revise the designated Oracle Source... Once an outcome... has been determined by Backpack Exchange... it shall be considered final and binding" (H, Terms 1.1, quoted from the PDF with ellipses). Backpack may also "suspend or cancel any Prediction Market that becomes impossible or impractical to resolve", and then sets position value at its "sole discretion", possibly far from the last price (H, Terms 3.2(e)). It may delete or modify any market and its rules at any time (H, Terms C).
- Oracle sources actually named in the rules (H, `/api/v1/prediction`):
  - Crypto price: Binance BTC/USDT, ETH/USDT, SOL/USDT 1-minute candle close at 08:00 UTC; ties go to the higher bracket; up/down compares consecutive days and "resolves 50-50" if equal.
  - FOMC: https://www.federalreserve.gov/monetarypolicy/openmarket.htm, upper bound of the target range; non-standard moves rounded up to the next 25 bp bracket.
  - FDV pre-markets: Polymarket's event of the same name; if no token launches by 2026-12-31 23:59 ET all resolve No. "1 day after launch" is 4:00 PM ET the next calendar day.
- Timing: crypto events resolved 16-19 minutes after the 08:00 UTC read (2026-01-15); FOMC 2026-01-28 20:01-20:03 UTC (about 1 hour after the 19:00 end date). The four FOMC markets were stamped about 20 seconds apart, which looks manual (M). `resolutionDelaySecs` is 28800 on every market.
- **Consistency check against the named source (H):** all 17 Backpack thresholds across the three resolved FDV events (edgeX 1B-5B, Infinex 200M-1B, Paradex 300M-5B) resolved No, matching Polymarket's resolved outcomes for the same thresholds (Polymarket: edgeX Yes at 300M-600M only, Infinex Yes at 100M only, Paradex Yes at 40M only; Backpack lists none of those lower thresholds). Source: gamma-api.polymarket.com events for the three slugs, 2026-10-19.
- **Dispute risk: high for an arbitrage leg.** Single-operator discretion, no on-chain challenge, no published appeal; disputes go to binding arbitration in San Francisco for US residents (H, Terms 6.2 and User Agreement 27). 18 zero-volume events remain `resolved:false` nine months on, so even housekeeping is incomplete (H, harmless because they never traded).

## 9. Geo, ToS, automation

- **Operator:** Trek Labs d/b/a Backpack Exchange (H, User Agreement). Prediction use is governed by the Prediction Market Services Terms (Last Updated 2026-02-15) plus the User Agreement (Last Updated 2026-09-07) and Margin Trading Terms.
- **Eligibility is per user, not just per country:** the web app reads `permissions.isPredictionEnabled` on the user and calls a country-permissions lookup when it is false, and a UK KYC status flag (`ukCanTrade`) appears on the prediction trade button (M; read from the downloaded front-end JavaScript, not from a policy page). Access is described as invite-only beta (H, learn article, updated 2026-07-16).
- **Restricted locations:** North Korea, Iran, Cuba, Crimea, Sevastopol, Luhansk, Donetsk are not served; Canada, Japan, New Zealand "planned" (H, https://support.backpack.exchange/exchange/exchange-account/identity-verification/supported-regions.md; undated). The page does not mention the US or prediction markets, so **US eligibility for prediction is NOT FOUND**. The Terms require that use "do not conflict with the laws of the country or region of your nationality or where you reside", location is checked by GPS/IP, and the user must not use "a virtual private network or any other privacy or anonymization tools" (H, Terms D and 3.1(e)).
- **Automation / data use (H, quote sparingly):**
  - User Agreement 17.1: licence "to use the API solely for the purposes of trading on the Platform. You agree to not use the API or data provided through the API for any other purpose." Backpack may set limits and "immediately suspend or terminate" API access.
  - User Agreement 23.1: no "web crawler or similar technique to access our Services or to extract data"; no unreasonable load; no wash trades or front running.
  - Prediction Terms D: no market manipulation and no harvesting "information from the Services for any unauthorized purpose".
  - The API docs describe the API as "for programmatic trade execution" and the support FAQ recommends WebSocket plus backoff, so bots are expected for trading; a pure aggregator that never trades on Backpack is the grey area (M).

## 10. Liquidity (as of 2026-10-19 unless stated)

- **Open interest:** 1,800 shares across 6 markets (H, `/api/v1/openInterest`); at the current prices that is on the order of a few hundred USDC at risk (M, my arithmetic: roughly 1,594 x 0.34 plus small amounts).
- **Lifetime traded volume (all 194 markets): 437,982 shares** by the field `quoteVolumeLifetime`, which I verified is share quantity (H for the 6 open markets, assumed for the rest, M). Since a share is worth at most $1, face value is at most $438k and notional USDC is probably roughly half that (L; the 6 open markets show quote/qty of 0.58 on the biggest one). By series (shares): BTC price brackets 140,854 (7 events); FOMC Jan 2026 128,297 (1 event; the Fed hold market alone 29,240 and the "cut 25" market 81,295); FDV 50,680 (4 events); SOL price 44,452; BTC up/down 34,590; SOL up/down 21,116; ETH price 17,115; ETH up/down 878.
- **Last 24 h:** `quoteVolume` is "0" for every market (H). **Live set:** Extended FDV, 6 markets, lifetime 1,560 shares (1,356 + 96 + 46 + 10 + 22 + 30), about 84 trades ever on the biggest.
- **Top of book, 2026-10-19 ~03:10 UTC (bid size @ price / ask size @ price), against Polymarket's same-named event (gamma-api, public GET, same minute):**

| Threshold | Backpack bid | Backpack ask | Polymarket bid | Polymarket ask |
|---|---|---|---|---|
| $300M | 708 @ 0.34 | 20 @ 0.50 (next 496 @ 0.722) | 0.37 | 0.39 |
| $500M | 25 @ 0.19 | 12 @ 0.30 | 0.18 | 0.19 |
| $800M | 20 @ 0.08 | 6 @ 0.17 | 0.10 | 0.12 |
| $1B | 5 @ 0.03 | 5 @ 0.09 | 0.065 | 0.071 |
| $2B | 17 @ 0.015 | 5 @ 0.045 | 0.034 | 0.035 |
| $3B | 30 @ 0.009 | none | 0.016 | 0.018 |

  No crossed quote exists (best case: $500M Backpack bid 0.19 vs Polymarket ask 0.19, zero edge before fees). Polymarket's Extended event shows $3.97M volume and $0.21M liquidity (H, gamma-api) versus 1,560 shares on Backpack: Backpack is roughly 0.04% of the volume of the venue it copies.
- Comparable resolved FDV events: Polymarket volume edgeX $15.2M / Infinex $2.77M / Paradex $0.20M versus Backpack lifetime shares 29.2k / 10.9k / 9.0k (H, derived), i.e. about 0.2% to 4.5% in face-value terms.
- No DefiLlama or third-party dashboard for Backpack prediction found (NOT FOUND, searched: web search for launch coverage only; DefiLlama not queried).

## 11. Event overlap and independence

- **Today:** Extended token FDV threshold markets only, which overlaps Polymarket and may overlap other FDV/launch markets on venues covered elsewhere (Limitless, Predict.fun, Opinion; not checked here). Resolution is explicitly Polymarket's, so Backpack is a derivative copy, not an independent price discovery source.
- **Historical (all expired January 2026):** BTC, ETH, SOL daily 08:00 UTC price brackets and up/down; January FOMC outcomes; edgeX, Infinex, Paradex FDV. These categories overlap Polymarket and Kalshi in general, but nothing live remains in them.
- **Shared liquidity:** none; Backpack runs its own book and margin engine and says the product is "Backpack-native" and not a wrapper around Kalshi or Polymarket (H, learn article). The only dependency is the resolution source above.
- **Linking key for the aggregator:** the `rules` text contains `https://polymarket.com/event/<slug>` for the FDV set, and `groupLabel` ("$300M") matches the Polymarket market title suffix, so linking is deterministic without fuzzy matching.

## 12. Adapter notes and revisit triggers

If built, keep it a **watch-only** probe rather than a trading adapter:
1. Every ~5 minutes: `GET /api/v1/prediction?resolved=false` and diff event slugs plus per-market `quoteVolume` and `quoteVolumeLifetime`.
2. For open markets only: `GET /api/v1/depth?symbol=<SYM>` (or WS `depth.<symbol>`), normalise: YES bid = last of `bids`, YES ask = first of `asks`, NO bid = 1 - YES ask, NO ask = 1 - YES bid (M, because there is no NO book).
3. Market id = `marketSymbol`; event id = `slug`; resolution = `resolvedAt != null`, YES iff `resolutionPrice == "1"`.
4. Treat Backpack as a lagging mirror of Polymarket when `rules` contains a Polymarket URL.

**Upgrade to P2 or P1 if any of:** a market with `createdAt` after 2026-01-26 appears; any market shows 24h `quoteVolume` above a few hundred shares; Backpack publishes a prediction fee schedule and opens the beta publicly; official docs add a prediction section (which would also settle the questions below); the Extended token launches (the event resolves within about 2 days of launch and could briefly carry real volume).

## 13. Open questions

- Is the beta still invite-only in October 2026, and which countries are permitted for prediction specifically? (Public terms do not say.)
- Prediction fee schedule, margin reserve for shorting YES, and minimum order notional.
- Is `/api/v1/prediction` cached (the `/markets` endpoint is, 300 s)? What happens to the 18 never-resolved zero-volume events?
- Does the API allow unauthenticated WebSocket depth for prediction symbols? (Not tested.)
- Whether Backpack's User Agreement 17.1 tolerates read-only market-data use by a third-party aggregator; ask Backpack in writing before relying on it.

## Sources

- Official API docs (Redoc, changelog to 2026-10-16, MarketType enum with PREDICTION, auth/signing, WS streams, Blockchain enum): https://docs.backpack.exchange/ [H]
- Public endpoints GET'd 2026-10-19: https://api.backpack.exchange/api/v1/markets?marketType=PREDICTION ; /api/v1/prediction (+`?eventSlug=extended-fdv-above-one-day-after-launch`, `?symbol=`, `?resolved=false`) ; /api/v1/depth ; /api/v1/trades ; /api/v1/openInterest ; /api/v1/tickers ; /api/v1/markPrices ; /api/v1/assets ; /api/v1/status ; /api/v1/time [H]
- Product page (title/description; dehydrated data identical to the API): https://backpack.exchange/prediction ; its front-end JavaScript chunks (endpoint names, `isPredictionEnabled`, `ukCanTrade`) [M]
- Backpack Learn, Unified Prediction Portfolio (published 2026-01-13, updated 2026-07-16): https://learn.backpack.exchange/articles/unified-prediction-portfolio-backpack [H]
- Prediction Market Services Terms of Service, Last Updated 2026-02-15 (Google Drive PDF linked from https://support.backpack.exchange/legal/general-legal/user-agreement.md): file id `1zH4If80Pux91Y3duMaJIxOhVro3TFVqo` [H]
- Backpack Exchange User Agreement, Last Updated 2026-09-07 (same index page): file id `1R1-MTQYGcWj5qk4q9vJcAsMwDwGP5Bok` [H]
- Support: https://support.backpack.exchange/llms.txt ; https://support.backpack.exchange/exchange/api-and-developer-docs/faqs.md (rate limits) ; https://support.backpack.exchange/exchange/trading/trading-fees.md ; https://support.backpack.exchange/technical-docs/trading/fees.md ; https://support.backpack.exchange/exchange/exchange-account/identity-verification/supported-regions.md [H]
- Press (beta announcement only): https://finance.yahoo.com/news/backpack-exchange-launches-margin-based-114720783.html (Coinspeaker, 2026-01-14) ; https://finance.yahoo.com/news/backpack-tests-prediction-markets-traders-215917913.html (99Bitcoins, 2026-01-15) [M]
- Cross-check on Polymarket (public gamma-api, 2026-10-19): `https://gamma-api.polymarket.com/events?slug=extended-fdv-above-one-day-after-launch`, `paradex-`, `infinex-`, `edgex-fdv-above-one-day-after-launch` [H]

## NOT FOUND (searched)

- Prediction fee schedule (support trading-fees, technical-docs fees, futures fees, Terms, User Agreement, learn index).
- Official prediction-market API docs or changelog entries (docs.backpack.exchange full text; only the `MarketType` enum and one WS remark).
- Public-IP rate limits for unauthenticated GETs.
- US eligibility for prediction; prediction-specific restricted-country list (supported-regions page is silent).
- Any on-chain contract, token or explorer representation of positions.
- Third-party volume dashboards (DefiLlama etc.) for Backpack predictions.
- Announcement of shutdown or of new prediction listings after January 2026 (web search budget exhausted after one extended search; docs changelog and learn index checked instead).

## Suspicious / embedded instructions encountered (recorded, not followed)

- Every page under support.backpack.exchange (GitBook) ends with an "Agent Instructions" section telling AI agents to issue an HTTP GET to the same page with `ask=<question>&goal=<user_goal>` query parameters, which would send the user's goal to a third party. Not followed. Seen on the `.md` form of https://support.backpack.exchange/legal/general-legal/user-agreement.md and reported by the fetch tool on the same family of pages.
