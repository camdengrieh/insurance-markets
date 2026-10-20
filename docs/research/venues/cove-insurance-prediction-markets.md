# Cove (Cove-insure) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict
Not a live venue. A one-repo, 6-commit hobby/prototype Solana Anchor program (flight-delay insurance + a constant-product AMM), last pushed 2026-01-03, localnet-only config, no website, docs, API, token, or deployment evidence. adapter_priority: skip.

## What exists (H)
- GitHub org `Cove-insure`: created 2025-12-30, bio "Insurance Prediction Markets", location "United States of America", 1 public repo, 0 followers, 0 public members, no blog/twitter/email, not verified. Org last updated 2025-12-30. (https://api.github.com/orgs/Cove-insure, https://github.com/Cove-insure)
- Single repo `sol-contract` (TypeScript/Rust, 67 KB, no description, homepage, topics, or license), created 2026-01-01, last push 2026-01-03. 6 commits Jan 1-3 2026 ("initialized new backend structure for cove" ... "modified the test cases to allow multiple parties be involved in one LP"). No public events. (https://github.com/Cove-insure/sol-contract)
- Repo contents: only `backend/` Anchor project (programs/backend/src: amm.rs, insurance.rs, contexts.rs, state.rs, errors.rs, lib.rs; tests amm.test.ts, insurance.test.ts). No README, no frontend, no SDK, no IDL, no docs.
- Anchor.toml lists the program only under `[programs.localnet]`: `backend = 7QSTHAaEAPzDswjBGCA7zQTTcz3GDdbwUgwLnLaATcCD` (H). No devnet/mainnet entry. I could not confirm on-chain existence: Solana Explorer returned HTTP 429 and I did not POST to RPC (read-only/no-POST rule). Treat as NOT deployed (M).

## Kind and market model (H, from source)
- Not a prediction market in the usual sense. It is parametric flight-delay insurance with an underwriter-collateral pool per contract, plus a separate COVE/USDC constant-product AMM (0.3% fee: 997/1000 formula in amm.rs).
- Instructions: initialize_pool, add_liquidity, swap_cove_for_usdc, swap_usdc_for_cove, remove_liquidity, create_contract(contract_id, flight_price, max_coverage, premium_rate, expiry), buy_insurance(coverage_amount), resolve_contract(claim_approved: bool).
- Outcomes are NOT tokenised: no YES/NO tokens, no share mints. Buyer position is only a coverage counter on the contract account; payout = current_coverage if claim approved. Premium = base(0.5% of flight_price per unit) * (1 + utilization^2) bonding curve (insurance.rs calculate_premium).
- Underwriter posts flight_price in USDC as collateral at creation.

## Chains and collateral
- Solana (SPL token USDC) only, and only in test config (H). A "COVE" token mint is referenced by the AMM but no mainnet mint is documented (NOT FOUND: searched repo, org page).

## Read API
- NONE. NOT FOUND (searched: org page, repo tree, repo description/homepage, GitHub search for related repos). No REST, subgraph, websocket, or IDL. Only on-chain account reads would be possible if it were ever deployed (Pool and InsuranceContract accounts, structs in state.rs). Fixtures: none saved (nothing to fetch).

## Trade path
- None operational. Program ix would be callable via signed Solana transactions if deployed, but no deployment is evidenced.
- PayBox reachability: no. A Solana wallet could sign program txs in theory, but there is no deployed target, no IDL, no UI.

## Fees
- AMM swap fee 0.3% (997/1000) (H, amm.rs). Insurance: premium curve only, no protocol fee in code (H).

## Resolution and dispute risk (H, from source)
- `resolve_contract(claim_approved)` takes a caller-supplied boolean after expiry. The `ResolveContract` accounts struct has no Signer, no oracle, no authority constraint. In the code read, anyone could call it with an arbitrary outcome and arbitrary payee token accounts (`buyer_usdc_account` and `underwriter_usdc_account` are unconstrained `mut` token accounts). This is an unaudited prototype and unsafe to hold funds in. There is no flight data oracle. Also payout goes to one "buyer" account, not per-buyer.

## Geo / ToS / automation
- NOT FOUND. No ToS, site, or docs. (Searched: org page, repo.)

## Liquidity
- No evidence of any: no TVL, volume, or OI source; no deployment. (NOT FOUND, as of 2026-10-19.)

## Event overlap / shared liquidity
- Flight-delay insurance only; overlaps with no other venue's categories (no sports/politics/crypto/macro). Shares liquidity with nothing. Not an arbitrage leg and not a signal source.

## Notes for the project
- Name collision caution: other "Cove" products exist (insurance companies, etc.); nothing found linking them to this org. Do not conflate.
- WebSearch budget for the session was exhausted during this task, so web coverage beyond GitHub and one WebFetch of the org page is missing. If a site/launch exists it would not have been found; recheck later via search for the "Cove-insure" org on X/Colosseum/Solana hackathon listings (M, speculation about where it may be).

## Open questions
- Is the program deployed to devnet/mainnet? (check Solana explorer later for 7QSTHAaEAPzDswjBGCA7zQTTcz3GDdbwUgwLnLaATcCD)
- Is there any web presence outside GitHub?

## Suspicious content
- None found. No embedded instructions in repo files read.

## Sources
- https://api.github.com/orgs/Cove-insure (H)
- https://github.com/Cove-insure (H)
- https://github.com/Cove-insure/sol-contract and files under backend/ (Anchor.toml, programs/backend/src/{lib,state,errors,contexts,insurance,amm}.rs) read via gh api raw (H)
- https://explorer.solana.com/address/7QSTHAaEAPzDswjBGCA7zQTTcz3GDdbwUgwLnLaATcCD - HTTP 429, not read
