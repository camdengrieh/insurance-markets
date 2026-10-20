# Predmarks (LATAM) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

**adapter_priority: skip.** Predmarks is an Argentina-focused *market curator/operator* that deploys LMSR markets on someone else's contracts (the Precog protocol on Base). It has no API of its own, no reachable public frontend as of today, its automation was wound down in April 2026, and on-chain trading on its master contract has been idle since 2026-05-17. Any liquidity it had belongs to Precog, so it is not an independent arbitrage leg. If LATAM/Argentina coverage matters, spec **Precog** (the underlying protocol) instead.

## Liveness (is it still live?) - almost certainly NOT

| Evidence | Tag |
|---|---|
| GitHub org `predmarks` created 2026-01-30, description "Prediction Markets para LATAM", 1 public repo (`backoffice`), 1 follower. https://github.com/predmarks (via `gh api orgs/predmarks`) | H |
| `https://predmarks.com`, `www.`, `app.`, and `staging-app.predmarks.com` all return Vercel `404 DEPLOYMENT_NOT_FOUND` on 2026-10-19 (DNS points at Vercel, no deployment attached) | H |
| `backoffice` repo (the only repo): last commit 2026-04-22 (dependency bump). 2026-04-14 commit "chore: disable all inngest crons - Winding down recurring costs". `docs/optimization-log.md` and README describe an internal tool, not a public product. https://github.com/predmarks/backoffice | H |
| Repo `homepage` field points to `predmarks-market-agents.vercel.app`, which 307-redirects to `predmarks-backoffice.vercel.app` (a login-gated Next.js dashboard; I did not probe it further) | H |
| Master contract `0x2297b780508cf997aaff9ad28254006e131599e5` on Base (PrecogMasterV7): 20,793 total txs; most recent shown 2026-05-17 21:39 UTC (154 days before today); burst of "Market Buy" on 2026-05-13, then Redeem Shares and "Market Transfer..." (ownership transfers) 2026-05-14..17. https://basescan.org/address/0x2297b780508cf997aaff9ad28254006e131599e5 | H (page scrape; only first 25 txs read) |
| Paragraph post dated 2026-02-19 calls Predmarks "private beta", no launch date, no site URL, says it is unclear if it will be on-chain. https://paragraph.com/@marcemijlin/predmarks-y-la-oportunidad-de-los-mercados-de-prediccion-en-latam | H (company's own promotional framing) |
| No X/press/other coverage found. WebSearch budget was exhausted after the first two searches, so further web discovery was NOT possible (searched: "Predmarks prediction markets LATAM" only) | - |

Net: market-creation/resolution tooling existed in Mar-Apr 2026; the "Transfer ownership" and withdraw-liquidity flows in the repo plus the May 2026 ownership transfers and silence afterwards are consistent with the operator handing off or winding down markets (M, inference).

## Kind and market model

- Kind: onchain, operator/curator on a third-party protocol (not its own contracts). [H for repo code; "operator" role M]
- Model: **LMSR automated market maker** ("Predmarks uses LMSR as its automated market maker"), binary (`['Si','No']`) or multi-outcome categorical, outcomes 1-indexed on chain. Markets in Spanish (Argentine), topics: ARS/blue dollar, Argentine politics, sports (e.g. DT of a football club), RSS from Clarin/La Nacion/Infobae/Chequeado. [H: `ARCHITRECTURE.md`, https://github.com/predmarks/backoffice/blob/main/ARCHITRECTURE.md]
- Tokenisation: shares are tracked inside the master/market contracts (functions `marketBuy/marketSell/marketRedeemShares`, `accountPositions` in the subgraph with `shares`, `invested`, `isRedeemed`); no evidence of ERC-1155/ERC-20 outcome tokens. [M, from ABI and subgraph queries]
- The `ARCHITRECTURE.md` itself warns that a market left open after the real-world event settles gives "free-money arbitrage" against LMSR - i.e. stale-market risk is real (and is the one kind of edge a scanner could see here). [H]

## Chains and collateral

- Base mainnet (chain 8453) and Base Sepolia (84532). [H: `src/lib/chains.ts`]
- Collateral: USDC, 6 decimals (code comment "USDC collateral has 6 decimals, 1e6 = 100%"); per-market `collateralToken` is a `createCustomMarket` parameter, token address is env-configured (not in repo). [H code comment; address NOT FOUND]
- Master: `PrecogMasterV7` `0x2297b780508cf997aaff9ad28254006e131599e5` on Base, deploy block 41072823; Basescan: verified, solc 0.7.6. [H: `src/lib/contracts.ts`, Basescan]

## Read API

- Official/public API: **none**. NOT FOUND (searched: org repos, site, repo README/ARCHITECTURE, predmarks.com hosts).
- On-chain reads (the only route): master `markets(uint256) -> (name, description, category, outcomes, startTimestamp, endTimestamp, creator, market)`, `marketPrices(uint256) -> (uint256[] buyPrices, uint256[] sellPrices)` (index 0 unused, 1e6 = 100%), market contract `result()`, `closeTimestamp()`, `token()`, `oracle()`. Also `marketBuyPrice`, `marketSellPrice`, `marketSharesInfo`, `marketResultInfo`, `marketCollateralInfo` per Basescan ABI. [H]
- Subgraph/indexer: the backoffice queries a GraphQL subgraph (The Graph style: `markets{id onchainId name category startTimestamp endTimestamp resolvedTo volume participants}`, `accountPositions{shares invested outcome isRedeemed}`), URL from env `INDEXER_URL`, optional API key. URL NOT FOUND (not in repo). [H for schema, endpoint unknown]
- Websocket: NOT FOUND.
- Rate limits: n/a. No fixtures saved (no reachable public API; the one Predmarks host that responds is a login-gated dashboard that I deliberately did not probe).

## Trade path

- Programmatic: direct contract calls `marketBuy(marketId, outcome, int128 sharesAmount, uint256 maxAmountIn)`, `marketSell(marketId, outcome, int128 sharesAmount, uint256 minAmountOut)`, `marketRedeemShares(marketId)` after an ERC-20 `approve` of collateral to the master. [H: Basescan ABI]
- PayBox reachable: **partial/in theory**. An EVM wallet on Base could submit `approve` + `marketBuy` as transaction proposals (no off-chain order signing, no API key). In practice moot: no live front end, no known open markets, zero activity since May 2026. Not recommended.

## Fees

- NOT FOUND for Predmarks. `createCustomMarket` takes `funding` and `overround` (likely the house margin baked into buy/sell price spread, since `marketPrices` returns separate buy and sell arrays) - inference only (L). Fee formulas live in the Precog contracts, not documented in the Predmarks repo.

## Resolution mechanism and dispute risk

- Per-market `marketOracle` address; `reportResult(marketId, outcome)` on the market or via a `Reporter` contract; `result()` 0 = unresolved, >0 = winning outcome (1-indexed). [H: `src/lib/contracts.ts`]
- In practice resolution is **centralised/manual**: an LLM "resolution checker" with web search proposes a result, a human editor confirms, then the operator's reporter wallet calls `reportResult`. No dispute window or UMA-style challenge found. [H: ARCHITRECTURE.md + repo]
- Roles `ADMIN_ROLE`, `MARKET_CREATOR_ROLE`, `CALLER_ROLE` (OpenZeppelin AccessControl) and `marketTransferOwnership` / `marketWithdraw` mean the operator can withdraw leftover liquidity and move market ownership. High operator/trust risk. [H ABI]

## Geo / ToS / automation

- NOT FOUND (no live site, no ToS). Context: Argentina has treated crypto prediction markets as unlicensed gambling and pulled Polymarket from app stores (secondary reporting, M: Yahoo Finance link surfaced in search results, not read).

## Liquidity

- No TVL/volume figure available. Master contract: 20,793 lifetime txs (Basescan, read 2026-10-19), holds 0 ETH and only spam tokens (M - indicates no meaningful USDC sits in the master; funds sit in per-market contracts). Subgraph volume NOT reachable. Treat as negligible/unknown.

## Event overlap / shared liquidity

- Overlap with other venues would be limited to Argentine politics/FX and some football questions; most questions are idiosyncratic Spanish-language local events with bespoke wording, so poor arbitrage matching. Brazilian/Argentine macro on Polymarket/Kalshi exists but is unlikely to match resolution criteria.
- **Shares liquidity with Precog**: the contract set (`PrecogMasterV7`, `PRECOG_MASTER_ABI`, `PrecogMarket`) is the Precog protocol (Base + Arbitrum). Predmarks is a brand/operator on it, so it is not an independent leg.

## Leads for the aggregator project (Precog, not Predmarks)

- Precog "fully onchain prediction market protocol on Base and Arbitrum", any ERC-20 collateral, multi-outcome, no token. https://www.precog.markets/ , https://docs.precog.markets/ [H, undated pages]
- Has a documented REST surface at `https://core.precog.markets` (`/openapi.json`: `GET /api/v1/markets?chain_id=`, `/market-prices`, `/market-trades`, `/accounts`, `/actions/app-token`), plus `/llms.txt`, `/auth.md` agent registration, and a `forecast-os` CLI on GitHub. [H for spec listing]. My unauthenticated GET of `/api/v1/markets?chain_id=8453` returned HTTP 307 to `/` (HTML), so the API appears to need an app token / agent registration (I did not register). Whether the Precog front end itself is still active in 2026-10 was NOT verified. Recommend a separate venue spec for Precog.

## Suspicious / embedded-instruction content

- `backoffice/CLAUDE.md` is a generic AI-agent workflow file (plan mode, subagents, self-improvement loop). It targets the repo owner's own coding agent; I did not follow it. Nothing else adversarial seen. A Basescan token list contained spammy token names ("Reduce 90% fee at https://lowgas.xyz", Telegram link) - airdrop spam, ignored.

## Sources

- https://github.com/predmarks (org via `gh api orgs/predmarks`, repos list) - H
- https://github.com/predmarks/backoffice: README.md, ARCHITRECTURE.md, CLAUDE.md, src/lib/{chains,contracts,onchain,indexer}.ts, commit history - H
- https://predmarks.com, https://www.predmarks.com, https://app.predmarks.com, https://staging-app.predmarks.com - HTTP 404 DEPLOYMENT_NOT_FOUND, 2026-10-19 - H
- https://predmarks-market-agents.vercel.app -> https://predmarks-backoffice.vercel.app (login-gated) - H
- https://basescan.org/address/0x2297b780508cf997aaff9ad28254006e131599e5 (page scrape, partial) - H/M
- https://paragraph.com/@marcemijlin/predmarks-y-la-oportunidad-de-los-mercados-de-prediccion-en-latam (2026-02-19) - H (promotional)
- https://www.precog.markets/ , https://docs.precog.markets/ , https://core.precog.markets/openapi.json , https://core.precog.markets/llms.txt - H
- WebSearch "Predmarks prediction markets LATAM" - M

## Not found / open questions

- Any public Predmarks front end or X account content; indexer URL; fee/overround values; collateral token address; per-market contract list; actual volume/TVL; whether Precog is hosting any residual Predmarks-branded markets; how Predmarks markets map to Precog creator address (Basescan `creator` field could be checked on-chain via eth_call, not done because it requires POST JSON-RPC).
