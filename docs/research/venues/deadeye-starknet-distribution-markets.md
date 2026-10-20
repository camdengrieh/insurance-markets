# Deadeye (Starknet distribution markets)

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Collateral is "XP", described by the project's own CLI skill as a restricted, non-transferable token with no monetary value. It is a play-money / points forecasting game, not a real-money venue. There is no cash leg to arbitrage, and the market model (continuous distribution, not binary) does not map onto binary venues.

## Identity and liveness

- Project: Deadeye, "distribution markets on Starknet". Website https://deadeye.wtf (docs at https://deadeye.wtf/docs). H (linked from repo skill; docs index fetched).
- Repo: https://github.com/teddyjfpender/deadeye-rs, created 2026-05-13, last push 2026-06-25, v0.1.25 (CHANGELOG), 1 star, not archived. License field NOASSERTION on GitHub; README says MIT or Apache-2.0. H.
- Last repo activity is about 4 months before today (2026-10-19), so the SDK may be dormant. M.
- Mainnet deployment manifest: contractsVersion 0.13.0, timestamp 2026-06-05, `"markets": []` in the manifest (markets are created via the factory, so the manifest list is not a market list). H.
- Live status NOT CONFIRMED: an unauthenticated GET to the indexer health endpoint was attempted and the permission layer denied it, so I did not retry or work around it. No live response was observed. WebSearch was also unavailable (session budget exhausted). So "still live" rests on repo activity and docs being reachable only. L.
- Not found: any volume/TVL/OI figure, any third-party coverage, any press, any DefiLlama listing (searched: repo, deadeye.wtf docs pages; web search unavailable).

## Market model

- Continuous-outcome "distribution markets": the market stores a probability distribution (e.g. Normal with mean mu and sigma). A trader replaces it with their own posterior; payoff is continuous in the realised outcome. H (deadeye.wtf/docs/trading, repo skill).
- Families: normal, lognormal, multinoulli (categorical), bivariate; also skew-normal, bounded-loss, funding, policy class hashes in the deployment manifest. H (dto.rs `marketType`; deployment-mainnet.json).
- Multinoulli (categorical) is the only family that could map to a discrete-outcome comparison; no evidence found of how many exist. L.
- AMM: single-pool, liquidity scalar k, LPs hold pro-rata shares of residual backing. No order book. H.
- Outcomes are not tokenised as ERC-20 per-outcome shares; a trader holds one position (mean, sigma, collateral locked) per market (with multi-leg lots tracked in the SDK). H (Position DTO, CHANGELOG).
- Prices: no single "probability" quote; for a binary-style comparison one would integrate the market's CDF over a threshold. Needs custom math (Q128.128 on chain, f64 off chain). M.

## Chains and collateral

- Starknet mainnet (SN_MAIN) and Sepolia. H (README, external-signer docs).
- Collateral: "XP", 18 decimals, token address in deployment-mainnet.json. The CLI skill states: "Collateral is XP - a restricted, non-transferable token with no monetary value; only gas is paid in STRK." Each wallet claims a one-shot initial grant via `claim_initial_grant`. H (skills/deadeye-cli/SKILL.md; restricted_collateral_token ABI has operator_mint / operator_transfer / operator_burn and an is_market_registered check).
- Gas in STRK. H.
- Consequence: P&L is denominated in a points token; no USDC or other real-money collateral found. L-M that real-money markets are not planned (nothing found either way).

## Read API

- Official docs: https://deadeye.wtf/docs (concepts only, no API reference seen). Typed client documented in source: `crates/deadeye-indexer` in the repo. H.
- Indexer base URL (per repo constant, Hetzner via sslip.io): `https://178-105-210-177.sslip.io`. H (source), not confirmed live. A bare-IP sslip.io host suggests a single self-hosted instance with no SLA. M.
- Endpoints (from client.rs, H): `/health`, `/api/markets`, `/api/markets/:address`, `/api/markets/:address/events?page&pageSize&from&to`, `/api/markets/:address/traders`, `/api/markets/:address/lps`, `/api/markets/:address/lps/:provider/history`, `/api/markets/:address/multinoulli-snapshots?limit`, `/api/positions/:trader`, `/api/positions/:trader/stats`, `/api/positions/:trader/events`, `/api/rankings`, `/api/activity`, `/api/analytics/overview`, `/api/analytics/domains/:slug`.
- Shape (from dto.rs, H): MarketSummary { address, title, description, category, topics[], marketType, isActive, state{mean, variance, sigma, k, effectiveK, totalBacking, isInitialized, isPaused, isSettled, fetchedAt}, multinoulliState, createdAt, updatedAt }.
- Auth: none in the client (plain GET, 15 s timeout). Rate limits: NOT FOUND. WebSocket: NOT FOUND (client is polling only).
- Alternative: direct Starknet JSON-RPC view calls (distribution, params, lp_info); README example uses a public ZAN RPC. H.
- Fixtures: none saved, because live GETs were blocked in this session. Response shapes above come from the typed DTOs, not from observed responses.

## Trade path

- Programmatic: Rust SDK / `deadeye` CLI; builds Starknet account multicalls (`claim_initial_grant`, ERC-20 `approve`, `execute_trade`), with `--emit-calldata` for external signers and `--dry-run` simulation. H.
- Signing: Starknet account key (local key in `~/.config/deadeye/config.toml`, or env var) or an external wallet companion ("strkd" via `wallet_addInvokeTransaction`). H.
- Trade requires an optimizer (mean, sigma, budget) rather than a simple limit/market order; there is no order book. H.

## PayBox reachability

paybox_reachable: **no**. Starknet is not among the PayBox chains named in the task (Base, Ethereum, BNB, Arbitrum, Polygon, Solana), an EVM wallet cannot sign Starknet transactions, and the collateral token is non-transferable points. Even a Starknet-capable path would yield only play-money exposure. H for chain/collateral facts, M for PayBox chain support (not verified against PayBox this session).

## Fees

- A deposit fee on collateral is mentioned ("sized from the chain's exact requirement (grossed up for the deposit fee)"). Rate, recipient and formula: NOT FOUND (searched: repo README, CLI skill, docs trading and glossary pages, CHANGELOG). The glossary references only a "no-fee" case in an invariant. H for existence, nothing on size.
- Gas: STRK. H.

## Resolution

- An oracle publishes the realised outcome at settlement; the market freezes and positions pay out mechanically; traders resolve first, then LPs against residual backing. H (deadeye.wtf/docs/glossary).
- Who runs the oracle, data sources, dispute process, timing: NOT FOUND. The on-chain "oracle" contract in the repo is a TWAP-style extension (average mean/variance observations, before/after hooks), not an outcome oracle. H (oracle ABI). Resolution is therefore likely operator-trusted. L.
- Market creation appears operator-curated (title, description, category are "operator-set"). H (dto.rs).

## Geo, ToS, automation

- No terms of service, geo restrictions or automation policy found. NOT FOUND (searched: deadeye.wtf landing and docs pages; landing page returned only a title to the fetch tool). Automation is explicitly encouraged: CLI skill is written for agents, with a trading loop and a "forecast" workflow. H.

## Liquidity

NOT FOUND (no volume, TVL, OI anywhere; the indexer `/api/analytics/overview` would provide it but was not fetched). Presumed negligible because collateral is free points. L.

## Event coverage / arbitrage overlap

- Market categories are operator-set; the examples in the docs are generic numeric quantities (sigma/mean scalars). No list of live markets obtained. NOT FOUND.
- Continuous scalar markets overlap poorly with binary venues; at best a threshold probability could be derived and compared, but with no real-money leg it has no arbitrage value.
- Possible use: signal-only (crowd distributions on numeric questions), but with a points-based game and no volume this is a weak signal. M.

## Shared liquidity

None found; self-contained AMM per market. H.

## Open questions

- Is the indexer still up, and how many markets are active? (live GET required, blocked in this run.)
- Any plans for real-money collateral?
- Who operates the settlement oracle?

## Sources

- https://github.com/teddyjfpender/deadeye-rs (README, CHANGELOG, docs/ARCHITECTURE.md, docs/EXTERNAL_SIGNERS.md) - H
- https://github.com/teddyjfpender/deadeye-rs/blob/main/skills/deadeye-cli/SKILL.md - H (XP statement)
- https://github.com/teddyjfpender/deadeye-rs/tree/main/crates/deadeye-indexer/src (client.rs, dto.rs, lib.rs) - H
- https://github.com/teddyjfpender/deadeye-rs/blob/main/crates/deadeye-artifacts/abis/deployment-mainnet.json, restricted_collateral_token.abi.json, oracle.abi.json, release-manifest.json - H
- https://deadeye.wtf/docs, /docs/trading, /docs/glossary - H (fetched via summarising tool, so wording is paraphrase)
- https://deadeye.wtf/ - landing page returned only the title

Suspicious content: none observed in the fetched pages or files (the CLI skill contains instructions aimed at AI agents by design; none were followed).
