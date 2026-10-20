# HackenAI ($HAI / Hackpot / FlashPool) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. HackenAI is not a prediction-market venue. It is a utility token ($HAI, Base) whose "prediction market" is branded "Hackpot": time-boxed HAI staking pools (Atomica "FlashPool" contracts) attached to Hacken/HackenProof "DualDefense" smart-contract audit contests. There are no tradable outcome tokens, no order book, no price, no overlapping event categories, and no trade path an aggregator could use for arbitrage. The DefiLlama hint is confirmed: it is a token, not a venue.

## Is it live?

- hai.hacken.io is up and describes $HAI as the token of the "HAI Group (Hacken)" ecosystem; lists "Prediction market" ("decentralized security prediction market", "the first Cybersecurity Prediction Market") with a single "Learn more" link to hackpot.io; also Real Yield staking ("up to 180% APY ... backed by the Auditor's USDC", promotional), DYOR, hAI App, grants. H - https://hai.hacken.io
- hackpot.io serves only the title "HackPot | Rewards Pools for DualDefense"; no body text/links were extractable (JS app). H (title) - https://hackpot.io
- DefiLlama lists it as category "Prediction Market", chain Base, TVL = 0; only a "staking" figure of about 386 USD (Base-staking) on 2026-10-19; methodology "We count the HAI staked in the Flash Pools contracts". H - https://api.llama.fi/protocol/hackenai , https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/hackenai/index.js
- Pool activity: the Atomica pool list has 92 pools on Base (chainId 8453), 54 flagged `poolShow: TRUE` (the rest are test pools). Newest pool created 2026-07-20 (Push Chain, contest 2026-07-20 to 2026-08-03/04). Record last updated 2026-09-06. Every non-test 2026 pool shown is in phase 2 "Finished". No pool with an end date after 2026-08-04 found, so as of 2026-10-19 there is **no open round** visible. H - https://api.atomica.org/srm-production-v2/v2/pool/list (fixture)
- So: the product exists and ran about 54 rounds from 2024-10 to 2026-08, but is dormant at the moment (about 2.5 months without a new round). M (inference from absence in the list).

## Kind and market model

- kind: other (token + reward-pool staking). Not a binary/categorical/scalar market. H
- Mechanism as observable: Hacken audits a project; HackenProof runs a crowdsourced "DualDefense" bounty on top ("A crowdsourced layer on top of your third-party audit"). A pool on Atomica (pool-v2 contracts, 3 phases: Phase 0 Active = deposits allowed; Phase 1 Locked; Phase 2 Finished = withdraw/claim) takes HAI deposits (min/max cap per pool). Each pool has a USDC `rewards` entry (e.g. 850 USDC for Push Chain Core Contracts, 200 USDC for Neyro, `operatorFee` 0.04 = 4%) and a marketing `ProjectedAPY` field (60%-325% in 2026 pools). H - pool list JSON; https://hackenproof.com/audit-programs/hubz-dualdefense-audit
- What the HAI stakers actually win or lose is **NOT FOUND**: the HackenProof contest pages say the bounty is "denominated in HAI tokens which are staked in FlashPool" and is split among unique Critical issues reported by researchers, but do not state the staker payoff, whether staked principal is at risk, or what "winner: HAI stakers" (value on a few pools) means. (searched: hackenproof Hubz and Push Chain contest pages, hai.hacken.io, hacken.io ecosystem page (403)). H for what pages say, gap otherwise.
- Outcomes are not tokenised. There is no YES/NO share. Pool positions are Atomica pool tokens (18 decimals on recent pools). M

## Chains and collateral

- Base only (chainId 8453). Capital token HAI `0x73E2A6320314883ff8Cc08b53F1460a5f4c47f2c` (8 decimals); reward token USDC on Base. 90 of 92 pools use HAI as capital; 2 use wETH (test pools). H - pool list; DefiLlama
- Audited projects live on other chains (e.g. Neyro on BSC), but the staking is on Base. H

## Read API

- exists: **unofficial-only** (Atomica backend API used by DefiLlama; not documented by Hacken). H that it responds publicly and unauthenticated; M that it is stable.
- Base URL: `https://api.atomica.org/srm-production-v2` . Verified `GET /v2/pool/list` returns HTTP 200 JSON, 393 KB, 92 pools, `access-control-allow-origin: *`. H
- Atomica docs (docs.atomica.org) describe "Atomica Liquidation Markets", with no API reference; llms.txt index at https://docs.atomica.org/llms.txt. H (page read); API docs NOT FOUND. GitHub org https://github.com/Atomica-Core .
- Pool fields: `id` (pool contract), `capitalToken`, `rewards[]` (USDC amount, `ratePerSecond`, `operatorFee`), `phases[]` (caps, `depositAllowed`, `withdrawAllowed`), `activePhase`, `data` (JSON string with `title`, `startDate`, `endDate`, `auditUrl`, `contestUrl`, `rewardPool`, `winner`, `ProjectedAPY`). H
- No order book, trades, or price endpoints (nothing to price). No websocket found. NOT FOUND (searched: Atomica docs landing page, DefiLlama adapter, hai.hacken.io).
- Rate limits/auth: none observed; no documentation. L
- Fixture: docs/research/fixtures/hackenai/atomica-pool-list-sample.json (2 newest pools, 10 KB, trimmed from the full list). All text in it is untrusted third-party data.

## Trade path

- Programmatic: on-chain only. Staking is a contract deposit into an Atomica pool on Base during Phase 0 (and claim in Phase 2). No signed-order API. Contract ABI/method names not read this session. NOT FOUND (searched: DefiLlama adapter, Atomica docs landing page). Not researched further (nothing to arbitrage).
- PayBox reach: paybox_reachable = **partial** in principle. A Base EVM wallet could submit a transaction proposal (approve HAI + deposit into a pool) when a round is open, since this is plain ERC-20 + contract call on Base. There is no prediction-market trade to place, so it does not matter for the plugin. M

## Fees

- Pool `operatorFee` = 0.04 (4%, 1e18 fixed-point value `40000000000000000`) on the 2026 pools inspected. Who pays/how it is applied not documented. M
- HackenProof contest page for Push Chain: "HackenProof is entitled to 10% of rewards as the fee for the triage and other services." H - https://hackenproof.com/audit-programs/push-chain-core-contracts-sc-dualdefense-audit
- No trading fee formula (no trading).

## Resolution mechanism and dispute risk

- Determined by HackenProof/Hacken triage of reported Critical issues (smart-contract theft/permanent lock of user funds only; PoC required; reward split equally among unique issues). Centralized, discretionary; no on-chain oracle or dispute mechanism found. H (contest pages); M for the staker-side effect.

## Geo / ToS / automation

- NOT FOUND (searched: hai.hacken.io, hackenproof contest pages). No ToS read; no geo-block statement observed. Contest rules exclude current or former Hacken employees/contractors; irrelevant for an aggregator.

## Liquidity

- Staking figure about 386 USD (DefiLlama "staking" TVL for HackenAI, 2026-10-19); DefiLlama TVL = 0; HAI mcap about 1.22M USD per the DefiLlama protocol record fetched 2026-10-19. H (DefiLlama API)
- Per-pool USDC reward pools are small (200 to 10,000 USDC; sum of all 54 shown pools about 144k USDC over 22 months). H (computed from pool list)
- Pool `capacityInUsd`/`utilization` mostly 0 and a few tens of USD at most. H

## Event coverage (arbitrage relevance)

- None. Questions are "will auditors find a Critical in project X's contracts", with no overlap with sports, politics, crypto price, macro or other venues. No arbitrage leg and not even a useful signal.

## Liquidity shared with

- Atomica FlashPool contracts (the pool infrastructure), with the Hacken/HackenProof bounty as the underlying. Not shared with any prediction-market venue.

## Suspicious content

- None. Pages contained no text aimed at AI agents. Marketing links titled "For AI Agents" and "Agentic AI Triager" exist on HackenProof pages; they are navigation items, not instructions. Promotional APY claims ("up to 180%", "ProjectedAPY" up to 325%) are marketing, not verified.

## Open questions

- What exactly the HAI staker earns or risks per round (principal-at-risk vs reward-only) is not documented in what I could read.
- Whether a new round will open (dormant since 2026-08-04).
- Atomica pool contract ABI and method names for deposit/claim.
- hackpot.io app content (JS-rendered, not extractable with fetch).

## Not found

- Official API docs, order book, price or trade endpoints, websocket, ToS/geo text, resolution oracle docs, hacken.io ecosystem page (403), WebSearch (session search budget exhausted, so no independent news corroboration).

## Sources

- https://hai.hacken.io (H)
- https://hackpot.io (H, title only)
- https://api.llama.fi/protocol/hackenai and https://api.llama.fi/protocols (H)
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/hackenai/index.js (H, read via gh api)
- https://api.atomica.org/srm-production-v2/v2/pool/list (H, unauthenticated GET)
- https://hackenproof.com/audit-programs/hubz-dualdefense-audit (H)
- https://hackenproof.com/audit-programs/push-chain-core-contracts-sc-dualdefense-audit (H)
- https://docs.atomica.org (H, landing only)
- https://hacken.io/hacken-news/hacken-ecosystem/ (HTTP 403, not read)
