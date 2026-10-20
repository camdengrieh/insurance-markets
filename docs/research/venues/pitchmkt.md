# PitchMKT (PitchMkt) - venue spec

Researched 2026-10-19. Read-only: public GETs and public GitHub files only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

**adapter_priority: skip** (re-check when mainnet launches). It is a testnet-only, football-matchweek parimutuel pool (Spanish "quiniela" style), not a tradable market with prices. Mainnet is not live, there is no secondary market, no order book, no odds until the pool closes, and no per-event price that can be compared to another venue. Test USDC is a faucet token with no value.

## Liveness [H]

- Landing site https://pitchmkt.xyz ("The first prediction market on HyperEVM", (c) 2026) and docs https://docs.pitchmkt.xyz (last updated 2026-09-06) are up (HTTP 200, 2026-10-19).
- The app at https://test.pitchmkt.xyz is wired to **HyperEVM Testnet (chain id 998)** only. App JS config has only `anvil` (31337) and `hyperevmTestnet` (998) chains, default chain `hyperevmTestnet`, and the "stablecoin" is a `FaucetStablecoin` ("mUSDC"). Source: bundled JS from https://test.pitchmkt.xyz/_next/static/chunks/ (public static assets, read only).
- Roadmap (https://docs.pitchmkt.xyz/roadmap, via WebFetch): Phase 1 "Protocol on Testnet" all shipped; Phase 2 (Squads, full app) nothing marked shipped; Phase 3 "Mainnet Launch" nothing shipped; "Specific dates are not published"; audits not mentioned. [H]
- Homepage says "Launch app" -> test.pitchmkt.xyz and "Open ->" for App = test.pitchmkt.xyz. There is no mainnet app. [H]
- On 2026-10-19 `GET /api/matchweeks?status=live` returns `[]` and the page shows "No active matchweek". Latest testnet matchweeks have prediction deadlines 2026-09-11/12 (past) and still have status `open` (never closed out on the server), so the testnet has been idle ~5 weeks. [H]
- GitHub org https://github.com/pitchmkt (created 2025-09-25, 0 followers, 2 repos; `protocol` last pushed 2026-09-06). [H]
- Web search (extended) found only the test subdomain; no press, audits, team info, or volume data. [H for absence, searched: "PitchMKT quiniela HyperEVM football matchweek pool"]

## Kind / market model

- Kind: parimutuel pool, peer-to-peer, on-chain (smart-contract escrow). Status: public testnet / beta. [H]
- One "matchweek" = 10 football fixtures (home/draw/away). A prediction picks 1, 2 or 3 outcomes (bitmask) per match; each combination covered is a "column". Columns = 2^doubles x 3^triples; cost = columns x unit price. Unit price is a compile-time constant of **2 USDC** (`UNIT_PRICE = 2 * 10**6`, 6 decimals). [H] https://docs.pitchmkt.xyz/columns ; contract src/MarketConfig.sol
- Not binary/categorical per-event market; there are no outcome tokens. A prediction is a record (`predictionId`) in the Matchweek contract, not a transferable token (no ERC-20/1155 evidence found; Matchweek.sol exposes `submitPrediction`, `claimPrize`, `claimRefund`). [H] for functions, M for "not transferable".
- Tiers (share of the pool after fee): 10/10 = 31%, 9/10 = 15%, 8/10 = 15%, 7/10 = 15%, 6/10 = 19%; under 6 = nothing. Within a tier, payout is proportional to winning columns. Empty-tier share goes to a global "carry pool" that is added to the 10/10 prize in later weeks. 31+15+15+15+19 = 95, plus 5% fee = 100. [H] MarketConfig.sol, docs how-it-works
- Squads (group buy-ins behind a leader with commission) are on the roadmap, not shipped. [H]
- Leagues exposed by API: Premier League, La Liga, Bundesliga, Serie A, Ligue 1, World Cup. [H] fixtures/pitchmkt/leagues.json

## Chains and collateral

- HyperEVM. Testnet chain id 998 (native HYPE for gas). Collateral: 6-decimal stablecoin. Testnet = FaucetStablecoin mUSDC (worthless). Mainnet plan = "USDC on HyperEVM" (site footer). Mainnet chain id would be 999 (M, standard HyperEVM; not stated by PitchMkt). [H/M]
- Testnet contracts (public, from https://github.com/pitchmkt/protocol README, also in app JS): PitchMkt factory `0xec06BB490764488b6D8A4C5D81674198016586a8`, CarryPool `0xad4d2692D15f9cEa0B4e5880668A5329C6FD79d9`, Treasury `0x8E60099712Fd21206E2eA491D8Bdf77dD3D7B03C`, Disputes `0xd69cfF5eCca7F42ee8C53BA4750b44f4B5039D73`, mUSDC `0xE9cFFc7B62549b8a1bCf564c625A44C82C449b0e`. Each matchweek is its own contract (address in API `contractAddress`, e.g. `0x22C3186237DB19cc8e89fd1f125F1cb006e5501d` for onchainId 9). No mainnet addresses published. [H]
- Auth in the web app uses Privy / wallet connect (RainbowKit, SIWE-style `/api/auth/nonce|verify|session`) bundled in JS. [H] for presence.

## Read API

- Exists: **unofficial-ish / undocumented first-party JSON API** that serves the web app; no published API docs found (docs site has no API page; searched docs nav: Overview, How it works, Columns, Squads, Carry pool, Results & Disputes, Treasury, Roadmap, Milestones). Classify as `none` for official docs; on-chain reads (contract view functions + events) are the reliable path. [H]
- Base URL: https://test.pitchmkt.xyz (same-origin `/api/...`). No production API host exists yet (https://pitchmkt.xyz/api/leagues returns the marketing HTML, not JSON). [H]
- Endpoints confirmed with unauthenticated GET (2026-10-19):
  - `GET /api/leagues` -> `[{"id":"pl","name":"Premier League","sortOrder":0}, ...]` (fixture leagues.json)
  - `GET /api/matchweeks?status=live|open|closed|awaiting` -> array of matchweeks `{id, leagueId, name, onchainId, contractAddress, status, predictionDeadline, externalMatchday, createdAt, distributed, matches:[{id, matchweekId, homeTeam:{id,leagueId,name,sortOrder}, awayTeam, kickoff, sortOrder, outcome}]}`; `outcome` is null until published, then `H`/`D`/`A` (seen `A`). (fixtures matchweeks_status_open.json, _closed.json, _live.json = `[]`)
  - `GET /api/matchweeks` without status -> 400 `{"error":"Only status=live, status=open, status=closed, status=awaiting, status=pendingResults, status=pendingDistribution or status=distributed is supported"}`; `pendingResults|pendingDistribution|distributed` -> `{"error":"Admin authentication required"}`.
- Endpoints seen in app JS but not fetched (need wallet/session or a matchweek id): `/api/column-shares?matchweek=<onchainId>` (share of each outcome per match, i.e. crowd distribution), `/api/predictions?wallet=&matchweek=`, `/api/predictions/claimable?wallet=`, `/api/auth/*`, `/api/volume/register`. Other `/api/orders|positions|history` strings in the bundle look like leftover template code (M).
- Pool size: read on-chain from the Matchweek contract (`predictionCount`, `totalStaked`, `decimals` view calls used by the UI). [H]
- Auth/limits: public GETs need no auth; rate limits NOT FOUND. Websocket: NOT FOUND. Requests went via Cloudflare/OpenNext.
- Staleness caveat: testnet fixture data looks seeded (e.g. Sep 2026 "open" weeks long past deadline).

## Trade path

- Programmatic: direct contract call only. `Matchweek.submitPrediction(uint8[10] masks)` after approving the stablecoin to the matchweek contract; no signed-order / off-chain order scheme exists (parimutuel). `claimPrize(predictionId, columnsPerTier, merkleProof)` where the Merkle root is committed by the admin; proofs presumably served by the API (`/api/predictions/claimable`) (M). Refund via `claimRefund`. [H] src/Matchweek.sol function list.
- Admin-only: `PitchMkt.createMatchweek` (onlyOwner), `publishResults`, `commitDistribution`, `Disputes.confirmDispute/rejectDispute` (onlyOwner). Owner is a single `Ownable` address in code; docs say a multisig admin group publishes results (consistency unverified). [H] code, M for multisig claim.
- PayBox reachability: **no today**. PayBox wallets/networks (Base, Ethereum, BNB, Arbitrum, Polygon, Solana ...) do not include HyperEVM as far as known (M, not verified against PayBox this session), and only testnet exists. If HyperEVM were supported, a transaction proposal (ERC-20 approve + `submitPrediction`) would be possible; no signed-order path. Rated `no`.

## Fees [H]

- 5% protocol fee on the matchweek pool (`PROTOCOL_FEE_PCT = 5` / 100), taken from the pooled stake at distribution, borne pro rata by all entrants, sent to the Treasury (https://docs.pitchmkt.xyz/treasury, WHITEPAPER.md). Carry pool is NOT funded by the fee. No gas-free path; gas in HYPE.
- Dispute bond: 50 USDC (`DISPUTE_BOND`); forfeited to treasury if rejected.
- Effective rake for a bettor: 5% plus the implicit cost of 6/10 tier skew (no money back under 6 correct).

## Resolution and dispute risk

- Admin group publishes 10 outcomes on-chain with a reference to "the official source (league or broadcaster data)". 12-hour dispute window (`DISPUTE_WINDOW`), anyone can dispute with a 50 USDC bond + evidence hash. [H]
- Dispute adjudication is by the contract **owner** (`confirmDispute`/`rejectDispute` are `onlyOwner`); docs do not say who judges. If unresolved for 3 days (`RESOLUTION_TIMEOUT`), anyone can trigger `refundAfterTimeout`. If results are not published within 3 days (`PUBLISH_TIMEOUT`) participants are refunded. Claim window 30 days; unclaimed goes to carry pool. [H] DisputeConfig.sol, MarketConfig.sol
- Centralisation risk: admin controls match list, results, prize Merkle root (`commitDistribution`) and treasury withdrawals. Not independently verified/audited; no audit mentioned. [H for code/docs, absence of audit searched in docs + web]

## Geo / ToS / automation

- NOT FOUND: no terms of service, geo-block or eligibility page on docs or app (searched docs nav, homepage, how-it-works). Repo licence: Business Source License; "Use in test and development environments is freely permitted. Production use requires a separate licence from PitchMkt" (converts to GPL v3 four years after mainnet). [H] https://github.com/pitchmkt/protocol (README). No stated API automation rules.
- Legal exposure: fixed-odds-free pooled football betting (pool betting). Likely regulated as gambling in many jurisdictions (M).

## Liquidity

- Mainnet: none (not launched). Testnet: valueless mUSDC. Search-snippet of a test page showed a single "32 USDC" pool on Matchweek 4 (L, undated snapshot). Current: no active matchweek, 0 live pools (2026-10-19). Pool figures from `/api/column-shares` and on-chain `totalStaked` could be sampled, but test tokens carry no information about real liquidity.
- Unit price 2 USDC with 59,049 max columns means pools are expected to be small relative to Polymarket/Kalshi (M).

## Event overlap / arbitrage

- Underlying events: weekly top-5-league football 1X2 results, so conceptually overlap with sports books and Polymarket/Kalshi/Limitless football 1X2 markets (M). But the product is a 10-match all-or-nothing combinatorial pool with a tiered payout: single-match odds cannot be extracted from a pool before close; the closest signal is `/api/column-shares` crowd distribution per match (the share of columns on H/D/A), a sentiment signal, not a price. No cross-venue arbitrage leg (cannot sell, no continuous prices, 5% rake, parimutuel dilution). Signal-only at best, and only if mainnet launches with real volume.

## Shared liquidity

None. Independent pool contracts on HyperEVM; does not route to any other venue. But also not an arbitrage leg.

## Suspicious content

None. Third-party JS bundles (Privy, WalletConnect/Reown, RainbowKit) contain a WalletConnect `projectId` and a QuickNode testnet RPC URL with an embedded token; neither is copied here. No AI-directed instructions seen.

## Open questions

- Mainnet launch date and whether the production API will be at a different host.
- Whether PayBox supports HyperEVM (chain 999) at all.
- Who actually controls the owner/admin key and whether it is a multisig.
- Real-money terms/geo restrictions at mainnet.

## Sources

- https://pitchmkt.xyz (landing, H)
- https://test.pitchmkt.xyz and its `/api/leagues`, `/api/matchweeks?status=...` (H); JS chunks under /_next/static/chunks/ (H)
- https://docs.pitchmkt.xyz/how-it-works, /columns, /disputes, /treasury, /roadmap (H, fetched via WebFetch summarizer; figures cross-checked against contract constants)
- https://github.com/pitchmkt/protocol : README.md, WHITEPAPER.md, AGENTS.md, src/MarketConfig.sol, src/DisputeConfig.sol, src/Matchweek.sol, src/Disputes.sol, src/Treasury.sol, src/PitchMkt.sol (H, read via gh api raw; not cloned or executed)
- https://api.github.com/users/pitchmkt (org metadata, H)
- WebSearch "PitchMKT quiniela HyperEVM football matchweek pool" (only hit was test.pitchmkt.xyz; L)
- Fixtures: docs/research/fixtures/pitchmkt/ (leagues.json, matchweeks_status_open.json, matchweeks_status_closed.json, matchweeks_status_live.json, matchweeks_no_status_error.json)
