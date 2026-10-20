# Predictify (Stellar / Soroban) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: `gh api` raw file reads of the Predictify-org repos; public unauthenticated GETs to the project's Vercel demo front page and to the stellar.expert public testnet explorer API. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. Soroban RPC was NOT called (JSON-RPC is POST-only). Third-party text treated as untrusted data; nothing in it was followed.

Research limit: the shared WebSearch budget was exhausted, so no web search could be run (no news/mainnet-announcement search). Mainnet absence is therefore "NOT FOUND in the repos and explorer", not "proven absent from the web".

Tags: **H** = read first-hand in a primary source this session; **M** = secondary/inferred; **L** = weak/stale.

Fixtures (<= 50 KB): `docs/research/fixtures/predictify-stellar/` (section 11).

---

## 0. Bottom line

1. **Live only as a fresh testnet prototype (H).** The one deployed contract was created 2026-10-18 15:50 UTC (the day before this probe), has 3 invocations, 15 events, 1 market (an admin smoke-test "Will BTC trade above $100,000 within 30 days?"), 0 balances/TVL, and explorer validation status "unverified". There is no mainnet contract ID anywhere in the repos.
2. **No real money, no users, no liquidity.** Testnet XLM/tokens have no value. Volume in the contract's own `stats_upd` event: `total_volume 0`, `total_bets 0`.
3. **Not tradable from PayBox/EVM.** Stellar/Soroban account (ed25519 G... address, Soroban auth entries), not an EVM or Solana chain.
4. **Read path is chain-only plus an unhosted backend.** Contract has paged read entry points; a REST backend exists as source code only (no deployed base URL found).
5. **adapter_priority = skip.** Testnet-only, hackathon-grade (203 of 900 lib tests are ignored as known-failing; the README says the full contract is 630 KB and cannot be deployed; only a slim build is). Revisit only if a mainnet contract ID with real volume appears.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Repo `Predictify-org/predictify-contracts` | created 2025-03-09, pushed 2026-10-18T16:46Z, not archived, 10 stars, 310 forks, no licence file, description "Soroban smart contracts for Predictify, a hybrid prediction market on Stellar. Live on testnet." Latest commits 2026-10-18 ("Fix lib tests, add slim testnet build, fix on-chain init/market-id bugs, deploy ..."; "ci: fix build errors ..."). Prior commit 2026-08-30. | H |
| README "Deployed (testnet)" | Contract `CCWRJXIUBSMFQ4AF2RXXH3AFBW6MEZG4GK4IYES7C4Z3X4PR6K7VAFHC` on `Test SDF Network ; September 2015`, slim build, 2% fee. No mainnet section. | H |
| stellar.expert testnet API `GET https://api.stellar.expert/explorer/testnet/contract/CCWRJXIUBSMFQ4AF2RXXH3AFBW6MEZG4GK4IYES7C4Z3X4PR6K7VAFHC` | HTTP 200: `created 1792338612` (= 2026-10-18 15:50:12 UTC), `invocations 3`, `events 15`, `errors 0`, `storage_entries 33`, `validation.status "unverified"`. `/value` -> `balances: []`, `total: 0`. | H |
| Earlier test deployments | docs/DEPLOYMENTS.md lists two earlier abandoned contracts ("initialize failed", "create_market trapped on-chain"). The working deployment was literally fixed on 2026-10-18. | H |
| Frontend demo `https://predictify-frontend-livid.vercel.app/` (a default Vercel hostname, not a branded domain) | HTTP 200, `<title>Predictify - Prediction Platform</title>`, `/markets` 200. Contents not inspected for network. Frontend README says it supports Freighter/LOBSTR/xBull/Albedo/Rabet wallets. | H (up), L (what it shows) |
| Mainnet | NOT FOUND (searched: contracts README, docs/DEPLOYMENTS.md, repo description, org repos). `docs/contracts/PAYOUT_SPECIFICATION.md` lists a "Mainnet Configuration" (3% fee, 1.5 XLM creation fee) but that is a config default, not a deployment. | H |
| Product site / docs site | NOT FOUND. Org has no homepage; `predictify-docs` repo is an empty placeholder (last push 2025-03-09, no README). | H |

Verdict: `still_live = true` only in the sense "an actively developed testnet prototype"; **not an operating venue**. Hint ("one of several Stellar/Soroban hackathon prototypes") is consistent. Not checked: other Stellar prediction products (outside scope of this spec).

Org repos (H): `predictify-contracts` (pushed 2026-10-18), `predictify-backend` (2026-10-18, 5 stars), `predictify-frontend` (2026-10-18, 4 stars), `predictify-docs` (2025-03-09), `.github`. A contributor-count of 310 forks with 10 stars suggests contributor-bounty/hackathon-wave forking (M, inference; GrantFox FWC26 campaign is named in the frontend README, H).

---

## 2. Kind and market model

- Kind: on-chain, Soroban smart contract (Stellar), fully noncustodial pool contract. (H, README + lib.rs)
- Model: **parimutuel pool**, not an order book and not an AMM. Payout formula from `contracts/predictify-hybrid/PAYOUT_SPECIFICATION.md`: `payout = (user_bet / total_winning_bets) * total_pool * (1 - fee)`. No tradable shares; a bet is a record in contract storage (`Bet`), not a token. Positions cannot be sold; `cancel_bet` gives a full refund before the deadline. (H)
- Outcomes: market has a `question` and a `Vec<String>` of outcomes (>2 allowed, so categorical); `winning_outcomes` can hold several (tie handling). The sample market uses `yes`/`no`. No scalar markets. (H)
- Price/odds: there is no price. Implied probability = outcome stake / total pool, computable from `get_market` / `get_market_bet_stats`. This is a late-closing payout-odds quantity, not a executable quote: it moves with each bet and you cannot lock it. For an arb scanner it is usable only as a weak signal (M).
- Two entry points for participation: `vote` (stake-weighted community vote used in resolution) and `place_bet` (stake into pool). (H)
- Market creation: `create_market(admin, ...)` takes an `admin` Address and calls the admin check; sample market created by the deployer key. Whether ordinary users can create markets in the deployed build: NOT FOUND (frontend claims "Anyone can create prediction markets"; the contract signature suggests admin only). (M)

## 3. Chains and collateral

- Chain: Stellar testnet only (Soroban SDK 25). Mainnet NOT FOUND. (H)
- Collateral: Soroban token interface; "any Stellar asset (USDC, custom token, XLM)" via a global/per-event allowed-asset registry (contracts README). Deployed instance was `initialize`d with `allowed_assets null` (default). Which asset the testnet instance actually uses: NOT FOUND (the explorer shows zero balances). (H for design, NOT FOUND for deployment)
- Creation fee 1 XLM (testnet), 1.5 XLM mainnet default. (H, spec doc)
- Contract size: Stellar caps WASM at 128 KiB; the full contract compiles to ~630 KB and cannot be deployed; deployed "slim" build is 128,890 bytes and omits analytics, recovery, monitoring, upgrade, many query functions. (H, docs/DEPLOYMENTS.md)

## 4. Read API

Exists: `onchain-or-subgraph-only` (plus unhosted backend source).

- **Soroban RPC (testnet):** `https://soroban-testnet.stellar.org`, JSON-RPC (`simulateTransaction`, `getEvents`, `getLedgerEntries`). Needs POST; **not called**. Documented in docs/DEPLOYMENTS.md. (H)
- **Contract read entry points in slim build (H):** `get_market(market_id: Symbol) -> Option<Market>`, `get_all_markets_paged(cursor: u32, limit: u32) -> PagedMarketIds`, `get_market_bet_stats(market_id) -> BetStats`, `get_bet`, `has_user_bet`, `get_event`, `get_balance`, `get_contract_version`, `capabilities() -> u64` (bitmap of 26 documented bits, e.g. bit 4 BETTING, bit 5 DISPUTES, bit 6 ORACLE_INTEGRATION). TypeScript bindings via `stellar contract bindings typescript --network testnet --contract-id <ID>`.
- **Public explorer REST (confirmed by GET, unauthenticated):** `https://api.stellar.expert/explorer/testnet/contract/<ID>` (summary), `.../<ID>/events?order=asc&limit=N&cursor=...` (decoded topic names plus base64 XDR bodies), `.../<ID>/value` (balances). `/storage` -> 404 "API endpoint was not found". Rate limits for stellar.expert not documented in what I read: NOT FOUND. This is a third party, not Predictify. (H)
- **Event topics seen (H):** `adm_role`, `adm_init`, `adm_act`, `contract_initialized`, `platform_fee_set`, `mkt_crt` (topics `["mkt_crt","mkt_5cae97f9_0"]`), `stats_upd` (payload: `active_markets`, `total_bets`, `total_volume`), `market_audit_entry_appended`, `gas_used`.
- **Backend (`predictify-backend`, source only):** Express/Postgres/BullMQ indexer exposing `GET /api/markets`, `/api/markets/search`, `/api/markets/{id}`, `/api/markets/featured`, `/api/markets/{id}/prediction-count`, `/api/leaderboard`, `/health`, `/api/indexer/health`, OpenAPI at `/openapi.json`, wallet-JWT auth (`/api/auth/challenge`, `/verify`). Paths read from `openapi.yaml` in the repo. **No deployed base URL found** (README documents `http://localhost:3001`). Frontend demo's backend URL: NOT FOUND. (H for source; hosted instance NOT FOUND)
- Auth/limits: none for chain reads; contract has an in-contract rate limiter for writes. WebSocket: NOT FOUND (Soroban RPC has no WS push; polling `getEvents`). (H/M)

## 5. Trade path

- Programmatic: yes in principle, as a Soroban transaction signed by an ed25519 Stellar key (`user.require_auth()` on `place_bet(user, market_id: Symbol, outcome: String, amount: i128, max_fee_bps: i128)`; `vote(user, market_id, outcome, stake)`; `dispute_market(user, market_id, stake, reason)`; `claim_winnings(user, market_id, claim_nonce: u64)`; `cancel_bet`; batch bet). There is no signed-order / off-chain matching: every action is an on-chain tx. (H, lib.rs)
- Note `place_bet` signature in lib.rs has `max_fee_bps` while the contracts README example does not: docs drift. (H)
- Documented known hazard: ~26 ignored tests fail because code calls `require_auth()` twice for the same address in one frame, "a real runtime hazard" (docs/TESTING.md). So some entry points may trap in simulation on-chain. (H)

## 6. Reachable through PayBox?

**no.** Stellar is not an EVM chain; accounts are ed25519 `G...` keys and calls require Soroban auth entries and Stellar-XDR transactions. A PayBox EVM wallet (Base/Ethereum/BNB/Arbitrum/Polygon) cannot sign or propose one. Whether PayBox supports Stellar at all: NOT FOUND in this session (not checked with PayBox tools by instruction; the task list of chains does not include Stellar). Moreover the venue is testnet-only, so there is nothing real to trade. (M)

## 7. Fees

- Platform fee 2% testnet / 3% mainnet default, in bps, applied **to winnings** only (not to losing stakes or refunds), paid by winners, accrues to the contract fee vault (`collect_fees`), admin withdraws on a 7-day timelock (`withdraw_fees`, cap 100% per window by default). Min fee 0.1 XLM / max 100 XLM testnet (0.2 / 200 mainnet). Market creation fee 1 XLM. The README says payout is `(user_bet / total_winning) * total_pool * (1 - fee)`, which would apply the fee to the whole pro-rata payout, while the spec text says "fee taken from winnings": an internal ambiguity. (H, both docs)
- Soroban network fees (XLM) on every tx: amounts NOT FOUND. (H)
- Stellar testnet instance fee at deploy: 2% (`platform_fee_percentage 2`). (H)

## 8. Resolution and dispute risk

- "Hybrid": oracle-based resolution with community vote blend (README: 70% oracle / 30% community), Reflector (contract `CALI2BYU2JE6WVRUFYTS6MSBNEHGJ35P4AVCZYF3B6QOE3QKOB2PLE6M` per README) and Pyth feeds (BTC/USD, ETH/USD, XLM/USD); 60 s staleness, 5% confidence limit, 66% oracle consensus threshold; fallback oracle config; `resolve_market_manual(admin, ...)`; `resolve_market`. Dispute: stake-weighted, 24 h extension, `dispute_window_seconds` / `dispute_stake_floor` per market; claim windows and admin sweep of unclaimed payouts (`set_treasury`). (H, READMEs + THREAT_MODEL.md)
- Risk (H/M): the only deployed market's oracle address is a placeholder (the admin account), so it can only be resolved manually by the admin (docs/DEPLOYMENTS.md says so explicitly). Admin/multisig roles can force-resolve (`/api/admin/force-resolve` in backend, `resolve_market_manual` in contract). The contract is unverified on the explorer, and tests are partly red. No external audit report found: the audit checklist document mentions a "Quarterly External Audit" as a process item only. Treat all outcomes as admin-decided.

## 9. Geo / ToS / automation

NOT FOUND: no terms of service, no geo restriction text, no API usage policy in the repos or demo front-page title (searched: three repos' READMEs, docs index). Permissionless contract; automation is not prohibited by anything I found, but also not endorsed. (H for absence in what was read)

## 10. Liquidity and overlap

- Liquidity: **zero** (H). Explorer: balances `[]`, total 0 USD, 3 invocations; on-chain stats `total_volume 0`, `total_bets 0` as of 2026-10-18 (`stats_upd` events, fixture). Even in principle the funds are testnet tokens with no value.
- Event categories: the only market is BTC price above $100,000 in 30 days (crypto price), which overlaps Polymarket/Kalshi/Limitless crypto-price ladders; frontend lists sports/politics/crypto categories generically. No live overlap at present. (H)
- Shared liquidity: none; independent contract. Not an arbitrage leg: parimutuel odds are not executable quotes and no capital sits in it. (M)

## 11. Fixtures saved

- `docs/research/fixtures/predictify-stellar/stellar-expert-contract-summary.json` (350 B): explorer contract summary, fetched 2026-10-19.
- `docs/research/fixtures/predictify-stellar/stellar-expert-contract-events.json` (9.8 KB): the 15 contract events (init, admin roles, `mkt_crt`, `stats_upd`) with base64 XDR bodies. Contains only the project's public testnet deployer address, no personal data.
- No Predictify-hosted API exists to sample; no backend instance found.

## 12. Adapter notes (if ever revived)

Adapter would read `get_all_markets_paged` then `get_market`/`get_market_bet_stats` by simulation (Soroban RPC `simulateTransaction`, read-only) or index `getEvents` topic `mkt_crt`/bet events. Normalise as a **parimutuel** market with `implied_prob_i = pool_i / total_pool` flagged `executable=false`, `venue_risk=admin_resolution`, `network=testnet`. Gate on: a mainnet contract ID appearing in README/DEPLOYMENTS.md, an explorer "verified" status, and `total_volume` > a few thousand USD.

---

## Sources

1. https://github.com/Predictify-org/predictify-contracts (repo metadata via `gh api`; README; docs/DEPLOYMENTS.md; docs/CAPABILITIES.md; docs/TESTING.md; docs/README.md; docs/security/THREAT_MODEL.md; docs/security/AUDIT_CHECKLIST.md; contracts/predictify-hybrid/README.md; contracts/predictify-hybrid/PAYOUT_SPECIFICATION.md; contracts/predictify-hybrid/src/lib.rs) - H
2. https://github.com/Predictify-org/predictify-backend (README, openapi.yaml, .env.example) - H
3. https://github.com/Predictify-org/predictify-frontend (README) - H
4. https://api.stellar.expert/explorer/testnet/contract/CCWRJXIUBSMFQ4AF2RXXH3AFBW6MEZG4GK4IYES7C4Z3X4PR6K7VAFHC (+ `/value`, `/events`, `/storage` 404) - H (third-party explorer)
5. https://predictify-frontend-livid.vercel.app/ and `/markets` (HTTP 200 and `<title>` only) - H for up-status
6. https://stellar.expert/explorer/testnet/contract/CCWRJXIUBSMFQ4AF2RXXH3AFBW6MEZG4GK4IYES7C4Z3X4PR6K7VAFHC (explorer link from the repo, not fetched)

Not searched: web search budget exhausted, so no press/social/mainnet-announcement search.
