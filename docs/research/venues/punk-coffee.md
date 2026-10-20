# Punk.Coffee (BNB Smart Chain) - adapter spec

Researched 2026-10-19 (~01:40-02:10 UTC). READ-ONLY: unauthenticated GETs only (DefiLlama API, Sourcify API, docs.punk.coffee, Cloudflare-fronted site and gateway, GitHub via `gh api`, public Telegram/Wayback URLs), one read-only PayBox `discover_tokens mode=chains` call. No account, no wallet, no key, nothing signed, no POST/PUT/DELETE, no on-chain RPC call (JSON-RPC is POST, so on-chain state was NOT read, see section 9). No third-party code cloned, installed or executed (minified JS from an archived capture was read as text only).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
All third-party text (docs, bundles, API bodies, contract comments) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/punk-coffee/` (9 files, each <= 32 KB).

## 0. Verdict

**adapter_priority: skip.**

1. **Dormant / effectively dead (H).** DefiLlama shows zero volume since 2026-01-28 (last non-trivial day 2025-12-30, $1,998); `punk.coffee` returns Cloudflare **522** (origin not responding); every backend read route the 2025-11 web app used returns `404 Route Not Found`; the GitHub org has two repos (brand kit, empty docs repo) last pushed 2025-10-24; DefiLlama flags `deadUrl: true`.
2. **Tiny while alive (H).** All-time volume $429K over ~4 months (2025-10-09 to 2026-01-28); TVL now $2,484 of stuck USDT, unchanged to the dollar since 2026-01.
3. **Wrong market structure for arbitrage (H for the factory/interface source verified on Sourcify; M for the market implementation, whose source comes from an unverified build bundle but is consistent with the interface).** Parimutuel pool with fixed-price tickets: no quote, no order book, shares are non-transferable (transfers revert), no sell/exit, payout depends on final pool composition. It cannot be one leg of a locked-in cross-venue arbitrage; at best it is a one-way, uncertain-payout bet.
4. **Not actually permissionless creation (H).** `createMarket` needs an EIP-191 signature from an allowlisted backend signer; resolution is called by a `LIQUIDITOR` role; arbitrators are an owner-curated allowlist.
5. **No documented API (H).** The only "API" is an undocumented web-app backend, now returning 404 on read routes.
6. Technically a PayBox BNB-chain wallet could call the contracts (plain `approve` + `buyShares`), so a re-check is cheap if the site returns (section 11).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `https://punk.coffee/` | HTTP 522 "error code: 522" via Cloudflare (curl, 2026-10-19 ~01:47Z) | H |
| Backend gateway `https://xisipa.punk.coffee` (host read from the archived 2025-11-04 web bundle) | Gateway answers (Cloudflare, `access-control-allow-origin: *`) but `GET /market_na/v1/market/stats`, `/v1/markets?page=1`, `/v1/market/config`, `/v1/market/tokens` all return 404 `{"error_msg":"404 Route Not Found"}` | H |
| Docs `https://docs.punk.coffee/` | HTTP 200 (GitBook). Content is the Oct-2025 launch copy; Terms "Last Updated July 12, 2025" | H (live), L (content age) |
| DefiLlama volume (dexs) | 24h $0, 7d $0, 30d $0; all-time $429,256; monthly: 2025-10 $67K (23 active days), 2025-11 $220K, 2025-12 $142K, 2026-01 **$25 (5 days)**, 2026-02..2026-10 **$0**; last non-zero day 2026-01-28 ($1) | H |
| DefiLlama fees | all-time $3,833; last non-zero day 2026-01-27 ($2) | H |
| DefiLlama TVL | $2,484 on 2026-10-19; every daily value 2026-01..2026-10 is within $2,449-$2,490 (flat = no deposits, no claims); peak $2,657 (2025-12-12) | H |
| DefiLlama metadata | listed 2025-10-14, category Prediction Market, chain Binance, `url: ""`, `deadUrl: true`, twitter `punkdotcoffee`, github `0xPunkcoffee` | H |
| GitHub org `0xPunkcoffee` | created 2025-09-19, 2 repos: `BrandKit` (pushed 2025-10-12), `punk-coffee-docs` (README only, pushed 2025-10-24); no org events; no contracts/SDK/API repo; npm package `punk-coffee` shown in the docs landing snippet does not exist (registry 404) | H |
| Wayback CDX for `punk.coffee` | last capture in the listing 2025-11-04 (earlier 2024 captures predate the project and are unrelated) | L |
| Third-party mention | Layer.gg X thread on BSC prediction markets (Dec 2025, ~305 days old at search time) lists it as "Early Bird Campaign" phase; no 2026 coverage found | L |
| Sourcify records | 7 of the project's contracts were verified on Sourcify between 2026-05-17 and 2026-09-27 (see section 2); shows someone touched the project in 2026, not that it trades | M (who/why unknown) |
| X (`x.com/punkdotcoffee`) | WebFetch returned HTTP 402; not pursued (402 recorded, stopped). t.me/s/punkdotcoffee redirects (302) with no public preview. Social activity in 2026 is UNKNOWN | H (blocked) |

Conclusion: **still_live = false** for aggregation purposes. The contracts remain deployed on BSC and are not known to be paused (state not read), but there is no UI, no working API, and no volume for ~9 months.

## 2. What it is

- **Kind**: onchain-other. Self-described "open, permissionless prediction market protocol for the crypto-native community", "world's first meme-powered prediction market", "No MM, No LP". Brand "Punk.Coffee" / "CafeHouse" (web footer). Operator not named; ToS governed by Cayman Islands law, CIMC arbitration. (H docs)
- **Chain**: BNB Smart Chain mainnet (56) only ("multi-chain expansion coming"; bug-bounty page mentions Base, Solana, Core, but no deployment seen). (H)
- **Collateral**: BSC-USD / USDT BEP-20 `0x55d398326f99059fF775485246999027B3197955` (18 decimals), the factory's constructor `stableCoin`. Native BNB for gas and for the market-creation fee. (H, decoded from Sourcify creation bytecode; matches docs "USDT-BSC").
- **Deposits**: "Universal Deposit Address" widget that bridges/swaps from other chains into USDT-BSC (provider unnamed; min $10 from Arbitrum, $3 other chains). Funding only; not shared liquidity. (H docs)
- **Contracts (all BSC, deployed by one EOA in blocks 63795586-63795676, i.e. ~2025-10-09; M for date, H for blocks)**:
  - `MarketFactory` `0xF7262C7eb1737f7701130C0151C0697Ad7c7A94D` (Sourcify exact match, verified 2026-05-17). Emits `MarketCreated(address indexed creator, uint256 indexed marketId, address indexed marketAddress, MarketCreatedParams)`; `marketCount()`, `markets(id)`, `marketsIds(addr)`. Creates each market as a `BeaconProxy`.
  - `UpgradeableBeacon` `0x0d5D1685c82E933fF0cB50454B2E10b32e40a157` -> `PredictionMarket` implementation `0xc33CF3279620564a01dEFE195E27916707C67216` (**not verified on Sourcify**, HTTP 404; source below comes from a build bundle, M).
  - `FeeManager` `0x03e89Aaa3f9264218830c5a7A228E6f0F54670D9`, `ACLManager` `0xB1A04194D627116203041f05Cb599F9902601f4E`, `ArbitrationManager` proxy `0x06ADa3C5EDc308BCf88F83a97Af7DEe15bdA6686` (impl `0x12266323453D0F9689Ae84355bb073f84b56a0f0`), `PredictionMarketRouter` proxy `0x9c0F3c0C20D10297cA4bFB50846f3242Ea2B9787` (impl `0x26185de57d6d0CC5aA65C2DBC204A35c62649b0E`; address from the archived web bundle, runtime-match verified 2026-09-26). Owners are Gnosis Safe proxies (`0x37c6...4998`, `0x9265...52c8`). (H unless noted)
- **Market model (H, source)**: parimutuel "winner-takes-pool" (docs call it "Intrinsic Settlement Value (ISV)" / "Bean Pool").
  - Each market has `outcomes[]` (contract allows 2-256; docs/UI describe binary YES/NO) and a creator-set `ticketPrice` (factory limits at deploy: 0.1 to 10 USDT; docs say "$1 per ticket").
  - `buyShares(outcomeIndex, tokenAmount)`: pulls USDT, mints `shares = tokenAmount * 1e18 / ticketPrice` as **ERC-1155 balance with id = outcomeIndex**; `safeTransferFrom` / `safeBatchTransferFrom` are overridden to `revert('Token transfers are disabled')`. No sell function. Buying stops at `endTime`.
  - Payout per winning share = `winningPool * userShares / totalWinningShares`, `winningPool = pool - platform - creator - community - arbPool fees`. Implied "price" of an outcome = its share of the pool, which moves with every later bet, so quoted odds are not a fill price.
  - Early-resolution variant (`isSupportedEarlyResolution`, used for price-trigger markets): buys made after the event timestamp are burned and refunded.
- **Creation (H, source)**: `createMarket(params, deadline, signature)` is `payable` (fee `createFee` = 2.5e15 wei = **0.0025 BNB** at deploy; docs say both 0.0025 and 0.005 BNB), requires `endTime` within `[minMarketDuration, maxMarketDuration]` (defaults **15 min to 72 h**) and a **signature from an allowlisted `signers[]` address** over (creator, deadline, question, endTime, metadataURI, ticketPrice, outcomes, earlyResolution, chainId, factory). So market creation is gated by the operator's backend, contrary to "permissionless".
- **Categories (M)**: UI banners (archived 2025-11-04): All, Crypto, Esports, Sports, Pop culture, Celebs, Trends; docs: "MVP currently supports Crypto" (token-pair price direction/threshold, time-based or price-trigger). Actual live market list never observed.

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Official API docs | **NOT FOUND** (searched: docs.punk.coffee `llms.txt`, `llms-full.txt`, all 10 pages; github.com/0xPunkcoffee; npm `punk-coffee`). Roadmap row "v2.0 Q1 2026: Public APIs, white-label support" and a "White-Label Markets ... Punk.Coffee APIs" sentence only. | H |
| Web-app backend `https://xisipa.punk.coffee` | Undocumented; routes extracted from the archived 2025-11-04 bundle (fixture `backend_api_routes_from_archived_frontend_and_live_probe.json`): no-auth `GET /market_na/v1/markets`, `/v1/market/{id}/detail`, `/holders`, `/trades?page=`, `/history-option-ratio`, `/v1/market/stats`, `/config`, `/tokens`, `/datasources`, `/v1/order/getTokenPrice?chain=`; auth (`X-Auth-Token` from wallet-nonce login: `POST /user_na/v1/lg/wallet/nonce`, `/login`) for `/market_a/v1/account/*`, `/user_a/*`. **Live 2026-10-19: all four read routes probed return 404.** Response shapes NOT observed (no sample could be saved). Rate limits NOT FOUND. | M (routes), H (404) |
| On-chain (any BSC RPC / archive) | The real data source: `MarketCreated` logs from block 63795651 (this is what DefiLlama's adapter uses, topic `0x6aea19a4...caddae`), `marketCount()`, `markets(id)`, per-market `getMarketInfo()` (question, endTime, metadataURI, ticketPrice, precision, resolved, aborted, winningOutcomeIndex, outcomes, earlyResolution), `getTotalSharesByOutcome(i)` / `totalSharesByOutcome(i)`, `getUserShares`, `SharesBought(buyer, outcomeIndex, tokenAmount, shares)`, `MarketResolved(winningOutcomeIndex, eventTimestamp)`, `MarketAborted`, `WinningsClaimed`. | H for the factory ABI/events (verified source), M for the market ABI (implementation unverified; interface file `IPredictionMarket.sol` is in the verified factory bundle) |
| Subgraph / indexer | NOT FOUND (searched: DefiLlama adapters, docs, GitHub org; not exhaustively on The Graph). | M |
| WebSocket | NOT FOUND. | M |
| Metadata JSON | Each market has `marketMetadataURI` (host/format NOT FOUND, no market read). | - |

Price feed for an aggregator would be: implied probability of outcome *i* = `totalSharesByOutcome(i) / sum(totalSharesByOutcome)` (net of fees), polled over RPC. It is a pool ratio, not a tradable bid/ask.

## 4. Trade path

Programmatic path is **plain EVM transactions from the user's EOA, no off-chain order signing and no API key** (H, contract source):
1. `USDT.approve(Router or Market, amount)`.
2. `Router.buyShares(market, outcomeIndex, tokenAmount)` (router pulls USDT then calls `market.buySharesFor`; router must hold the `ROUTER` role) or `market.buyShares(outcomeIndex, tokenAmount)` directly. `tokenAmount >= ticketPrice`; `block.timestamp < endTime`; not paused/resolved/aborted.
3. After resolution and the public-notice window: `claimWinnings(market)` / `Router.batchClaimWinnings([...])`; `claimRefund` for aborted markets; `claimInvalidPurchaseRefund` for early-resolution refunds.
There is no cancel, sell, or limit order. The web app's wallet login (nonce + signature, `X-Auth-Token`) only serves its off-chain features (points, referrals, "positions" view, market-creation requests).

## 5. PayBox reachability

**partial.** BNB Smart Chain (`eip155:56`, native BNB) is in PayBox's chain catalog (H, live `discover_tokens mode=chains query=BNB` 2026-10-19, "metadata catalog, not a support allowlist"). The trade path needs only ordinary BSC transactions (`approve`, `buyShares`, `claimWinnings`), which fit transaction proposals; gas in BNB; collateral BSC USDT (PayBox funding of BSC USDT not tested). Limits: market ABI comes from an unverified implementation (M); no live markets; no exit before resolution; ToS prohibits US/UK/CA/CN and "agent" use (section 8). End-to-end proposal flow not exercised (read-only run).

## 6. Fees

| Fee | Value | Tag |
|---|---|---|
| Docs, settlement | "98% of the pool to winners, 2% to platform and incentive mechanisms" (Quickstart, How it Works); elsewhere "up to 2.5% service fee", "winning side receives 97.5%"; Lifecycle page lists "2% platform fee + 1% creator reward" but the payout formula still uses 0.98. **Docs are internally inconsistent.** | H docs |
| On-chain (FeeManager constructor values) | platform 100 bp (1%), creator 100 bp (1%), community 25 bp (0.25%); ArbitrationManager `initialize` sets arbPool 50 bp (0.5%). Total deducted from the pool at resolve = sum = **2.75%** at deploy defaults; all owner-changeable (`updateFees`, `setArbPoolConfig`). Current values NOT read. | H (deploy values), unknown (current) |
| Who pays | Taken from the pooled stake at resolution, so borne pro-rata by winners (losers' stake is the source). No fee on entry (`buyShares` deducts none). | H |
| Market creation | 0.0025 BNB (contract, at deploy); creator earns the 1% creator fee after resolution. | H |
| Refund path | Aborted/invalid: stake back, docs say up to 2.5% (or <=2%) "may be retained"; on-chain `claimRefund` returns full `shares*ticketPrice` with no deduction in the bundle source. Docs vs code disagree. | H/M |
| Gas | BSC BNB gas per tx. | M |

## 7. Resolution and dispute

- **Who resolves (H, source)**: `resolveMarket(winningIndex, eventTimestamp, batchSize)` callable only by the `LIQUIDITOR` role (or a router holding it), after `endTime` or earlier for early-resolution markets. Data source is chosen at creation (docs: "trusted sources or oracle feeds; long-term DAO"); no on-chain oracle in the contracts. Exchange price APIs (`api.binance.com`, `api.bitget.com`) appear in the web bundle as price sources (M). Actual resolver identity/EOA/Safe: NOT FOUND (ACL not read).
- **Public notice + challenge (H, source)**: after resolve, winnings/fees are claimable only after `publicNoticeDuration` (**default 15 min in code; docs say 12-24 h**, owner-changeable). During the window a holder of the *losing* outcome can call `voteDispute` with a deposit (initiator 10%, voters 5% of their losing position, weight cap 30% per user, trigger at 51% of losing votes). If triggered, an owner-allowlisted `arbitrator` calls `applyArbitrationResult(Maintain | ChangeWinner | Abort)`; on Maintain 80% of voter deposits are slashed to `arbPoolAddress`. So final outcome authority is the operator's arbitrators (docs: "future DAO governance").
- **Invalid/abort**: `abortMarket` by an abort-role or router -> full-refund path.
- **Dispute / operator risk: high.** Centralised signer, resolver and arbitrators; upgradeable beacon (beacon owner NOT read; an OZ `UpgradeableBeacon` owner can swap the market implementation for every market) and upgradeable router/arbitration proxies; docs say audits "in progress" with no report found. DefiLlama `audits: "0"`. (H)
- Early-resolution markets burn buys placed after the event timestamp, which is an additional operator-judgement step (H).

## 8. Geo, ToS, automation

- Terms of Use (docs.punk.coffee/doc/legal/termsofuse, **last updated 2025-07-12, L: predates the product**): not for "U.S. persons"; ineligible if "citizen, resident, or located in" the US and territories, Canada, China, UK (regulated prediction markets), or comprehensively sanctioned places; "Circumventing geo-blocks via VPNs or proxy servers" prohibited; "You use the Platform on your own behalf, not as an agent or representative of another person or entity" (conflicts with delegated agent trading); wash trading, manipulation, Sybil attacks prohibited; "Interfering with or disrupting the Platform, APIs, or smart contracts" prohibited. No explicit rule on bots or scripted read access. (H)
- No programmatic access is offered anyway, so the practical constraint is the contract-level path in section 4. Reading public chain data is unrestricted.

## 9. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| TVL (USDT held by market contracts) | $2,484 | DefiLlama `api.llama.fi/protocol/punk.coffee`, 2026-10-19; flat since Jan 2026, so stuck/unclaimed pools, not active liquidity | H |
| 24h / 7d / 30d volume | $0 / $0 / $0 | DefiLlama dexs summary, 2026-10-19 | H |
| All-time volume | $429,256 (2025-10-09 to 2026-01-28) | same | H |
| Peak month | 2025-11, $220,479 | same | H |
| All-time fees | $3,833 | DefiLlama fees summary | H |
| Open interest / per-market pools | NOT FOUND (needs RPC reads; not done) | - | - |

DefiLlama's adapter (`DefiLlama-Adapters/projects/punk_coffee/index.js`) tracks only the single factory above, so a second factory/redeploy would be invisible; none was found (M).

Not read, and why: current `marketCount`, `paused`, fee values, resolver identities, per-market pools. All need `eth_call`/`eth_getLogs`, which are HTTP POST JSON-RPC; the run rule forbids POST. Explorer GET APIs were tried and unusable: Etherscan v2 (API key required), Blockscout hosted API (HTTP 402 "make an X402 payment", recorded and stopped), BscScan (Cloudflare challenge), Routescan (chain 56 unsupported).

## 10. Event coverage and overlap

- Intended categories: crypto price direction/threshold (the only live template per docs), plus UI tabs for sports/esports/pop culture/celebs/trends (no evidence they ever shipped). Durations 15 min to 72 h at deploy defaults.
- Overlap with other venues (M): BTC/ETH/BNB short-dated price-threshold questions also exist on Polymarket, Kalshi, Limitless, Probable, Myriad. But those are CLOB/AMM with sellable positions. This venue's payout is pool-dependent and non-transferable, and rules (reference exchange, snapshot time, "price-trigger closes early") differ per creator, so cross-venue equivalence needs per-market matching and is risky.
- **Not shared liquidity**: own contracts and own pools (H). Independent, but empty.

## 11. Adapter notes (only if the venue revives)

1. Monitor revival cheaply: DefiLlama `summary/dexs/punk.coffee` (`total7d`) and `https://punk.coffee/` HTTP status; re-evaluate if 7d volume > $10K.
2. Discovery: BSC `eth_getLogs` on factory `0xF7262C...` for `MarketCreated`, then `getMarketInfo()` per market; cache by `marketId`.
3. Signal: implied probability = pool ratio net of the fee stack; treat as a *crowd-sentiment signal*, never as an executable price. Mark all quotes `executable=false`.
4. Trade (if ever): Router `buyShares` after verifying live fee values (`FeeManager.getFeesAndAddresses`, `ArbitrationManager.publicNoticeDuration/arbPoolFeeBp`), paused flags, and that the beacon implementation is still `0xc33C...7216` (owner can upgrade).
5. Never count it as an arbitrage leg: no exit, payout changes after entry, centralised resolution.

## 12. NOT FOUND list

- Official API documentation / OpenAPI / SDK (searched docs `llms-full.txt`, GitHub org, npm).
- Any 2026 announcement, shutdown notice, pivot or relaunch (WebSearch budget ran out after two queries; X returned 402; Telegram no preview).
- Audit report (docs say "in progress").
- Current on-chain parameters and list of markets (needs POST RPC).
- Real response shapes from the backend (all read routes 404).
- Operator/legal entity name, team identities.
- Subgraph / indexer.

## Sources

1. https://defillama.com/protocol/punk.coffee (site 403 to WebFetch; data via API below) - M
2. https://api.llama.fi/protocol/punk.coffee , https://api.llama.fi/summary/dexs/punk.coffee , https://api.llama.fi/summary/fees/punk.coffee (fetched 2026-10-19) - H
3. https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/punk_coffee/index.js (read via `gh api`) - H
4. https://docs.punk.coffee/llms.txt , https://docs.punk.coffee/llms-full.txt (10 pages incl. Quickstart, How Punk Coffee Works, Market Types, Market Lifecycle, Terms, Privacy) - H (L for age)
5. https://sourcify.dev/server/v2/contract/56/0xF7262C7eb1737f7701130C0151C0697Ad7c7A94D (and 0x0d5D1685..., 0x03e89Aaa..., 0xB1A04194..., 0x06ADa3C5..., 0x9c0F3c0C..., 0x12266323..., 0x5B25382C..., 0xc33CF327... [404]) - H
6. https://web.archive.org/web/20251104004546/https://punk.coffee/ and the `_next/static/chunks/*.js` bundles of that capture (API base, routes, router/factory/USDT constants) - M
7. https://github.com/0xPunkcoffee (org + two repos via `gh api`) - H
8. https://punk.coffee/ (HTTP 522), https://xisipa.punk.coffee/market_na/v1/... (4 GETs, HTTP 404), 2026-10-19 - H
9. https://x.com/layerggofficial/status/2001250438767890782 (search-result snippet; Dec 2025) - L
10. PayBox `discover_tokens mode=chains query=BNB` (read-only, 2026-10-19); local notes `docs/research/06-paybox-platform.md`, `docs/research/venues/probable.md` for the BNB catalog entry - H/M
11. https://api.etherscan.io/v2 (key required), https://api.blockscout.com/56/... (HTTP 402), https://bscscan.com (Cloudflare challenge), Routescan (chain 56 unsupported) - dead ends, H

## Suspicious content

None found. Observed and ignored: GitBook "Page Not Found" template that advertises `?ask=` / `llms-full.txt` helper endpoints (GitBook platform feature, not followed except `llms.txt` / `llms-full.txt` as ordinary docs); docs landing code snippet `import PunkCoffee from "punk-coffee"` (package does not exist, not installed); WebFetch of x.com returned 402 (no payment made).
