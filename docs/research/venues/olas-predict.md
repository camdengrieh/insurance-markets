# Olas Predict - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.
WebSearch budget was exhausted for this session, so everything below comes from direct fetches of the official site, official GitHub repos (via `gh api`), and public GETs.

## Verdict

adapter_priority: **skip** as a trading venue; keep as an optional **signal source** (agent leaderboard / agent trades) at most.

Olas Predict is NOT a market venue. It is a read-only analytics UI ("Watch autonomous agents trade on real-world events") over two existing venues that Olas agents trade: **Omen on Gnosis Chain** (Omenstrat) and **Polymarket on Polygon** (Polystrat). It has no order book, no AMM of its own, no wallet flow and no trading API. Any liquidity it shows is Omen's FPMM pools (on markets Olas's own creator agents deploy) and Polymarket's CLOB, so it is **not an independent arbitrage leg**: Polymarket is covered by the parallel workflow, and Omen/AIOmen is already in the census. The only Olas-specific part is that Olas runs the market creator that seeds the Omen markets the UI lists.

## Is it live?

- Site up, title "Olas Predict Beta", meta description "Explore AI-powered prediction markets on Olas Predict. Watch autonomous agents trade on real-world events and outcomes." Canonical page is /questions (root redirects to `/questions?state=opened`). H - https://predict.olas.network/ (curl, HTML head)
- Why WebFetch showed only the title: it is a Next.js app that renders client-side. H
- UI repo active: valory-xyz/olas-predict, created 2024-08-30, last push 2026-10-15, not archived, Apache-style tooling, 2 stars. H - `gh api repos/valory-xyz/olas-predict`
- Trader agent repo valory-xyz/trader pushed 2026-10-16, Apache-2.0, not archived. Market creator repo valory-xyz/market-creator pushed 2026-10-07. H
- Olas's own stats page (as of 2026-10-19 05:20 UTC): Omenstrat 206 daily active agents (7d average), 1,212 agents ever registered; Polystrat 12 daily active agents, 139 registered. H - https://olas.network/agent-economies/predict
- Market creator Safes still transacting today: Quickstart creator `0x89c5cc945dd550bcffb72fe42bff002429f46fec` (79,950 txs, latest 2026-10-19 04:12 UTC) and Pearl creator `0xffc8029154ecd55abed15bd428ba596e7d23f557` (25,183 txs, latest 2026-10-19 04:47 UTC). H - https://gnosis.blockscout.com/api/v2/addresses/{addr}/counters and /transactions (fixtures saved). These are public contract addresses, not user wallets.
- CoinDesk 2026-03-15 claim that Olas agents give retail an edge: not re-verified this session (no search); treat as M/L context only.

## Kind and market model

- kind: onchain-other (agent-activity dashboard over Omen/Gnosis + Polymarket/Polygon). H - olas-predict CLAUDE.md
- Omen leg: **Omen FPMM** (Gnosis Conditional Tokens fixed-product market maker). Binary Yes/No markets; outcome tokens are ERC-1155 conditional tokens; price = FPMM marginal price (the UI reads `marginalPrices` from the subgraph). H - CLAUDE.md "Key Data Concepts" ("FixedProductMarketMaker (FPMM)... Outcome Tokens: ERC-1155... Marginal Prices")
- Polymarket leg: Polymarket CLOB v2, collateral pUSD on Polygon. H - trader README
- Olas market creation: the market-creator agent asks an AI Mech (`propose-question`) to turn news into questions, they go through an approval server, then one multisend deploys an FPMM via `FPMMDeterministicFactory`, adds initial wxDAI liquidity and posts a Realitio question. Topics follow the operator's `TOPICS`/`NEWS_SOURCES`. H - https://github.com/valory-xyz/market-creator README
- Categorical/scalar: none seen; Olas-created Omen markets are binary (INVALID answer = `0xff..ff` handled in UI constants). H/M

## Chains and collateral

- Gnosis Chain (chain id 100): wxDAI (`0xe91d153e0b41518a2ce8dd3d7944fa863463a97d`) as FPMM collateral; xDAI for gas. H - market-creator README, trader README
- Polygon (137): pUSD (wraps USDC.e) for the Polystrat leg. H - trader README
- OLAS token (staking rewards, mech payments) is not trading collateral. H

## Read API

exists: **onchain-or-subgraph-only** for market data; a small **official-public** REST endpoint exists for the agent leaderboard.

- Docs: none for an API. The only documentation is the UI repo's CLAUDE.md. NOT FOUND (searched: olas.network/agent-economies/predict, docs.olas.network landing, GitHub repo files). H
- Public leaderboard (confirmed unauthenticated GET, 200): `GET https://predict.olas.network/api/leaderboard?agentType=omenstrat|polystrat&window=7d|30d|90d|1y&rankBy=roi|pnl&limit=N` (max limit 100, page size 30; `offset` and a `snapshot` consistency param exist; repeated params => 400). Returns `{agentType, rankBy, window, totalRanked, totalResults, offset, limit, updatedAt, agents:[{address, name, rank, notRankedReason, roi, pnl, accuracy, brierScore, avgTradeSize, volume, trades}]}`. Snapshot hourly (updatedAt 2026-10-19T07:00:39Z at fetch). Omenstrat 7d: 93 ranked agents; Polystrat 7d: 15 ranked. H - fixture `docs/research/fixtures/olas-predict/lb-omenstrat-7d-limit3.json`. Also `GET /api/leaderboard/agents` (per-address lookup, up to 50 addresses). Both documented in CLAUDE.md. Contract note: CLAUDE.md says the `agents` response is a cross-repo contract used by the trader, so it should be fairly stable, but it is not a public SLA. M
- Market data comes from The Graph-style subgraphs hosted by Olas (GraphQL over HTTP POST, so NOT exercised here because this session forbids POST): H (URLs from `constants/index.ts`)
  - Omen markets/trades/liquidity: `https://omen.subgraph.autonolas.tech`
  - Agent bets/stats: `https://predict-agents.subgraph.autonolas.tech`
  - Conditional tokens: `https://conditional-tokens.subgraph.autonolas.tech`
  - Gnosis blocks: `https://gnosis.subgraph.autonolas.tech`
  - Mech marketplace: `https://api.subgraph.autonolas.tech/api/proxy/marketplace-gnosis`
  - Polymarket agent bets: an SQD squid (OpenReader dialect); the older Polymarket agents subgraph stopped indexing bets in June 2026. URL is an env var, not published. H/M
  - Mech analytics REST (public, no auth): `/v1/data/scored-rows` (base URL in `constants/leaderboard.ts`, not captured). M
- Auth/limits: none documented; subgraph endpoints behind autonolas.tech are not documented as rate-limited or SLA-backed. For a robust adapter, read Omen directly (Gnosis RPC `getLogs`/multicall on the FPMM contracts, or another Omen indexer) instead of relying on Olas's hosted subgraphs. M
- Websocket: none documented. NOT FOUND.
- Prices/books/trades/resolution: for Omen use subgraph `fixedProductMarketMakers` (marginal prices, liquidity) and `fpmmTrades`; resolution via Reality.eth question state. Specific entity names not verified this session. M

## Trade path

- None through Olas Predict. The UI has no wallet connector, no signing, no `writeContract` (wagmi removed on purpose). H - CLAUDE.md "Viem for read-only blockchain access"
- Trading happens by (a) Olas agents (Safe multisig, Open Autonomy stack, run via Pearl or Quickstart) buying FPMM outcome tokens on Omen or placing CLOB orders on Polymarket; (b) a human or bot interacting directly with the underlying venues. H - trader README
- For this project's aggregator, an Omen adapter (FPMM `buy`/`sell` on Gnosis) or Polymarket adapter is the correct path, not an "Olas Predict" adapter.

## PayBox reachability

paybox_reachable: **no** (for Olas Predict itself). Nothing to sign here. The Polystrat leg is just Polymarket on Polygon (covered by the other workflow). The Omen leg is on Gnosis Chain (chain id 100); Gnosis Chain is not in the PayBox chain list given for this task (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) and I did not call PayBox to check. M

## Fees

- Omen FPMM: LP fee is set per market by the creator at deployment (`MARKET_FEE`, percent); the actual value for current Olas markets was not read (needs a subgraph/RPC call). NOT FOUND (searched: market-creator README). H for "creator sets it", unknown for the number.
- Olas agents' sizing assumes `fee_per_trade` of 0.01 xDAI (Omen) and 0.01 pUSD (Polymarket), per trader README example config. That is the agent's own cost estimate, not a venue fee. M
- Agents also pay AI Mech request fees (not a venue fee). H
- Polymarket fees: see Polymarket spec.

## Resolution and dispute risk

- Omen: Reality.eth (Realitio) crowd-bonded answers with an answer timeout (`MARKET_TIMEOUT`, days) and an arbitration fallback; the UI links questions to a Reality.eth instance on Gnosis (`0x79e32ae0...`). Olas runs a separate `market-resolver` service for resolution. H (README + constants). Risks: bond-based escalation, INVALID resolution (UI handles `0xff..ff`), plus the UI explicitly keeps a `BROKEN_MARKETS` list of 2 markets, showing resolution/market anomalies happen. H
- Polymarket: UMA optimistic oracle (see Polymarket spec).
- Questions are LLM-generated from news and gated by an approval server, so wording/edge-case quality varies; this matters for cross-venue matching. M

## Geo / ToS / automation

- No ToS or geo terms found on the site or in the UI repo (the UI has no wallet flow). NOT FOUND (searched: predict.olas.network HTML, repo README/CLAUDE.md/SECURITY.md names). Underlying venues carry their own rules (Polymarket geoblocks; Omen is permissionless).
- Robots: `User-agent: * Allow: /`. H - https://predict.olas.network/robots.txt
- Leaderboard responses have `cache-control: public`; `agents` endpoint caches 60 s, list 5 min per CLAUDE.md. Polite polling every few minutes is fine. M

## Liquidity (with dates)

- No venue-level volume/TVL figure published for "Olas Predict". NOT FOUND (searched: olas.network stats page, UI repo).
- Scale clues, 2026-10-19: Omenstrat 7d leaderboard of 93 ranked agents shows tiny per-agent flows (top three agents: trades 11-14, volume 7.8-13.1 xDAI each in 7 days; avg trade size 0.56-1.14). Polystrat top two: ~15.5 USDC volume each in 7 days, avg trade ~1.1. H - fixture. So agent-driven flow is on the order of single-digit to low-hundreds of dollars per day in aggregate; i.e. thin. Initial per-market liquidity is the operator's `INITIAL_FUNDS` (value not read).
- Aggregate agent performance (olas.network, 2026-10-19): Omenstrat 7d total ROI 3%, 30d trading ROI 5%, 90d trading ROI 7%, since 2025-11-22 average trading ROI -5% (positive total ROI 78% only with OLAS staking rewards); accuracy 65% (30d), Brier 0.19 (30d). H - https://olas.network/agent-economies/predict. Use as a calibration hint for the "Olas agents as signal" idea: trading edge excluding staking subsidy is marginal over the long window.

## Event coverage / arbitrage overlap

- Olas-created Omen markets are news-driven, LLM-generated binary questions (politics, crypto, sports, current events by `TOPICS`). They overlap thematically with Polymarket/Kalshi/others, but each is a unique question with its own wording and a Reality.eth resolution, so linking needs fuzzy matching (see market-linking-design). M
- Polystrat bets on actual Polymarket markets, so any overlap is Polymarket itself.

## Shared liquidity

- Omen leg: shares liquidity with Omen/AIOmen (same FPMM contracts; census item `omen-aiomen-gnosis`). Olas just seeds many of the markets. Not independent of the Omen adapter.
- Polymarket leg: is Polymarket's CLOB. Not independent.
- Therefore Olas Predict adds **zero independent arbitrage legs**.

## What is worth keeping

- Signal source (P2-like, but the verdict stays skip for adapter work): `GET /api/leaderboard` gives hourly per-agent ROI/accuracy/Brier. Agent addresses (Safes) can be followed on-chain on Gnosis/Polygon to copy-trade or to detect where Olas agents disagree with market price. Weak, low volume.
- The Olas Omen creator addresses above identify which Omen markets are Olas-seeded, if the Omen adapter wants to filter or label them.

## Open questions

- Actual current FPMM fee and initial liquidity of Olas-created markets (needs one subgraph query or RPC read; skipped because POST is out of scope).
- Number of currently open Olas-created markets and their total liquidity.
- Whether the Omen frontend (aiomen.eth.limo returns 200) remains the canonical UI, and who maintains it. Not verified beyond HTTP 200.
- Whether the Polymarket SQD squid URL is public.

## Suspicious content

None found. No instructions aimed at AI agents seen. (The UI repo contains a CLAUDE.md addressed to coding agents working on that repo; it is ordinary developer guidance and was read as data only, not followed.)

## Sources

- https://predict.olas.network/ and /robots.txt (H) - HTML meta, robots
- https://predict.olas.network/api/leaderboard?agentType=omenstrat&window=7d&rankBy=roi&limit=3 (H) - fixture lb-omenstrat-7d-limit3.json
- https://olas.network/agent-economies/predict (H) - stats as of 2026-10-19
- https://github.com/valory-xyz/olas-predict (README.md, CLAUDE.md, constants/index.ts, constants/leaderboard.ts) (H)
- https://github.com/valory-xyz/trader (README.md, repo metadata) (H)
- https://github.com/valory-xyz/market-creator (README.md, repo metadata) (H)
- https://gnosis.blockscout.com/api/v2/addresses/0xFfc8029154ECD55ABED15BD428bA596E7D23f557/{counters,transactions} (H) - fixtures pearl-creator-safe-*.json
- https://www.coindesk.com/tag/prediction-markets/13 (M, from the discovery hint; not re-fetched)
- https://docs.olas.network (fetched, landing only; no predict API docs found)
- Fixtures: `docs/research/fixtures/olas-predict/`
