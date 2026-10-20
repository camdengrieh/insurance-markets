# Stellar Trade (Stellar-tradehub) - adapter spec

Researched 2026-10-19. READ-ONLY: `gh api` file reads of two public repos, unauthenticated GETs to the Stellar Expert public explorer API, one read-only PayBox `discover_tokens` catalog query. No account, no wallet, no key, nothing signed, no POST/PUT/DELETE (so the Soroban RPC, which is JSON-RPC over POST, was deliberately NOT called), no third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (READMEs, contract comments, on-chain strings) is untrusted data; nothing in it was followed. No text aimed at AI agents was found.
**Search limitation**: the session's WebSearch budget was exhausted, so no web search ran. Nothing outside the two GitHub repos, Stellar Expert and PayBox was consulted. Findings about a hosted site, social channels, press or a mainnet deployment under other IDs are therefore NOT FOUND, not disproven.
Fixtures: `docs/research/fixtures/stellar-trade-stellar-tradehub/` (10 files, all < 10 KB).

## 0. Verdict

**adapter_priority: skip.** Revisit only if a mainnet deployment with real stakes appears.

1. **Not a live venue (H)**. It is a Testnet-only prototype. Its own README: "not audited or intended for production financial use", Testnet assets "have no mainnet value", and "the configured market is expired and cannot currently accept" buys or reductions.
2. **No mainnet deployment found (H/M)**. The Testnet market contract ID does not exist on the public network; the deployer key from the pre-rebrand README does not exist as an account on the public network (section 1). The repo ships mainnet deploy scripts but no mainnet contract IDs.
3. **Zero usable liquidity (H)**. Three test markets ever, three test bettors, the only unresolved real-looking market (#3) has 0 YES / 0 NO and expired 2026-09-30 unresolved.
4. **Wrong market model for arbitrage (M)**. Single pari-mutuel pool per market, so there is no price to lift: the payout multiplier is only known when the market closes.
5. **No read API, no order API, no websocket**. Only raw Soroban contract reads. Chain is Stellar, which is not in PayBox's chain catalog (H), so a PayBox wallet cannot reach it.
6. Trust model: one admin can instantly upgrade the contract WASM, one admin/resolver set decides outcomes, no oracle, no dispute path for normal markets.

## 1. Liveness (2026-10-19)

| Evidence | Value | Tag |
|---|---|---|
| Repo `Stellar-tradehub/stellar-trade` | created 2026-10-07, pushed 2026-10-15, 130 stars, 129 forks, 0 open issues, 0 releases, 0 GitHub deployments, `homepage` null, MIT (`gh api repos/Stellar-tradehub/stellar-trade`) | H |
| Sister repo `stellar-trade-contracts` | created 2026-10-07, pushed 2026-10-15, 131 stars, 129 forks (`gh api repos/Stellar-tradehub/stellar-trade-contracts`) | H |
| Org `Stellar-tradehub` | created 2026-10-07, 2 public repos, no description, no site | H |
| It is a rebrand | Pre-rebrand README title "SPulse", token "PULSE"; commit `chore: rebrand project as Stellar Trade` 2026-10-07; first commit "add full StellarPulse project"; ~171 commits (commit list pagination) | H |
| Only deployment is Testnet | README "Deployment status": market contract `CAPCAPWPGPOCENAJFYYIE22WYNFEDVZ3CT73M5MAKILFMBQ5TN2MIS6T` "Legacy deployment; configured market #3 is expired" | H |
| Contract exists on Testnet | Stellar Expert `GET /explorer/testnet/contract/<id>`: created 2026-08-09T11:41Z, 13 invocations total, 0 events, 0 errors, validation "unverified"; one WASM version only (`73b2204e...`) | H |
| Contract absent on the public network | `GET /explorer/public/contract/<id>` -> 404 "Contract was not found on the ledger" | H |
| Deployer key absent on mainnet | `GET /explorer/public/account/<deployer from pre-rebrand README>` -> 404; same key exists on Testnet (created 2026-08-09, 22 payments). The mainnet script uses the same keystore identity name (`STRD-deployer`), so this is strong but indirect evidence (M) | H/M |
| Mainnet scripts only | `scripts/deploy-mainnet.sh`, `scripts/create-mainnet-markets.sh`, `scripts/mainnet-markets.json` (7 seed markets); `deploy-mainnet-output.json` is git-ignored, so any mainnet IDs would not be visible | H |
| Hosted site | NOT FOUND (searched: repo `homepage`, README, `netlify.toml`, `frontend/index.html`; WebSearch unavailable). `netlify.toml` shows it is a Netlify static site, URL not published | H |

Credibility flags (M, observations only): 129 forks per 130 stars; `tiny/commit-001..040.txt` each contain "tiny change NNN"; README refers to "Wave issues" (a contributor-reward programme). Consistent with activity-farming, not proof of it. A historical `ISSUE_DRAFT.md` in the contracts repo claims "CRITICAL" accounting flaws but is labelled "historical draft, not a current security assessment".

## 2. What it is

- **Kind**: onchain-other. Soroban (Stellar smart contracts, Rust), static HTML frontend with Freighter wallet (README, `frontend/soroban.js`). Crates: `prediction_market`, `stellar_trade_token` (STRD reward token, not deployed), `referral_registry`, `leaderboard`, `cross_contract_invariants` (contracts README). (H)
- **Market model (H, contract source `prediction_market/src/lib.rs`)**: binary YES/NO, **pari-mutuel pool**, no order book, no AMM curve, no continuous price. `Market{id, question, image_url, category, end_time, total_yes, total_no, resolved, outcome, cancelled, creator, bet_count}`; `Category` enum = Crypto, Sports, Politics, Entertainment, Science, Other.
- **Outcome tokenisation**: none. A position is a storage entry `Bet(market_id, user)`, not a token. Current source stores `net_yes`, `net_no`, `gross`, `claimed`, `count` (two-sided). The **deployed** legacy contract stores `{claimed, count, gross, is_yes, net}` (decoded from ledger entries, fixture `stellar_expert_testnet_contract_data_decoded.json`), i.e. an older single-side shape, so **the deployed WASM predates the current source** (M, inferred from the storage shape and the single WASM version dated 2026-08-09). `reduce_position` may not exist on the deployed contract.
- **"Sell"** = `reduce_position`: returns a cost-basis refund, "not an order-book sale to another user and does not open a short position" (README). It refunds `0.98*A + 0.015*A = 0.995*A` of the reduced gross, independent of current odds (source). So it is a cancel-at-cost option, not price discovery (M).
- **Limits (source)**: net stake >= 1 XLM (`MIN_BET` 10,000,000 stroops, tested on the 98% net), <= 20 bets per user per market, <= 50 concurrently open markets, >= 1 h duration, market creation admin-only, creation rate limit 10 per 720 ledgers.
- **Chain / collateral (H)**: Stellar. Native XLM through the XLM Stellar Asset Contract. SAC IDs in `scripts/deploy-mainnet.sh`: mainnet `CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA`, testnet `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`. No stablecoin.
- **Categories**: see section 7. Only test content exists on chain.

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Official REST/GraphQL/WebSocket API | **none**. NOT FOUND (searched: both READMEs, `docs/CONTRACT_CALLS.md`, repo tree, `netlify.toml`). The frontend's market and leaderboard pages use hard-coded sample values ("not currently backed by live contract reads", README) | H |
| Docs | `docs/CONTRACT_CALLS.md` (ABI table, error codes, raw RPC TypeScript example); contract README; `INVARIANT_MATRIX.md` | H |
| Soroban RPC (JSON-RPC, **POST**) | `https://soroban-testnet.stellar.org` (Testnet, in README/frontend) and `https://mainnet.sorobanrpc.com` (mainnet, in `netlify.toml` and `deploy-mainnet.sh`). View functions are read by `simulateTransaction` without signing. **Not called in this run (POST rule)**; shapes below are from docs only | H (URLs), unverified (shapes) |
| Stellar Expert explorer API (GET, no key, third party) | Confirmed working this session (see below) | H |
| Auth / rate limits | none for Stellar Expert as far as observed; limits NOT FOUND (not documented in anything read) | M |
| WebSocket | none | H |

**View functions** (`CONTRACT_CALLS.md` + source): `get_market(market_id) -> Market`, `get_bet(market_id, user)`, `get_position(market_id, user) -> Position`, `get_market_count()`, `get_open_market_count()`, `get_market_bettors_page(...)`, `get_payout(market_id, user)`, `get_market_fees(market_id)`, `get_config()`. Excerpt: fixture `contract_abi_excerpt.rs.txt`.

**Events** (header comment in source, includes `bet_placed (user, id) -> (is_yes, amount, net)`, `market_created`, `market_resolved (outcome, pool, fees)`, `market_cancelled`, `cancel_refund`, `claim_processed`, `zero_side`) are declared, but Stellar Expert reports 0 events for the deployed Testnet contract (fixture `stellar_expert_testnet_contract_events_empty.json`), so the deployed WASM may not emit them or the indexer does not parse them (M).

**Confirmed GETs (all unauthenticated, 2026-10-19, base `https://api.stellar.expert/explorer`)**
1. `GET /testnet/contract/<id>` -> `{"contract","created":1786275660,"creator","wasm","invocations":13,"events":0,"errors":0,"storage_entries":15,"validation":{"status":"unverified"}}` (fixture `stellar_expert_testnet_contract.json`). Also `/balance` (`[{"asset":"XLM","balance":"3000000",...}]`), `/versions`, `/events`.
2. `GET /testnet/contract-data/<id>?limit=50` -> HAL `_embedded.records[]` of `{key, keyHash, owner, value}` where key/value are **base64 ScVal XDR** (fixture `stellar_expert_testnet_contract_data_raw.json`). I decoded them with a small stdlib XDR reader (fixture `..._decoded.json`; account addresses truncated). This is the only way to list markets/positions without the Soroban RPC, and it requires an XDR decoder.
3. Negative controls: `/public/contract/<id>` and `/public/account/<deployer>` -> 404 (fixtures `stellar_expert_mainnet_*_404.json`).

**Decoded on-chain state (H, read 2026-10-19)**

| Market | Question (untrusted string) | Category | Ends (UTC) | YES / NO pool | State |
|---|---|---|---|---|---|
| 1 | "Will this smoke test pass?" | Crypto | 2026-08-09 11:49 | 9.8 / 4.9 XLM net | resolved YES, claimed |
| 2 | "Cancel test market?" | Sports | 2026-08-09 12:48 | 1.96 / 0 XLM net | cancelled |
| 3 | "Will Stellar XLM trade above 0.50 USD before September 30, 2026?" | Crypto | 2026-09-30 11:52 | 0 / 0 | **expired, never resolved or cancelled** |

Pool units are stroops in the raw data (98,000,000 = 9.8 XLM); M on the Stellar Expert balance unit (3,000,000 stroops = 0.3 XLM, last updated 2026-08-09).

## 4. Trade path

- **No orders**; trading = Soroban contract invocations signed by a Stellar (ed25519) account. Calls: `place_bet(user: Address, market_id: u64, is_yes: bool, amount: i128 stroops)`, `reduce_position(user, market_id: u64, amount: i128) -> i128`, `claim(user, market_id)`, `cancel_refund(user, market_id)` (H, `CONTRACT_CALLS.md`, `frontend/soroban.js`).
- Flow (H, `frontend/soroban.js`, SDK `@stellar/stellar-sdk` 14.5.0): build tx with `Contract.call`, `server.prepareTransaction` (simulate, footprint), sign with the wallet (Freighter) for the network passphrase (`Test SDF Network ; September 2015` / `Public Global Stellar Network ; September 2015`), `sendTransaction`, poll `getTransaction`. Needs a funded account with XLM for the stake and fees.
- **Testnet only**; Testnet XLM from Friendbot has no value (README).
- **PayBox reachability: no (H for catalog, M for conclusion)**. `discover_tokens` in chains mode with query "stellar" returned 0 chains. PayBox's EVM transaction proposals and signed orders cannot produce a Stellar XDR transaction envelope. I did not test whether a PayBox Solana wallet (also ed25519) could sign raw Stellar payloads via `request_wallet_sign`; it would also need an XLM-funded Stellar account matching that key, and there is no documented support. Treat as unreachable.

## 5. Fees (source, H)

- On `place_bet` of gross `A`: `net = floor(A*9800/10000)` is credited to the chosen side; total fee `= A - net` (about 2%): platform 150 bps stays in the contract's per-market fee ledger, remaining ~50 bps is the referral share, paid to a registered referrer, **otherwise refunded to the bettor** (source comments). No fee on winnings.
- Payout at `resolve_market`: `floor(entry_net * total_pool / winning_side)`, with `total_pool = total_yes + total_no` (both net of fee). Integer dust goes to the fee ledger.
- `reduce_position` refund `= 0.98A + 0.015A`. For a bettor without a referrer the round trip is about free (0.5% referral refunded at entry plus 99.5% back). Bettor with a referrer loses ~0.5% (M, arithmetic from source).
- Admin fee withdrawal: 20% of accumulated fees per request, 24 h timelock for fee recipients. Config changes: 7-day timelock plus governor threshold.
- Network fees: Soroban resource fee in XLM (not measured). Market creation cost estimated ~0.05-0.10 XLM per `create-mainnet-markets.sh` comment (L, author estimate).

## 6. Resolution and dispute risk

- **Permissioned (H)**: `resolve_market(caller, market_id, outcome)` by the admin or a registered resolver, only after `end_time`; the resolver may not hold a stake in that market (`ResolverConflict`). "There is no automated oracle in this workspace" (contracts README).
- **Dispute**: only a 7-day challenge window when the winning side is empty (principal stays claimable, fees locked, admin may `freeze_market` to a refund). No dispute path for normal outcomes. Admin can `cancel_market` any unresolved market at any time.
- **Admin power (source)**: `upgrade(admin, new_wasm_hash)` replaces the contract bytecode **immediately, with no timelock** and storage preserved, so the admin can in principle take the pool. `set_paused` and `pause` also exist.
- **Observed liveness failure (H)**: market #3 passed its close on 2026-09-30 and was still unresolved on 2026-10-19.
- Resolution sources / criteria for questions are not published beyond the question string (README says they "must be published before a market opens", roadmap lists this as unsolved).
- Audit: none ("not audited"; `issues/` holds 41 historical reports, which the repo says are not proof of an audit).

## 7. Geo, ToS, automation

- Terms of service, geo restrictions, KYC: NOT FOUND (searched: README, contracts README, `docs/`, `frontend/index.html`, `netlify.toml`). MIT license only. README on funds: "Testnet software and assets are experimental and have no mainnet value."
- Automation: nothing forbids it; contract calls are permissionless except `create_market` (admin) and `resolve_market` (admin/resolver). Registered resolvers cannot bet.

## 8. Liquidity (all Testnet, worth nothing)

- Contract balance 0.3 test XLM (M on units), last changed 2026-08-09; 13 invocations all-time; 3 bettors on 2 markets (decoded state), 0 stake on the only candidate market. Source: Stellar Expert API, fetched 2026-10-19.
- TVL / volume / OI on mainnet: none found (no mainnet contract). Not on DefiLlama (not checked; WebSearch unavailable).
- Shares liquidity with another venue: **no**. It is independent but empty.

## 9. Event-category overlap (arbitrage relevance)

- Live: none worth matching. Test strings only.
- Planned (repo `scripts/mainnet-markets.json`, 7 seed questions, H as a plan, not live): BTC >= $101,000 and ETH >= $3,500 and XLM >= $0.50 "before December 31, 2026" (crypto price), Brazil/Argentina to win the 2026 World Cup Final on July 19, 2026 (already past, so the file is stale), Fed cuts rates at least once before 2026-12-31 (macro), humanoid robot under $50,000 (science). Categories overlap Polymarket/Kalshi, but with no live market or independent price, there is nothing to arbitrage, and the pari-mutuel payoff cannot be locked against another venue's fixed price before close.

## 10. Adapter notes (if ever revived)

- Read path: Soroban RPC `simulateTransaction` of `get_market_count` then `get_market(i)` (or Stellar Expert `contract-data` plus XDR decode); implied YES probability `total_yes/(total_yes+total_no)` is only a current-pool indicator, and net payout multiplier is `total_pool/winning_side` at close.
- Monitor: `market_resolved` / `market_cancelled` events or `Market.resolved/cancelled` flags; resolver non-response risk.
- Treat as signal-only at best. Not worth adapter effort now.

## Open questions

- Is there any mainnet deployment under IDs not in the repo (deploy output is git-ignored)? WebSearch was unavailable; mainnet Soroban RPC not queried (POST).
- Does the legacy Testnet WASM implement `reduce_position`? (Stellar Expert did not expose the spec; the Soroban RPC was not called.)
- Is there a hosted site (Netlify) and any ToS? Not found.

## Sources

- https://github.com/Stellar-tradehub/stellar-trade (README, `docs/CONTRACT_CALLS.md`, `frontend/soroban.js`, `netlify.toml`, `scripts/deploy-mainnet.sh`, `scripts/create-mainnet-markets.sh`, `scripts/mainnet-markets.json`; pre-rebrand README at commit `0d644ca`) - H
- https://github.com/Stellar-tradehub/stellar-trade-contracts (README, `INVARIANT_MATRIX.md`, `issues/README.md`, `prediction_market/src/lib.rs`) - H
- GitHub REST API: repo, org, contents, commits for both repos (via `gh api`, 2026-10-19) - H
- https://api.stellar.expert/explorer/testnet/contract/CAPCAPWPGPOCENAJFYYIE22WYNFEDVZ3CT73M5MAKILFMBQ5TN2MIS6T (+ `/balance`, `/versions`, `/events`, `contract-data/<id>`) - H
- https://api.stellar.expert/explorer/public/contract/CAPCAPWPGPOCENAJFYYIE22WYNFEDVZ3CT73M5MAKILFMBQ5TN2MIS6T and `/public/account/<deployer>` (404s) - H
- PayBox `discover_tokens` (mode chains, query "stellar", 0 results), 2026-10-19 - H
