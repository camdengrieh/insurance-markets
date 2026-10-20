# Predex (predexmarkets.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.
Priority: **skip**. Reason: owner-settled 3/5/10-minute pari-mutuel crypto-price rounds (no independent price discovery, no overlap with other venues' event markets), the documented API host is currently dead, no liquidity evidence, and the Terms ban unauthorised automation.

## Summary

- Marketing site is up (www.predexmarkets.com returns 200 on 2026-10-19; Vercel). H
- Backend API host `api.predexmarkets.com` returns `404 {"status":"error","code":404,"message":"Application not found"}` for `/`, `/api/events`, `/api/health`, `/api/market/round/BTC`, `/api/market/price/BTCUSDT`; response header `server: railway-hikari`, `x-railway-fallback: true` (the Railway app behind the domain is not deployed/removed). The site's own JS bundles point at this host. So every documented REST endpoint is unreachable today. H (fixtures: `api-events.404.json`, `api-events.headers.txt`)
- Product: UP/DOWN pools on crypto/gold/silver price over fixed 3/5/10 minute slots on BNB Chain, USDT. Plus off-chain "event markets" (politics/sports/world events) held in MongoDB and admin-resolved. H (site, docs, README)
- The public GitHub contracts contradict the marketing/docs: they have **no oracle**; the owner EOA submits the outcome. See "Resolution".

## Kind and market model

- Kind: onchain-other (BNB Chain), plus an off-chain event-market component. H
- Crypto rounds: binary YES(UP)/NO(DOWN), **parimutuel pool** per (asset, duration, slot). No order book, no AMM, no secondary trading, no share tokens: positions are only mapping entries `yesBets/noBets[roundKey][user]` (not tokenised). H (`PredexV2.sol`, `PredexMarket.sol` in PredexMarkets/predex-contracts, commit 2026-05-17)
- Payout = `userBet * (yesPool+noPool - 1.5% fee) / winningPool`. "Up to 1.95x" is a marketing cap, not enforced in the contract code seen; the payout is floating, depends on final pool ratio, and is unknowable at bet time. H (contract), M (1.95x claim origin)
- V2 (time-slot) design: round key = keccak256(asset, duration, slot) with slot = block.timestamp / duration; durations 180/300/600 s; bets locked in the last 20 s; round exists only after first bet. H (`PredexV2.sol`). The deployed contract's ABI in the repo (`abi/PredexMarket.json`) matches the **V1** `PredexMarket.sol` (createRound/placeBet(roundId,...)/settleRound), not V2 and not the `predict(symbol,isUp,amount)` shown in README. Which code is at the deployed address is NOT verified (see open questions). H for the mismatch itself
- Event markets: binary or up to 20 outcomes, custom duration, "AI odds" from GPT-4, off-chain pools, admin resolved. M (README and how-it-works are vendor claims; no endpoint reachable to confirm)

## Chains and collateral

- BNB Chain (chainId 56). Contract `0xeb11de4ff55d139628df718A7564e6dc5DAf93f0` (also embedded in the homepage JS). H (`deployments.json`, homepage bundle)
- Collateral: USDT BEP-20 `0x55d398326f99059fF775485246999027B3197955`, 18 decimals. H (`deployments.json`)
- Email-registered users get platform-managed wallets (custodial); MetaMask users self-custody. H (Terms/FAQ, via WebFetch summary)

## Read API

- Docs: https://www.predexmarkets.com/docs/api . Base URL `https://api.predexmarkets.com`. No auth for reads. Rate limit 200 requests / 15 min / IP. Enterprise tier (higher limits, history, webhooks) by email only. H (docs page)
- Documented endpoints (all GET): `/api/events`, `/api/events/:id`, `/api/market/price/:asset`, `/api/market/round/:asset` (pool sizes and time remaining), `/api/ai/predict/:eventId`, `/api/news`, `/api/suggestions`. README additionally lists `/api/health`, `/api/ai/odds/:marketId`. H (docs), M (README)
- Documented event object: `id,title,category,emoji,description,resolutionRules,endDate,yesPool,noPool,yesCount,noCount,status`. Round/price response bodies are NOT documented. H (docs) 
- **Live status: NOT reachable** (404 Application not found, 2026-10-19). No response shape could be confirmed; no real data fixtures. H
- WebSocket: NOT FOUND (searched: docs/api page, README, homepage and dashboard JS chunks for ws:// / wss://).
- On-chain read path (the only workable one): `getRound`, `rounds`, `yesBets/noBets`, `BetPlaced`/`RoundSettled`/`Claimed` events via any BSC RPC or log indexer; no subgraph found. H (ABI/source), but unverified against the deployed bytecode.

## Trade path

- Programmatic: on-chain only: `USDT.approve(contract, amount)` then `placeBet(...)` (V1: roundId; V2: asset string, duration, isYes, amount), later `claim(...)`. Plain EVM transactions, no signed-order scheme. The authenticated REST path (`POST /api/events/:id/predict`, Bearer token) exists in README for event markets but the token issuance flow is not documented. H (source), M (REST)
- Genuinely tradable only with a fresh round: bets are accepted for <= ~160-580 s windows and the payout multiple is unknown until lock, so an arb leg cannot be sized or hedged deterministically.
- PayBox reachability: partial. A BNB Chain EVM wallet could in principle send the two transactions (approve + placeBet) via transaction proposals; whether PayBox supports chainId 56 for arbitrary contract calls was not checked here (no PayBox tools called, per ground rules). Not worth building given the priority.

## Fees

- 1.5% of the **total pool** taken at settlement and sent to the owner (contract: `FEE_BPS = 150`, transfer to `owner()`); marketing/FAQ/Terms variously say "1.5% of winnings". Effective payer: all pool participants pro rata (contract). H (source), conflict with docs noted
- Gas on BNB Chain; "event markets: modest platform fee", unspecified. Affiliate split 20-35% of fees (README). H/M
- Min bet $1 (FAQ); no max listed. H

## Resolution and dispute risk

- Docs/Terms/FAQ say crypto rounds settle via Chainlink; the README says Chainlink; the how-it-works page lists Binance Spot/Futures as the price source. H (docs text)
- **The contract source in the public repo has no oracle integration at all:** `settleRound(..., bool outcomeYes)` is `onlyOwner` and the owner chooses the outcome after `settleAt`. `PredexV2` also has `emergencyWithdraw(token, amount)` for the owner, contradicting "No admin can move user funds". H (`PredexMarket.sol`, `PredexV2.sol`)
- Event markets: admin-resolved (AI-suggested), manual for politics; ambiguous markets may be cancelled with refunds; disputes by email within 7 days, final decision with the platform, then arbitration. H (Terms via WebFetch)
- Risk: high. Trust-the-operator settlement, operator-controlled rounds, a single owner key, unaudited (audit status not addressed), and no on-chain dispute path.

## Geo, ToS, automation

- "Available worldwide subject to local laws"; no named restricted countries; sanctions lists barred. Use of "bots, scripts, or automated tools" and scraping prohibited "without authorization". H (Terms, via WebFetch summary; verbatim text not re-read)
- Therefore automated trading would violate ToS unless authorised; read-only polling of the documented public API is arguably permitted ("free, no authentication for read-only") but the API is down.

## Liquidity

- **NOT FOUND.** Homepage counters are unrendered placeholders (24 h predictions, etc.). BscScan returned HTTP 403 to WebFetch; Sourcify has no match for the address (`sourcify-lookup-404.json`, so the "verified" claim is unconfirmed here; BscScan may still verify). No TVL, volume or OI source found. Contract GitHub repo is 5 months old (created 2026-05-17, one commit, no further activity). WebSearch budget was exhausted, so no independent coverage was searched. Treat as thin until shown otherwise. H (absence), L (inference)
- Homepage and docs are the only claims of "200+ countries", "22+ markets" (README/how-it-works list 20 crypto + XAU + XAG; V2 comment says 50+). L

## Event category overlap and liquidity sharing

- Overlap with other venues: only "crypto price up/down within 3-10 min" and Gold/Silver spot direction. Other venues' near-term crypto markets (e.g. 5-15 min up/down products) are the nearest analogues, but a floating-payout pari-mutuel pool cannot be arbitraged cleanly. Politics/sports "event markets" are off-chain, admin-resolved, with unknown liquidity. M
- Shares liquidity with no other venue (own pools). Independent, but because the payout is floating and the pools tiny/unknown, there is no arbitrage value. H (source), M (conclusion)

## Adapter notes (if ever revisited)

- Poll `api.predexmarkets.com/api/market/round/:asset` only if it comes back; otherwise read `getRound` and `BetPlaced` logs from the BSC contract. Implied probability for a leg = poolSide / (yesPool+noPool) before the 1.5% fee, always as a snapshot that moves until lock.
- Model as `signal-only` at best (crowd direction over 3-10 minutes), never as an arb leg.

## Open questions

1. Which code is actually deployed at `0xeb11...93f0` (V1, V2, or something with an oracle)? Needs an explorer/RPC `eth_getCode` or verified-source read (BscScan 403, Sourcify no match, and POST JSON-RPC was avoided under the read-only rule).
2. Is the backend (Railway app) permanently gone or a transient deploy failure? Re-check `https://api.predexmarkets.com/api/health`.
3. Real volume/TVL: USDT balance of the contract and BetPlaced count over the last 30 days.
4. Are bots allowed via an "authorization" (contact is an email address on the site; none contacted).

## Suspicious content

- None containing instructions to AI agents. Marketing-vs-code inconsistencies (oracle claim vs owner-settled code; "no admin can move user funds" vs `emergencyWithdraw`; README functions `predict()/getCurrentRound()` absent from the ABI) are recorded above as reliability signals.

## Sources

- https://predexmarkets.com (redirects to https://www.predexmarkets.com/) , homepage HTML and JS chunks (H, 2026-10-19)
- https://www.predexmarkets.com/docs, /docs/api, /docs/security, /docs/faq, /docs/how-it-works (listed; first four fetched via WebFetch summarisation), /terms (H, but WebFetch paraphrase, 2026-10-19)
- https://github.com/PredexMarkets/predex-contracts : README.md, deployments.json, contracts/PredexMarket.sol, contracts/PredexV2.sol, abi/PredexMarket.json, docs/how-it-works.md (single commit 2026-05-17) (H)
- https://api.predexmarkets.com/api/events and other paths: 404 Application not found (H, 2026-10-19)
- https://sourcify.dev/server/v2/contract/56/0xeb11de4ff55d139628df718A7564e6dc5DAf93f0: no match (H)
- https://bscscan.com/address/0xeb11de4ff55d139628df718A7564e6dc5DAf93f0: HTTP 403 to automated fetch (not read)
- Fixtures: docs/research/fixtures/predex/ (api-events.404.json, api-events.headers.txt, deployments.json, PredexMarket.sol.txt, PredexV2.sol.txt, sourcify-lookup-404.json)
