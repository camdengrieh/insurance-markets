# Hunch VPM (Robinhood Chain) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.
Read-only research; no accounts, wallets, signing or POSTs. WebSearch budget was exhausted, so no independent third-party coverage was checked (see Open questions).

## Verdict

adapter_priority: **skip**. The venue is live and has a clean public read API, but as of 2026-10-19 it has had **zero real bettors and zero volume**: every market's pool is just the operator's 1+1 USDG seed. It is a stock-direction parimutuel (no order book, no exit, no price discovery from outsiders), blocked for US/CA/UK/CH users at the front end, unaudited, with 25 USDG max entries. Revisit only if `/api/proof` shows non-zero distinct bettors.

## Identity and liveness

- Name: Hunch on Robinhood Chain ("Hunch VPM"), site https://hunch-vpm-rh.vercel.app (README also names vpm.playhunch.xyz). Not the same product as PlayHunch's other venues; a sister instance exists at arc.playhunch.xyz (Arc chain), not researched. [H, site + README]
- Repo https://github.com/rajkaria/hunch-vpm-rh: created 2026-09-27, last push 2026-10-04, 0 stars, MIT. [H, gh api]
- Self-described "Beta. Unaudited." Not affiliated with Robinhood, Chainlink or Paxos. [H, /docs/risks, README]
- Still live: yes. `GET /api/health` on 2026-10-19 returned ok=true, latest block 0 s old, keeper wallet funded, "new bets and new markets are open". 20 markets (ids 0-19) opened and all 20 settled (daily TSLA/NVDA only, through Fri 2026-10-16). [H, /api/health, /api/markets, /api/proof]
- Contracts deployed 2026-10-02T17:56:22Z to Robinhood Chain mainnet (chain 4663; `eth_chainId` on the public RPC returned 0x1237 = 4663). [H, README, FACTS.md, RPC]
- The page said no market was open at fetch time; next opening bell Monday 2026-10-19 9:30 ET. [H, site]

## Market model

- Kind: onchain-other. Binary only (UP / DOWN; outcome 0 = UP, 1 = DOWN). Daily markets (open to close, one trading day) and weekly markets (first open to Friday close). [H, site, API docs]
- Mechanism: **Vested Parimutuel (VPM)**, pool-based, no house, no order book, no AMM. Your win payout = your stake plus every opposing dollar that arrives after you; a last-second bet gets roughly its stake back. Capacity matching with kappa = 30 (a side accepts at most 30x the opposing pool); excess is returned. Contract is the whitepaper's reference `VestedParimutuel` plus ten listed changes (D1-D10). [H, README, HunchVPM.sol]
- Outcome tokenisation: **none**. A bet is a position id (struct in `HunchVPM`, `positions[]`), owned by an address, optionally transferable on-chain with `transferPosition`. Not an ERC-20/1155. [H, contract source]
- Implied probability is not a standing price: payout depends on arrival order, so a cross-venue price comparison needs the mechanism math (`previewPayout`, `headroom`, `getBook`), and any marginal quote is path-dependent. There is no way to sell or hedge inside the venue. [M, inferred from README mechanism]
- Tickers allow-listed: NVDA, TSLA, AAPL, COIN (Robinhood Stock Tokens, Chainlink feeds). Only TSLA and NVDA daily markets were actually listed in ids 0-19 (M, from /api/markets). [H]
- Entry bounds (live API): min 1 USDG, max 25 USDG per bet, feeBps 200, seed 1 USDG per leg, headroom 29 USDG per side. Docs/risks say 25 USDG; README and the relay API docs say 100 USDG: **inconsistent, trust the live per-market `limits`**. [H]

## Chains and collateral

- Robinhood Chain mainnet, chain id 4663 (Arbitrum Orbit on Ethereum per README), RPC https://rpc.mainnet.chain.robinhood.com, explorer https://robinhoodchain.blockscout.com. [H, README; chain id H via RPC]
- Collateral: USDG (Paxos Global Dollar), 6 decimals, `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`; supports EIP-3009 `receiveWithAuthorization`. Paxos can freeze addresses or pause the token. [H, README, risks page]
- Contracts [H, README + /api/proof]: HunchVPM `0x1c23356536eA8E30F53481b971098aC30DA43576`; StockRoundResolver `0xb3336ab62cB57841CDEA2CA43d62F2D2c5287721`; HunchMarketFactory `0x2EdcCA1e40AEACD3ef2d5FcBFEAC5B356e1b6676`; Safe (owner/guardian/treasury, 2-of-3, operator holds all three keys) `0x5866308Af35fA8AbD67f88d31695aD029143F336`; keeper/opener `0xEb420AD181518814B6E3feb89A9d369Da3F5b580`. Chainlink feeds NVDA `0x379E...9F15`, TSLA `0x4A11...7C38`, AAPL `0x6B22...2cD0`, COIN `0xA3a4...8Ef2`.
- Funding path described by Hunch: bridge USDC from Arbitrum One or Base with Across to Robinhood Chain; arrives as USDG. [H, README; not tested]

## Read API

- Exists: **official-public**, unauthenticated, HTTP JSON, Next.js route handlers on Vercel. No websocket found (NOT FOUND, searched: API docs page, route list in repo). [H]
- Base URL: https://hunch-vpm-rh.vercel.app . Docs: https://hunch-vpm-rh.vercel.app/docs/api (source `apps/web/src/app/(venue)/docs/api/page.tsx`). Stability promise: fields may be added, never renamed. [H]
- Endpoints [H, docs + live GET 2026-10-19]:
  - `GET /api/markets` - all markets newest first (20 at fetch; ~69 KB because each includes a rules text). Fields: id, ticker, family (daily/weekly), question, phase, status, winner, strikeTime, finalTime, strike{answer, roundId, at}, live{...}, change{bps}, pool{up,down}, totals{pool,up,down,pendingUp,pendingDown,paidOut}, headroom, limits{minEntry,maxEntry,feeBps}, acceptingBets, maxStrikeAge/maxFinalAge, voidableAt, seedPerLeg, opener, openedAt, specId, feed, stockToken, rules.
  - `GET /api/markets/[id]` - one market plus positions.
  - `GET /api/prices` - latest Chainlink reading per ticker (8-decimal answers).
  - `GET /api/positions?owner=0x...` - positions for an address.
  - `GET /api/proof` - counters (markets opened/settled/refunded, distinct bettors, USDG staked/paid/fees), settled markets, refund drill, fee sweeps.
  - `GET /api/health` - keeper job health.
- Amounts are decimal strings in USDG 6-decimal units; prices 8-decimal Chainlink answers; times are unix seconds. [H]
- Rate limits: GETs edge-cached (prices/markets 15 s, market detail 5 s, proof 60 s), "no limit beyond fair use" except positions 30/min/IP. Relay POST 10/min per IP and per signer. [H, docs]
- On-chain equivalent (source of truth, no API needed): HunchVPM views `marketCount`, `getMarket`, `getBook`, `headroom`, `previewPayout`, `previewFee`, `marketTerms`, `marketPositions`; events `MarketCreated`, `Entered`, `Resolved`, `Voided`, `Claimed`, `FeesSwept`. Public RPC is described as rate-limited with little history. [H, contract source, risks page]
- Fixtures (fetched 2026-10-19, unauthenticated GET, generic UA): `docs/research/fixtures/hunch-vpm-robinhood-chain/` - `api-markets.trimmed.json` (3 of 20 markets, rules text stripped), `api-markets-19.trimmed.json`, `api-prices.json`, `api-proof.counters.json`, `api-health.json`.

## Trade path

- Programmatic, two options [H, contract source + API docs]:
  1. Direct: approve USDG to HunchVPM, then `enter(marketId, outcome, amount)` (msg.sender owns the position; needs ETH for gas on chain 4663, which Hunch says is under a cent).
  2. Gasless relay: the bettor signs an EIP-712 USDG `ReceiveWithAuthorization` whose nonce = `enterNonce(marketId, outcome, amount, salt)` (binds chain, contract, market, side, amount); `POST /api/relay/enter` (body: from, marketId, outcome, amount, validAfter, validBefore, salt, signature, optional chainId/hunchVpm) makes the relayer submit `enterWithAuthorization` and pay gas. Anyone can also submit that call themselves. Relay rejects ERC-1271 smart-wallet signatures (`contract_signer`), requires a regular EOA signature; blocks by region (403 `region_blocked`). Not exercised here (POST forbidden).
- No cancel, no sell, no limit orders: a bet is final. `transferPosition` moves a position to another address (OTC only). Exit is claim after settlement (`claim`/`claimFor`, deliverable by anyone) or refund. [H]
- Auth: none for API. Signing scheme is plain EIP-712 / ECDSA over an EOA.

## PayBox reachability

- paybox_reachable: **partial** (plausible, untested).
- Robinhood (4663) is in PayBox's chain catalog (`discover_tokens mode=chains`, 2026-10-19, recorded in docs/research/06-paybox-platform.md) and `get_buy_link` supports Robinhood. [H, prior in-repo research]
- `request_wallet_sign` `typedData` can sign the USDG `ReceiveWithAuthorization` with an EVM wallet; the same EOA address is shared across all `eip155:*` chains (per 06-paybox-platform.md), then a plugin/agent POSTs to the relay or calls `enterWithAuthorization` itself. Alternatively an `evm` transaction proposal on `eip155:4663` (`approve` + `enter`) with native ETH on 4663 for gas. [M, inference from PayBox notes; no test]
- Blockers: the relay is geo-blocked and the front end blocks US/CA/UK/CH (the PayBox user's jurisdiction decides); gasless relay may be unavailable to smart-account signers; PayBox proposals show raw calldata only (no decoded summary); relay host would need to be in a plugin's network allowlist. Whether PayBox's wallet-sign policy accepts arbitrary EIP-712 domains is NOT FOUND (06-paybox-platform.md).

## Fees

- 200 bps (2%) on **a winner's gain only** (payout minus accepted stake), taken at claim; `fee = floor((payout - accepted) * feeBps / 10000)`; swept to the Safe treasury. Refunds carry no fee. Max settable feeBps is 500. [H, HunchVPM.sol `_claim`, rules text in /api/markets]
- Losers pay nothing beyond losing the stake. Gas: sponsored by the relayer for relayed bets; otherwise the bettor pays (cents). Bridging fees (Across) not researched.

## Resolution and dispute risk

- Resolver: `StockRoundResolver` (no owner, no price input). Anyone resolves after 4:00 pm ET using the two Chainlink rounds "in effect" at the 9:30 am ET open and the 4:00 pm ET close (last round at or before each bell). UP if close > open, DOWN if lower. [H, README, rules text]
- Refund (void) in full if prices equal (same round), either price older than 26 h, out of range, or the token price is paused for a corporate action for more than a day; anyone can trigger refunds 72 h after the bell if unsettled. [H]
- Oracle caveat: Chainlink stock feeds update on 0.5% deviation or 24 h heartbeat, so the "price in effect" can be hours old and up to ~0.5% off the official exchange print; flat sessions (<0.5% move) refund everyone. This differs from how exchange-print based venues resolve the same question, so a "same event" hedge on another venue has **basis risk**. [H, risks page, rules text]
- No dispute process; no sequencer-uptime feed; chain operator can filter transactions; Paxos can freeze USDG. Unaudited. Safe is 2-of-3 with all three keys held by the operator (can pause new entries, list/delist feeds; cannot move stakes or set prices). [H, risks page, README]

## Geo / ToS / automation

- Stock-price markets "not offered to persons in the United States, Canada, the United Kingdom or Switzerland"; enforced by a front-end country block and relay `region_blocked`; the contracts themselves are permissionless. Users must confirm eligibility. [H, README, risks page]
- Automation/bot rules: NOT FOUND (searched: risks page, API docs, README). The API is explicitly public and bots can call contracts directly. No formal ToS page found (not separately fetched; the site mentions "terms").

## Liquidity

- As of 2026-10-19 (`/api/proof` readAt 1792386624): markets opened 20, settled 20, refunded 0, **distinct bettors 0, USDG staked by bettors 0, USDG paid to bettors 0, fees swept 0**. Every market's pool = 1 USDG per side (the operator seed). [H, /api/proof, /api/markets]
- Per-bet cap 25 USDG and kappa 30 imply tiny capacity even if it attracts users: headroom 29 USDG per side per market. [H]
- TVL: effectively a few USDG of operator seed. Keeper wallet held 5.42 USDG at the health check. [H, /api/health]

## Event overlap and independence

- Overlap: US large-cap stock daily/weekly direction (NVDA, TSLA, AAPL, COIN). Other prediction venues have run similar "stock up/down today" binary markets (M, from memory of the category; not verified for 2026 and the Polymarket/Kalshi specs are covered by the parallel workflow). Resolution basis (Chainlink Stock Token price, not exchange close) differs, so treat any match as imperfect.
- Independent liquidity: yes, a standalone contract with its own pools (not shared with another venue). But it has no real liquidity, so it is not a usable independent leg.
- Arbitrage fit: poor. Parimutuel payout is path-dependent, there is no sell side, positions cannot be closed or hedged inside the venue, and capacity is at most ~25 USDG a bet. Signal value: none while pools equal seed; a future pool imbalance would be a retail sentiment signal at most.

## Open questions

- Is there any third-party coverage, volume or user growth since 2026-10-04 (web search unavailable, budget exhausted)?
- Does the 25 USDG vs 100 USDG discrepancy (docs vs README/relay docs) reflect a pending change? Live per-market `limits.maxEntry` = 25 USDG.
- Do PayBox policies allow signing the USDG EIP-712 `ReceiveWithAuthorization` on chain 4663? Untested.
- What are the formal ToS (site mentions terms; no page fetched)?
- Sister venue arc.playhunch.xyz (Arc chain) not researched.

## Sources

- https://hunch-vpm-rh.vercel.app (site, fetched 2026-10-19) [H]
- https://hunch-vpm-rh.vercel.app/docs/risks (fetched 2026-10-19) [H]
- https://hunch-vpm-rh.vercel.app/docs/api and its source `apps/web/src/app/(venue)/docs/api/page.tsx` [H]
- Live GETs 2026-10-19: /api/markets, /api/markets/19, /api/prices, /api/proof, /api/health [H]
- https://github.com/rajkaria/hunch-vpm-rh: README.md, docs/FACTS.md, contracts/src/HunchVPM.sol, repo metadata and commits via `gh api` [H]
- https://rpc.mainnet.chain.robinhood.com `eth_chainId` = 0x1237 [H]
- docs/research/06-paybox-platform.md (PayBox chain catalog incl. Robinhood 4663, wallet-sign behaviour) [H as recorded earlier in this repo; M here]
- Whitepaper https://www.playhunch.xyz/vpm-whitepaper (linked from site, not read) [not verified]
