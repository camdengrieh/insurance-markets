# The Situation / Deadeye (Starknet) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

**adapter_priority: skip (at most P2 signal-only, and even that is thin).**

- The hint ("hybrid CLOB with off-chain matching", "Velocitas") is WRONG for this package. It is a Starknet AMM for continuous distributions (normal, lognormal, bivariate, multinoulli), not a CLOB and not binary. (H, npm README + contract list)
- Collateral is **XP**, "a restricted, non-transferable token with no monetary value". Only gas is paid in STRK. So there is no real-money edge to arbitrage, and PayBox cannot "trade" it in any value-bearing sense. (H, deadeye-cli SKILL.md)
- Activity is tiny: 356 events ever, last trade 2026-08-13, ~1,000 units of backing per market, 1 meaningful live market (US CPI Oct 2026). (H, indexer)
- Venue is technically live (indexer up, site up, SDK published 2026-06-30), so it is "live" but as a points/testnet-style game.

## Identity

- Public brand is **Deadeye** (https://deadeye.wtf); npm scope and Cairo repo stack are called "The Situation" ("the-situation stack"). (H: deadeye.wtf `<title>`; deadeye-rs indexer lib.rs says "matching the upstream `the-situation` stack")
- npm `@the-situation/sdk` created 2026-02-04, latest 0.14.1 published 2026-06-30 (H, registry.npmjs.org). Description: "High-level SDK for The Situation prediction markets on Starknet". README: "normal-distribution AMMs ... (`mean`, `variance`, `sigma`)", default network `sepolia`. (H)
- Sibling packages: core, abi, artifacts, utils, collateral, starknet, deployer (all @the-situation/*). Contract set shipped in artifacts: normal, lognormal, skew_normal, bivariate, multinoulli, bounded_loss, funding, policy AMMs, an `insurance` contract and an `asian_option` contract, `restricted_collateral_token`, factory/distribution_factory. (H, artifacts 0.15.0 file listing + release manifest dated 2026-06-04)
- Maintainer publishes a Rust SDK/CLI `deadeye-rs` (GitHub, public, last push 2026-06-25, v0.1.25). The GitHub org/repo `the-situation/the-situation-sdk` linked from npm returns 404 (private or deleted). (H)
- "Velocitas", "hybrid CLOB", "off-chain matching": NOT FOUND (searched: npm registry package metadata for all versions, README, deadeye docs, deadeye-rs README). The first-party WebSearch quota was exhausted, so web-wide search was not possible. Treat the hint as mismatched/hallucinated.

## Market model

- Continuous **distribution markets** (Paradigm-style). State is a parametric distribution (mean mu, sigma). A trade replaces the stored distribution with the trader's posterior; trader posts collateral = worst-case loss `sup_v[lambda_f f(v) - lambda_g g(v)]`; payout at settlement is by the density difference at realised value v*. (H, deadeye.wtf llms-full.txt + glossary)
- Families: `normal`, `lognormal`, `bivariate` (2D e.g. hurricane lat/long), `multinoulli` (categorical grid, e.g. World Cup 48x6 preset or a 36-outcome score market). (H, indexer `marketType` values + SDK worldcup2026 preset)
- No outcome tokens. Positions are on-chain "lots" per trader address with locked collateral; no ERC-20/ERC-1155 share tokens. LP gets shares in `total_lp_backing` plus frozen claim components. (H, docs + starknet README)
- Not an order book. Single AMM curve per market with `k`/`effectiveK` depth. Per-trade policy: sigma ratio cap [sigma/4, 4 sigma], |mu move| <= 4 sigma, sigma floor `k^2/(backing^2 sqrt(pi))`, min trade collateral. (H, SKILL.md)
- Mapping to binary/threshold venues is derived, not native: P(X > t) from the normal CDF at (mean, sigma). That is the only practical cross-venue bridge (e.g. CPI threshold vs Kalshi/Polymarket CPI brackets).

## Chains and collateral

- Chain: Starknet mainnet (`SN_MAIN`) and sepolia. Default RPC in SDK: `https://starknet-mainnet.public.blastapi.io`; deadeye-rs uses a ZAN public RPC. (H)
- Collateral: **XP** (restricted ERC-20, non-transferable, "worthless off-platform", one-shot initial grant via `claim_initial_grant()`). Gas in STRK. (H, SKILL.md "Collateral is XP"; "XP is non-transferable and worthless off-platform").
- Inconsistency: indexer activity `summary` strings say "for 48.1306 STRK"; collateral amounts are 18-decimal. Likely a hardcoded label in the indexer; docs say XP. (M)

## Read API

- Official-ish public unauthenticated REST **indexer**: `https://178-105-210-177.sslip.io` (Caddy, HTTP/2, CORS `*`, GET only). Documented only in the maintainer's `deadeye-rs` crate (`crates/deadeye-indexer`), not in a docs page. Raw IP-based hostname on Hetzner = weak operational maturity. (H for responses; M for "official")
- Endpoints (from client.rs; verified 200 unless noted):
  - `GET /health` (200) -> `{status, uptime, dbStatus, marketsCount:24, eventsCount:356, lastPollAt:null, voyager{...}}`
  - `GET /api/markets` (200, 67 KB, 23 markets) and `GET /api/markets/{address}` (200)
  - `GET /api/markets/{address}/events?page=&pageSize=[&from=&to=]` (200, paginated `{data,total,page,pageSize}`)
  - `GET /api/activity?limit=` (200)
  - listed in client but not tested: `/api/positions/{trader}`, `/api/positions/{trader}/stats|events`, `/api/rankings`, `/api/markets/{m}/traders|lps|lps/{p}/history|multinoulli-snapshots`
  - `GET /api/analytics/overview` -> 200-ish error `{"error":"Analytics warehouse is not configured (set WAREHOUSE_DATABASE_URL)."}` (H) - analytics endpoints are broken.
- Market object fields: address, title, description, category, topics[], marketType, axis labels/units, resolutionSource, resolutionCriteria, `resolution{source,criteria,metric,units,settled,settlement_value}`, isActive, `state{mean,sigma,variance,k,effectiveK,isInitialized,isPaused,isSettled,settlementValue,totalShares,totalBacking (128.128 fixed-point as decimal string; divide by 2^128),fetchedAt}`, `multinoulliState{outcomeCount,probs[]}`, createdAt, updatedAt. (H)
- No book/price endpoint: "price" = (mean, sigma). No trades-by-time ticker beyond events/activity. No websocket found (NOT FOUND: searched client.rs and docs).
- Auth/limits: none observed; no documented rate limit. Docs ask for "RPC etiquette" (empty body = throttled). Voyager (Starknet explorer) API keys back the indexer (`voyager.activeKeyCount:3`). (H)
- On-chain read alternative: Starknet RPC view calls via `@the-situation/starknet` (AMMContract.getDistribution/getParams/getFeeConfig...) (H).
- Docs: https://deadeye.wtf/docs.md, https://deadeye.wtf/llms.txt, https://deadeye.wtf/llms-full.txt (H). Pages: getting-started, trading, lp-strategy, glossary, faq, for-the-forecasters.

Fixtures: `docs/research/fixtures/the-situation-starknet/` (health, markets sample of 3 incl. normal/multinoulli/lognormal, events sample, activity sample).

## Trade path

- On-chain `execute_trade(candidate_mean, candidate_variance, candidate_sigma, x_star, supplied_collateral, hints)` plus ERC-20 `approve` of XP, via a Starknet account multicall (starknet.js v9 / starknet-rs). No signed-order/off-chain matching. (H, starknet README + deadeye-rs)
- Client-side collateral/hint computation is required (SQ128x128 fixed point; `@the-situation/collateral`, `deadeye-optimizer`), and the chain rejects bad sigma/hints.
- The CLI supports `--emit-calldata` for keyless handoff to an external signer (strkd companion wallet adapter). (H, CHANGELOG 0.1.23)

## PayBox reachability

**paybox_reachable: no.** Starknet is not in the EVM/Solana set; the account is a Starknet account contract (Stark curve), and there is no EVM-signed order path. Even with a Starknet signer, collateral is non-transferable XP, so no value could be moved or hedged. (H for XP/Starknet; PayBox network list per task prompt)

## Fees

- `lp_fee_bps` accrued into LP backing on every trade; deposit fee grossed into required collateral; settlement fee in bps **on profit only**, deducted at claim; `getFeeConfig()` returns LP, protocol, settlement bps. Actual bps values: NOT FOUND (searched docs, SKILL.md; on-chain `getFeeConfig()` not queried because that needs a Starknet RPC call and a market ABI). (H for existence, none for values)
- Gas: STRK per tx.

## Resolution

- Market owner/oracle calls `settle(value)`; trading stops; trader lots claim first, then LP. (H, SKILL.md + FAQ). Centralised: single owner/oracle, no dispute window described (NOT FOUND). Resolution criteria are free text per market (e.g. "Printed metric by the BLS."), and some are sloppy ("US Inflation in May (CPI YoY)", `resolutionSource` null).
- Dispute risk: high/unquantified (admin-settled).

## Geo / ToS / automation

- No ToS, geo-blocking or restriction text found on deadeye.wtf docs (NOT FOUND; the SPA shell hides any in-app terms; one WebFetch of the site was blocked by a tool quota so only llms-full.txt/docs.md were read).
- Automation is explicitly encouraged: the `deadeye` CLI ships agent skills, `trade loop`, external-signer handoff. Non-monetary, so regulatory exposure is probably low, but unknown.

## Liquidity (as of 2026-10-19, indexer)

- 23 markets listed (health says 24), 356 events total, last event 2026-08-13T18:38Z (>2 months stale). (H)
- Typical `totalBacking` ~1,000 XP per market (units are fake XP); individual trades 15-48 XP. Most markets are settled/paused (World Cup lognormal "When will X be eliminated", CPI May/June). Live and unsettled: 1 normal (US CPI YoY Oct 2026, mean 3.19, sigma 0.137, backing ~1001), 9 "Hurricane Testing" bivariate markets (dated Jul 21-26 2026, past their valid times, test data), and a World-Cup multinoulli score market (Portugal vs Spain, June 6; stale). (H)
- Volume/TVL in USD: none (XP has no value). 

## Event overlap (arbitrage relevance)

- Only CPI YoY (macro) overlaps real venues (Kalshi/Polymarket CPI markets); sports (World Cup) already finished; hurricane markets are testing. Because stakes are worthless XP, the Deadeye CPI curve is at most a **free crowd/bot forecast signal**, quality unknown (a handful of traders). (H/M)

## Shared liquidity

None - standalone AMM pools. Not an independent *tradable* arbitrage leg because there is no monetary collateral.

## Suspicious content

None found in fetched pages. (The deadeye-cli SKILL.md is agent-targeted instructions; it was read as data only and not followed. It includes an install one-liner `curl | sh` from deadeye.wtf; not executed.)

## Open questions

- Actual fee bps and any mainnet contract addresses for factory/XP token (not in published docs; would require RPC calls).
- Whether XP is planned to convert to a real token/points airdrop (docs say no monetary value).
- Whether /api/analytics will be enabled.
- Whether a future real-collateral version exists; recheck in 3-6 months.

## Sources

- https://registry.npmjs.org/@the-situation%2fsdk (H: dates, versions, description, README)
- https://unpkg.com/@the-situation/sdk@0.14.1/ (README, dist/multinoulli/worldcup2026.js, ProviderLive.js) (H)
- https://unpkg.com/@the-situation/starknet@0.13.2/ (README, dist/providers/base.js network config, oracle.js) (H)
- https://unpkg.com/@the-situation/artifacts@0.15.0/dist/contracts-release-manifest.json (H)
- https://github.com/teddyjfpender/deadeye-rs (README, CHANGELOG, docs/*, crates/deadeye-indexer/src/client.rs, lib.rs, skills/deadeye-cli/SKILL.md) (H)
- https://deadeye.wtf , /llms.txt, /docs.md, /llms-full.txt (H)
- https://178-105-210-177.sslip.io/health, /api/markets, /api/markets/{addr}, /api/markets/{addr}/events, /api/activity, /api/analytics/overview (H, fetched 2026-10-19)
- https://www.npmjs.com/package/@the-situation/sdk returned HTTP 403 to fetch (not read).
