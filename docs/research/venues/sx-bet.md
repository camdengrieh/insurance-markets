# SX Bet (sx.bet) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (~00:30-01:10 UTC). READ-ONLY: official docs reads (docs.sx.bet `.md` pages), unauthenticated GETs to `api.sx.bet`, DefiLlama API GETs, `gh api` read of one DefiLlama issue, WebFetch of help-centre pages, one read-only PayBox `discover_tokens` (chain catalog). No account, no API key, nothing signed, no POST/PUT/DELETE, no WebSocket connection, no PayBox signing or money tool, no third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (URL in section 14); **M** = secondary/inferred (incl. small-model WebFetch extractions of JS-heavy help pages); **L** = weak or stale (>6 months).
Third-party text is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/sx-bet/` (12 new files dated 2026-10-19, each <= 3 KB; two older files from the 09 workflow also sit there).

## 0. Verdict

**adapter_priority: P1 for a read-only adapter (sports lines + order-book depth); execution leg: not practical through PayBox today.**

1. Live and growing (H): V3 exchange ("OBv3") launched 2026-08-25; DefiLlama V3 volume $6.4M on 2026-10-18 UTC, $27.3M over 7d; ~8,000+ active markets, 472+ events right now.
2. Independent liquidity (H/M): its own peer-to-peer CLOB with its own escrow contract on its own chain. Nothing in the docs ties it to another venue's book. Makers are priced off sportsbook consensus (maker-rewards "Global Line", Pinnacle named), so its prices are a useful sharp-book signal but the liquidity is not shared with Polymarket or Kalshi.
3. Best-in-class API for a sports venue (H): documented REST, Centrifugo WebSocket, EIP-712 order signing, per-route rate limits, scoped API keys.
4. But: **sports-only in practice** (politics/economics/novelty sport ids exist but have 0 active markets; crypto = one BTC daily-strike ladder with ~$3.7K total capacity), **geo-excluded for the US and ~24 jurisdictions**, **own chain not in PayBox's catalog**, **onboarding is browser-based** (API key + proxy wallet), and the API changed in breaking ways on 2026-10-13.
5. Read side is cheap: markets, fixtures, leagues and the anonymised trade tape are keyless, and (surprise, H) the **legacy `GET /orderbook-v3/snapshot?marketHash=` still returns full books with no key today**, though the changelog says it gets "a much stricter rate limit" on 2026-12-01. Plan on a read-only scoped API key.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Site banner | "SX Bet is not available in the United States or other prohibited jurisdictions", version string 11.0.0, status link status.sx.bet (WebFetch of sx.bet) | M |
| Changelog | 2026-08-25 "The exchange now runs on a new orderbook, OBv3" (V3 launch); 2026-08-31 V2 trade-history endpoints 404 from 2026-09-14; newest entry 2026-10-13 (API-key scopes, snapshot path move) | H (WebFetch of docs.sx.bet/changelog, raw `changelog.md` grepped) |
| Public trade tape | 50 trades between 00:21 and 00:41 UTC 2026-10-19 (fixture `trades_public_perPage3_2026-10-19.json` is the 3-row cut) | H |
| Live API | `/metadata/obv3` 200, `/markets/active` 200 with `nextKey` paging, 8,000 markets pulled before my own 80-page cap stopped the scan | H |
| DefiLlama | V3 listed 2026-10-09 (`listedAt` 1791577825); V2 (`sx-bet-v2`) retired, last row 2026-10-04 | H |
| Parent protocol | `parent#sx-bet` groups SX Bet, V2, V3; chain "SX Rollup" | H |

## 2. Kind and market model

- **Kind**: sportsbook-exchange; peer-to-peer order-book betting on a rollup chain (H, docs "What is SX Bet?": "users trade against each other through an open order book").
- **Market**: always a **binary** two-outcome market per `marketHash` (bytes32). Fields `outcomeOneName`, `outcomeTwoName`, `outcomeVoidName`, `type` (30+ type ids, e.g. 52 = "12" moneyline, 1 = 1X2 as "Team A wins / does not win", 2 = Under/Over, 3 = Asian handicap, 28 = totals variant, 226 = moneyline incl. overtime), `line`, `mainLine`, `gameTime`, `sportXeventId`, `leagueId`, `liveEnabled`, `tradingModes` (all observed values `["CLOB"]`), `binaryOnly`, `isQuarterLineMarket` (quarter lines settle half-win/half-loss; parent and child hashes) (H, docs markets page and live rows). A 3-way sport result is therefore 2-3 separate binary markets (e.g. "Tie / Not tie"). Categorical/scalar: none (H). Parlays exist as RFQ parent markets with `legs`.
- **Tokenisation**: no outcome tokens. A bet is an escrow position (`LOCKED` in the OBv3 escrow contract); positions are rows in the API (`/positions-v3`), not transferable ERC-20s (H, bet-lifecycle page).
- **Order book**: price-time priority CLOB. Each order names an outcome side via `isMakerBettingOutcomeOne`; price `percentageOdds` is the **maker's own implied probability x 1e20** (string). Taker price = `1e20 - makerOdds`. Resting `size` is the maker's stake in USDC base units (6 dp); taker capacity at a level = `size * (1e20 - p) / p`. Orders must sit on a 0.125% ladder (`oddsLadderStepSize` 125 = 125x1e15; exceptions exactly 0.1% and 99.9%) (H, order-book, unit-conversions, odds-rounding pages; ladder value confirmed live).
- **Time-in-force**: `GTC` (rests), `IOC`, `FOK` (parlays), `postOnly` modifier; crossing orders execute immediately. Capital is not locked until a match; exposure is checked per `market:outcome` against the full balance; if matches drop balance below resting orders the engine cancels worst-odds-first (`INSUFFICIENT_BALANCE`) (H, risk-limits page).
- **Capital efficiency**: opposite positions on the same market release escrow at fill time (`ceRefundAmount`, `refundFee` rate) (H, capital-efficiency page).
- **Min order**: live metadata `limits.orderSizeMinimumBaseUnits` = "1000000" (1 USDC) (H). The docs "Testnet & Mainnet" table says mainnet minimum is `5` USDC: docs conflict with the live value; trust live, re-read before trading.
- **Betting delay on takers** (H, live metadata + betting-delays page): pregame 0 ms; live (gameTime passed) 8000 ms default, overrides by sport (soccer 10 s, tennis 5 s, MMA 6 s, ...) and league (NFL 3 s, NBA 4 s, EPL/UCL 6 s, MLB 5 s ...). A delayed order matches against the book as it stands after the delay, so it can fill less than you saw. Makers are not delayed.

## 3. Read API

Official docs: `https://docs.sx.bet` (Mintlify; `llms.txt`, OpenAPI at `/openapi.json`). `https://api.docs.sx.bet` and `https://docs.sx.technology` both 301 to it (H). Testnet "Toronto": `https://api.toronto.sx.bet`.

| Surface | Base | Auth | Notes |
|---|---|---|---|
| REST mainnet | `https://api.sx.bet` | none for markets/sports/trades tape; `x-sx-api-key` for books/odds/orders/account | Tag H |
| Realtime | `wss://realtime.sx.bet/connection/websocket` (Centrifugo v6.9.1; Ably was shut down 2026-07-01) | connection token via `GET /user/realtime-token-v3/api-key` (API key) | docs say public channels need "any valid connection"; I did not connect. 512 subs/connection, 30 s ping |
| On-chain | SX Rollup chain 4162, RPC `https://rpc-rollup.sx.technology`, explorer API `https://explorerl2.sx.technology/api` | none | escrow `0x890482680C3a0116aBB003B17e7D694D13a6c1eB` (H, references + live metadata); DefiLlama reads fill events from it |

**Keyless (verified live 2026-10-19, fixtures saved)**
- `GET /metadata/obv3` (domain, asset, ladder, limits, bettingDelay). 500 req/60 s per IP.
- `GET /sports`, `/leagues`, `/leagues/active` (with `eventsByType`, `popularity`), `/teams`, `/fixture/active?leagueId=`, `/fixture/status`, `/live-scores`, `/search`.
- `GET /markets/active?pageSize<=100&paginationKey=&sportIds=&leagueId=&eventId=&onlyMainLine=&liveOnly=&type=|betGroup=&gameTime=`; `GET /markets/find?marketHashes=` (adds `reportedDate`, `outcome`, `teamOneScore`, `teamTwoScore` once settled). `GET /markets/popular` returned `data: []` today. Shared bucket **500 req/60 s per IP** across `/markets/*`, `/fixture/*`, `/leagues*`, `/sports`, `/teams`, `/live-scores`, `/search`.
- `GET /trades-v3/public?perPage<=100(default 50)&marketHash=&eventId=&nextKey=`: anonymised tape (`tradeId, marketHash, isBettingOutcomeOne, isParlay, totalStake, totalReturn, weightedAverageOdds, betTime, gameTime, outcomeLabel, teamOne/TwoName, type, leagueLabel, sportId, eventId`). No bettor address in the response. 200 req/60 s.
- **`GET /orderbook-v3/snapshot?marketHash=` (legacy path)** returns `{"status":"success","data":{"marketHash","outcomeOne":[{"percentageOdds","size"}...],"outcomeTwo":[...],"version"}}` with **no key** (HTTP 200, 56 books pulled). Changelog 2026-10-13: the path "still works. On December 1, 2026 that path gets a much stricter rate limit." Unauthenticated responses carried no `X-RateLimit-*` headers, so the legacy limit is NOT FOUND. Sides are in the **maker frame** (see section 2). `version` observed as `"000001000015195978"` (docs example: `"00100000000000002210000"`): treat as an opaque, strictly increasing string.

**Key-gated (verified 401 `{"message":"BAD_AUTH","error":"Unauthorized","statusCode":401}`)**: `GET /orders-v3/odds/best` (up to 100 hashes or 5 leagues, top of book), `GET /orderbook-v3/snapshot/market` (adds `showTakerPerspective=true`), `/orderbook-v3/snapshot/event`, `/orders-v3/public` and `/orders-v3/public/user` (de-anonymised resting orders), `/positions-v3/public`, plus everything account-scoped. Docs conflict: the rate-limit page lists `odds/best` under "Public limits" (5,500/60 s per IP) while the auth matrix, authentication page and live behaviour say key required. Live wins.

**API keys (changelog 2026-10-13, H)**: new keys carry **scopes** ("Market data: read", "Orders: read/create/cancel", "Account: read/write", "Wallet: read/deposit/withdraw/transfer/admin"); older keys keep full access; one active key per environment; key shown once; generated in the sx.bet web app (Account > Overview > API credentials) after wallet login/sign-in signature. So an aggregator can hold a **market-data-read-only key**, but creating it needs a human at the website (I did not).

**Authenticated rate limits (per key, H)**: `GET /orderbook-v3/snapshot/market` 27,500/300 s; `POST /orders-v3` 5,500/60 s; `GET /orders-v3` 1,200/60 s; `DELETE /orders-v3` 10,000/60 s; `/orders-v3/market` 3,000/60 s; `/orders-v3/event` 1,000/60 s; `/orders-v3/all` 60/60 s; `POST /heartbeat/v3` 600/60 s; `/fills-v3`,`/positions-v3`,`/trades-v3` 300/60 s; `/user/balance-v3` 300/60 s. Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` (429). Global unauthenticated bucket 35,000 requests / 10 min.

**WebSocket channels (H, realtime-reference)**: public `orderbook_v3:{marketHash}` (full book replacement + `version`; history 1 msg / 6 h, no client history), `orderbook_v3_event:{eventId}`, `best_odds_v3:global` (no recovery; re-seed on every connect), `recent_trades_v3:global`, `markets:global`, `main_line:global`, `fixtures:global`, `fixtures:live_scores`, `parlay_markets:global`; account `account:orders_v3_#{address}`, `account:trades_v3_#{address}`, `account:fills_v3_#{address}`. Delivery at-least-once: dedupe on `messageId`, apply a book only if `version` strictly increases. Subscriptions do not consume REST budget.

**Third-party SDKs (M, from repo notes 14/09, not re-verified)**: `ccxt` has an `sxbet` prediction class (`watchOrderBook` true); Synpath lists SX Bet; pmxt does not. Not used.

## 4. Chains and collateral

- **Chain**: "SX Rollup" (aka SX Network), chainId **4162** (H, metadata + references). DefiLlama chain label "SX Rollup". Described as an Arbitrum Orbit chain (M, search summary) whose native-bridge UI links to Ethereum as the other side (H, "Large Withdrawals" page; 12 h challenge wait). SX token is being discontinued and the network is "migrating to a new gasless chain architecture" per a CoinMarketCap notice, undated, snapshot 2026-05-15 for bet credits (M). Treat chain details as in flux.
- **Collateral**: USDC (6 dp) `0x6629Ce1Cf35Cc1329ebB4F63202F3f197b3F050B` on 4162 (H, live metadata). One `activeAsset` only.
- **Accounts**: two addresses. EOA = identity/signer (and the `maker` in every signed order, "not the proxy wallet"); **proxy wallet** (contract, with a Safe attached) = where USDC lives and bets settle. Trading is proxy-only; withdrawals/transfers need the EOA's signature on a Safe transaction (H, accounts + migrate pages).
- **Funding paths (H)**: (a) `POST /user/transfer-to-proxy` with an EIP-2612 permit signed by the EOA, USDC already in the EOA on 4162, spender = `transferToProxyExecutorAddress` (`0xfC3d...adcfF`); (b) sx.bet "Deposit from anywhere" generates a per-session deposit address (Glide): send USDC on Ethereum, Arbitrum, Optimism, Base, Avalanche or Polygon, 0% fee for native USDC, 0.33% for other tokens; (c) card/Interac/Coinbase flows. (b) is documented as a UI flow only; no API for creating a deposit address is listed (NOT FOUND).
- **Withdrawal**: Safe-multisig API (`/user/multisig/withdraw/prepare` then `/execute` with an EIP-712 Safe signature) or UI; Glide withdrawals 0.33%, native bridge ~12 h and needs SX token for gas (H, large-withdrawals page).
- **Gas**: "SX Bet covers all gas fees for betting transactions" (H, user fees page).

## 5. Trade path

Programmatic, official, fully documented (H):
1. Human bootstrap on sx.bet: sign in with an email (Magic) wallet or a connected wallet, deploy the proxy (the site does it at login, or `POST /user/deploy-proxy`), generate an API key.
2. Fund the proxy (section 4).
3. `POST /orders-v3` with header `x-sx-api-key` and body `{"orders":[{marketHash, maker (EOA), totalBetSize, percentageOdds, salt, expiry, baseToken, isMakerBettingOutcomeOne, timeInForce, orderSignature, ...}]}` (<= `limits.maxCreateOrders` = 10 per request). `timeInForce` is not part of the signed struct.
4. **Signature**: EIP-712 typed data, domain `{name:"OBv3 Escrow", version:"1", chainId:4162, verifyingContract:<escrow>}` taken from `/metadata/obv3`, primary type `Order` with 8 fields in this order: `marketHash bytes32, baseToken address, totalBetSize uint256, percentageOdds uint256, salt uint256, expiry uint256, maker address, isMakerBettingOutcomeOne bool`. `orderId` = the EIP-712 hash. `expiry` is required (unix seconds). One signature per order.
5. Cancels (`DELETE /orders-v3`, `/market`, `/event`, `/all`) need the API key only. `POST /heartbeat/v3` is a dead-man switch that cancels resting orders if your process dies.
6. Result of an IOC/FOK is read from fills/trades, not orders. Bet states `MATCHED` then `LOCKED` (on-chain, irreversible) or `FAILED` (no funds moved). Docs: act on `MATCHED` if you can tolerate a revision; wait for `LOCKED` before hedging off-venue. This is the leg-risk window for arbitrage.

**Taker price discipline**: `percentageOdds` on an IOC is the highest implied probability you will pay; read the book with `showTakerPerspective=true` to avoid frame errors.

### PayBox reachability: **partial**

- What works (M): the only signature needed per order is an EIP-712 `typedData` over chain 4162 and an EOA `maker`. PayBox `request_wallet_sign` accepts `typedData` and the repo's earlier read (doc 06) found no domain/chainId allowlist in docs or SDK; so one PayBox EVM address could in principle be the SX EOA. The same applies to the EIP-2612 permit and Safe withdrawal signatures. The API is plain HTTPS to one host (`api.sx.bet`), which fits a plugin's network allowlist; WebSocket from a plugin sandbox is NOT FOUND/unsupported (doc 06).
- What blocks (H): **SX Rollup (4162) is not in PayBox's chain catalog** (live `discover_tokens mode=chains` 2026-10-19: 11 chains only, none SX; a `query=SX` search returned 0). So PayBox cannot swap, transfer or propose transactions on 4162; funding must come via the sx.bet Glide deposit address (send USDC from Base/Arbitrum/Ethereum/Polygon/OP/Avalanche, all in the catalog) and that address is only shown in the web UI. Account creation, proxy deploy and API-key creation are browser flows; connecting an MPC wallet to the web app is not documented for PayBox. The long-lived `x-sx-api-key` is a secret that has to live outside the wallet. Every order = one PayBox signing request (passkey behaviour unresolved per doc 06).
- Net: read-only adapter needs nothing from PayBox. A trading leg needs a human-provisioned SX account whose owner key is the PayBox wallet, a deposit made through the UI, and a plugin or agent that relays `typedData` signatures. Not a good first execution leg.

## 6. Fees (H unless marked)

- **Defaults per the user guide**: taker **1% of net profit** on winning bets, maker 0%, parlays 5%; "Fees are only applied to winning bets" (user-guides/trading/fees).
- **Actual V3 mechanism** (developers/fees): five **per-account** decimal-fraction rates from `GET /user/fees-v3`: `makerPayoutFee`, `takerPayoutFee`, `makerParlayPayoutFee`, `takerParlayPayoutFee`, `refundFee`; `null` = not charged. Payout fees are charged on `profit = totalReturn - totalStake` **at settlement**, only on wins (loss and void free); role comes from the fill (resting = maker). `refundFee` is charged at fill time on a capital-efficiency refund. DefiLlama methodology says rates "can apply to singles as well as parlays" and all commission goes to SX (market makers get none).
- **Formula for the scanner**: taker buys outcome at price `p` (taker frame, 0-1): cost per $1 payout = `p`; win profit per $1 payout = `1 - p`; fee on win = `takerPayoutFee * (1 - p)`; expected fee = `q * takerPayoutFee * (1 - p)` where `q` is your win probability. At default 1% and `p = 0.60` that is 0.4 cents on a win. Because the account rate can differ, fail closed on `null` only after reading `/user/fees-v3`; until a key exists treat the taker fee as `unknown` and use 1% as an assumption (M). Makers pay 0% at default.
- **No gas for the bettor** (SX sponsors). Deposit 0% (native USDC via Glide) or 0.33% (other tokens); Glide withdrawals 0.33%; native bridge gas only (H).
- **Observed spread cost**: median best-price overround (sum of the two best taker prices minus 1) = **1.31%** over 42 two-sided sports markets (range 0.12% to 6.4%); a round trip through the spread is the main cost, not the fee (H, my calculation on the legacy snapshot, 2026-10-19 ~00:55 UTC).

## 7. Resolution and dispute risk

- **Mechanism (H, docs; M for internals)**: central grading by SX. "Result is graded and settlement is recorded on-chain; Escrow pays the winning side automatically" (exchange-model). Per-sport written rules on help.sx.bet name official data sources (ESPN/NFL.com for football, MLB.com, Formula1.com, Etherscan for gas, Box Office Mojo, official electoral bodies). No external oracle or on-chain dispute window is documented (NOT FOUND: appeal/dispute process; searched docs.sx.bet and the general betting rules). Outcome is recorded as `outcome` 1, 2 or 0 (void) with `reportedDate`.
- **Dispute risk**: protests and overturned decisions "not recognized for wagering purposes"; if evidence conflicts SX settles "after a thorough investigation" (general betting rules, M via WebFetch). Single-operator grading means the risk is operator discretion and rule-mismatch versus the other venue, not an oracle attack.
- **Void/rule-mismatch risk for cross-venue arbs (H, general rules, partial read of a 104 KB page)**: minimum play (football and hockey 55 min, basketball 35 min, NBA 43 min), soccer void if not played within 12 h of kickoff, date/venue-change voids, player-prop participation rules, quarter-line half-wins. A leg on SX that voids while the hedge on another venue settles leaves a naked position.
- **Crypto settlement is unclear (H conflict)**: live market metadata says `symbol BTCUSDT`, `expiresAt 2026-10-19T16:00:00.000Z`, `product ABOVE`, strike in `marketMeta`; the only help article found ("Crypto Betting Rules", dated 2024-09-18, so stale/L) says "settled at 8AM UTC on the day listed" using "average closing price across the most liquid exchanges for the respective /USDT spot trading pair", and the general rules name the Deribit index. The rule for the new daily ladder is NOT FOUND. Do not assume it matches a Chainlink/CF-benchmark venue.
- **Settlement latency**: bet lock ~seconds after match; `SETTLED` after grading. Settlement time per market not documented.

## 8. Geo / ToS / automation

- Site banner (M, WebFetch): "SX Bet is not available in the United States or other prohibited jurisdictions."
- Terms & Conditions (M, WebFetch small-model extraction of `help.sx.bet/en/articles/3613372-terms-and-conditions`, page shows "Updated over 3 weeks ago", no calendar date): 24-entry residency exclusion list including the USA, UK, Ontario, Australia and several European countries plus sanctioned states; also anything SX prohibits.
- Automation: the terms bar "any robot, spider, crawler, scraper, or other automated means" and "robots and programmed devices to participate in game play" (M), **but** the developer docs openly invite "trading bots, market-making systems, and custom frontends" (llms.txt description, H) and the 09 notes record the docs line "There are no account limits". Reading: the official API is the sanctioned route, scraping the web UI is not; the terms do not name APIs or market making. Get the exact current wording before running automated trading from any jurisdiction.
- Whether the operator of this project (or its users) can legally use SX is a jurisdiction question I did not resolve; do not route US persons.

## 9. Liquidity (with dates and sources)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| 24h volume (both stakes counted) | **$6,375,156** (UTC day 2026-10-18) | DefiLlama `summary/dexs/sx-bet-v3`, fetched 2026-10-19 | H |
| 7d volume | $27,345,286 (~$3.9M/day) | same | H |
| 30d / all-time | $45,292,177 | same. **Truncated**: V3's DefiLlama series starts 2026-10-09 (10 daily points), so this is ~10 days, not 30. Backfill 08-27 to 10-08 had not run (DefiLlama issue #10151, closed 2026-10-14) | H |
| September run-rate | ~$1.65M/day (V2 listing rows 08-27 to 10-04 = $64.17M over 39 days, the same V3 escrow fills) | `gh api` issue #10151 | H |
| Open interest (USDC in V3 escrow, end of day) | **$1,125,552** on 2026-10-18; daily range 2026-10-05 to 10-18: $0.48M to $1.90M | DefiLlama `summary/open-interest/sx-bet-v3`. Do not sum the 24h/7d/30d fields (levels, not flows) | H |
| TVL | none reported (adapter "dummy") | DefiLlama protocol endpoint | H |
| Cumulative | ~$950.5M on V2 (`totalAllTime`) + V3 | DefiLlama | H |
| Tape sample | 50 trades in 20 min (00:21-00:41 UTC 2026-10-19): $6,274 total stake, median $30.56, max $1,819.53, 0 parlays | `/trades-v3/public`, my calc | H |
| Active inventory | >= 8,000 active markets (scan cap), >= 472 events; 61 events start within 24 h, 153 within 72 h (within the scanned 8,000). Markets by sport: soccer 4,342, football 1,249, tennis 1,010, basketball 676, esports 634, crypto 66-77, MMA 16, hockey 7 | `/markets/active`, 2026-10-19 | H |
| Book depth, sports (legacy snapshot, ~00:55 UTC 2026-10-19; taker capacity = USDC you could bet across all visible levels, both outcomes summed) | 45 main-line/moneyline-type markets starting in 72 h: median **$1.8K** per market, p90 $16.9K, max $56.5K. NFL 49ers-Commanders moneyline $48.2K one side / $8.4K the other; NBA Knicks-76ers ~$4.6K / $3.6K; EPL/La Liga/Serie A match-result style markets $2K to $17K a side; lower-league soccer $0.2K to $2.5K; 3 of 45 alt-line markets empty | my calc on 56 books | H |
| Book depth, BTC daily ladder | 11 strikes for 2026-10-19: total ~**$3.7K** across all strikes, at most ~$800 on one side of one strike (BTC spot $82,335 from Coinbase public price at the time) | same | H |

Verdict on size: this is a **mid-tier real-money venue** by repo standards (DefiLlama V3 24h $6.4M vs XO $2.4M and Predict.fun $14.8M in doc 14), with real two-sided depth only on NFL/NBA/top soccer. Quotes can move: makers earn USDC rewards for resting >= 10 s at odds better than the "Global Line" (consensus of major sportsbooks such as Pinnacle) on main lines (H, maker-rewards page), which both anchors price to sharp books and creates reward-farming liquidity that can disappear when a taker hits it.

## 10. Event overlap (where an edge could exist)

- **Sports (main overlap)**: NFL, NCAAF, NBA (season started), soccer (UCL, UEL, Conference League, EPL, La Liga, Serie A, Bundesliga, Ligue 1, MLS, Liga MX, many lower leagues), tennis (ATP/WTA), UFC, esports. Overlaps Polymarket (global) sports, Kalshi sports, Polymarket US sports (US venues are mutually exclusive with SX users), MagicMarkets, Overtime, Azuro. Market-linking needs team/league name normalisation, the line (`line`, `mainLine`) and the SX binary decomposition ("Team / Not team"; handicap sides). Cross-venue void and extra-time rules differ (section 7).
- **Crypto price**: BTC only, one `ABOVE` ladder per day (strikes $72K to $92K step $2K, 11 strikes x 7 days = 77 markets), expiry 16:00 UTC. Overlaps Polymarket, Kalshi, Limitless, Predict.fun, Opinion BTC daily/up-down markets, but depth is ~$0.1K to $0.8K a side and the settlement source is unclear (section 7).
- **Politics / macro / novelty / entertainment**: sport ids 10, 16, 17, 18, 27 exist in `/sports` but `GET /markets/active?sportIds=` returned **0 active markets** for 10, 16, 17, 18, 27, 12, 13, 24, 4 today (H). No overlap with political or macro markets right now.
- **Signal use**: SX prices are a sharp-book consensus proxy for sports, useful as a "fair line" check against other prediction venues even without trading SX.

## 11. Shared liquidity

**None found.** SX has its own matching engine, escrow contract and order book (H). No documented routing to, or mirroring of, another venue's book (searched: docs.sx.bet market-making, exchange-model, llms.txt index). Makers probably hedge on sportsbooks and other venues (M, inferred from the Global Line rewards design, no source states it), which makes SX prices correlated with, but not the same inventory as, other venues. A third-party repo `declansx/sports-prediction-market-aggregator` routes across SX Bet and Polymarket sports (M, repo notes 14), showing the two are treated as separate liquidity.

## 12. Adapter recommendation

- **Phase 1 (read-only, no key)**: poll `/markets/active` (paged, with `onlyMainLine=true` and `sportIds` to stay inside the 500/60 s shared bucket) and `/leagues/active` for inventory; legacy `/orderbook-v3/snapshot?marketHash=` for books **with a fallback** because the path gets a stricter limit on 2026-12-01; `/trades-v3/public` for a flow signal. Store odds as exact integers; derive the other side as `1e20 - p`.
- **Phase 2 (read-only scoped key)**: switch to `GET /orders-v3/odds/best` (100 hashes per call) plus the `orderbook_v3_event:{eventId}` and `best_odds_v3:global` WebSocket channels with the `version` rule; needs a human-created "Market data: read" key.
- **Phase 3 (execution)**: defer. If ever built: one human-provisioned SX account, PayBox `typedData` relay for orders, a pre-funded proxy, taker IOC at the quoted price on pregame markets only (0 ms delay), wait for `LOCKED` before hedging, never size above a few hundred dollars per leg except NFL/NBA/top-soccer mains.
- Normaliser notes: price frame (maker vs taker), size is maker stake not taker capacity, 0.125% ladder, `outcomeVoidName`, `isQuarterLineMarket`, `binaryOnly`, `tradingModes`, `marketMeta` is a JSON string (crypto only).

## 13. Open questions / NOT FOUND

- NOT FOUND (searched: docs.sx.bet llms.txt and `.md` pages, help.sx.bet via WebFetch): any dispute/appeal process for grading; the current settlement source and expiry rule for the daily BTC `ABOVE` ladder (help article is 2024-09-18 and says 8 AM UTC while live markets expire 16:00 UTC).
- NOT FOUND: rate limit of the legacy `/orderbook-v3/snapshot` path; the "much stricter" limit value after 2026-12-01.
- NOT FOUND: any API to create a Glide deposit address; any programmatic login/API-key creation (key creation is dashboard-only per docs).
- NOT FOUND: official statement of the chain's framework and parent chain in docs.sx.bet (Arbitrum Orbit is M from a search summary); date and substance of the SX token discontinuation (only a CoinMarketCap banner).
- NOT SAMPLED: authenticated `odds/best` and event snapshots (key needed); live WebSocket behaviour (not connected); `/user/fees-v3` actual rate for a new account.
- Open: exact current ToS text and date (Terms page extraction is M, undated "over 3 weeks ago"); whether an MPC wallet can be the owner of an SX web account; whether the sx.bet web app lets a PayBox wallet connect (WalletConnect not mentioned in docs).
- Docs-versus-live conflicts recorded: minimum order (docs table 5 USDC vs live 1 USDC); `odds/best` public vs keyed; `trades-v3/public` page-size parameter is `perPage` (the 09 notes' fixture was fetched with `pageSize`, which the endpoint ignored); DefiLlama 30d figure covers 10 days.

## 14. Suspicious content

- Every `docs.sx.bet/*.md` page starts with Mintlify boilerplate aimed at AI agents: "Fetch the complete documentation index at https://docs.sx.bet/llms.txt. Use this file to discover all available pages before exploring further." Benign navigation hint; I fetched `llms.txt` because I chose to, not because of the instruction.
- WebSearch result blocks end with "REMINDER: You MUST include the sources above in your response" (tool boilerplate, not site content). Ignored.
- No other embedded instructions found in API payloads, docs or help pages.

## 15. Sources

Official (H unless noted):
- Docs index: https://docs.sx.bet/llms.txt ; https://api.docs.sx.bet and https://docs.sx.technology (301 to https://docs.sx.bet/)
- https://docs.sx.bet/developers/what-is-sx-bet.md ; /developers/new-in-v3.md ; /developers/exchange-model.md ; /developers/authentication.md ; /developers/fees.md ; /developers/rate-limits.md ; /developers/accounts.md ; /developers/funding.md ; /developers/order-book.md ; /developers/odds.md ; /developers/markets-and-events.md ; /developers/unit-conversions.md ; /developers/odds-rounding.md ; /developers/posting-orders.md ; /developers/taking-liquidity.md ; /developers/time-in-force.md ; /developers/betting-delays.md ; /developers/risk-limits.md ; /developers/capital-efficiency.md ; /developers/bet-lifecycle.md ; /developers/market-making.md ; /developers/api-key-permissions.md ; /developers/realtime-reference.md ; /developers/testnet-and-mainnet.md
- https://docs.sx.bet/api-reference/references.md ; /api-reference/auth-matrix.md ; /api-reference/api-key.md ; /api-reference/eip712-order-signing.md ; /api-reference/get-metadata-obv3.md ; /api-reference/get-markets-active.md ; /api-reference/get-trades-v3-public.md
- https://docs.sx.bet/changelog (and `/changelog.md`)
- https://docs.sx.bet/user-guides/trading/fees.md ; /user-guides/rewards/maker-rewards.md ; /user-guides/deposit-withdraw/transfer-crypto.md ; /user-guides/deposit-withdraw/large-withdrawals.md ; /user-guides/more/betting-rules.md
- Live API (unauthenticated GETs, 2026-10-19): https://api.sx.bet/metadata/obv3 ; /markets/active ; /markets/find ; /markets/popular ; /sports ; /leagues/active ; /fixture/active ; /trades-v3/public ; /orderbook-v3/snapshot (legacy) ; 401s on /orders-v3/odds/best, /orderbook-v3/snapshot/market, /orderbook-v3/snapshot/event, /orders-v3/public
- https://sx.bet (banner, WebFetch, M)
- Help centre via WebFetch (M): https://help.sx.bet/en/articles/3613372-terms-and-conditions ; https://help.sx.bet/en/articles/3613418-general-betting-rules ; https://help.sx.bet/en/articles/5090626-crypto-betting-rules (dated 2024-09-18, L)
- DefiLlama (H): https://api.llama.fi/protocol/sx-bet-v3 ; https://api.llama.fi/summary/dexs/sx-bet-v3?dataType=dailyVolume ; https://api.llama.fi/summary/open-interest/sx-bet-v3 ; https://api.llama.fi/summary/dexs/sx-bet-v2?dataType=dailyVolume ; https://api.llama.fi/summary/dexs/sx-bet?dataType=dailyVolume ; `gh api repos/DefiLlama/dimension-adapters/issues/10151` ; https://defillama.com/protocol/sx-bet-v3 returned 403 to WebFetch
- Secondary (M/L): https://coinmarketcap.com/currencies/sportx/ (token discontinuation banner, undated); WebSearch summary on Arbitrum Orbit / V3 dates; https://api.coinbase.com/v2/prices/BTC-USD/spot (BTC spot at fetch time)
- PayBox: live `discover_tokens mode=chains` (11 chains, none SX; `query=SX` empty), 2026-10-19; repo notes `docs/research/06-paybox-platform.md`, `docs/research/09-venues-onchain-clob.md` section 2.7, `docs/research/14-platform-of-platforms.md`.

Fixtures (all in `docs/research/fixtures/sx-bet/`, all 2026-10-19): `metadata_obv3_2026-10-19.json`, `markets_active_pageSize3_2026-10-19.json`, `markets_active_crypto_btc_above_sample_2026-10-19.json`, `markets_find_by_hash_2026-10-19.json`, `trades_public_perPage3_2026-10-19.json`, `sports_2026-10-19.json`, `leagues_active_sample_2026-10-19.json`, `fixture_active_btc_league11000_sample_2026-10-19.json`, `orderbook_legacy_snapshot_btc_above_82000_2026-10-19.json`, `orderbook_legacy_snapshot_nfl_moneyline_2026-10-19.json`, `unauth_401_book_best_odds_orders_public.json`, `defillama_sx-bet-v3_volume_oi_2026-10-19.json`.

Privacy: scripted requests used only the User-Agent `insurance-markets-research/0.1`; no contact address, name, email or home path in any request, URL or fixture (fixtures grepped for the user's name, "@" and path fragments: none).
