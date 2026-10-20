# VS Trade (vstrade.fun) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Launched about 2026-09-03 on Robinhood Chain; the only independent signal of usage is a flat ~$52 TVL for six weeks, the official frontend host currently answers "Application not found", and no official docs, API, repo or ToS were found. Peer-to-pool relative-performance bets on stock-token pairs also have no natural cross-venue counterpart.

## Is it live?

- Frontend: `https://vstrade.fun/` and every path I probed (`/docs`, `/api/markets`, `/robots.txt`, `/terms`, `/logo.png`) returned HTTP 404 JSON `{"status":"error","code":404,"message":"Application not found"}` from Railway's edge (`x-railway-fallback: true`) on 2026-10-19. DNS CNAME points at a `*.up.railway.app` host. So the deployment is currently unlinked/removed. (H, curl; fixture `vstrade-fun-root-2026-10-19.txt`). `www.`, `api.`, `docs.` subdomains do not resolve (H).
- A search-engine snippet from earlier in this session described the site as "VS - Stocks fight here", an independent app not owned or endorsed by Robinhood (M, search-result summary of https://vstrade.fun/, page itself not fetchable now).
- Contracts may still be live on-chain, but I could not verify: Blockscout for Robinhood Chain is behind a Cloudflare challenge and I did not circumvent it; I did not send JSON-RPC POSTs.
- DefiLlama lists it (id 8594, category Derivatives, chain Robinhood Chain, listedAt 2026-09-09). TVL series is constant at about $51.91 to $51.93 USDG from 2026-09-09 to 2026-10-18, i.e. no deposit activity in six weeks (H, https://api.llama.fi/protocol/vs-trade, fixture `defillama-protocol-vs-trade.json`).
- Twitter: https://x.com/vstrade_fun (WebFetch returned HTTP 402, not read; recorded only, nothing paid).

## Market model (M, from builder-written DefiLlama PR text and adapter; no official docs found)

- Binary, two-asset "relative performance" market: pair of Robinhood Stock Tokens (e.g. NVDA vs AMD) over a fixed window. The asset with the higher end/start price ratio pays 1 USDG per share, the other 0. If no valid feed data in the resolution window, market is cancelled and every share refunds 0.5 USDG. (H, PR #20943 body https://github.com/DefiLlama/DefiLlama-Adapters/pull/20943)
- Complete-set mechanics: 1 USDG = 1 A + 1 B share; each market holds 1 USDG per outstanding complete set plus AMM pool liquidity. Trading is against a fixed-product pool ("outcomes trade on a fixed-product pool from open to close"; sell early or hold, per search summary - M). (H adapter comment, https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/vs/index.js)
- Each market is an immutable `VSMarket` contract created by a factory. Outcome tokenisation (ERC-20 vs internal accounting) NOT FOUND (searched: DefiLlama adapter/PR, GitHub code search for `VSMarket`, site unreachable).

## Chains and collateral

- Robinhood Chain (Arbitrum-stack L2; mainnet live per The Block, M). Collateral USDG (Global Dollar). (H adapter)
- Factory: `0xE96F3d1F98f91842EA209acA197844040E241990` (H adapter; public contract address). ChainlinkOracleAdapter: `0x72CC887908F4627274cF6855459450E787414E69` (H, PR body). Factory ABI hints: `allMarkets() -> address[]`, per-market `accruedFees() -> uint256`.
- Chain ID / RPC URL NOT FOUND in this session (searched: DefiLlama only).

## Read API

- Official REST/WebSocket API: NOT FOUND (searched: site paths, GitHub, DefiLlama). exists = `onchain-or-subgraph-only` in practice: enumerate markets with `factory.allMarkets()` and read market state via contract calls. No subgraph found.
- Only usable public HTTP source is DefiLlama TVL (`https://api.llama.fi/protocol/vs-trade`), which gives aggregate TVL only, no per-market prices.
- Per-market view function names (prices, reserves, start/end time, state) NOT FOUND; contract source unverified/unknown.

## Trade path

- No API. Only on-chain: EVM wallet approves USDG and calls market contracts (buy/sell/mint-complete-set/resolve/claim function names NOT FOUND). Resolution and open are permissionless calls (H, PR body).
- PayBox reachability: **partial/unknown**. If PayBox supports Robinhood Chain as an EVM network, transaction proposals could work in principle; PayBox's supported networks list was not checked here (task bans PayBox money-moving tools; discover_* not called). Treat as unreachable until Robinhood Chain support is confirmed. Signed-order flow does not exist (AMM, direct contract calls).

## Fees

NOT FOUND for rates. Protocol fees accrue inside each market (`accruedFees`) and are swept to a treasury (H, adapter). Rate, who pays: unknown. Likely taken on AMM swaps (L, inference).

## Resolution and dispute risk

- Chainlink Data Feeds on Robinhood Chain via `ChainlinkOracleAdapter`; `open()` snapshots price at startTime, `resolve()` snapshots at endTime by walking back at most 200 aggregator rounds; validates answer > 0, round completeness, freshness <= maxPriceAge (default 1h). Feeds register-once. No admin can choose winner. (H, PR body, author-stated and unaudited; audits field empty)
- Risks: stock-token feeds idle outside US market hours (stale -> cancel/50c refund path), corporate actions/splits, unaudited immutable contracts, tiny liquidity.

## Geo / ToS / automation

NOT FOUND (site unreachable; searched: site paths, search). Search summary says it is not affiliated with Robinhood (M). No documented automation rules.

## Liquidity

TVL about $51.93 USDG on 2026-10-18, flat since 2026-09-09 (H, DefiLlama). No volume/OI/market count found. Effectively zero.

## Event overlap and independence

Pairs of US large-cap stock tokens, "A outperforms B" over a window. Overlap with other prediction venues is essentially none (equity relative-performance is a niche; closest analogues are Kalshi/Polymarket stock up/down markets, which are single-asset thresholds, and perp pairs). Liquidity is independent (own AMM pools), but too thin to matter. At best a signal-only reference for tokenised-stock relative performance; Chainlink feeds are available directly, so nothing is gained from the venue.

## Suspicious content

None observed. (Note: DefiLlama commit message carries an AI co-author line; irrelevant.)

## Open questions

- Whether contracts still hold live markets (needs a Robinhood Chain RPC/explorer read; Blockscout is Cloudflare-gated).
- Whether the frontend moved to a new host.
- Fee schedule, function ABI, share tokenisation.

## Sources

1. https://api.llama.fi/protocols and https://api.llama.fi/protocol/vs-trade (H)
2. https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/vs/index.js (H)
3. https://github.com/DefiLlama/DefiLlama-Adapters/pull/20943 (H, merged 2026-09-08; author-supplied claims)
4. https://vstrade.fun/ (H: 404 Railway "Application not found" 2026-10-19)
5. Web search summary of vstrade.fun and The Block Robinhood Chain article https://www.theblock.co/post/406918/robinhood-chain-goes-live-mainnet-alongside-24-7-tokenized-stocks-lighter-perps-planned-crypto-agentic-trading (M)
6. https://x.com/vstrade_fun (not read, HTTP 402)

Fixtures: docs/research/fixtures/vs-trade/ (defillama-protocol-vs-trade.json, defillama-adapter-vs-index.js, vstrade-fun-root-2026-10-19.txt).
