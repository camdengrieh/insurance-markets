# Resolve (Stellar) - venue spec

Researched 2026-10-19. Read-only; no wallet, no signing, no POST to the venue.
Confidence tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict
SKIP. Stellar TESTNET-only demo with a trivial contract (4 on-chain events total), zero indexed markets, play-money XLM, no mainnet deployment, unaudited. Not an arbitrage leg and not even a useful signal source. Revisit only if a mainnet contract id is announced.

## Liveness [H]
- App https://resolveit-app.vercel.app returns HTTP 200; title "Resolve", "Binary YES/NO prediction markets on Stellar. Settlement is on-chain; the indexer is discovery only." (fetched 2026-10-19).
- Repos resolve-web/{resolve-contract,resolve-sdk,resolve-indexer,resolve-app}: created 2026-09, last pushes 2026-10-09..11. contract release v0.1.0 tagged 2026-10-08 as "Testnet preview". A commit mentions a "Stellar Wave maintainer checklist" (likely a grant/hackathon programme) [M].
- Primary indexer https://resolve-indexer.onrender.com returns 503 "This service has been suspended." Fallback https://resolve-indexer-r4fs.onrender.com/health returns {"status":"ok","cursor":null,"lastIngestAt":null}; /ready returns 503 not_ready (ingest has no cursor); /markets returns {"markets":[],"nextCursor":null}. [H] (fixtures saved)
- Stellar Expert testnet contract stats (api.stellar.expert, 2026-10-19): created 2026-10-08, invocations 5, events 4, errors 0, validation "unverified". [H]
=> Effectively a dormant testnet demo; the production indexer is suspended and the fallback has indexed nothing.

## Kind and market model [H, contract README]
- kind: onchain-other (Soroban smart contract), binary YES/NO only. No categorical or scalar.
- Parimutuel pool: users stake a SEP-41 token on YES or NO; no order book, no AMM, no price discovery before resolution. Implied probability = side pool / total pool (derivable from `yes_pool`, `no_pool`).
- Outcomes are NOT tokenised: positions are internal per-address storage (`get_position`), non-transferable. One address may hold both sides.
- Payout = floor(user_winning_stake * (yes_pool+no_pool) / winning_pool); dust stays in contract. Empty winning side => full refund. Outcome `Invalid` => full refund.
- Staking closes at `close_at` (max 120 days after creation); `resolution_timeout` 1h-30d, then anyone may `invalidate`.
- Anyone can create a market with any `resolver` address and any settlement token.

## Chains and collateral [H]
- Stellar (Soroban) TESTNET only: contract CD3YJNAYKVKT72DYPVS644OPNVNW6673TUIQWGXXA4VQD7536ARWB6MZ (sdk src/networks.ts). Reference settlement token is native XLM SAC on testnet (CDLZFC3S...2HHGCYSC). No mainnet deployment found (NOT FOUND: searched repo READMEs, SDK networks.ts, app .env.example, site).
- Collateral is worthless testnet XLM. Contract is "unaudited" and "not upgradeable in v0.1.0".

## Read API
- exists: unofficial-ish / official-public but empty. docs: indexer README https://github.com/resolve-web/resolve-indexer [H]. No separate docs site.
- Base URLs: https://resolve-indexer-r4fs.onrender.com (live, empty), https://resolve-indexer.onrender.com (suspended). Soroban RPC https://soroban-testnet.stellar.org (contract views get_market/get_position/get_claimable/next_market_id).
- Endpoints [H, README]: GET /health, /ready, /markets?status=&limit=&cursor=, /markets/:id, /markets/:id/positions, /users/:address/positions, /users/:address/activity. Only /health and /markets confirmed live.
- Auth/limits: none documented. Render starter plan (free-tier style cold starts likely [M]). No websocket; indexer polls Soroban getEvents every 5s. Events: market_created, staked (with yes_pool/no_pool), market_resolved, market_invalidated, claimed.
- Indexer README itself says it is "not authoritative" and may lag.
- Note: I sent one JSON-RPC POST (getLatestLedger, read-only method) to the public Stellar testnet RPC while probing; that is a read, but technically an HTTP POST. No state changed.

## Trade path [H]
- Via @resolve-protocol/sdk (GitHub-only install, not on npm) using stellar-sdk AssembledTransaction: simulate, sign (Freighter wallet or Keypair), submit to Soroban RPC. Functions: create_market, stake, resolve, invalidate, claim. Auth = Stellar ed25519 account/auth-entry signature.
- PayBox reachability: NO. PayBox EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon) and Solana cannot sign Stellar transactions; no Stellar network support in scope [M: not verified in PayBox docs this session]. paybox_reachable = no.

## Fees [H]
- No protocol fee in the contract README (winners split the full pool; floor dust retained). Stellar network fees only (testnet, free/faucet). No fee formula to model.

## Resolution and dispute risk [H]
- A single designated `resolver` address per market (chosen by creator) reports Yes/No/Invalid. README: "Resolvers are trusted for timely honest outcomes; economic recourse for bad resolution is off-chain / social." No dispute mechanism, no oracle. Extremely high resolver-risk; any creator can be their own resolver.

## Geo / ToS / automation [L]
- NOT FOUND (searched: site home and /status, repo READMEs, SECURITY.md/CONTRIBUTING listing). Repos are Apache-2.0. No ToS, no geo restrictions, no API automation rules stated.

## Liquidity [H, 2026-10-19]
- Zero indexed markets; on-chain contract has 5 invocations / 4 events lifetime (Stellar Expert). Volume/OI/TVL effectively 0 and testnet-valued at 0 USD.

## Event overlap and shared liquidity
- Categories: user-created arbitrary questions; no evidence of sports/politics/crypto/macro listings. NOT FOUND (no markets). No shared liquidity with another venue; independent, but there is no liquidity to be independent of. Parimutuel payout is also not a tradeable price so it cannot be a clean arbitrage leg (price moves with your own stake, no exit before resolution).

## Adapter priority: skip
Testnet only, empty, parimutuel without exit, single-address resolver, Stellar-only signing unreachable from PayBox.

## Open questions
- Will a mainnet contract and audited v1 appear? Watch resolve-web/resolve-contract releases.
- What is the "Stellar Wave" programme (possible grant that explains the bursty Sept-Oct 2026 commits)? [not researched]

## Sources
- https://resolveit-app.vercel.app and /status (2026-10-19) [H]
- https://github.com/resolve-web/resolve-contract README, releases (v0.1.0 2026-10-08) [H]
- https://github.com/resolve-web/resolve-indexer README, render.yaml [H]
- https://github.com/resolve-web/resolve-sdk README, src/networks.ts [H]
- https://github.com/resolve-web/resolve-app README, .env.example [H]
- https://resolve-indexer-r4fs.onrender.com/health, /ready, /markets [H]; https://resolve-indexer.onrender.com/health (503 suspended) [H]
- https://api.stellar.expert/explorer/testnet/contract/CD3YJNAYKVKT72DYPVS644OPNVNW6673TUIQWGXXA4VQD7536ARWB6MZ [H]
- Fixtures: docs/research/fixtures/resolve-stellar/
