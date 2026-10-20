# OddMaki Protocol - adapter spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

**Verdict: adapter_priority P2.** Technically clean (fully on-chain CLOB on Base, USDC collateral, Gnosis CTF tokens, a GraphQL subgraph), but there are no published usage figures, no market list was readable, and liquidity is probably fragmented across independent white-label venues. Treat it as a supply source to re-check, not a first-wave leg.

## 1. Liveness

- Site, docs and app respond in Oct 2026 (HTTP 200 for app.oddmaki.com; docs pages fetched) [H]. https://www.oddmaki.com/ , https://www.oddmaki.com/docs
- Home page says live on Base mainnet; Base Sepolia demo also exists [H].
- GitHub repos not archived. Last pushes: oddmaki-core 2026-06-03, oddmaki-sdk 2026-06-03, oddmaki-subgraph 2026-06-10, oddmaki-venue-starter 2026-06-10 [H, gh api]. Nothing in 4+ months; possibly stale development cadence [M].
- Blog posts dated 2026-05-15, 05-18, 05-21 only [H]. Launch looks like May 2026; a DefiLlama Pro dashboard from May 2026 reportedly calls it a newer entrant [L, search snippet only].
- Actual on-chain activity (trades, open orders) NOT verified. Blockscout was behind a Cloudflare challenge; the subgraph needs POST (not allowed). So "contracts deployed" is documented, "markets being traded" is not.

## 2. Kind and market model

- Kind: on-chain protocol, permissionless "venue factory" (operators launch branded venues on shared contracts), one EIP-2535 Diamond with 21 facets [H, docs/ecosystem/protocol].
- Market types [H, docs home + docs/markets]:
  - Binary: YES/NO, resolved by UMA.
  - Market Group: 2 to 50 mutually exclusive outcomes, each a binary market, UMA resolved with a NegRisk-style cascade (one resolves YES, siblings resolve NO in the same tx).
  - Price Market: YES/NO, resolved by Pyth against a strike or a captured open price.
  - No scalar markets documented.
- Order book: fully on-chain CLOB. Each market has a YES book and a NO book, each with BUY and SELL. Price = tick x tickSize / 1e18; docs example uses 1% tick (prices 0.01 to 0.99) [H, docs/trading/orderbook]. Tick size is a per-market field (subgraph `Market.tickSize`) [H].
- Matching: anyone calls `matchOrders(marketId, maxSteps)`; price-time priority; settlement paths Normal Fill, Mint-to-Fill (two crossing buys split collateral), Merge-to-Fill (two crossing sells merge) [H]. So matching is not automatic: it needs a keeper, and the keeper earns the 10 bps operator fee. A resting cross can exist until someone calls it [M, inferred]; relevant for reading "top of book" as executable.
- Order types: limit (GTC or with expiry), FOK, FAK; market orders take a collateral amount and max price tick [H].
- Subgraph schema (not in the docs) also contains DPM (Dynamic Pari-Mutuel, Pennock 2004) markets: `isDpmMarket`, `DpmMarket`, `DpmOutcome`, categorical N outcomes, pool prices move with flow, no outcome tokens [H, oddmaki-subgraph schema.graphql, saved as fixture]. Not described in public docs; an adapter must skip or separately model `isDpmMarket = true` markets (AMM-like, not CLOB).
- Tokenisation: Gnosis Conditional Tokens (ERC-1155). Binary: YES = index 0 (index set 1), NO = index 1 (index set 2); position IDs stored in `MarketTradingData.positionIds[2]`; groups use a wrapped (NegRisk) collateral layer so position IDs differ from standalone [H, docs/positions/outcome-tokens].

## 3. Chains and collateral

- Base mainnet (8453) and Base Sepolia (84532) only [H, docs/ecosystem/contracts].
- Base mainnet addresses [H]: OddMaki Diamond `0x025d086a62d93e24f3cb3f161612ca8e9530127d`; Gnosis ConditionalTokens `0x3e2ae408ca03f27849edff32d107c7b8ea5c87b4`; USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; UMA OOv3 `0x2aBf1Bd76655de80eDb3086114315Eec75AF500c`. The Diamond and CTF addresses also appear in oddmaki-subgraph `networks.json` [H]. (A Bitget page listed a different truncated address; ignore, third-party [L].)
- Collateral: USDC (6 decimals) in all docs examples; the contracts page does not label it explicitly, and the subgraph has a per-market `collateralToken` plus `collateralDecimals` (mentions "18 for ETH") so other collateral tokens may exist per market [H]. Adapter must read `collateralToken` per market, not assume USDC.
- Pyth address not listed in docs; readable via `ProtocolFacet` [H].

## 4. Read API

- Exists: `onchain-or-subgraph-only`. No REST/WebSocket API from OddMaki. Official data surface is The Graph subgraph plus direct RPC reads [H].
- Docs: https://www.oddmaki.com/docs/ecosystem/subgraph ; query cookbook https://github.com/oddmaki/oddmaki-subgraph (QUERIES.md); schema saved at `docs/research/fixtures/oddmaki-protocol/subgraph-schema.graphql`.
- Endpoints [H]:
  - Base mainnet Studio: `https://api.studio.thegraph.com/query/1716020/oddmaki-base/version/latest` (docs call it "rate-limited, fine for development").
  - Base mainnet gateway subgraph ID: `CxoYVjELrNCMLopAmVshnfVAie7yH6QZyCSKD3r41XSQ` (production use needs your own The Graph API key; no OddMaki key needed).
  - Base Sepolia Studio: `https://api.studio.thegraph.com/query/1716020/oddmaki-base-sepolia/version/latest`.
- A plain GET to the Studio URL returns 302 to `.../graphql` (playground HTML). GraphQL queries are POST, which this research did not send. So no real response sample exists; shapes below come from the schema and QUERIES.md only [H for schema, none for live data].
- Key entities/queries [H]: `venues`, `markets` (status, question, outcomes, tickSize, collateralToken, lastPriceTick_0/1, totalVolume, uniqueTraders, tags, isPriceMarket, isDpmMarket, resolvedOutcome), `orders(where:{status:Active})` (side, outcome, tick, amount, filled), `TopOfBook` entity, `Trade`, `Fill`, `TraderPosition`, `FeeEvent`, `Question`/`Assertion` (UMA lifecycle), `Protocol(id:"1")` (totalVenues, totalMarkets, totalVolume, totalFees, totalUsers), `VenueDailySnapshot`, `MarketDailySnapshot`.
- SDK: `@oddmaki-protocol/sdk` (viem peer dependency) with `client.public.getMarkets/getMarketsWithPricing/getTopOfBook/getOrders/getTradeHistory/getRecentTrades/getPositions` (subgraph-backed) and `client.trade.getOrderBook/getOrder/getTickLevel` (RPC reads) [H, docs/ecosystem/sdk]. Python and Rust SDKs "in progress" [H, home page].
- Auth/limits: none for Studio endpoint beyond throttling (numbers not published); gateway needs the integrator's own API key [H]. WebSocket: NOT FOUND (searched: docs home, subgraph page, SDK page, FAQ). Realtime would need RPC log subscriptions on `OrderPlaced`/fill events (event names not verified) or subgraph polling [M].
- Freshness: subgraph lags chain; polling interval and order-book depth truth should be reconciled with `getOrderBook` on RPC before acting [M].
- Indexer caveat: venues are many; market discovery must enumerate all venues, each with own fee schedule and access policy.

## 5. Trade path

- Programmatic: yes, but purely on-chain transactions, no off-chain signed orders and no relayer/gasless path found [H, docs/trading/orderbook says "does not mention off-chain signed orders"; docs/ecosystem/sdk lists no relayer]. SDK: `placeOrder/placeOrderSimple`, `placeMarketOrder*`, `cancelOrder`, `batchPlaceOrders` (up to 20, same market), `batchCancelOrders` (up to 100), `cancelAndReplace`, `splitPosition`, `mergePositions`, `matchOrders` [H].
- Auth/signing: ordinary EVM transactions signed by the trader EOA via viem. No API key, no EIP-712 order scheme.
- Approvals needed [H]: USDC `approve` to the Diamond for buys, splits, creation fee, UMA bond; CTF `setApprovalForAll` to the Diamond for sells and merges.
- Every order costs Base gas and a confirmed block (~2s blocks, M); Base gas is "fractions of a cent" per the FAQ [H, venue-creation context]. Cancel/replace is atomic, so market making is feasible but latency is block-bound.
- Orders escrow collateral on placement (BUY: USDC, SELL: outcome tokens) [H/M].

## 6. PayBox reachability

- `paybox_reachable = yes` in principle: Base is an EVM chain and every action is a plain contract call (approve, setApprovalForAll, placeOrder, cancel, match, redeem). The project plan records that `io.paybox/transactionProposal` covers on-chain EVM calls [H, docs/plan.md line 124 in this repo]. No EIP-712 sign-then-submit flow is needed, which removes the main Phase 0 uncertainty seen on off-chain-order venues.
- Not verified this session (PayBox tools deliberately not called): whether the user's PayBox grant supports Base and arbitrary calldata to a non-allowlisted contract, whether the wallet holds Base ETH for gas, and whether approvals need separate proposals (two to three tx before first trade). Per-order proposals will be slow versus a CLOB with off-chain signing.

## 7. Fees

All fees are taker-only; makers pay nothing [H, docs/venues/fees].

| Layer | Rate | Set by | Paid to |
|---|---|---|---|
| Protocol | 0 to 200 bps | protocol owner | treasury |
| Venue | 1 to 200 bps | venue operator | venue recipient |
| Creator | 0 to venue fee (carved out of venue fee, not additive) | venue operator | market creator |
| Match operator | 10 bps fixed | fixed | address that submits `matchOrders` |

- Taker total = protocol + venue + operator bps; example 50 + 100 + 10 = 160 bps. Formula implied as amount x bps / 10,000; docs do not state it explicitly; rounding remainder goes to protocol [H/M].
- Discrepancy: home page says protocol fee is "a fixed 50 bps"; fee docs say 0 to 200 bps owner-set [H both]. The scanner must read each market's snapshotted `protocolFeeBps` (subgraph `Market.protocolFeeBps`) and the venue fee, not hardcode.
- Fee schedule is snapshotted at market creation; later changes affect only new markets [H].
- Separate market creation fee, split 50/50 protocol and venue [H].
- Resolver pays Pyth update fee (wei-scale) [H]. UMA asserter posts a USDC bond [H].
- Gas on top (Base, small).
- Edge note: total taker cost of roughly 1.6% (typical) plus gas is large relative to cross-venue arb margins on a binary; fee variation per venue means net edge must be computed per market.

## 8. Resolution and dispute risk

- UMA (binary/groups) [H, docs/markets/resolution, docs/venues/oracle-settings]: anyone asserts via `assertMarketOutcome` with a USDC bond; liveness set per market at creation, minimum 2 hours (7200 s) and lower values silently floored; anyone may dispute on UMA OOv3, escalating to UMA DVM; settle is manual (`settleAssertion`), no auto-settlement. Invalid outcome pays `[1,1]` (50/50). A market with no assertion stays active indefinitely. No admin override or emergency resolution.
- Bond and reward are venue settings (recommended 1 to 100 USDC bond, 1 to 10 USDC reward); no default stated [H]. Low bonds on small venues weaken dispute economics: a cheap false assertion is a real risk (M, inference).
- Pyth (price markets): anyone calls `resolvePyth` after close; no bond or dispute; explicit strike (YES if final price >= strike) or deferred open price captured from Hermes VAA; if no VAA in range, after closeTime + 7 days anyone can `markInvalid` (50/50) [H]. Price-market semantics (>= vs > and price source/time) differ from Polymarket/Kalshi crypto contracts; do not treat as the same contract for arbitrage without comparing terms.
- Question wording is written by arbitrary market creators; settlement-rule mismatch against other venues is the main arbitrage risk [M].
- Admin: Diamond owner can `diamondCut` (upgrade facets), set fee and oracle addresses, suspend venues; venue operators can pause their venue/markets; "no global pause" [H, docs/ecosystem/protocol]. No audit mentioned in docs, FAQ, or core SECURITY.md (NOT FOUND, searched: docs/ecosystem/protocol, docs FAQ, oddmaki-core SECURITY.md). Upgradeable contracts with unaudited code on a young protocol is a material custody risk [M].

## 9. Geo, ToS, automation

- Terms are published by "Predictable Reality" (developer of the open-source software); it states it is not a venue operator and does not custody funds or resolve outcomes [H, https://www.oddmaki.com/terms].
- Sanctioned countries/territories excluded; OddMaki "may restrict access ... at its sole discretion" [H]. US persons are not named as excluded in Terms; compliance and jurisdiction gating are the individual venue operator's responsibility, and venues can gate trading by whitelist, NFT, token balance or custom contract [H, FAQ + home page].
- Automation: Terms bar bots/scrapers "other than through documented APIs"; the subgraph and SDK are documented, and the FAQ explicitly endorses running matching bots and quoting bots with batch operations [H]. Rate limits of the Studio endpoint unpublished; use own gateway key for production.
- Per-venue access policies may block an arbitrary wallet from trading or listing: adapter must check each market's/venue's access control before quoting [H].

## 10. Liquidity

- NOT FOUND (searched: oddmaki.com home/docs/blog/FAQ, app.oddmaki.com (SPA, returns tagline only), DefiLlama /protocols API (no OddMaki or Predictable Reality entry as of 2026-10-19), Blockscout (Cloudflare challenge), subgraph (POST needed)). Home page itself publishes no usage figures, and the blog states none.
- First step for a future pass: POST `{protocol(id:"1"){totalVenues totalMarkets totalVolume totalFees totalUsers}}` and `markets(orderBy:totalVolume,first:20)` to the Studio endpoint, plus USDC balance of the Diamond on Base (TVL proxy).
- GitHub stars (4, 0, 0, 3 on the four repos) suggest tiny community attention [H as a count, M as a signal].

## 11. Event overlap and arbitrage relevance

- Category set is operator-defined (open-ended). No default catalogue found; markets carry `tags`. Which categories actually have liquidity is unknown.
- Pyth price markets are the most likely overlap with other venues (crypto up/down and strike markets: Polymarket, Kalshi, Limitless etc.), but with different resolution rules (see section 8) and likely thin books.
- Sports/politics/macro overlap would depend on which venue operators exist; unknown.

## 12. Liquidity sharing and independence

- Independent of every other venue on the covered list: own on-chain books, own collateral custody in the Diamond. It reuses Gnosis CTF and UMA (the same primitives Polymarket uses) but shares no order books with them [H for architecture, M for conclusion].
- Whether books are isolated per venue, or the same event can be listed on several venues with separate books, is not stated [NOT FOUND, searched: docs/ecosystem/protocol, docs/trading/orderbook, FAQ]. Markets appear to belong to exactly one venue (`Market.venue`), so there is no shared liquidity across OddMaki venues for the same market, but several venues may list near-duplicate questions, creating intra-protocol arb.

## 13. Adapter notes (if built)

- Discovery: subgraph `markets(where:{status:Active})` with `venue`, `tickSize`, `collateralToken`, `isDpmMarket`, `isPriceMarket`; skip DPM; check `groupId` for NegRisk groups.
- Price: tick x tickSize / 1e18 per outcome token; YES and NO books are separate (arbitrage within market: buy YES at ask + NO at ask < 1 minus fees, which Mint-to-Fill does natively).
- Execution cost: ~1.6% taker plus gas; approvals first; keeper dependency for matching; wait for finality.
- Resolution tracking via `Question`/`Assertion` entities and `status`.

## Untrusted-content log

- No prompt-injection style instructions seen in site, docs or subgraph content. Repos contain CLAUDE.md files (not read, not followed).

## Sources

- https://www.oddmaki.com/ (home) [H]
- https://www.oddmaki.com/docs and subpages: /docs/ecosystem/contracts, /docs/ecosystem/subgraph, /docs/ecosystem/sdk, /docs/ecosystem/protocol, /docs/venues/fees, /docs/venues/oracle-settings, /docs/trading/orderbook, /docs/markets/resolution, /docs/positions/outcome-tokens, /docs/resources/faq [H]
- https://www.oddmaki.com/terms, https://www.oddmaki.com/blog [H]
- https://app.oddmaki.com/ (tagline only) [H]
- https://github.com/oddmaki/oddmaki-subgraph (schema.graphql, QUERIES.md, networks.json), https://github.com/oddmaki/oddmaki-core (SECURITY.md, repo metadata), oddmaki-sdk, oddmaki-venue-starter repo metadata [H]
- Web search snippets (dev.to, DefiLlama Pro, Bitget) [L]
- Local: docs/plan.md in this repo (PayBox transaction proposal capability) [H for what it says, unverified live]
- Fixtures: docs/research/fixtures/oddmaki-protocol/subgraph-schema.graphql (schema from GitHub, not a live response)
