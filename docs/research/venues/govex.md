# Govex - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of one public page, `curl` GETs to govex.ai (HTML, robots.txt, one static JS bundle) and to the public backend host `backend-api-v2-mainnet.up.railway.app` (GET /health, /api/daos, /api/proposals), `gh api` reads of the public `govex-dao` GitHub org. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. Third-party/page content treated as untrusted data.

Research limit: the shared WebSearch budget was already exhausted, so there was NO web-search pass (no news, X, or third-party coverage checked). Everything below is first-party (site, GitHub org, backend API) plus the Prediction Index listing.

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/govex/` (`api_daos.json`, `api_proposals.json`, `health.json`).

---

## 0. Bottom line

1. **Not a general prediction market.** Govex is a Sui futarchy / "decision market" governance stack: markets exist only to decide DAO proposals (Reject vs Accept), priced in a DAO's own token. No sports/politics/crypto-price/macro event contracts. (H: govex-dao/decision-markets-v3 README, sdk-v3 docs/PROPOSALS.md)
2. **Wound down.** The only DAO on the production backend is Govex itself (`/api/daos` returns exactly 1 DAO). Its Proposal 11, "Wind Down Govex and Enable USDC Redemption", reached trading 2026-07-20, trading ended 2026-07-22T18:32Z, state `executed`, winning outcome 1 (Accept). Metadata says the LLC is wound up, the govex.ai domain, brand and X account transfer to a third party, and contracts are to be published under MPL 2.0. All 11 historical proposals are `executed`/`finalized`; none is open. (H: backend /api/proposals, fetched 2026-10-19)
3. **Site still serves** (HTTP 200, frontend commits "wind-down banner" 2026-07-24, last commit 2026-10-01 "Update README.md"), and the backend `/health` returns healthy, but there is no live market to trade. Liveness label from Prediction Index ("live", volume n/a) is stale/inaccurate for trading purposes. (H for site/backend; Prediction Index page itself H, but its status is superseded)
4. **No arbitrage value.** No overlapping event categories, a single wound-down DAO, a thin GOVEX/USDC AMM, and conditional markets whose "price" is a governance signal, not an event probability.
5. **adapter_priority = skip.**

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://govex.ai/` | 200; `<title>` "Secure and Manage Sui Assets", description "Sui multisig and decision market platform." React SPA shell | H |
| `GET .../health` on backend | `{"status":"healthy"}` | H |
| `GET .../api/daos` | 1 DAO (Govex, GOVEX/USDC, version v3, `proposal_count` 11, `treasury_stable_balance` 44167772050 raw = ~44,168 USDC at `treasury_updated_at` 1783771613105 ms, i.e. ~2026-07-11) | H |
| `GET .../api/proposals` | 11 proposals; newest (Proposal 11) created 2026-07-18, trading 2026-07-20 to 2026-07-22, executed. None in review/trading | H |
| Proposal 11 metadata | category `dao_wind_down`; offchain resolutions: wind down Govex DAO LLC, transfer domain/brand/X account to a named individual, publish contracts under MPL 2.0; `dissolutionUnlockDelayMs` 604800000 (7 days) | H |
| Frontend repo | commits 2026-07-24 "Expand wind-down banner on mobile" / "Give mobile wind-down panel more room"; latest 2026-10-01 README edit | H |
| Prediction Index entry | binary, Sui, live, volume n/a | H (listing) / stale (status) |

Verdict: **still_live = false** for trading purposes (protocol wound down by its own governance vote 2026-07-22; the website and indexer remain up).

---

## 2. Kind and market model

- Kind: onchain futarchy / decision market (governance), Sui. (H)
- Spot side: constant-product `x*y=k` AMM (Uniswap V2 style) per DAO, asset token vs stable (USDC). (H: dex-aggregator-integration-help.md)
- Proposal market: on proposal start, a configurable share of spot liquidity (`conditional_liquidity_ratio_percent`, 0..99; docs also describe "100% quantum split") moves into one conditional AMM per outcome (`outcome_count` 2..50; observed 2 or 3, labelled e.g. ["Reject","Accept"]). Conditional coins are per-outcome tokens registered per proposal. Winner is decided by TWAP of conditional prices, not by an external event. (H: sdk-v3 docs/PROPOSALS.md, integration doc)
- Not binary-event contracts: prices are of the DAO token conditional on each decision (fixture `prices` ~0.0018 USDC per GOVEX). (H)

## 3. Chains and collateral

- Sui mainnet only. Collateral = DAO stable type (USDC `dba346...::usdc::USDC`, 6 decimals) and DAO asset token (GOVEX, 9 decimals). Package IDs listed in the integration doc (`futarchy_markets_core` `0x9a47...7dd2`). (H)

## 4. Read API

- Exists: **unofficial-ish / app-backend, undocumented as a public API**. Backend base URL appears in the frontend repo README as a recommended env var: `https://backend-api-v2-mainnet.up.railway.app`. (H)
- Docs URL: none for the REST backend. SDK docs (`https://github.com/govex-dao/sdk-v3/tree/main/docs`) mention `GET /launchpads/:id`, `/proposals/:id`, `/daos/:id` for a self-hosted indexer; the production host answers `GET /api/daos` and `GET /api/proposals` (list of full objects), and `/proposals`, `/daos`, `/api/dao/<id>` returned 404. (H)
- Key endpoints confirmed (unauthenticated GET): `/health`, `/api/daos`, `/api/proposals`. Proposal object fields include `state`, `winning_outcome`, `outcome_messages`, `trading_started_at`, `trading_ended_at`, `twaps`, `prices`, `amm_fee_bps`, `protocol_fee_bps`, `escrow_id`, `spot_pool_id`. (H)
- Auth/rate limits/websocket: NOT FOUND (searched: frontend README, SDK docs, response headers not captured). robots.txt on govex.ai says `Disallow: /api/` (applies to the web host; the Railway host has no robots check recorded). (H for robots)
- On-chain reads: Sui fullnode/GraphQL (`https://fullnode.mainnet.sui.io:443`, `https://graphql.mainnet.sui.io/graphql`) per frontend README; spot pool object `UnifiedSpotPool` with `get_reserves`, `simulate_swap_*_accurate`. SDK: npm `govex-sdk-v3`. (H)
- No historical trade feed endpoint identified. NOT FOUND (searched: sdk-v3 docs grep, backend probes).

## 5. Trade path

Programmatic: Sui transactions (PTBs) via `govex-sdk-v3`/`swap_entry` Move functions signed by a Sui (ed25519) key. Not an orderbook, no signed-order API. (H/M)
PayBox reachability: **no** for EVM wallets (Base/Ethereum/BNB/Arbitrum/Polygon). Would need a Sui signer, which PayBox plugin scope does not appear to include. Moot, since markets are closed. (M)

## 6. Fees

- Spot: steady total = LP fee `fee_bps` (cap 500 bps) + 50 bps protocol fee when aggregator-enabled; optional launch decay schedule (up to 9,900 bps over <= 24h, 8 half-lives). Paid by swapper on input. (H: integration doc)
- Conditional AMM fee observed 150 bps; proposal creation fee `dao_proposal_creation_fee` field present (value in fixture). (H)

## 7. Resolution and dispute risk

- TWAP of conditional pools decides Accept vs Reject; Reject can win immediately via TWAP fast path, Accept starts an execution window and then the DAO's staged actions execute on-chain. No external oracle, no dispute process. Risk: price manipulation of thin pools, sponsorship thresholds, unaudited code. (H: PROPOSALS.md; READMEs state "not independently audited")

## 8. Geo / ToS / automation

NOT FOUND (searched: govex.ai HTML/robots, frontend README, TRADEMARKS.md only). Frontend MIT licensed; brand reserved. No stated automation limits. Govex DAO LLC is being wound up, so any ToS is moot.

## 9. Liquidity

- Total volume: n/a (Prediction Index, fetched 2026-10-19). 
- Treasury ~44.2k USDC as of ~2026-07-11 (backend `treasury_stable_balance`); wind-down snapshot projected LP out ~63.6k USDC (proposal metadata, 2026-07-18). Pool is being dissolved; current TVL NOT FOUND. (H/M)
- Shares liquidity with: no other venue; internal spot pool backs the conditional markets (not an independent price for any external event).

## 10. Event overlap / arbitrage value

None. No sports, politics, crypto-price or macro contracts. Only possible use is a signal for GOVEX token price, which is not relevant to this project.

## 11. Priority

**skip**: protocol wound down by governance vote 2026-07-22, no live markets, not event-based, Sui-only.

## Sources

- https://govex.ai/ , https://govex.ai/robots.txt , https://govex.ai/assets/index-F9AQWFrT.js (links to x.com/govex_ai, github.com/govex-dao) - H
- https://predictionindex.xyz/ecosystem - H (listing only)
- https://backend-api-v2-mainnet.up.railway.app/health , /api/daos , /api/proposals - H (fixtures)
- https://github.com/govex-dao/decision-markets-v3 (README, dex-aggregator-integration-help.md) - H
- https://github.com/govex-dao/sdk-v3 (README, docs/FULL_DOCUMENTATION.md, docs/PROPOSALS.md) - H
- https://github.com/govex-dao/frontend (README, commit log) - H

## Suspicious content

None found. (Frontend repo contains a `CLAUDE.md` for its own development; not read or followed.)
