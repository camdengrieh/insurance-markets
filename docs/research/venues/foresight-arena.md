# Foresight Arena (foresightarena.xyz)

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

Not a market. It is an on-chain forecasting competition/benchmark for AI agents on Polygon. Agents submit probability forecasts (basis points) on Polymarket-sourced markets via commit-reveal, scored by Brier and Alpha (vs Polymarket mid-price). No stake, no tokens, no order book, no payout found. It is NOT a tradable venue and NOT an arbitrage leg. At most it is a signal/benchmark source (see below). adapter_priority: skip for trading; P2 at best as an optional signal feed.

## Still live? (H)
- Site returns HTTP 200, SPA (title "Foresight Arena - On-chain benchmark for AI forecasters"). https://foresightarena.xyz/ [H]
- Relayer GET /health returns status ok, chain polygon, relayer balance ~1.40 POL (2026-10-19). Fixture: docs/research/fixtures/foresight-arena/relayer-health.json [H]
- contracts repo last commit 2026-10-06 (merge PR #25); commit messages reference "Round 176" on 2026-10-03, so roughly 170+ rounds run, with rounds closing every few hours (deadlines at 18:00 and 04:58 UTC seen in commit text). https://github.com/foresight-arena/contracts [H]
- sdk repo last push 2026-05-06; org profile 2026-05-02. [H]
- Status: live, beta-ish, actively maintained. Built by ForesightFlow (Research Dept of Devnull FZCO) [H, org profile README].

## Kind and market model
- kind: forecasting-nonmoney / benchmark. Per README: "On-chain prediction competition for AI agents" [H].
- Each round: a curator selects a set of Polymarket markets (round window 48-72 h per org profile). Agent commits keccak256(abi.encodePacked(uint256 roundId, uint16[] predictions, bytes32 salt)), then reveals. Predictions are P(YES) in basis points 0-10000, one per market (binary only) [H].
- Scoring on-chain: Brier = avg((pred - outcome)^2); Alpha = avg(baselineBrier - agentBrier) where baseline = Polymarket mid price at commit deadline posted by curator (fetched off-chain from the CLOB API) [H].
- No outcome tokens, no positions, no prices of its own. Outcomes are read from the Gnosis CTF (payoutNumerators / payoutDenominator) at 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045 on Polygon [H].

## Chains and collateral
- Polygon PoS (chainId 137). No collateral: "No gas required. The relayer pays all transaction costs" [H]. Direct mode costs about 0.003 POL per commit and 0.01 POL per reveal [H].
- Mainnet contracts: RoundManager 0x033C47EdE0030aDf72a4ea6B6B32DC4Bf60d2B5c, PredictionArena 0x9CeD2996d759993B955779aAcA7d399708b9b9D7 [H]. Canonical ERC-8004 Identity 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 and Reputation 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 registries [H].
- Money staked / prizes: NOT FOUND (searched: contracts README, SKILL.md for prize|stake|reward|usdc|payout|fee|money; site meta; org profile). Contracts take no value. Reputation Registry gets curator-posted "campaign feedback" for top performers, which is reputation, not payment [H].

## Read API
- exists: official-public (no auth for reads); writes go via a relayer.
- Docs: https://foresightarena.xyz/SKILL.md (developer docs, 16.8KB) and https://github.com/foresight-arena/contracts README [H].
- Relayer base: https://api.foresightarena.xyz. GET /health, GET /reasoning/{roundId}/{agent} (posted LLM reasoning JSON, whitelist-gated posting) [H]. Confirmed /health live shape (fixture) [H].
- Subgraph (The Graph, GraphQL over POST): free https://api.studio.thegraph.com/query/1745354/foresight-arena/version/latest (about 3K queries/day); keyed gateway https://gateway.thegraph.com/api/{API_KEY}/subgraphs/id/4ybnvA1cDQjRRm1YzhBhaeVAn7XrQFGP9GL44RvwPvx8 [H]. Entities: rounds (roundId, conditionIds, commitDeadline, revealStart, revealDeadline, benchmarkPrices, benchmarksPosted, invalidated, marketCount), agents (gaslessNonce, name), agentRounds (predictions, brierScore, alphaScore) [H]. I did NOT query the subgraph because GraphQL requires POST and the ground rules forbid POST; shape is from docs only [M].
- Polymarket Gamma used for market details: gamma-api.polymarket.com/markets?condition_ids=... (covered by the Polymarket workflow) [H].
- Websocket: NOT FOUND. Rate limits: subgraph free ~3K/day; relayer one commit and one reveal per agent per round [H].
- Aggregator relevance: each round's conditionIds map 1:1 to Polymarket condition IDs, so it is a free curated list of Polymarket markets plus the leaderboard of agent probabilities (after reveal). Agent reveals are public on-chain only after the reveal phase, so they lag and are of limited use as a live signal.

## Trade path
- none. There is nothing to buy or sell. Participation = EIP-712 signed Commit/Reveal messages (domain PredictionArena v1, chainId 137, verifyingContract = PredictionArena) POSTed to the relayer, or direct commit()/reveal() calls [H]. Gasless relayer requires ERC-8004 registration with a Twitter/X-verified voucher [H]. Registration needs a public Twitter post, which is an off-limits action for this research.
- PayBox reachability: partial/not relevant. A PayBox EVM wallet on Polygon could in principle sign the EIP-712 typed data or send direct transactions, but it would earn only a score, never PnL. No reason to integrate for trading. paybox_reachable = partial (technically, no economic purpose).

## Fees
- None to participants (relayer pays gas). Relayer funded by operator [H].

## Resolution and dispute risk
- Trustless relative to Polymarket: outcomes read from the Gnosis CTF, i.e. Polymarket's UMA-resolved results. Dispute risk inherits UMA/Polymarket risk [H]. Trusted curator creates rounds, posts benchmark prices, can call triggerOutcomes (anyone after revealDeadline); admin can invalidate rounds [H]. Unresolved markets are skipped in scoring [H].

## Geo / ToS / automation
- Permissionless, any Polygon address; automation is the point (agents). No ToS, geo-restriction page or terms found (NOT FOUND: searched site HTML, SKILL.md, READMEs; the SPA body was not rendered, so a ToS link inside the SPA could exist) [M]. Source license MIT [H].

## Liquidity
- None applicable. No TVL/volume/OI. Participation scale: round counter around 176 by 2026-10-03 [H, commit message]; agent count NOT FOUND (needs subgraph POST).

## Event overlap and shared liquidity
- Event set is a subset of Polymarket markets (curator picks; categories not documented; "light" selector repo market-light-selection exists, not read). Shares nothing independent: there is no liquidity. Its "market" is Polymarket's price, so it can never be an independent arbitrage leg [H].

## Possible use as a signal source (P2 idea)
- Ranked agent probabilities versus Polymarket benchmark price (Alpha) could be a crowd-of-AI-forecasters signal on a small curated set of Polymarket events. Weak: agent quality unknown, reveals lag, set small. Not worth building before the core venues.

## Open questions
- Active agent count, round cadence, and leaderboard persistence (needs subgraph query by someone permitted to POST).
- Whether any sponsored prize campaigns exist (the Reputation Registry "campaign feedback" hints at contests).
- The SPA may contain ToS or prize info not visible in static HTML.

## Suspicious content
- None observed. SKILL.md is aimed at agents ("Drop this into your agent's context ... read it") but only contains integration docs; nothing was followed. Registration requires publicly tweeting a promo code (social-promotion requirement), not acted on.

## Sources
- https://foresightarena.xyz/ (HTML meta description) [H]
- https://foresightarena.xyz/SKILL.md [H]
- https://github.com/foresight-arena/.github (profile/README.md) [H]
- https://github.com/foresight-arena/contracts (README.md, commit log, license) [H]
- https://github.com/foresight-arena/sdk (README.md) [H]
- https://api.foresightarena.xyz/health (GET, 2026-10-19) [H]
- WebSearch extended: not performed (session search budget exhausted).
- Fixtures: docs/research/fixtures/foresight-arena/relayer-health.json, SKILL.md.head.txt
