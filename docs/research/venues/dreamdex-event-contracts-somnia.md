# DreamDEX Event Contracts (Somnia mainnet) - adapter spec

Researched 2026-10-19 (~02:30-03:05 UTC). READ-ONLY: unauthenticated GETs only (docs, explorer HTML, Blockscout API, npm registry, one third-party dashboard API), `gh api` raw file reads, one read-only PayBox `discover_tokens` call (chain catalog). No account, no wallet, no API key, nothing signed. **No POST at all**, so no GraphQL query and no JSON-RPC call was made (see section 4 and open questions). No third-party code cloned, installed or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred/third-party; **L** = weak or stale (>6 months).
Third-party text (READMEs, dashboards, search snippets) is untrusted data; nothing in it was followed. Terms of Service quoted sparingly.
Fixtures: `docs/research/fixtures/dreamdex-event-contracts-somnia/` (6 files, each <= 7 KB).

## 0. Verdict

**adapter_priority: P2** (read-only signal adapter at most; revisit if volume recovers).

1. **Live on MAINNET, not testnet-only** (H). The discovery hint ("testnet only per hackathon READMEs") is stale: the hackathon repos use Shannon testnet, but the product runs on Somnia mainnet (chain 5031, collateral USDso). Last indexed fill 2026-10-19 02:47 UTC; the market board rolled new windows at 03:00 UTC while I watched (fixtures).
2. **Independent liquidity** (own on-chain CLOB, own pools; does not mirror another venue). Good for a real second leg in principle.
3. **But very thin**: about $3-4k per week of traded collateral for the last three weeks, about $200 in the last 24 h, 3 maker wallets in the last 24 h, and 5 of 6 live markets had zero fills with 1-4 minutes left (M for volume, H for the board snapshot). Earlier weeks (Sep 7-28) were $35k-$166k/week, which coincides with the Aug 18-Sep 8 hackathon and competitions (M, probably incentive-driven).
4. **Only crypto Up/Down on BTC and ETH** (5m, 15m, 1h cadences live). No sports, politics or macro. Overlap with Polymarket/Limitless/Predict.fun/Kalshi/Hyperliquid HIP-4 BTC/ETH up/down series, but with a **different settlement oracle** (Somnia ProphecyOracle multi-source median vs Chainlink etc.), so it is a basis trade, not a clean arb.
5. **API**: no REST for event contracts (REST/WS docs are spot-only). Reads go through the public Hasura-style GraphQL indexer, the Somnia chain RPC/WS, or the npm TypeScript SDK `@somnia-chain/markets-sdk` (MIT, v0.32.1 published 2026-10-13). Workable for a TypeScript project, but the GraphQL schema is not published as a standalone reference.
6. **PayBox cannot trade it** with its normal tools: Somnia (5031) is not in PayBox's 11-chain catalog (H, live `discover_tokens`), SOMI gas and USDso must be held on Somnia, and every order is an on-chain transaction.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Last fill in indexer window | 2026-10-19 02:47:29 UTC (third-party dashboard reading the official indexer; `last_24h.last_fill_utc` in fixture `third-party-ec-volume-weekly-mainnet.json`) | M |
| Official explorer, mainnet event-contract board | 6 live markets (BTC/ETH x 5m/15m/1h), all status Trading at 02:56 and 02:59 UTC; at 03:00:49 UTC the six windows had rolled to expiries 03:05 / 03:15 / 04:00 UTC and the total went 47,670 -> 47,676 (fixtures `somnia-markets-explorer-live-event-board*.json`) | H |
| SDK `@somnia-chain/markets-sdk` 0.32.1 | published 2026-10-13 (npm registry) | H |
| `somnia-chain/dreamdex-bot-kit` | MIT, created 2026-07-07, pushed 2026-10-12, 11 stars / 13 forks / 28 open issues, not archived (`gh api`) | H |
| ToS effective date | 23 September 2026 (https://dreamdex.io/terms-of-service) | H |
| First mainnet binary fill | 2026-07-22 15:36 UTC (third-party repo `emrestay/ec-activity`, `lib/config.mjs`) | M |
| Earlier mainnet venue | stopped rolling markets on 2026-07-31 (same repo README); bot-kit says venue ids changed three times in the first week of August | M |
| Hackathon | "Event Contracts Hackathon" on DoraHacks, registration 2026-08-18, submissions to 2026-09-08, $5,000 USDso prize pool (search summary of DoraHacks/hackathons.space) | M |
| Docs lag the product | docs say BTC/ETH on "15-minute and 1-hour windows at the time of writing"; board shows 5m live too | H |

The "$120 million volume for spot + event contracts" figure surfaced by one search snippet could NOT be found on the CoinMarketCap page it was attributed to, and is inconsistent with the indexer-derived numbers below. Treat as unverified (L).

## 2. What it is

- **Operator**: DreamDEX, S.A. (Panama company; ToS H). Product name in docs: "Event Contracts" inside the dreamDEX app (https://app.dreamdex.io/event-contracts/WBTC:USDso/15m). Protocol layer is **Somnia Markets** (`somnia-chain/somnia-markets`, SDK docs at https://prd.smk.somnia.host/docs), a generic binary-market engine in which several "venues"/operators can exist; dreamDEX is one venue (venue id moves, see section 4).
- **Kind**: onchain-clob (Somnia L1, 100 ms blocks per SDK docs H).
- **Market model (H)**: binary YES/NO ("Up"/"Down"), **order book**, single book per market quoted in Up (YES) probability, Down price = 1 - Up price. Four sides BUY_YES / SELL_YES / BUY_NO / SELL_NO; crossing paths: direct swap, **mint-a-pair** (two opposite-side buyers, no seller needed), burn-a-pair. Prices in (0,1); mainnet tick = lot = 0.001 (1e15 raw on 18-dec USDso). Order types LIMIT, MARKET (IOC), FILL_OR_KILL, POST_ONLY; every order must carry `expireTimestampNs` <= market expiry (0 reverts). The dreamDEX app itself only places IOC orders and exits by selling into resting bids.
- **Tokenisation (H)**: Up and Down positions are ids on one shared ERC-6909 singleton `OutcomeToken6909` (not per-market ERC-20s). 1 USDso mints 1 Up + 1 Down (`mintCompleteSet`), merge returns 1 USDso. Winning token redeems 1 USDso; losing redeems 0 (does not revert). Winnings are **claimed**, not pushed.
- **Series structure (H, SDK binary guide)**: a `MarketCreator` rolls series at wall-clock boundaries via Somnia reactivity. Cadences supported 1m/5m/15m/1h/4h/24h; live on 2026-10-19: 5m, 15m, 1h x BTC, ETH. Per market: a `BinaryMarket` contract + a recycled `BinaryPool` (CLOB + escrow). **Pools are recycled across windows**, so key by `marketId`/symbol, never by pool address.
- **Strike (H)**: series markets are **reference-mode**: "resolves YES iff its own oracle answer is at/above the previous boundary's reference answer" (on-chain `strike` field = 0). The question text shows the recorded opening price, e.g. "Will BTC/USDC's price be at or above 82623.9375 at unix time 1792379100?"; at the 03:00 UTC boundary the 5m/15m/1h BTC markets all carried the same reference 82623.9375 (fixture after-roll). Docs say not to parse question text; read `strike`/`asset`/`intervalSec` fields (H, gotcha 13). Some non-series markets can use a fixed strike (H, support FAQ).
- **Symbol format (H, SDK docs)**: e.g. `BTC-95000-31DEC26/USDC#YES`; bot-kit shows `BTC-0-12AUG26-1600/USDso#YES`.

## 3. Chains and collateral

- **Somnia mainnet, chainId 5031**; native SOMI (gas, 18 dec). RPC `https://api.infra.mainnet.somnia.network`, WS `wss://api.infra.mainnet.somnia.network/ws`; backups PublicNode, Ankr, Stakely, Validation Cloud (H, SDK networks page + dreamDEX developers page). Explorer https://explorer.somnia.network (Blockscout, GET API works).
- **Collateral: USDso** `0x00000022dA000002656c64D9eA6011ea952D008A`, 18 decimals on mainnet. USDso is "backed 1:1 by FraxUSD via LayerZero" and mintable from USDC.e via a swap contract / FraxNet widget (H, audits + deposit pages). Blockscout (2026-10-19): total supply 3,494,239.5 USDso, 16,832 holders, ERC-20 (H, fixture `somnia-explorer-usdso-token.json`).
- Testnet (Shannon 50312) uses tUSDC (6 decimals, public faucet, 10,000 per call) - this is what the hackathon repos use. The 10^12 decimals gap silently misprices orders if hard-coded.
- **Core contracts (CREATE3, identical on testnet and mainnet; H, contracts-and-addresses page)**: BinaryMarketsModule `0x3ecC694Cef705358864a646142ac17A90E29e388` (confirmed on mainnet: verified ERC1967 proxy, fixture `somnia-explorer-binary-markets-module.json`), MarketsCore `0x2802504314685D89bF6C992CA5a8e7cC78bc0294`, BinarySettlement `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23`, OutcomeToken6909 `0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9`, OracleHub `0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b`, CollateralRouter `0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C`. Contracts are upgradeable proxies (admin can roll implementations). Per-market and pool addresses come from the module registry, never hard-coded.
- Funding into Somnia from other chains: the dreamDEX app deposits USDC from e.g. Arbitrum via LayerZero routing USDC -> USDC.e -> USDso (H, first-deposit page). SOMI is needed for gas on event contracts (not sponsored, H fees page).

## 4. Read API

**Verdict: `official-public` for the indexer + chain; REST/WS are spot-only.**

| Surface | Detail | Tag |
|---|---|---|
| dreamDEX REST `https://api.dreamdex.io/v0` | Docs: "the HTTP API covers spot only and has no event-contract endpoints". Live `GET /v0/markets` returned 4 spot pairs only (SOMI, USDC.e, WBTC, WETH vs USDso; fixture `dreamdex-rest-v0-markets.json`). | H |
| dreamDEX WS `wss://api.dreamdex.io/v0/ws/public` | channels `orderbook`, `ohlcv`, `trades`, `order`, symbols are spot pairs. Not used for EC. | H |
| **Markets indexer GraphQL** `https://prd.smk.somnia.host/v1/graphql` (testnet `https://dev.smk.somnia.host/v1/graphql`) | Documented in the official SDK docs as "the production indexer" (https://prd.smk.somnia.host/docs/typescript/reference/networks-and-endpoints). Hasura-style query language (`where`, `_eq`, `order_by`, `limit`, `offset`). A third-party tool queries it with no key (M). A plain GET returns `PersistedQueryNotSupported`, so real queries need POST, which I did not do. Tables seen via third-party code: `Fill` (id, maker, taker, makerSide, takerSide, kind in DIRECT_YES/DIRECT_NO/MINT_A_PAIR/BURN_A_PAIR, quantity, quoteQuantity, timestamp, txHash, `market{asset intervalSec expiry venueId}`), filter `market:{marketType:{_eq:BINARY}}` is **mandatory** because spot/perps/EC share the `Fill` table. Official docs name market-row fields: `marketId`, `asset`, `intervalSec`, `expiry`, `tradingStart`, `venueId`, `operatorId`, `oracleQuestionId`, `cumulativeQuoteVolume`, `cumulativeBaseVolume`, `tradeCount`, `lastPrice`, `lastTradeAt`, status incl. terminal `Finalized`. | H (endpoint, field names from recipes), M (table schema) |
| SDK `@somnia-chain/markets-sdk` (TypeScript, MIT, needs `viem`) | `listLiveBinaryMarkets`, `listBinaryMarkets({status:"Finalized"})`, `listPastBinaryMarkets`, `fetchOrderBook(symbol, depth)`, `watchOrderBook`, `getMarketOnchain(marketId)` (authoritative status, pool, yesId/noId), `getCandles(pool, secs)`, `getFills(pool, ...)`, `getMarketResolution(marketId)`, `getOpeningPrices`, `fetchTicker`. Use >= 0.29.0 (below 0.23 reads fail, below 0.28 float prices revert, below 0.29 market count silently caps at 10,000). | H |
| Chain RPC/WS | Order books live on-chain (pool contract); SDK streams them via chain events. Docs: "There are no API rate limits: market data is the chain itself, and the public RPC endpoints are unthrottled." Indexer limits: NOT FOUND. | H (claim as stated by operator) |
| Price feed (underlying BTC/ETH EMA index) | `https://price-feed.prd.oracle.somnia.host/v1/graphql`, quote USDC (SDK networks page). bot-kit README says no mainnet feed bundled; SDK docs 0.32 list one. Not exercised. | H/L |
| Resolution transparency | `https://prd.oracle.somnia.host/questions/{oracleQuestionId}?view=graph` (client-rendered; shows sources, median, required source count). Indexer: `getMarketResolution(marketId)` returns `openingAnswer.numericValue` / `closingAnswer.numericValue`. | H |
| Explorer HTML (GET, official) | `https://prd.smk.somnia.host/markets?type=event` is server-rendered and lists live + past markets with strike/open, fills count and expiry. Handy for a smoke test; not an API. | H |
| Third-party volume tally | `https://ec-leaderboard.vercel.app/api/leaderboard?since=&until=` (unaffiliated dashboard over the indexer). Used here for volume only. Do not depend on it. | M |

**Not captured (needs POST)**: real GraphQL `Market`/`Fill` responses, book depth, and JSON-RPC reads. Fixtures for the live board come from the official explorer's server-rendered HTML, parsed by me.

Pagination/ids to know: `marketId` is bytes32; `venueId` bytes32 is **unstable** (bot-kit example values `0x679795a0...` testnet / `0x458b30c2...` mainnet; both networks changed venue three times in the first week of August 2026); the indexer lags the chain by seconds; gate every write on on-chain status 1 (Trading).

## 5. Trade path

- **No REST order API and no off-chain signed orders for EC.** Orders are on-chain transactions to the market's pool via the SDK: `exchange.createOrder(symbol, "limit", side, amount, price, {timeInForce:"IOC"|postOnly})` (unified tier) or `exchange.trader.placeOrder({pool, side, price, quantity, orderType, expireTimestampNs})` (raw tier). SDK signs locally with a private key (fixed fees, local nonce) and sends via Somnia `realtime_sendRawTransaction`. Also: `mintSet`/`burnSet`, `trader.redeem` (explicit outcome index), cancel. (H, recipes.)
- **Auth/signing**: plain EVM secp256k1 signature over a Somnia (5031) EIP-1559 transaction; the key must hold SOMI (gas) and USDso (collateral; buys pull from wallet, "auto-pull"). Buys escrow collateral, sells escrow outcome tokens (no naked shorts). Reverts do not throw on SDK < 0.23; check the receipt.
- **Bot keys**: "Link a bot" (place/cancel only, cannot withdraw) is documented for **Perps and Spot only**, not event contracts (H, link-a-bot page). The app uses a Privy-backed smart wallet; SDK also exposes smart-account/Safe/Permit2/builder-approval helpers (H, SDK index). No documented hot-key-without-withdraw option for EC.
- **Maintenance**: markets die every window; a bot must roll to the successor, cancel/let expire orders, and run a claim sweep (`listBinaryMarkets({status:"Finalized"})` then `trader.redeem`) or its balance sits in settled markets.
- **PayBox (EVM wallet through proposals or signed orders)**: **no for standard flows, partial in theory** (`paybox_reachable: no`).
  - PayBox chain catalog (live `discover_tokens mode=chains`, 2026-10-19): Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid. `query=somnia` returns 0. Somnia 5031 is absent (H; the tool says the catalog is "not a support allowlist").
  - `io.paybox/transactionProposal` for `eip155:5031` is syntactically valid but needs the network "available in PayBox" (project note 06); swaps/bridges via MoonX cannot reach Somnia (M, unverified).
  - The wallet would need SOMI plus USDso on Somnia. The only documented funding path is dreamDEX's own deposit/LayerZero route from a supported chain (e.g. Arbitrum USDC), which is an app flow, not a documented contract call (NOT FOUND: deposit contract ABI for this path).
  - Raw signing of a Somnia transaction via `request_wallet_sign` op `transaction` is untested (and would need an agent-run broadcaster); each order, approval and claim is a separate signature. No money-moving or signing tool was called.

## 6. Fees

| Item | Value | Tag |
|---|---|---|
| Maker / taker | 0% (docs: "no entry, settlement, or winnings fee") | H |
| Settlement fee | protocol supports a one-time fee on winning redemptions; **dreamDEX sets it to 0** | H |
| Void | no fee on void | H |
| Gas | paid by the user in SOMI (sponsorship covers only SOMI<->USDso and USDC.e<->USDso spot pairs, account creation, withdrawals; "Event Contracts ... paid from your account's native balance"). Gas per order: NOT FOUND (fixed per-action estimates not published). Explorer shows 5.26 gwei average gas price 2026-10-19. | H |
| Builder fees | the protocol has builder/router fee streams (`listBuilderFees`); not charged by default; roadmap "builder-codes / fee-rebate program" | M |
| Maker rewards | "Collateral Yield" paid in USDso to resting liquidity, proximity-weighted (fees page; applicability to EC not stated) | H/L |

The fees page carries a "Work in Progress" banner (H), so rates can change without notice (ToS: "All fees are subject to change at any time without notice").

## 7. Resolution mechanism and dispute risk

- **Mechanism (H)**: at expiry the **ProphecyOracle** (Somnia oracle hub, scheduled at market creation, gas pre-reserved) posts an `AnswerPosted(questionId, outcomeIdx, numericValue, voided, ...)`; Somnia reactivity delivers it to the OracleHub callback and then to `BinaryMarketsModule` which flips the market to Resolved/Voided; redemption opens immediately. Settlement price = **median of multiple price sources** with a minimum number of agreeing sources; "never a single exchange tick"; UP wins if settlement >= opening reference, Down if below. Source list and the minimum count are shown only per question on the oracle explorer; **named sources: NOT FOUND in docs** (searched docs.dreamdex.io, SDK docs, oracle explorer HTML).
- **Backstops (H)**: anyone can call `pokeOracle(questionId)`; after the settlement window anyone can call `voidExpired()`. Length of the settlement window: NOT FOUND.
- **Void policy (H)**: if no reliable price inside the window the market voids and **each side redeems 0.50 USDso** (`UNIFORM`, used by every dreamDEX market; `CLOB_SNAPSHOT` policy exists in the protocol). This is not a refund of entry price.
- **Dispute risk**: there is **no dispute or challenge process** for the price answer (no bond/UMA-style flow); recourse is a support ticket. ToS "Automated and AI-Based Resolution Risk": resolution may be performed "by automated resolution systems, including artificial-intelligence-based agents operated by independent validators ... without human review" and may be "non-deterministic" or differ "from other sources". Contracts are upgradeable. Hacken audited the **spot** contracts (April 2026); an audit of the binary/event-contract stack is NOT FOUND (audits page lists spot + USDso swap by Sherlock).
- **Arb implication**: opening reference and close are sampled by a different oracle than Polymarket/Limitless (Chainlink TWAP/Data Streams per project notes 08/09), so equal-title legs can settle on opposite sides near the strike; void pays 0.50 irrespective of entry.

## 8. Geo, ToS, automation

- **Restricted territories (H, ToS 23 Sep 2026)**: Iran, Cuba, North Korea, Myanmar, Crimea/Donetsk/Luhansk, Kherson/Zaporizhzhia, and "the United States of America (restricted only with respect to Perpetual Futures trading functionality and Event Contracts functionality)" and the same carve-out for the **United Kingdom**. VPN circumvention is prohibited (3.6). The marketing site says "available in permitted jurisdictions only". The app runs wallet screening and a geo boundary component (flags seen in page payload, H). The contracts themselves are permissionless; the restriction binds users via the ToS/Interface. Whether the operator can block contract-level access: NOT FOUND (no allowlist seen).
- **Automation (H)**: ToS 4.10 bans bots/scrapers against the **Interface** "except through APIs or tooling expressly designated for automated trading". The operator publishes a bot kit, an SDK, "no API rate limits" and sample bots, so SDK/on-chain trading is explicitly supported; scraping the web app is not. The dreamDEX site `/terms-of-service` also bars use of the Interface "for monitoring its availability ... or competitive purposes" (benchmarking). Read the explorer/indexer/chain instead of the app.
- **Regulatory**: ToS states the regulatory characterisation of Event Contracts is uncertain and the functionality may be "restricted, suspended, or discontinued at any time".
- Wash trading: the code author of a volume dashboard notes zero fees make self-crossing cost only gas (M). Treat volume as unreliable.

## 9. Liquidity (all dated)

| Metric | Value | Source / tag |
|---|---|---|
| Event-contract volume, week to 2026-10-19 | $3,406 (997 fills, 266 taker addresses) | M, third-party tally of indexer fills (fixture) |
| Week to 2026-10-12 | $3,238 (184 fills, 19 traders) | M |
| Week to 2026-10-05 | $5,412 | M |
| Week to 2026-09-28 | $97,273 (9,101 fills, 383 traders) | M |
| Week to 2026-09-21 | $35,220 | M |
| Week to 2026-09-14 | $166,302 | M |
| Last 30 days (to 2026-10-19) | $117,451 (11,202 fills, 662 takers) | M |
| Last 24 h (02:47 UTC cutoff) | $199.77 (232 fills, 68 takers, 3 maker wallets; BTC 231 fills, ETH 1; 15m $162, 1h $37, no 5m fills) | M |
| Live board snapshot 2026-10-19 02:56-02:59 UTC | 6 markets, 1 fill total, 15m BTC priced 77%, the other five "no price" | H (explorer HTML) |
| Event-contract markets ever created (mainnet, all venues) | 47,670 (47,664 past, 6 live) on 02:59 UTC; +6 at 03:00 roll | H (explorer) |
| dreamDEX platform, marketing site | trailing 30-day volume $11.9m, TVL $1.7m, 18.1k "traders on the book", 4 CLOB markets (mostly spot) | M (marketing page crawl 2026-10-19; no EC breakdown) |
| USDso supply | $3.49M | H (Blockscout 2026-10-19) |
| Book depth per market (size at best bid/ask) | NOT FOUND (needs RPC/GraphQL POST) | - |

Volume is defined as collateral moved, each fill counted once (a mint/burn is worth a whole contract). The venue's own `cumulativeQuoteVolume` field counts only the Up-leg premium and under-counts mints (official recipes H).

## 10. Event coverage and arbitrage overlap

- **Categories**: crypto price only. BTC and ETH, "at or above reference at time T" windows of 5m/15m/1h (4h/24h supported by the protocol but not seen live). No sports, politics, macro. (H)
- **Overlapping venues** (from project notes 08/09, M): Polymarket BTC/ETH Up/Down (Chainlink TWAP/Data Streams), Limitless 5m/15m/1h (Chainlink TWAP), Predict.fun up/down (Chainlink Data Streams), Kalshi 15-min crypto, Hyperliquid HIP-4 priceBinary/priceBucket, Alpha Arcade mirrors. Wall-clock aligned boundaries (00/05/10 ..., hourly at :00 UTC) match those series, so windows can be paired; the reference price differs (DreamDEX = its own median at the boundary, shown in the question text and the oracle explorer).
- **Liquidity shared with another venue?** No. Own order book and pools (H). Not a Polymarket mirror. Separate from dreamDEX spot liquidity (spot and EC are different contracts; they share only the `Fill` table in the indexer). Note several operators/venues can exist on the same Somnia Markets protocol; they would be separate books (earlier mainnet venue stopped 2026-07-31, M).
- **Quotient signal angle**: Quotient does not cover this venue (project note 12, not re-checked). The implied probability is usable as a lagging signal only when a two-sided book exists, which is rare right now.

## 11. Adapter notes for the aggregator

1. Discovery: `listLiveBinaryMarkets({asset, intervalSec})` or GraphQL `Market` where `marketType = BINARY`; scope by `venueId` read off a live row, expect it to change; ignore other venues.
2. Normalise to a binary instrument keyed by `marketId`, outcome YES = Up. Reference price = recorded opening answer; expiry = `expiry` (unix s); resolution oracle = "somnia-prophecy-median" (flag basis risk vs Chainlink venues).
3. Prices: Up probability in (0,1), tick 0.001, lot 0.001 contract (derive from `decimals()` of collateral; never hard-code 6/18). Down book = mirror.
4. Gate on on-chain status (1 = Trading) and skip markets with < ~25% of the interval left (their gotcha 9).
5. Stream: chain WS events through the SDK; avoid scraping app.dreamdex.io (ToS 4.10).
6. If thin books persist, mark the venue as "signal-only, rarely tradable". Do not size an arbitrage leg here without measuring depth first.

## 12. NOT FOUND (searched)

- Order book depth / size per market (needs POST to GraphQL or RPC; searched docs, SSR explorer pages: book is client-rendered).
- Published GraphQL schema or indexer rate limits (searched SDK docs index, networks page, npm packument).
- Named price sources and quorum for the ProphecyOracle median (searched dreamDEX docs, SDK docs, oracle explorer SSR, web search).
- Settlement window length after expiry (searched settlement page, FAQ, market-structure page).
- Audit of the event-contract/binary contracts (audits page lists only spot by Hacken April 2026 and USDso swap by Sherlock).
- Gas cost per EC order in SOMI/USD.
- Official contract-level deposit ABI for the LayerZero funding path usable from a PayBox-supported chain.
- Whether PayBox can sign a chain-5031 transaction (not tested; no signing tool called).
- Confirmation that any other operator/venue currently lists non-crypto event contracts on Somnia Markets.

## Sources

Primary (H):
- https://app.dreamdex.io/docs (docs.dreamdex.io redirects here; `.md` suffix serves raw markdown): `/trading/event-contracts/README`, `/settlement-and-voids`, `/faq`, `/trading/common/fees`, `/trading/common/link-a-bot`, `/developers/event-contracts/{README,market-structure,contracts-and-addresses,gotchas,recipes}`, `/developers/http-api/{README,market-data}`, `/developers/websocket-api/real-time-feed`, `/developers/README`, `/welcome/{roadmap,making-your-first-deposit}`, `/security/{risks,audits}`, `/support/faq/{event-contract-settlement,fees-funding-and-gas}`
- https://dreamdex.io/terms-of-service (effective 23 Sep 2026) and https://www.dreamdex.io/ (marketing, "available in permitted jurisdictions only")
- https://prd.smk.somnia.host/docs/typescript, `/binary`, `/reference/networks-and-endpoints` (Somnia Markets SDK docs); explorer pages `https://prd.smk.somnia.host/markets?type=event` and `/events/<market>`
- https://github.com/somnia-chain/dreamdex-bot-kit (README, `docs/event-contracts.md`, `packages/ec-core/src/{addresses,config,markets}.ts`)
- https://registry.npmjs.org/@somnia-chain/markets-sdk (dist-tags, publish times)
- https://api.dreamdex.io/v0/markets (live GET)
- https://explorer.somnia.network/api/v2/addresses/0x3ecC694C...e388 and `/tokens/0x00000022...008A` (Blockscout, live GET)
- https://prd.oracle.somnia.host/explore (Prophecy Oracle indexer, chain 5031; SSR shell only)
- PayBox `discover_tokens mode=chains` (read-only, 2026-10-19)

Secondary (M/L):
- https://github.com/emrestay/ec-activity (third-party volume tally; first fill 2026-07-22; methodology) and its live API https://ec-leaderboard.vercel.app/api/leaderboard
- https://dorahacks.io/hackathon/event-contracts/detail, https://www.hackathons.space/hackathons/event-contracts-hackathon (via search summary)
- https://github.com/os6863/event-contracts (EdgeScope; hackathon repo, testnet) - hackathon repos are the source of the stale "testnet only" hint
- https://coinmarketcap.com/cmc-ai/somnia/latest-updates/ (community post dated 2026-08-24 on EC launch; "$120M" claim not found there)
- Project notes `docs/research/08-venues-polymarket-kalshi.md`, `09-venues-onchain-clob.md`, `06-paybox-platform.md` for overlap venues and PayBox chain handling
