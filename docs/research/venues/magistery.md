# Magistery - venue spec (2026-10-19)

Verdict: adapter_priority P2. Technically clean and fully on-chain, but no evidence of any volume, users, audit or frontend, and public repo/npm activity stops in late March 2026. Treat as an unverified, probably near-empty venue until one subgraph query shows otherwise.

Tags: H = read first-hand this session in a primary source, M = secondary or inferred, L = weak or stale.

## Liveness
- Homepage and docs 200 and describe the protocol as deployed on Polygon mainnet, copyright 2026. (H, https://www.magistery.org)
- Contracts deployed 2026-03-13. (H, https://www.magistery.org/docs/protocol/deployments)
- npm `@magistery/sdk`: created 2026-03-15, latest 0.1.4 published 2026-03-23, no release since (about 7 months). (H, https://registry.npmjs.org/@magistery/sdk)
- GitHub org `0xMagistery` (a User account, created 2026-03-14, 2 public repos, 0 followers): sdk last push 2026-03-29, bot last push 2026-03-30 ("Update Railway template URL"). Nothing newer. (H, gh api users/0xMagistery and repos/.../commits)
- Contracts are immutable, so "live" at the contract level cannot be switched off, but no market count, volume, trader count or TVL is published anywhere. (H, ecosystem-roadmap page: "reports no market count, trading volume, liquidity, or user numbers")
- Could NOT verify on-chain activity: subgraph and RPC reads need POST (forbidden by ground rules); the GET subgraph URL only returns the GraphiQL HTML page; Blockscout API is behind a Cloudflare challenge; web search budget was exhausted. So "still_live" is true only in the sense that the site and contracts exist (M).

## Kind and market model
- Permissionless on-chain CLOB prediction market protocol, no company, no token, no admin keys. (H, homepage)
- Binary markets: `MarketFactory.createMarket(question, outcomeSlotCount, deadline, resolver)`; SDK example uses 2 outcomes (YES/NO). (H, /docs/protocol/architecture, /docs/sdk/getting-started)
- Categorical via `NegRiskAdapter.createMultiOutcomeMarket(question, labels, deadline, resolver)`: one independent binary YES/NO market per label, one shared resolver, each leg resolved separately; `isResolved(marketId)` true when all legs resolved. No `resolveMultiOutcome`. (H, architecture) Note: this is not the Polymarket neg-risk conversion mechanism as far as the docs say; no convert function was described (M).
- Scalar: NOT FOUND (searched: architecture, contract-reference, homepage).
- Outcome tokens: ERC-1155 positions in the Gnosis Conditional Tokens Framework at 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045 on Polygon (the same CTF Polymarket uses). The factory is the CTF oracle for every condition. `conditionId = CTF.getConditionId(factory, questionId, outcomeSlotCount)`. (H, architecture)
- Order book: fully on-chain limit orders. `placeBuyOrder` escrows USDC, `placeSellOrder` escrows outcome tokens (needs CTF `setApprovalForAll` to OrderBook). Matching is permissionless: anyone submits `fillBuyVsBuy(buyId0, buyId1, fillAmount)` (two BUYs on opposite outcomes, USDC split into outcome tokens via CTF, i.e. "mint") or `fillBuyVsSell(buyId, sellId, fillAmount)`. No signed off-chain orders, no matching engine operated by the protocol; matching is done by keepers/frontends. (H, architecture + contract-reference)
- Units: PRICE_SCALE 1e6 ($1 = 1_000_000), buy price 1..999999, amounts are 6-decimal shares, buy cost = price*amount/1e6, MAX_AMOUNT 1e18, MIN_ORDER_COST 1e4 (0.01 USDC). (H, contract-reference; constants match in SDK constants.ts, H)
- Markets keep trading until on-chain resolution, not until deadline; stale quotes can be picked off after deadline. After resolution anyone can `cancelExpiredOrder`. (H, security page)

## Chains and collateral
- Polygon mainnet (chain id 137 per SDK constants) only. (H)
- Collateral: native USDC on Polygon, 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359. No fallback collateral; Circle blacklist/pause risk acknowledged. (H)
- Core contracts (all H, deployments page, verified on Polygonscan per site): MarketFactory 0xf93d869af1a19c5e946c0766b52914996b1e3835, OrderBook 0x896b8247f8eb9cfdb5de4db3e0579a834a7cbd15, Treasury 0x4f3a167f5a97592479bf56866440c318191006b4, NegRiskAdapter 0xd65a9cb91a0bf7d919ec9078c2ca586f180ff064, UMAResolver 0x802Bf2742dE2C8C30F570faB00b941322414804A, KalshiResolver 0x624BbE00204f0f78263abAb48cACAAd134E5dBAf, PolymarketResolver 0x4A2e70cBc1105310310bA921CB6E4821fcD44A0d, OperatorResolverFactory 0x395a50AA907664d12147b03Aa96ad3022A322b6A. UMA OOv3 0x5953f2538F613E05bAED8A5AeFa8e6622467AD3D.

## Read API
- No official REST/WebSocket API. NOT FOUND (searched: homepage, /docs nav, architecture, SDK page, ecosystem-roadmap).
- Official data layer = The Graph Studio subgraph "magistery" v3.0.0: `https://api.studio.thegraph.com/query/1744387/magistery/v3.0.0` (GraphQL, POST; described as "rate-limited"; Studio endpoints are dev-grade and not meant for production load, M). (H, /docs/protocol/subgraph)
- Subgraph entities (H, subgraph docs): Market (id=conditionId, question, creator, resolver, deadline, status Active/Pending/Resolved/Voided, volumeUsd, uniqueTraders, linked), MarketOutcome (outcomeIndex, positionId, lastPrice, bestBid, bestAsk, totalBidLiquidity, totalAskLiquidity in shares), OrderBookLevel (side, price, totalAmount, orderCount), Order (side, price, amount, filled, cancelled), Match (fillType, price, volume, fee), TradeExecution, UserOutcomePosition, UserMarketSummary, MarketHourData / MarketDayData (OHLC, volumeUsd, tradeCount). Query: `markets(first:10, orderBy: volumeUsd, orderDirection: desc, where:{status:"Active"})`; `marketSearch(text:)`.
- Pagination limit and indexing latency: NOT FOUND.
- On-chain fallback: OrderBook has no "orders for market" getter; book is rebuilt from `OrderPlaced`/`OrderFilled`/`OrderCancelled` events (side 0 = BUY, 1 = SELL). View functions: `MarketFactory.isTrading/isResolvable/marketResolver/marketOutcomeSlotCount/marketResolved`; SDK `getMarket`, `getOrder(orderId)`, `getPosition`. (H, building-a-frontend, contract-reference, SDK client.ts method list)
- Market metadata is only the `question` string plus deadline plus resolver (MarketCreated event). No category, tags, images, or description fields found. (M: from MarketCreated event fields)
- Auth: none for subgraph or RPC. Websocket: none official (could use RPC log subscriptions, M).
- Docs: https://www.magistery.org/docs ; SDK: https://www.npmjs.com/package/@magistery/sdk (viem-based, 0.1.4).
- Fixtures: none saved. Subgraph and JSON-RPC both require POST; GET to the subgraph returns GraphiQL HTML (tested with and without Accept: application/json). Shapes above are from docs only.

## Trade path
- Direct EVM transactions to the OrderBook, no off-chain signing or API keys: `approve(USDC -> OrderBook)`, `placeBuyOrder(conditionId, outcomeIndex, price, amount)`, `placeBuyOrders(...)` (batch), `placeSellOrder(...)` (after CTF `setApprovalForAll`), `cancelOrder`, `cancelOrders`, plus permissionless `fillBuyVsBuy` / `fillBuyVsSell`. Redeem via CTF. (H, contract-reference; SDK client.ts)
- Taking liquidity means calling a fill function between two resting orders; there is no "market order vs book" call in the listed ABI. A taker who wants to cross an existing sell places a buy at/above the ask and then needs a fill call matching the two (the taker can submit that fill themselves). (M, inferred from ABI)
- SDK (`@magistery/sdk`) wraps viem; private-key wallet client; CLI needs `POLYGON_RPC_URL` and `MAGISTERY_PRIVATE_KEY`. Do not use the CLI with a PayBox wallet; build calldata instead. (H)

## PayBox reachability
- paybox_reachable: yes in principle (partial in practice). Polygon USDC + plain contract calls with no off-chain signature is the easiest possible shape for transaction proposals: ERC-20 approve, CTF setApprovalForAll, OrderBook calls. Any PayBox EVM wallet funded on Polygon could do it if PayBox supports Polygon and arbitrary-contract proposals (not verified here; check with docs/research/06-paybox-platform.md). Non-Polygon wallets (Base, BNB, Arbitrum, Solana) would need a bridge/swap to Polygon USDC first. (M)
- Atomic cross-venue use with Polymarket (same chain, same CTF, same USDC) is plausible, M.

## Fees
- 0.1% (FEE_BPS 10 / 10000) on every fill, ceiling division, paid to Treasury (`Treasury.calculateFee`); in `fillBuyVsSell` the fee is deducted from the buyer's USDC before it reaches the seller (so buyer pays). Fee side in `fillBuyVsBuy` NOT FOUND in docs (SDK has `estimateFillBuyVsBuy` returning fee and surplus). Treasury sends to an immutable recipient (a Safe). No maker rebate; no gas abstraction, so users pay Polygon gas for placing, cancelling, and filling. Third-party platforms can add their own fee on top (e.g. the Telegram bot). (H)
- Resolution bond for UMA path: 750 USDC (BOND_AMOUNT in SDK constants, H), paid by the asserter, not traders.

## Resolution mechanism and dispute risk
- Resolver is chosen per market at creation and immutable. Options (H, architecture + homepage): UMAResolver (UMA OOv3 ASSERT_TRUTH2, bond >= 750 USDC, 2-hour liveness, disputes go to UMA voters); KalshiResolver (same UMA flow, market linked to a Kalshi ticker via `linkMarket`); PolymarketResolver (permissionless `resolve(conditionId)` reads CTF `payoutNumerators`/`payoutDenominator` of the linked Polymarket condition, no liveness); OperatorResolver (creator-deployed, EIP-712 signed outcome messages).
- Anyone can create a market with any resolver, including one rigged by the creator; the docs recommend whitelisting the three official resolvers. Unlinked Kalshi/Polymarket markets are tradable but cannot resolve until `forceVoid` (>= 90 days past deadline when no pending resolution; 180 days unconditional); void pays both outcomes equally. Wrong resolutions after liveness are final. (H, security page)
- 2-hour liveness is very short compared with Polymarket's UMA flow, so manipulation/dispute risk is higher (M, comparison).
- Arbitrage consequence: a Polymarket-mirror market resolves identically to the linked Polymarket condition (good for a hedge, but then it is a resolution-dependent copy, not an independent source of truth).

## Geo / ToS / automation
- No terms of service, geo restrictions or bot policy found on the site (privacy page, security page, homepage). (H, NOT FOUND for ToS; searched /privacy, /docs/protocol/security, homepage.) Protocol is permissionless contracts; no frontend with KYC or geoblocking exists in the docs. Automation is explicitly intended (keepers, SDK, CLI, Telegram bot). The Telegram bot's own operators may impose terms (not read).
- No audit ("None yet", self-described; 655 tests). No bug bounty mentioned. (H)

## Liquidity
- NOT FOUND. No volume, OI or TVL published; site and docs give only hypothetical examples ("$500k monthly volume" is an illustration). (H, homepage, ecosystem-roadmap)
- Only shipped front end is a self-hostable Telegram bot (open source, last commit 2026-03-30). Polymarket-clone frontend, keeper bot, Discord bot, embeddable widget listed as "not yet built" with no dates (H, ecosystem-roadmap; that page may be stale, last known state March 2026). No keeper bot means matching depends on whoever runs one; resting orders may never get matched (M).
- Suggested one-time check (needs POST, outside this task's rules): subgraph `markets(first:5, orderBy: volumeUsd, orderDirection: desc){id question volumeUsd uniqueTraders status}`.

## Event overlap and independence
- The bot "mirrors Polymarket markets on-chain via Magistery protocol" and PolymarketResolver/KalshiResolver exist to resolve copies of Polymarket and Kalshi events, so any liquid market here is likely a copy of a Polymarket/Kalshi event (politics, sports, crypto price, macro). That is exactly where arbitrage vs Polymarket/Kalshi would be, but also means the useful markets are priced off those venues. (H for the design and bot description; M for what actually trades)
- Liquidity sharing: separate OrderBook contract, separate escrow; it does not route into Polymarket's CLOB. It shares only the CTF contract and USDC token. So liquidity is independent, but the venue is probably thin. (M)

## Adapter notes (if built)
- Discovery: subgraph `markets(where:{status:"Active"})` with MarketOutcome bestBid/bestAsk; depth from OrderBookLevel; linkage to Polymarket/Kalshi via `linked` + resolver address + `getPolymarketCondition(conditionId)` / `getKalshiTicker(conditionId)` (SDK read functions, H) - this gives a free cross-venue link key.
- Normalise price: price/1e6 per outcome; YES/NO are two separate outcome books (outcomeIndex 0/1) plus the BuyVsBuy mint path, so a combined YES+NO bid > 1 is directly crossable.
- Filter by trusted resolver address allowlist.
- Cost model: 0.1% + Polygon gas per placement/cancel/fill.

## Open questions
- Is there any real volume? (subgraph volumeUsd)
- Does PayBox support Polygon + arbitrary contract proposals?
- Does a keeper exist that actually matches orders?
- NegRisk conversion semantics (not described).
- Fee side for `fillBuyVsBuy`.

## Suspicious content
- None found. No embedded instructions in fetched pages. (WebFetch returns summarised content, so hidden text could have been dropped; M.)

## Sources
- https://www.magistery.org (homepage, H)
- https://www.magistery.org/docs/protocol/architecture (H)
- https://www.magistery.org/docs/protocol/deployments (H)
- https://www.magistery.org/docs/protocol/contract-reference (H)
- https://www.magistery.org/docs/protocol/security (H)
- https://www.magistery.org/docs/protocol/subgraph (H)
- https://www.magistery.org/docs/sdk/getting-started (H)
- https://www.magistery.org/docs/guides/building-a-frontend (H)
- https://www.magistery.org/docs/guides/ecosystem-roadmap (H)
- https://www.magistery.org/privacy (H, no ToS content)
- https://registry.npmjs.org/@magistery/sdk (H, publish dates)
- https://github.com/0xMagistery (sdk: src/client.ts, src/constants.ts; bot: README.md) via gh api (H)
- https://api.studio.thegraph.com/query/1744387/magistery/v3.0.0 (GET returned GraphiQL HTML only; no data)
- Not obtained: web search results (session search budget exhausted), Polygonscan/Blockscout (Cloudflare challenge), any independent coverage of the project.
