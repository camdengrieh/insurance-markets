# Oracle Bet (Solana) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- adapter_priority: **skip** (revisit only if a live app and an indexer API appear).
- Reason: no evidence the venue is live (no app URL, no trading volume data found, GitHub org and docs untouched since 2026-01-29, about 9 months stale); no official read API; creator-resolved markets (centralised, dispute-prone); thin/unknown liquidity; Solana-only so not reachable from an EVM PayBox wallet.

## Identity and liveness

- GitHub org `oracle-bet`, created 2026-01-28, last updated 2026-01-29, 2 public repos (`program-idls`, `.github`), 1 follower, not verified, twitter handle `Oracle_Markets`. Last push to either repo 2026-01-29. [H] https://api.github.com/orgs/oracle-bet , https://api.github.com/orgs/oracle-bet/repos
- Org profile README: "under active development. Public repositories will expand over time". Points to GitBook only; no app/site URL. [H] https://github.com/oracle-bet/.github (profile/README.md)
- `.github` repo description says "Solbet AI - Decentralized Prediction Market" (a possible former/alt name). [H] same API.
- GitBook docs: https://oracle-bet.gitbook.io/home (index at /home/llms.txt, 9 pages; fetched 2026-10-19). No app link, no program IDs, no social links in the docs. [H]
- NOT FOUND: a working app/site URL, trading volume, TVL, user counts, any news/launch coverage, any 2026 on-chain activity evidence. (searched: GitHub org/READMEs, GitBook pages and HTML, WebSearch x2 - one standard search returned nothing about a Solana "Oracle Bet"; guessed domains oraclebet.io / .xyz / .com resolve to unrelated sites (a "Payload" page, a parked-domain sale page); x.com/Oracle_Markets fetch returned HTTP 402 so not read; Solana explorers returned 403 / solana.fm 502; Solana JSON-RPC not used because it requires POST.) The web search tool budget was exhausted mid-task, so coverage of news/social is incomplete.
- Name collision warning: a different "OracleBet" exists on Mantle (hackquest project, 0.1% fees, Chainlink/UMA). Not this venue. [M] search snippet, https://hackquest.io/projects/OracleBet (not opened).
- still_live: **false/unknown** (treated as not confirmed live; likely pre-launch or abandoned).

## Market model [H unless noted]

- Binary only (outcome u8: 0 = NO, 1 = YES; resolved_outcome i8: -1 unresolved). Source: IDL errors `InvalidOutcome: Outcome must be 0 (NO), 1 (YES), or -1 (unresolved)` and Market struct with only `yes_quantity`/`no_quantity`. https://github.com/oracle-bet/program-idls/blob/main/market_program.json
- AMM: LMSR bonding-curve, `C(q)=b*ln(e^{qyes/b}+e^{qno/b})`, price = softmax; Yes+No = 1. Parameter `b` is `liquidity_parameter` (global in Config and copied per Market). https://oracle-bet.gitbook.io/home/the-bonding-curve-model.md
- Outcomes are NOT tokenised: positions are program accounts (`Position` PDA: yes_shares, no_shares, total_spent, total_received, claimed) plus per-trade `Order` accounts. No SPL outcome tokens (inferred from IDL: no mint accounts besides USDC) [M].
- Markets are user-created (permissionless creation with a USDC `creation_cost`; metadata via `metadata_uri` + 32-byte hash, so question text and rules live off-chain, location unknown). Market has `end_timestamp`; creator can `extend_market_end_time`.
- "Migration" at $25,000 pool liquidity is cosmetic: market stays on the same LMSR curve; creator gets a $250 reward. https://oracle-bet.gitbook.io/home/the-journey-to-migration.md
- Docs and IDL disagree in an unclear way: docs say AMM funded by pooled reserve, IDL has `withdraw_liquidity` by config authority (admin can withdraw from market escrow) [H IDL; implication M: custodial/admin risk].

## Chain and collateral

- Solana. Collateral USDC (`usdc_mint`, `creator_usdc_account`, `market_escrow` token accounts). Program id in IDL: `2MM2APzbQN7pyhCmGgsu1Jyd2Didw6fbZro8hDkGnS45` (public program address, not user data). Not confirmed deployed on mainnet (NOT FOUND, no explorer access). [H for IDL address; deployment unknown]

## Read API

- exists: **onchain-or-subgraph-only**. No official REST/WebSocket API found. Docs mention "off-chain services handle indexing, data access" (org README) but publish no endpoints. [H]
- Docs URL: https://oracle-bet.gitbook.io/home (GitBook MCP endpoint at /home/~gitbook/mcp is GitBook's docs-search, not market data).
- Feasible on-chain reads for an adapter: getProgramAccounts on program for `Market` accounts, decode with the IDL (Anchor), compute `P_yes = e^{yes/b}/(e^{yes/b}+e^{no/b})`; `OrderPlaced` event also emits `yes_price_bps`/`no_price_bps`. Requires a Solana RPC and Anchor decoding; unverified against live data.
- Auth/limits: n/a. Fixtures: no live API response available; saved instead the IDL (trimmed) and docs under `docs/research/fixtures/oracle-bet-solana/` (market_program.idl.trimmed.json, gitbook-llms.txt, gitbook-fee-structure.md).

## Trade path

- On-chain Anchor instruction `place_order(amount u64, outcome u8, is_buy bool)` signed by a Solana wallet with USDC; accounts include order, market, config, position, referral_account, referrer_vault, user, user_usdc_account, market_escrow, protocol_vault. Also `claim_winnings`, `claim_refund`. Only args are amount/outcome/is_buy: **no min-shares / max-slippage argument visible in args** despite a `SlippageTooHigh` error code (L: slippage protection unclear; sandwiching risk on thin pool). [H IDL]
- No off-chain signed orders (AMM, direct transactions).

## PayBox reachability

- paybox_reachable: **no** for EVM wallets. Needs a Solana wallet with USDC and a custom Anchor instruction. Whether a PayBox Solana credential could submit an arbitrary program instruction proposal is not assessed here (would need PayBox plugin/contract check; out of scope, read-only). [M]

## Fees [H]

- 1.29% trading fee per trade: 0.25% creator fee + 1.04% protocol fee (to stakers); referrers get 30% of fees. Applied on order amount, charged to trader (Order stores `creator_fee_charged`, `protocol_fee_charged`, `net_amount`). Fee bps are configurable by the config authority (`update_config`) and stored per market. https://oracle-bet.gitbook.io/home/fee-structure.md , referral-system.md
- Round trip (buy+sell) about 2.6% before LMSR slippage; makes arbitrage against tighter venues unattractive.

## Resolution and dispute risk [H]

- Creator (or Community Takeover team) posts the outcome: `resolve_market(resolved_outcome)` is gated by the `authority` account in IDL (also appears to require config authority: `resolve_market` accounts are market, config, authority) - unclear whether the creator or the protocol admin signs. Docs: "Creators ... Resolve markets accurately". https://oracle-bet.gitbook.io/home/for-creators.md
- No oracle, no bonds, no on-chain dispute process described; "Disputed/Unresolved" state disables trading; Unresolved gives pro-rata refund. CTO mechanism if creator abandons. https://oracle-bet.gitbook.io/home/refund-and-dispute-logic.md
- Risk: high (single-party resolution, ambiguous rules held off-chain, admin `withdraw_liquidity`). Not suitable as an arbitrage leg against oracle-resolved venues without basis-risk haircut.

## Geo / ToS / automation

- NOT FOUND (no ToS, geo-restriction or API-use terms in docs; no app to inspect).

## Liquidity

- NOT FOUND. No volume/TVL/OI data from any source. The only number is the $25,000 per-market "migration" threshold (a design target, not an observation). Treat as thin/unknown. [L]
- Shares liquidity with: none known (own LMSR pools; independent but unproven).

## Event coverage / overlap

- User-generated arbitrary markets; AI-assisted creation (Gemini 3 Pro). No category list found. Any overlap with sports/politics/crypto price is incidental and unverifiable. [L]

## Open questions

- Is there a live app, and what is its domain? (Check the Oracle_Markets X account when reachable.)
- Is the program deployed on Solana mainnet, and is there on-chain activity after 2026-01?
- Who signs `resolve_market`: market creator or global authority?
- Where are `metadata_uri` documents hosted (market titles/rules)?

## Suspicious content

- None observed. The gitbook mentions an MCP endpoint (GitBook standard); not used.

## Sources

- https://github.com/oracle-bet (API: https://api.github.com/orgs/oracle-bet, /repos) [H]
- https://github.com/oracle-bet/.github/blob/main/profile/README.md [H]
- https://github.com/oracle-bet/program-idls/blob/main/market_program.json (last commit 2026-01-29) [H]
- https://oracle-bet.gitbook.io/home/llms.txt and pages: welcome-to-oracle-bet, the-bonding-curve-model, the-journey-to-migration, fee-structure, for-creators, for-stakers, refund-and-dispute-logic, referral-system, ai-integration (.md versions) [H]
- WebSearch 2026-10-19 (Mantle OracleBet name collision) [M]
