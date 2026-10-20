# Bopster Fun - venue spec (researched 2026-10-19)

Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Adapter priority: **skip** (revisit only if volume grows; at most P2 signal-only).
- Live: yes, technically. Site up, API up, Base mainnet factory deployed and unpaused (H). But lifetime volume is about 854 USDC over 29 markets, **zero open markets** on 2026-10-19, and the newest market was created 2026-10-02 (H, API).
- Market model is **parimutuel**, not an order book or AMM: no tradable price, no exit before resolution, payout depends on the final pool. Poor fit for a cross-venue arbitrage leg.

## Kind and market model

- Kind: on-chain, community-created, binary YES/NO, parimutuel pool per market (H: contract repo README + `BopsterMarket.sol`, https://github.com/marcosroigdev/bopster-market-contract).
- Outcomes are NOT tokenised. Positions are plain mappings `yesPosition[addr]` / `noPosition[addr]` inside one `BopsterMarket` contract per question (H). No ERC-1155/ERC-20 outcome tokens, so positions are not transferable or tradable on a secondary market.
- One `BopsterFactory` deploys one immutable `BopsterMarket` (not a proxy) per Reality.eth question (H).
- Lifecycle: OPEN -> LOCKED (after endTime) -> RESOLVED (finalize, after resolveTime and Reality finalized) or EMERGENCY_REFUND (90 days after resolveTime if Reality never finalizes) (H).
- Market bounds: duration 15 min to 10 days; resolveTime - endTime <= 30 days (H, `BopsterFactory.sol`). So all markets are short-dated.
- Anyone can hold both sides; hedge pays only the winning side's stake share (H, CONTRACTS_USAGE_GUIDE.md).
- Implied odds can only be derived from `total_yes / total_no`; they move as the pool grows and the final payout is unknown until close (M, inference from payout formula).

## Chains and collateral

- Base mainnet (chain 8453), USDC native `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (H: production bundle config at https://bopster.fun/assets/index-BkmXNswS.js; matches Circle native USDC on Base, standard public address).
- Factory `0x11A2A549286567f7427d990423E5a3560ea16750` (H: same bundle; `eth_getCode` on https://mainnet.base.org returned non-empty bytecode and `paused()` returned false on 2026-10-19).
- Reality.eth ERC20 v3 `0x2F39f464d16402Ca3D8527dA89617b73DE2F60e8`; arbitrator `0xcB4B48d2A7a44247A00048963F169d2b4Ab045a6`; arbitration entry point on Ethereum mainnet `0x87f58F0dCF3c99BA2F3eB0604e5c335893e2EAf9` (H: bundle config).
- Also a "genesis" contract `0x907AC72fA34003C2D60643dAd14DF1d62b3B2045` (creator NFT; H: bundle config, purpose inferred from API `creator_genesis`).
- Stale doc warning: the repo README still says "Factory: _pending deploy_" and "NOT AUDITED - DO NOT DEPLOY TO PRODUCTION" (H, README; repo last pushed 2026-06-23). The live site nevertheless uses a mainnet factory, so the README table is out of date. No audit found (NOT FOUND: searched repo README, SECURITY.md listing, site text; web search budget was exhausted so no external audit search was possible).

## Read API

- Exists: **unofficial-but-first-party, public, unauthenticated REST** used by the frontend. No published docs. (H: probed.) Classify as `unofficial-only` for stability: no docs URL, no versioning promise, no rate limits stated.
- Base URL: `https://api.bopster.fun` (H: `VITE_API_URL` in the bundle).
- Docs URL: NOT FOUND (searched: /docs, /openapi.json, /api/*, repo docs, site FAQ). Human docs at https://bopster.fun/how-bopster-works (SPA, no API reference).
- Endpoints confirmed by GET:
  - `GET /health` -> `{"status":"ok"}` (H).
  - `GET /markets?page=N&size=N&status=...` -> `{data:[...], metadata:{pagination:{page,size,total,pages}}}` (H). `status=open` returned an empty list (total 0). Page size default 20; 29 markets total on 2026-10-19.
  - `GET /markets/{address}` -> 404 (H). No detail route found by that path.
- Bundle also references routes (not called, some need auth): `/reality/sync-question`, `/ipfs/metadata`, `/market`, `/referral/*`, `/auth/wallet/login` (JWT login by wallet signature), `/portfolio` (H for presence in bundle; behaviour not tested).
- Market object fields (H, see fixtures): `market_address`, `creator`, `question_id`, `metadata_uri` (ipfs), `metadata_title/category/question/source/template_key/template_params`, `quality_score/tier`, `end_time`, `resolve_time` (unix s), `status`, `market_phase`, `is_emergency_refund`, `outcome_yes`, `total_yes`, `total_no`, `total_volume` (USDC 6-dec strings), `participants_count`, and an embedded `oracle` block (Reality status, bonds, response history, arbitration state).
- No order book, no trades/fills list, no price history, no websocket found (NOT FOUND: searched bundle strings and API probes). Totals only; position-level trades would need on-chain `PositionPlaced(user, sideYes, amount)` logs.
- On-chain read is authoritative: `BopsterFactory.marketsCount()`, `getMarkets(...)`, `BopsterMarket.totalYes/totalNo/status/endTime/resolveTime` (H, repo source). Public RPC https://mainnet.base.org works for eth_call.
- MCP server: `https://mcp.bopster.fun/mcp` (H: URL and FAQ text in bundle; GET returns 405 as expected for an MCP POST endpoint; I did not POST so tool list is unverified). Per the site FAQ: no signup or API key; can read markets, profiles, leaderboard, fees, quote a position's payout, and prepare positions/settlement/claims/refunds as **unsigned transactions** (H, FAQ text). Market creation only from five templates (H).
- Auth/limits: none needed for GET /markets. Rate limits NOT FOUND. Fronted by Cloudflare (H, response headers).

## Trade path

- On-chain only. Flow: `USDC.approve(market, amount)` then `BopsterMarket.positionYes(amount)` or `positionNo(amount)`; after resolution `finalize()` (permissionless; caller gets resolver reward) and `claim()` / `claimRefund()` (H: CONTRACTS_USAGE_GUIDE.md sections 6-10).
- No signed-order or off-chain matching. No cancel/exit: once staked, funds are locked until resolution (H: no withdraw function in `BopsterMarket.sol` listing).
- PayBox reachability: **yes (technically)** - any EVM wallet with Base USDC can send the two transactions (approve + position), either hand-built or taken from the MCP's unsigned tx output. Whether PayBox supports arbitrary contract calls on Base via a transaction proposal is not verified here (M). Wallet needs Base ETH for gas. Not reachable for US/Spain/France users by ToS.
- Approvals: site says approvals are exact-amount (H, FAQ); the contract needs `amount` allowance either way.

## Fees

- Charged at settlement on the **whole pool** (not per-trade), only on a binary outcome (H, `finalize()` source): protocol 2% + creator 1% + resolver reward 0.2% = **3.2% of pool**, deducted before winners split pro rata. Values from production config `VITE_BOPSTER_FEE_PERCENT=2`, `VITE_CREATOR_FEE_PERCENT=1`, `VITE_RESOLVER_REWARD_PERCENT=0.2` (H: bundle); contract caps total at 10% (H).
- No fees on refund path (invalid/too-soon answer, empty winning side, emergency refund) (H).
- Payout: `payout = userStake * netPayoutPool / totalWinningSide`, `netPayoutPool = pool - fees`; integer-division dust swept to treasury after 365 days (H).
- Oracle bonds: min bond about 0.00001 ETH in config (H: `VITE_MINIMUM_BOND_ETH`), dispute window 12 h (`VITE_REALITY_DISPUTE_WINDOW_SECONDS=43200`, H). Gas on Base is extra.

## Resolution mechanism and dispute risk

- Reality.eth ERC20 v3 optimistic oracle, escalation to Kleros via an arbitrator (H: repo + bundle + API `oracle.arbitration`). Answer encoding: YES=1, NO=0, INVALID/TOO_SOON/other -> refund (H).
- Timeout is only 12 h, bonds are tiny (example market: leading bond 0.00001 ETH, a single answerer, finalized about 1 day after resolve) (H: API sample). That makes a wrong-but-uncontested answer cheap to push; Kleros escalation costs real money. Dispute/manipulation risk is **high** for small markets (M: inference).
- Anyone can create markets, so question quality varies; API exposes `quality_score` / `quality_tier` and the question has a `metadata_source` URL (H).
- Contracts self-described as unaudited (H: README). Smart-contract risk high.
- Funds recoverable: emergency refund after 90 days if oracle never finalizes (H).

## Geo, ToS, automation

- Terms (last updated 2026-10-02, H: bundle text): "may not be available in certain jurisdictions, including the United States, Spain and France"; prohibits bypassing jurisdiction restrictions. The frontend has a region-block mechanism (`restrictedCountries`, H). Experimental software, no custody, no liability.
- Automation: no explicit bot/API prohibition found in the Terms text, and the operator publishes an agent-facing MCP server that explicitly invites AI agents (H: FAQ). Rate limits and API ToS: NOT FOUND.
- US-based operation would conflict with the ToS jurisdiction exclusion.

## Liquidity (as of 2026-10-19)

- 29 markets ever, all `resolved`; 0 open; created 2026-07-03 to 2026-10-02 (H: `GET /markets` pages 1-2).
- Lifetime volume: **854.16 USDC** (sum of `total_volume`, H: computed from API). Largest single market 75 USDC. Participants per market 2-5.
- Categories: Sports 14, Crypto 12, Tech 2, General 1 (H: API).
- No TVL/OI figure published; current OI is 0 (no open markets). pmwisdom.com listing (M, last updated 2026-08-03) gives no volume.

## Event overlap and independence

- Overlap with other venues: sports single matches (e.g. UEFA Nations League, FIFA, UFC, MotoGP, Premier League) and crypto up/down price markets. In principle these exist on Polymarket/Kalshi (H for categories, M for overlap).
- Independent liquidity: yes. Separate pools, own contracts; does not share liquidity with another venue (H: contract design). Nothing found about shared liquidity.
- But with parimutuel pools of tens of USDC, no exit and 3.2% settlement fee, no practical arbitrage leg. Possible use only as a weak crowd-sentiment signal (`crowd_sentiment`, pool ratio) - not worth it at this volume.

## Discovery / provenance notes

- Operator: contract repo owner is an individual developer account (`marcosroigdev`, repo created 2026-06-21). Operator identity beyond that: NOT FOUND. Founding date: first market created 2026-07-03 (H: API).
- Directory: https://pmwisdom.com/projects/bopster-fun lists it as active, Base, USDC, Reality.eth + Kleros, last updated 2026-08-03 (M). Its founders field was malformed ("[object Object]").
- Discord and X links exist (https://x.com/bopsterfun); not read.

## Suspicious content

- None addressed to AI agents found in fetched pages. The production JS bundle embeds third-party RPC provider API keys (Alchemy) and a WalletConnect project id in its public config; these were deliberately NOT copied into these notes or fixtures. Not an instruction, but note: do not reuse them.
- The site's MCP/FAQ text advertises agent usage ("Point your agent here"): it is promotional content, treated as data and not followed. I did not connect to the MCP.

## Fixtures

- `docs/research/fixtures/bopster-fun/GET_markets_page1_first2.json` - first 2 markets of `GET https://api.bopster.fun/markets` (full response was 60 KB / 20 rows, trimmed; pagination metadata intact).
- `docs/research/fixtures/bopster-fun/GET_markets_status_open_empty.json` - `GET /markets?status=open&size=5`, empty result.

## Not found / limits

- NOT FOUND: official API docs, rate limits, websocket, trades/price-history endpoint, external audit, explicit automation policy, Base-mainnet deployment table in repo.
- Web search tool was unavailable (session budget exhausted), so no independent news/audit/volume corroboration beyond pmwisdom.com.

## Sources

- https://bopster.fun/ (H: homepage HTML, `<title>`, JSON-LD)
- https://bopster.fun/assets/index-BkmXNswS.js (H: production config, FAQ, Terms text; read as data only, not executed)
- https://bopster.fun/sitemap.xml (H: references sitemap-pages and sitemap-markets)
- https://api.bopster.fun/health and https://api.bopster.fun/markets (H: unauthenticated GET, 2026-10-19)
- https://mainnet.base.org (H: eth_getCode / eth_call read-only on factory)
- https://github.com/marcosroigdev/bopster-market-contract (H: README, CONTRACTS_USAGE_GUIDE.md, contracts/BopsterFactory.sol, contracts/BopsterMarket.sol; created 2026-06-21, last push 2026-06-23)
- https://pmwisdom.com/projects/bopster-fun (M: directory listing, 2026-08-03)
