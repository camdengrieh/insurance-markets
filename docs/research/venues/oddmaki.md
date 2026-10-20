# OddMaki - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock 04:28-04:35 UTC). READ-ONLY: WebFetch page reads, `gh api` file reads, unauthenticated GETs to documented hosts (Graph Studio, npm registry, GitHub API, DefiLlama, Basescan pages). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages and repo text were treated as untrusted data; nothing in them was followed (none contained instructions aimed at agents). WebSearch was unavailable (session budget used up), so no independent press or social coverage was checked.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale. Note: WebFetch returns a small-model summary of the page, so figures read that way are tagged H only when they were repeated across two independent fetches or match source code.

Fixtures (<= 50 KB): `docs/research/fixtures/oddmaki/` (section 13). They are primary-source files, not live API responses (see section 4 for why).

---

## 0. Bottom line

1. **Live as software, effectively dormant as a market.** The Base mainnet Diamond exists and still receives transactions (last seen 2026-10-12), but its USDC balance is **13.57 USDC** and the 25 most recent transactions (2026-09-16 to 2026-10-12) all come from **one** sender doing Create Market / Place Order / Match Orders. That looks like a team or test wallet, not organic trading (H, Basescan, 2026-10-19; section 1, 10).
2. **Technically the cleanest integration target in the batch**: fully on-chain CLOB on Base, plain contract calls (no off-chain signed orders, no relayer), USDC collateral, Gnosis CTF ERC-1155 outcome tokens, MIT-licensed TypeScript SDK, public GraphQL subgraph. A PayBox EVM wallet could trade it with ordinary one-call transaction proposals on Base (section 5, 6).
3. **Not independent of anything, but nothing to arbitrage against**: it has its own CTF deployment and its own books (no shared liquidity with Polymarket or any venue), but there is effectively no liquidity to take or make (section 10, 11).
4. **No push or REST read API**: the only off-chain read path is a GraphQL subgraph (POST only; Studio endpoint is rate-limited and "for development"; production needs a Graph API key) plus on-chain view calls. No websocket (section 4).
5. **Dev activity stalled**: last commits 2026-06-03 (core, SDK) and 2026-06-10 (subgraph, venue starter); last blog post 2026-05-21; npm SDK last published 2026-06-03 (H, section 1).
6. **adapter_priority = skip** (watch-list). Revisit only if the subgraph shows real volume or an independent venue with traffic appears (trigger in section 12).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Site | oddmaki.com loads; "permissionless onchain engine for prediction markets"; footer 2026; blog posts dated 2026-05-15, -18, -21 (https://oddmaki.com, /blog, fetched 2026-10-19). No newer posts. | H |
| Mainnet contract | Basescan labels `0x025d...127d` "OddMaki: Protocol Proxy"; **6,401 transactions** total; contract created ~171 days before 2026-10-19 (~2026-04-30; matches core commit "deploy base mainnet" 2026-05-01). | H (two fetches agree) |
| Most recent activity | Latest tx **2026-10-12 08:24:55 UTC, Create Market**; before that Place Order 2026-10-01, Place Market Buy 2026-09-30, Match Orders 2026-09-30, 4 order txs 2026-09-29, then ~16 Create Market txs 2026-09-16..18. | H |
| Who | All 25 listed txs: same `from` (`0xB60143bc...27BE9B033` as abbreviated on the page), value 0 ETH, gas $0.00-ish. | H (page) / M (interpretation as team or test wallet) |
| Repos | `oddmaki-core` last push 2026-06-03 (DPM pool mode, v1.6.0 deployed to Base); `oddmaki-sdk` 2026-06-03; `oddmaki-subgraph` 2026-06-10; `oddmaki-venue-starter` 2026-06-10; `oddmaki-matching-keeper` 2026-05-29. Nothing after 2026-06-10 (about 4 months, flag as possibly stale). | H (`gh api`) |
| npm | `@oddmaki-protocol/sdk` latest 1.19.1 published 2026-06-03, MIT. | H (registry.npmjs.org) |
| Demo | Venue Starter demo runs on **Base Sepolia**, not mainnet (https://base-sepolia.demo.oddmaki.com/). | H |
| DefiLlama | Not listed (searched `api.llama.fi/protocols`, 8,758 entries, name/slug contains "oddmaki"/"maki": only unrelated Makina, MakiSwap). | H |

Verdict: `still_live = true` (contracts callable, owner still deploying; a transaction 7 days ago), but treat as **pre-traction**.

---

## 2. Kind and market model

- **Kind (H, https://oddmaki.com/docs, github.com/oddmaki/oddmaki-core README):** "Permissionless prediction market factory with a fully on-chain Central Limit Order Book", "Shopify for prediction markets". One EIP-2535 Diamond (21 facets in the 2026-05 post; v1.6.0 manifest lists ~27 contract entries incl. DPM facets) holds all **venues**; a venue is an on-chain config (operator, fee schedule, access gates, UMA params). Anyone creates a venue in one tx; operators then fork the **Venue Starter** front end (MIT).
- **Order book (H, docs /trading/orderbook, core source `LimitOrdersFacet.sol`):** each market has separate YES and NO books, each with BUY and SELL sides. Price = integer tick; `price = tick * tickSize / 1e18`; tickSize chosen at market creation (docs example 1% tick -> ticks 1..99 = $0.01..$0.99). Price-time priority. Order types: limit (GTC or expiry), FOK, FAK (market orders). Limit orders lock collateral (BUY) or outcome tokens (SELL). Matching is **permissionless**: anyone calls `matchOrders(marketId, maxSteps)` and earns a 10 bps operator fee.
- **Three settlement paths (H, docs /trading/matching-settlement):** Normal Fill (executes at the ask), Mint-to-Fill (two crossing buy orders on YES and NO summing >= 1.0 plus fees: protocol splits collateral), Merge-to-Fill (two sells summing <= 1.0 minus fees: protocol merges). So YES+NO complementarity is enforced on-chain; `getImpliedTopOfBook` exposes implied bid/ask from the opposite book (H, `OrderBookFacet.sol`).
- **Market types (H, docs /markets/market-types):**
  - Binary YES/NO, resolved by UMA OOv3.
  - **Market groups** = categorical: 2..50 mutually exclusive binary markets, NegRisk-style cascade (one YES resolves siblings NO; NO->YES position conversion). Placeholder slots allowed.
  - **Price markets**: binary Up/Down or explicit-strike markets resolved by Pyth with no dispute path. Schema comments show series keys like `btc-updown-5m` (H, subgraph schema); docs say "no 5 minute floor, no 24 hour ceiling".
  - **DPM pool markets (new, v1.6.0 deployed 2026-06-03)**: Pennock "Dynamic Pari-Mutuel" pool, NOT the CLOB. `placeOrder` reverts for DPM markets (H, core source `requireNotDpmMarket`). Price formula `p_i(n) = (M_i/N_other)*exp(n/N_other)`; payout = refund of price paid + pro-rata share of the losers' pool (H, core `docs/dpm-pricing-math.md`). Not a clean arbitrage leg (price moves with your own flow, payoff depends on final pool).
  - Scalar markets: NOT FOUND (searched docs /markets/market-types, /markets/creating-markets; outcomes for binary must be exactly `['Yes','No']`).
- **Tokenisation (H, docs /positions/outcome-tokens):** Gnosis Conditional Tokens ERC-1155, YES = index 0 (indexSet 1), NO = index 1 (indexSet 2); `positionId` derived from `conditionId` and collateral token; group markets use a wrapped-collateral layer so their position ids differ from standalone markets. Outcome-token decimals: not stated in docs (NOT FOUND; USDC examples use 6 decimals).
- **Docs/code drift (H):** docs describe market orders with `collateralAmount` + `maxPriceTick`; core `MarketOrdersFacet.sol` (2026-05-29/06-03) exposes `placeMarketBuy(marketId, outcomeId, budget, slippageBps, ...)` / `placeMarketSell(...)`. Use the ABI from the SDK, not the prose docs.

---

## 3. Chains and collateral

| Chain | Contract | Status | Tag |
|---|---|---|---|
| **Base mainnet (8453)** | Diamond `0x025d086a62d93e24f3cb3f161612ca8e9530127d`; self-deployed Gnosis CTF `0x3e2ae408ca03f27849edff32d107c7b8ea5c87b4`; UMA OOv3 `0x2aBf1Bd76655de80eDb3086114315Eec75AF500c`; Pyth `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a` | Live (section 1) | H (docs /ecosystem/contracts, core `deployments/base/latest.json` v1.6.0 2026-06-03, `docs/MAINNET_DEPLOYMENT.md`) |
| Base Sepolia (84532) | Diamond `0x31a4126aec35b36d46dd371eb0f0d5b71e1c2292` | Testnet and demo | H |
| Arbitrum | "named as the next chain" in the 2026-05-15 blog post. `deployments/` has only `base` and `base-sepolia`. No deployment found. | Not live | H (absence) |

- **Collateral:** native **USDC on Base** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals (H). FAQ: other UMA-whitelisted ERC-20s can be chosen per market at creation (H, FAQ; `ProtocolFacet.setCollateralWhitelisted`). Basescan shows USDC as the Diamond's only token holding (H).
- The Diamond is its own vault: `VaultFacet.getVault()` returns `address(this)` (H, source). Mint-to-fill moves collateral into the CTF contract.

---

## 4. Read API

**There is no OddMaki-operated REST or websocket API.** (H: docs /docs intro says "no backend to run"; the front end reads Base RPC + subgraph + Pyth Hermes.) Read paths:

1. **Subgraph (GraphQL, The Graph)**
   - Docs: https://oddmaki.com/docs/ecosystem/subgraph ; schema and sample queries: github.com/oddmaki/oddmaki-subgraph (`schema.graphql`, `QUERIES.md`, MIT).
   - Studio endpoint (dev): `https://api.studio.thegraph.com/query/1716020/oddmaki-base/version/latest` (H; docs and SDK `config.ts`). Subgraph id (Base) `CxoYVjELrNCMLopAmVshnfVAie7yH6QZyCSKD3r41XSQ`; production gateway format `https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<id>` (H, SDK `buildSubgraphGatewayUrl`). Gateway needs your own Graph API key (key creation is an account action, not done).
   - Probe result (unauthenticated GET, H): the Studio URL answers `302` -> `/graphql` and serves the GraphiQL HTML page; queries are executed via POST only (a GET with `?query=` and `Accept: application/json` still returned GraphiQL). Response headers `x-ratelimit-limit: 3000`, `x-ratelimit-reset` about 24 h ahead, so the Studio limit looks like **3000 requests per day** (M, inferred from headers; docs only say "rate-limited, suitable for development").
   - **Live response shapes were NOT captured**: GraphQL needs POST, which the ground rules forbid. Shapes below come from the schema source (H) instead.
   - Entities (H, `schema.graphql`): `Venue` (venueFeeBps, creatorFeeBps, totalVolume, activeMarkets, tradingAccessControl, paused ...), `Market` (question, outcomes, tickSize, protocolFeeBps snapshot, lastPriceTick_0/1, status Draft|Active|Resolved|Invalid, resolvedOutcome, tags, isPriceMarket, isDpmMarket, groupId, totalVolume), `MarketGroup`, `MarketGroupItem`, `PriceMarket` / `PriceMarketSerie`, `DpmMarket` / `DpmOutcome` / `DpmPosition` / `DpmEntry`, `Order` (side, outcome, tick, amount, filled, status Active|Filled|PartiallyFilled|Cancelled|Expired), `Trade`, `Fill` (with fees, tradeType OrderFill|MintFill|MergeFill|MarketOrder), `TopOfBook` (topTick per market/outcome/side; **best price only, not depth**), `TraderPosition`, `FeeEvent`, `Question` / `Assertion` (UMA lifecycle).
   - Order-book depth from the subgraph: query `orders(where:{status:Active})` per market (QUERIES.md pattern).
2. **On-chain views (Base RPC, eth_call)** on the Diamond (H, `OrderBookFacet.sol`): `getTopOfBook(marketId, outcomeId, side)`, `getTickLevel(marketId, outcomeId, side, tick)`, `getMarkPrice`, `getImpliedTopOfBook`, `canMatchOrders(marketId)`; `LimitOrdersFacet.getOrder(orderId)`; `ProtocolFacet.getProtocolFeeBps()`. These are authoritative; venue-starter FAQ says UI uses on-chain state to override subgraph lag.
3. **TypeScript SDK** `@oddmaki-protocol/sdk` (MIT, viem peer dep): `client.public.getMarkets / getMarketsWithPricing / getMarket / getTopOfBook / getOrders / getTradeHistory / getRecentTrades / getPositions / getUnifiedMarketFeed / getTraderPositions / getLeaderboard`, `client.trade.getOrderBook / getTickLevel / getOrder`, `client.priceMarket.get / fetchPythLatestUpdate`. Python and Rust SDKs "in progress" (homepage); none found in the org (5 public repos: core, sdk, subgraph, venue-starter, matching-keeper).
4. **Websocket / streaming**: NOT FOUND (searched docs index, SDK README/module list, subgraph README). Use `eth_subscribe` logs on Base or poll the subgraph.
5. **Rate limits / auth**: Studio ~3000/day/IP (M, see above); gateway = per-API-key plan (NOT FOUND numeric limits; docs link to Graph key setup only). RPC limits are the RPC provider's.

---

## 5. Trade path

- **Everything is a normal EVM transaction from the trader's address** (H, source): no EIP-712 order signatures, no relayer, no off-chain matching. `msg.sender` is the maker/taker.
- Calls on the Diamond (H, `LimitOrdersFacet`, `MarketOrdersFacet`, `BatchOrdersFacet`, `MatchingFacet`, `VaultFacet`):
  - `placeOrder(marketId, outcomeId, side, tick, qty, expiry)`; `cancelOrder(orderId)`
  - `placeMarketBuy(marketId, outcomeId, budget, slippageBps, ...)`, `placeMarketSell(marketId, outcomeId, tokenAmount, slippageBps, ...)` (FOK/FAK)
  - `batchPlaceOrders` (<= 20, one market), `batchCancelOrders` (<= 100), `cancelAndReplace`
  - `matchOrders(marketId, maxSteps)` (anyone), `splitPosition`, `mergePositions`
  - Resolution: `assertMarketOutcome`, `settleAssertion`, `reportResolution`; redemption of winning tokens from the CTF (`redeemPositions`) / docs call it `redeemWinnings()`.
- **Approvals (H, docs /ecosystem/sdk):** BUY and split need `USDC.approve(diamond, amount)`; SELL and merge need `CTF.setApprovalForAll(diamond, true)` (CTF = `0x3e2a...87b4`).
- **Access gates (H, docs /venues/access-control):** per-venue and per-market trading gate: Open (default), Whitelist, NFT, ERC-20 balance, or Custom `isAllowed(address)`. A bot may be refused without notice on gated venues; check `canTradeOnMarket` first.
- **Order latency/cost:** one tx per action, Base block time; gas about $0.00001-0.00004 per tx in the Basescan sample (H, section 1). Resting orders cost gas to place and cancel and are visible on-chain (front-runnable; no sequencer).
- Fee-aware sizing helper exists in SDK (`src/utils/feeAwarePricing.ts`, not read in detail).

---

## 6. PayBox reachability

**paybox_reachable = yes (technically), via one-call EVM transaction proposals on Base.**
- Base (eip155:8453) is in PayBox's chain catalog (live `discover_tokens` result recorded in `docs/research/06-paybox-platform.md`, 2026-10-19, H there). `io.paybox/transactionProposal` EVM kind = one `{to, value, data}` call per proposal; the PayBox EOA pays gas in ETH on Base (same doc).
- Required proposals per trade: (1) `USDC.approve(Diamond, amount)` once, (2) `CTF.setApprovalForAll(Diamond, true)` once if selling, (3) `placeOrder` or `placeMarketBuy`, later `cancelOrder` / redeem. Each is a separate user-approved proposal; PayBox shows raw calldata only (no decoded summary), so the plugin must build calldata from the SDK ABIs and show its own human summary.
- No signed-order path exists, so none of the typedData / Kernel machinery used for XO is needed.
- Practical limits: no atomic approve+order (one call per proposal); a market-making loop would need one approval per order unless the wallet grant is `autonomous`; gas funding of ETH on Base is required.
- I did not call any PayBox tool; this is inferred from the local PayBox notes and the contract source (M overall).

---

## 7. Fees

All taker-only; makers pay nothing; resting orders keep the fee snapshot taken at placement (H, docs /venues/fees, FAQ).

| Layer | Range / value | Paid to | Tag |
|---|---|---|---|
| Protocol fee | 0-200 bps, owner-settable (`setProtocolFeeBps`), **snapshotted per market at creation**; currently **50 bps** (SDK default constant; 2026-05-15 blog says "currently 50 bps") | protocol treasury | H docs; M that on-chain value is still 50 (not read via RPC) |
| Venue fee | 1-200 bps, set by venue operator | venue fee recipient | H |
| Creator fee | 0..venue fee, a **sub-split of the venue fee** (not additive) | market creator | H |
| Match operator fee | fixed 10 bps | `msg.sender` of `matchOrders` | H |
| Market creation fee | per venue, default 0, split 50/50 protocol/venue | one-off at creation | H |
| Resolution costs | asserter posts UMA bond (>= venue `umaMinBond`); resolver of Pyth markets pays the Pyth update fee | n/a | H |

Formula (docs): `taker total bps = protocolFeeBps + venueFeeBps + operatorFeeBps`, applied to the fill's dollar notional (docs example: $50 buy, 50+100+10 = 160 bps = $0.80). For Mint-to-Fill / Merge-to-Fill the fee is carved from the surplus/shortfall, not from a leg. So a taker pays **at least 61 bps (50+1+10) and up to 260 bps**, not the flat 50 bps in the discovery hint. Note the fee is a flat % of notional (not Polymarket-style p*(1-p)), so it is relatively heavier near 1c and 99c. Subgraph `Fill.fees` and `FeeEvent` give the realised split.

---

## 8. Resolution and dispute risk

- **UMA Optimistic Oracle V3** for binary and group markets (H, docs /markets/resolution; OOv3 `0x2aBf...F500c`, address from UMA's Base deployment list per core deployment doc). Anyone can assert (posts bond in USDC), liveness window, anyone can dispute (directly on the UMA oracle), disputes go to the UMA DVM (FAQ: "typically 48-96 hours"). Only one active assertion at a time; a rejected assertion clears the lock. Anyone must call `settleAssertion` and `reportResolution`; no auto-settle.
- **Parameters are venue-controlled and weak by default**: liveness set per market, floor 7200 s (2 h); `umaMinBond` per venue, docs recommend only **1-100 USDC** (SDK constants suggest 750 USDC to match Polymarket); reward recommended 1-10 USDC; no hard maximums (H). Small bonds make wrong assertions cheap, so for a thin venue the real security is "someone is watching", which is unproven here.
- **No admin override** for UMA markets (docs); but the **Diamond owner can upgrade facets via `diamondCut`, set oracle/CTF/treasury, change protocol fee and suspend venues** (docs /ecosystem/protocol). Owner identity (multisig vs EOA) is not documented on the site; the deployment guide says a Safe multisig is intended to own it (M; owner not read on-chain). `ProtocolFacet` rescue and moderation functions were removed 2026-05-23 (H, commit log).
- **Invalid outcome** = payout [1,1] (both tokens redeem 50%) (H). Price markets: Pyth only, no dispute path; if Hermes has no in-range VAA, `resolvePyth` reverts and after `closeTime + 7 days` anyone may `markInvalid` (50/50 refund) (H). Resolution window default 60 s, max 300 s.
- **Question quality**: the market creator writes the title/description (UMA reads it); no curation layer by default (H). Cross-venue arbitrage versus Polymarket/Kalshi therefore carries **definition-mismatch risk** on top of normal oracle risk.
- **Smart-contract risk**: BUSL-1.1 code (converts to MIT 2030-01-01), 423 Foundry tests claimed (README), April 2026 commits fix audit-labelled findings (C-02, C-03, C-05, H-01..H-06) but no published audit report or auditor name found: NOT FOUND (searched: docs /ecosystem/protocol, ToS 4.1, core README, SECURITY.md). Young (deployed ~2026-04/05), upgradeable.

---

## 9. Geo, ToS, automation

- Operator of the website/dApp: **Predictable Reality, Inc.** (Delaware); it states it publishes open-source software and "does not operate the Protocol", and is not a Venue Operator (H, https://oddmaki.com/terms, 1.1-1.3).
- Eligibility: 18+; users must not be located in or resident of comprehensively sanctioned jurisdictions (Cuba, Iran, North Korea, Syria, Crimea, Donetsk, Luhansk) or be on sanctions lists (3.4); the company "may restrict access by jurisdiction or person" (3.5). No technical geo-block described (H, page text). Compliance/KYC for a venue is "the operator's responsibility" (FAQ). US status of individual venues: NOT FOUND.
- Automation: ToS section 5 bans "bots, scrapers" except via documented APIs within published rate limits; open-source components are governed by their own licenses (8.1). The contracts are permissionless, and the SDK and a reference matching keeper are published for bots, so direct on-chain bot trading is the intended use (M: ToS binds the website/Services; on-chain use is not mentioned either way). Scraping the dApp front end would be the risky route; use RPC/subgraph.
- Licenses: core BUSL-1.1 (Copyright Predictable Reality, converts MIT 2030-01-01); SDK, subgraph, venue-starter, keeper MIT (H, `gh api`). Do not vendor core source; ABIs/addresses through the MIT SDK are fine.
- No ToS-level rule found on arbitrage or market making. Per-venue rules (whitelists, token gates) may apply.

---

## 10. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| USDC held by the Diamond (resting buy orders + DPM pools; the vault is the Diamond itself) | **13.571488 USDC** | Basescan address page and token-balance page, 2026-10-19 (two fetches) | H |
| USDC held by the CTF (collateral behind minted YES/NO pairs) | **0.15 USDC** | Basescan `0x3e2a...87b4`, 2026-10-19 | H |
| CTF contract tx count | 3 (only `setApprovalForAll`, 2026-08-25, 09-01, 09-29) | same | H |
| Diamond tx count | 6,401 lifetime; last 25 txs spanning 2026-09-16..2026-10-12, all one sender | same | H |
| Volume / OI / venue count / market count | **NOT FOUND**. The subgraph (`Venue.totalVolume`, `activeMarkets`) would answer it, but needs POST (not done); homepage and blog give no stats ("The post gives no OddMaki trading volume, user counts, or market counts"). | oddmaki.com, 2026-10-19 | H (absence) |
| DefiLlama TVL/volume | not listed | api.llama.fi, 2026-10-19 | H |

Reading: total on-chain collateral across the protocol is **about $14** (Diamond + CTF), so any displayed price on mainnet is backed by almost nothing. Even if the lifetime volume were larger (the 6,401 txs include market-creation bots and testing), there is no depth to trade. Caveat: balances are a point-in-time stock, taken from Basescan pages via a page-summariser; an RPC `balanceOf` read would confirm (not done to respect the no-POST rule).

---

## 11. Overlap and shared liquidity

- **Categories (M):** capability-wise, (a) Pyth **crypto price Up/Down and strike markets** (BTC/USD example; series like `btc-updown-5m` appear in schema comments) overlap Polymarket, Limitless and Kalshi crypto contracts; (b) UMA-resolved binary/categorical markets can be about anything (sports, politics, macro) because creation is permissionless. I found **no evidence of any specific live mainnet market** in these categories (the market list is only in the subgraph). Schema examples such as "Where will Giannis be traded?" are code comments, not live markets.
- **Shared liquidity (H):** none with another venue. OddMaki deploys its own Gnosis CTF on Base (`MAINNET_DEPLOYMENT.md`: "None canonical on Base mainnet ... Deploy your own"; Basescan: CTF created by the same deployer as the Diamond). Each market has its own YES/NO books; venues share contracts and the "rails" (blog) but not order books. Different venues listing the same real-world question are **separate books** and thus technically independent legs (and potential intra-OddMaki arbitrage), but with ~zero depth.
- **Not an independent signal either**: prices on a book that is only touched by one wallet carry no information; use as signal source is not recommended.

---

## 12. Adapter priority

**skip** (watch-list). Reasons: no real liquidity (about $14 on-chain, one active wallet), no push API, development quiet since June, uncurated resolution with weak default bonds, and the Pyth up/down markets that would overlap other venues are not shown to exist on mainnet.

Revisit trigger (cheap): one read-only GraphQL query to the subgraph (needs permission to POST, or an API key) for `venues{venueId name totalVolume activeMarkets}` and `_meta{block{timestamp}}`. If any venue shows > about $50k/week volume or a venue with whitelist-free trading and tags `crypto`/`sports`/`politics` appears, build a read-only adapter (subgraph + `getTopOfBook`), then a PayBox trade adapter using proposals in section 6. Adapter sketch if ever built: poll `markets(where:{status:Active})` + `orders(where:{status:Active})` per market, normalise tick -> price (`tick*tickSize/1e18`), treat YES and NO books as one complementary book (use `getImpliedTopOfBook`), subtract taker fee `protocolFeeBps + venueFeeBps + 10` using the market's snapshotted `protocolFeeBps` and venue config, ignore DPM markets for arbitrage.

---

## 13. Fixtures and open questions

Fixtures in `docs/research/fixtures/oddmaki/`:
- `core_deployments_base_latest.json` (2.4 KB): core repo `deployments/base/latest.json`, v1.6.0, 2026-06-03 (facet addresses, CTF, USDC, UMA). Core is BUSL-1.1; the manifest only lists public addresses.
- `subgraph_schema.graphql` (24.7 KB): `oddmaki-subgraph/schema.graphql` (MIT), main branch as of 2026-10-19.
- No live API response saved: GraphQL requires POST; the only GETs were GraphiQL HTML (not saved).

Open questions:
1. Real volume, venue and market counts (subgraph POST needed).
2. Current on-chain protocol fee and Diamond owner (`getProtocolFeeBps`, `owner()` via RPC eth_call, which is a POST to the RPC).
3. Whether the lone active wallet is the team's (likely, M) and whether any third-party venue exists on mainnet.
4. Whether an audit report exists (commit messages reference audit finding ids).
5. Outcome-token decimals and exact `placeMarketBuy` argument list (read the SDK ABI `MarketOrdersFacet.json`).

---

## 14. Sources

- https://oddmaki.com (home, 2026-10-19), /docs, /docs/ecosystem/{contracts,subgraph,sdk,protocol}, /docs/trading/{orderbook,matching-settlement}, /docs/venues/{fees,oracle-settings,access-control}, /docs/markets/{market-types,creating-markets,price-markets,resolution}, /docs/positions/outcome-tokens, /docs/resources/faq, /terms, /blog, /blog/how-oddmaki-works (2026-05-15). All H as page content (read through WebFetch summaries).
- https://app.oddmaki.com/ (client-rendered shell, only a tagline; no stats).
- https://github.com/oddmaki/oddmaki-core (README, `deployments/base/latest.json`, `docs/MAINNET_DEPLOYMENT.md`, `docs/dpm-pricing-math.md`, `docs/dpm-markets-plan.md`, `src/facets/*.sol`, commit log), https://github.com/oddmaki/oddmaki-sdk (README, `src/config.ts`, `src/constants.ts`, `src/subgraph/client.ts`), https://github.com/oddmaki/oddmaki-subgraph (`schema.graphql`, `QUERIES.md`), https://github.com/oddmaki/oddmaki-venue-starter (README), https://github.com/oddmaki/oddmaki-matching-keeper (README). Read via `gh api` raw. H.
- https://registry.npmjs.org/@oddmaki-protocol%2Fsdk (publish timeline). H.
- https://api.studio.thegraph.com/query/1716020/oddmaki-base/version/latest (GET only: redirect, GraphiQL page, rate-limit headers). H.
- https://basescan.org/address/0x025d086a62d93e24f3cb3f161612ca8e9530127d ; https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913?a=0x025d086a62d93e24f3cb3f161612ca8e9530127d ; https://basescan.org/address/0x3e2ae408ca03f27849edff32d107c7b8ea5c87b4 (2026-10-19; read through a page summariser, key figures repeated across fetches). H/M.
- https://api.llama.fi/protocols (name search, no OddMaki entry). H.
- Blocked or not used: Blockscout `base.blockscout.com` API returned a Cloudflare challenge (not bypassed); Basescan `/txs` returned 403; Routescan does not serve Base (`chain not supported`); WebSearch budget exhausted (no independent coverage checked).
- Local context: `docs/research/06-paybox-platform.md` (PayBox chain catalog and proposal contract).
