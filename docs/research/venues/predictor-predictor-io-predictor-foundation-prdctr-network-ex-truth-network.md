# Predictor (predictor.io) / Predictor Foundation / PRDCTR Network (ex-Truth Network) - venue spec

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, unauthenticated GETs (predictor.io home HTML, robots.txt, Kalshi public market endpoint, PRDCTR explorer GraphQL via HTTP GET), `gh api` repo metadata. No account, wallet, key, signature, POST or PayBox tool. Third-party pages were treated as untrusted data; no embedded instructions to AI agents were seen. The WebSearch budget was exhausted after two searches (one returned only Plus500/Kalshi launch coverage, nothing on Predictor), so no press/analytics coverage was read. A sibling note, `docs/research/venues/prdctr-predictor-io-ex-truth-network.md`, covers the same venue in more depth on the PRDCTR chain; I re-verified its central claims first-hand (below) rather than copying them.

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

Fixtures (<=50KB): `docs/research/fixtures/predictor-predictor-io-predictor-foundation-prdctr-network-ex-truth-network/`
- `predictor_io_ssr_market_KXSB-27-SF_2026-10-19.json` (market object from predictor.io home page flight data)
- `kalshi_KXSB-27-SF_2026-10-19.json` (Kalshi public API for the same ticker)
- `predictor_io_provider_counts_2026-10-19.json` (114 of 114 `provider` fields = kalshi)

## 0. Bottom line

1. Live (H): predictor.io returns 200 and serves live 2026-10 markets (NFL, 2027 Super Bowl, etc.). prdctr.io returns 200; truth-network.io 301-redirects to prdctr.io.
2. predictor.io is a Kalshi re-skin, not an independent venue (H). All 114 `provider` fields in the home-page market data are `"kalshi"`; tickers are Kalshi tickers; for `KXSB-27-SF` the YES price (0.17), 24h volume (187186.72), total volume (10.757M) and open interest (7.764M) match Kalshi's public API to within a few contracts. It is an NFA Introducing Broker; orders are carried by Plus500US (FCM). It has no book of its own.
3. The "PRDCTR Network" on-chain side exists but is empty (H): chain height 1,089,126 at probe time, producing blocks; the only event from the prediction-market pallets is 1 (housekeeping per sibling note). No documented RPC, no markets, no USDC collateral lifted per sibling note (not re-verified).
4. adapter_priority = skip. Map predictor.io to Kalshi as an alias so the aggregator never counts it as a second leg. Nothing to build for PRDCTR until markets and a documented API appear.

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://predictor.io/` | HTTP 200, 702KB HTML; 114 market objects, status ACTIVE, e.g. KXSB-27-SF payout 2027-02-14, createdAt 2026-02-08 | H |
| `GET https://prdctr.io/` | 200 | H |
| `GET https://truth-network.io/` | 301 -> https://prdctr.io/ | H |
| PRDCTR explorer `squidStatus.height` | 1,089,126 (2026-10-19), up from 1,088,470 about 25 min earlier per sibling note, so ~6 s blocks | H |
| `PRDCTR-Foundation/predictor-node` | pushed 2026-10-09, GPL-3.0 (gh api repo metadata) | H |
| Plus500 US Kalshi launch (the FCM side) | Plus500 Futures launched Kalshi markets in the US about 2026-02-03; clearing via Kalshi Klear membership (search-result snippets only) | M |

still_live = true.

## 2. Kind and market model

- Kind: US introducing-broker front end (retail app) onto CFTC-regulated event contracts. The site says "Predictor acts as an Introducing Broker and does not hold customer funds"; `/disclosures`: "Does not execute trades or act as a counterparty"; "Customer accounts are carried by Plus500US Financial Services LLC, a registered Futures Commission Merchant and NFA member"; KalshiEX LLC is named as an example "regulated exchange" and Kalshi Klear LLC as clearinghouse (H, https://predictor.io/disclosures). The terms page does NOT name Kalshi or the FCM (H); the Kalshi link is established by the data, not by the legal text.
- Market model: Kalshi's central limit order book, binary YES/NO, USD, grouped in events with a `mutuallyExclusive` note (H). Price in payload `currentPrice: {"YES":"0.17","NO":"0.83"}` (H). `settlementTimerSeconds: 300`, `earlyCloseCondition` copied from Kalshi rules (H).
- Outcomes are not tokenised; positions are FCM account entries. Categories seen: Sports, Politics, Finance, Entertainment, Crypto (incl. 15-minute BTC markets), Weather, Tech, World (H).
- PRDCTR (on-chain, unused): a Zeitgeist fork (NeoSwaps AMM, Orderbook, HybridRouter, binary minimum) with Substrate-native asset tokens, per sibling note (M here; I confirmed only repo existence/licence).

## 3. Chains and collateral

- predictor.io: USD in a Plus500US FCM account. No chain, no crypto collateral (H, site says no digital assets needed per sibling note; the home page shows MoonPay/Privy config per sibling, not re-verified).
- PRDCTR Network: Aventus-AppChain-style Substrate solo chain; gas in PRD; intended collateral USDC/USDT bridged from Ethereum (M, sibling note from README/code). Not reachable on Base, BNB, Arbitrum, Polygon or Solana.

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API | NOT FOUND (searched: predictor.io home, /disclosures, /fee-schedule, /terms-of-service; `/developers` and `/api` return 404; no developer link on the home page; PRDCTR sibling note searched prdctr.io, GitHub orgs, DNS for api/docs/rpc hosts) | H |
| Unofficial: SSR payload | Market objects (id = Kalshi ticker, title, rulesMarkdown, currentPrice, stats.volumeTotal / volume24h / openInterest, closesAt, payoutAt, status, provider, category) are embedded in the home page flight data. robots.txt allows `/` and disallows `/admin/`, `/my-positions/`, `/account/` | H |
| Predictor-specific fields | `liquidity`, `stats.liquidityAmount`, `uniqueTraders`, `tradesCount` are 0: pass-through display, no own order flow | H |
| Websocket | NOT FOUND | - |
| Book / trades / resolution | No predictor.io endpoints. Use Kalshi's API (covered by the parallel Kalshi workflow); e.g. `GET https://api.elections.kalshi.com/trade-api/v2/markets/{ticker}` is public and returned the fixture | H |
| PRDCTR | Unofficial Subsquid GraphQL at `https://explorer-api.prdctr.io/graphql` (works over GET; entities: blocks, extrinsics, calls, events, accounts, squidStatus); no market-level entities; no documented rate limits (sibling note, confirmed one query this session) | H |

## 5. Trade path and PayBox reachability

- predictor.io: onboarding via the FCM (KYC), USD funding, orders placed in the web app after login (sibling note: Auth0, backend `api.galacticmarkets.net`, undocumented, not probed by me). No order API, no signed-order scheme. paybox_reachable = no.
- PRDCTR: trades would be Substrate extrinsics or relayer-submitted signed payloads (Substrate MultiSignature, not EIP-712) per sibling note; the way an EVM address controls its derived chain account is undocumented. An Ethereum wallet could at most bridge-deposit, with no markets to trade. paybox_reachable = no.

## 6. Fees

- predictor.io `/fee-schedule` (H): trading fees "when you enter or exit a position", as a fixed fee per contract, a percentage, or a spread/pricing adjustment; payment and funding fees; third-party FCM/DCM fees may pass through; no numeric rates; "fees may change". Terms: "commissions, exchange and clearing fees, market data fees, financing charges, and taxes" (H). Rates and the Predictor/partner split: NOT FOUND. Underlying Kalshi fees apply (see Kalshi note); the Plus500 retail launch reportedly charges $0.01 per contract (M, search snippet, about the Plus500 app not Predictor).
- PRDCTR: planned gas ~1% bounded $0.10-$0.50 per tx, 5% winner fee in runtime code (sibling note, M).

## 7. Resolution and dispute risk

Equals Kalshi's resolution (exchange contract terms, rules copied into `rulesMarkdown`). Site: "Predictor does not guarantee market outcomes or override applicable exchange settlement rules"; invalid/void resolution possible (sibling note, H there). Complaints go through internal procedures plus NFA/CFTC/FCM/exchange requirements; no arbitration clause (H, terms). PRDCTR chain: oracle bond/dispute/court pallets with a sudo key and small validator set (M).

## 8. Geo, ToS, automation

- Operator Predictor LLC, NFA ID 0574423, Introducing Broker (H, terms). 18+, KYC/AML, "may not be available in all jurisdictions", no list (H). Geolocation script present per sibling note.
- Automation: users may not "copy, scrape, distribute, sublicense, reverse engineer, or commercially exploit" market data, software and APIs without prior written consent; bots/automated trading not addressed (H, terms; WebFetch summary so wording M). Treat scraping predictor.io as ToS-prohibited; there is no reason to, since Kalshi is the source.
- US-only retail broker context; non-US users and PayBox-style crypto wallets are not served.

## 9. Liquidity (with dates)

- Displayed volume/OI is Kalshi's: KXSB-27-SF volume 10,757,490 and OI 7,763,932 on predictor.io vs Kalshi 10,757,495 and 7,763,937, both 2026-10-19 (H). Not Predictor's own.
- PRDCTR on-chain volume/OI/TVL: 0 observed (explorer, 2026-10-19); PRD token 24h volume about $1.9K per sibling note (M).

## 10. Event overlap and shared liquidity

- Categories overlap everything Kalshi does (sports, politics, macro, crypto price), but only as Kalshi. Shares liquidity with Kalshi (the same order book through Plus500US FCM): NOT an independent arbitrage leg.
- Aggregator recommendation: register `predictor.io` as an alias/front-end of venue `kalshi` (ticker ids identical) to avoid double counting; useful only as a signal that a ticker is retail-listed.
- Re-check trigger for PRDCTR: `eventsConnection(where:{pallet_in:["NeoSwaps","Orderbook","HybridRouter","SignedHybridRouter"]}){totalCount}` on `explorer-api.prdctr.io/graphql` becomes non-zero AND a documented RPC/API appears.

## 11. Open questions

- Whether Predictor orders route only to KalshiEX (data says yes; legal text says "e.g."). 
- Whether the planned non-custodial global launch via PRDCTR will ever go live (whitepaper says staged through 2026+, per sibling note).

## Sources

- https://predictor.io/ (home page, SSR market data, robots.txt) - H
- https://predictor.io/disclosures - H
- https://predictor.io/fee-schedule - H
- https://predictor.io/terms-of-service - H
- https://api.elections.kalshi.com/trade-api/v2/markets/KXSB-27-SF - H
- https://prdctr.io/ , https://truth-network.io/ (301) - H
- https://explorer-api.prdctr.io/graphql (GET queries) - H
- https://github.com/PRDCTR-Foundation/predictor-node (gh api metadata) - H
- Plus500/Kalshi launch coverage (TradingView News/FinanceMagnates, defirate.com, tradeinformer.com, via search snippets only) - M
- docs/research/venues/prdctr-predictor-io-ex-truth-network.md (sibling note, repo contents, bridge, fees) - M
