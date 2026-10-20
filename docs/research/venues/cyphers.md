# Cyphers (cyphers.bet) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- adapter_priority: **skip** (revisit only if it launches on mainnet). Devnet beta with valueless test USDC, parimutuel pools whose per-side totals are hidden until settlement, no REST API, no public order book, and no sign of real liquidity. [H]
- Still live in 2026? The site and docs are up and the SDK is actively published (npm `@cypher-zk/sdk` 0.8.9 published 2026-06-28; docs repo last commit 2026-08-01; org `.github` pushed 2026-09-04). It is a live **devnet beta**, not a live money venue. [H]

## Kind and market model

- On-chain Solana program (Anchor + Arcium MPC), parimutuel pools per outcome. [H] https://docs.cyphers.live/how-it-works/fees.md
- Market types actually supported in docs and SDK: `YesNo` (binary) and `MultiOutcome` (2 to 4 named options). More than 4 options and numeric/exact-price predictions are "Not supported today". [H] https://docs.cyphers.live/how-it-works/market-types.md
- The homepage and org README advertise "Accuracy Contests" (forecast exact price, ranked by precision), but the docs and SDK enums (`MarketType` 0 YesNo, 1 MultiOutcome) do not include it. Treat as roadmap/marketing. [H for the contradiction]
- Outcomes are not tokenised. A bet creates an `EncryptedPosition` PDA keyed by (market, user, betIndex) holding ciphertext of side and amount, plus plaintext `netAmount` and `entryOdds`. Positions are not transferable tokens and cannot be sold or cancelled. [H] https://docs.cyphers.live/sdk/reference/accounts.md , FAQ "Can I cancel a bet? No."
- Odds: `entryOdds = totalPool / yourSidePool`, locked at bet time; later bets do not change your payout; a settlement `payoutRatio` (<= ~1) scales payouts so they cannot exceed the vault. [H] fees.md
- Market categories enum: Crypto, Politics, Sports, Tech, Economy, Culture, Beyond. [H] https://docs.cyphers.live/sdk/reference/constants.md
- Markets are permissionless and user-created (creator bond >= $20, question <= 200 bytes). [H]

## Chains and collateral

- Solana. Program ID in the repo's Anchor.toml `[programs.localnet]` entry: `CYPHERKLYj1bZtWv7Xut6Snw13ab1DwdJia5ZSEeVeej` (localnet entry only; devnet/mainnet program IDs not independently confirmed; SDK exports `PROGRAM_ID` from a synced IDL). [H for the repo string, M that it equals the deployed devnet ID] https://github.com/cypher-zk/cyphers-program
- Collateral: USDC in design. On devnet it is a test token "Cypher Coin" (`KNOWN_MINTS.devnetCSDC`, mint prefix `8AF9BABN...`), claimable free from an in-app faucet / faucet.cyphers.live; "Devnet uses test USDC with no real value." Mainnet constant is Circle USDC (`EPjFWdd5...`). The accepted mint is read at runtime from `GlobalState.acceptedMint`. [H] https://docs.cyphers.live/quickstart.md , constants.md
- Min bet $1 (`MIN_BET_USDC` 1_000_000 micro-USDC); no protocol max. [H]

## Read API

- Official REST/GraphQL API: **NOT FOUND** (searched: homepage, docs llms.txt index of 28 pages, docs sitemap, SDK reference, GitHub org). The site's `robots.txt` disallows `/api/`, and `https://cyphers.bet/api/markets` returns an HTML page, not JSON; I did not probe further under `/api/`. [H]
- Read path is **on-chain / SDK only**: `@cypher-zk/sdk` (TypeScript, requires `@solana/web3.js ^1.95.4`, not v2/kit) with `client.markets.all()`, `client.markets.byIds(ids)`, `client.positions.byUser`, `client.marketQuestions.fetchMany`, account fetchers, and event subscription via WebSocket log subscription (`client.events.subscribeAll`, 10 typed events incl. `BetPlacedEvent`, `MarketCreatedEvent`, `PayoutClaimedEvent`, `ResolutionFlaggedEvent`, `MarketFinalizedEvent`, `ResolutionOverriddenEvent`). Rate limits are those of whatever Solana RPC you use; SDK batches `getMultipleAccountsInfo` in chunks of 100. [H] https://docs.cyphers.live/sdk/reference/client.md , events.md , changelog.md
- Docs: https://docs.cyphers.live (Mintlify; agent-friendly `.md` suffix on every page and `/llms.txt`). SDK on npm: https://www.npmjs.com/package/@cypher-zk/sdk . Agent skill: https://github.com/cypher-zk/cypher-skill . Program source (public): https://github.com/cypher-zk/cyphers-program . [H]
- Key on-chain fields for an aggregator: `MarketAccount` (`marketId, marketType, numOutcomes, category, creator, resolver, creatorBond, totalBetsCount, state, outcome, pendingOutcome, closeTime, resolutionDeadline, challengePeriod, challengeDeadline, disputed, payoutRatio, minBet`), PDAs `["market", id_u64_LE]`, `["market_vault", market]` (vault balance = total staked), `["market_question", market]` (question text). [H] accounts.md, constants.md
- **No live price is available.** `revealedPool0..3` are written only by the MPC callback after resolution, so per-side pools are hidden during betting; only the total vault balance, bet count and per-position `entryOdds` are public. Whether `entryOdds` on new positions leaks the current implied price is NOT FOUND in the docs (inferred M: pool state is held inside the MPC, odds are computed there). An aggregator therefore cannot derive a tradable implied probability. [M, from H field definitions]
- Fixtures: no JSON API to sample. Saved doc/ref excerpts only under `docs/research/fixtures/cyphers/` (`docs-llms.txt`, `sdk-constants.md`, `sdk-accounts.md`, `robots.txt`).

## Trade path

- Programmatic via SDK `client.actions.placeBet` (x25519 key exchange with Arcium cluster key, encrypts side and amount, builds Anchor instruction, wallet signs a Solana transaction); then waits ~10 s for the MPC callback. Also create/cancel/resolve/flag/claim actions. [H] https://docs.cyphers.live/sdk/actions/place-bet.md (index), changelog.md
- Signing: Solana (ed25519) transaction signature via an Anchor-style `Wallet` (`signTransaction`). The bettor's x25519 private key from `placeBet` MUST be persisted (browser local storage `cyphers:pos:*` in the app) to see one's own side; claiming does not need it per FAQ. [H] cypher-skill README, FAQ
- No orders, no cancel, no sell/exit before settlement: a bet is locked until resolution. This makes it unsuitable as an arbitrage leg that needs to unwind. [H]

## PayBox reachability

- paybox_reachable: **no** for an EVM-only wallet. The venue is Solana-only; an EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot sign a Solana program instruction. Only a PayBox Solana credential could in principle sign `request_wallet_sign`/transaction proposals, and the bet needs client-side Arcium encryption plus a persisted secret, which a generic proposal flow does not provide. Moreover it is devnet-only, so there is nothing of value to trade. [M, inference from H facts]

## Fees

- Protocol fee: typical 0.5%, max 1% (`MAX_PROTOCOL_FEE_BPS` 100) paid by bettor, deducted up front, to treasury. Market-creator fee: typical 1.5%, max 5% (`MAX_LP_FEE_BPS` 500), to the creator. Typical total about 2% of stake. Rates are read from `GlobalState.protocolFeeRate` and can be changed by the protocol. Solana tx fee about $0.0005. Creator bond >= $20 returned with fees. [H] fees.md, constants.md, FAQ
- Parimutuel structure also implies an implicit "overround" cost: payout depends on the final pool ratio, not a quoted price.

## Resolution and dispute risk

- Resolver is a single wallet chosen by the market creator (defaults to the creator; can be a multisig). Resolver posts outcome after close; Arcium decrypts all bets (~10 s); 24-48 h challenge window; anyone can flag (cost: SOL tx fee only); a protocol **admin** reviews and posts the final outcome via `adminOverrideResolution`. If the resolver misses the deadline (default 7 days after close), the market is Refundable (stakes returned, 14-day refund period). Unclaimed payouts after the claim deadline (default 14 days) are swept to the protocol admin. [H] lifecycle.md, dispute-resolution.md, FAQ, constants.md
- Risk: centralised, subjective resolution (creator/admin trust), no oracle for outcomes (Pyth/Switchboard logos on the homepage are unexplained; docs name no oracle). Anyone can create a market, so quality varies; resolution may be late or wrong. Audit claim: "reviewed by security firms; reports will be linked before mainnet" (no report found). [H for statements, L for audit claim]

## Geo / ToS / automation

- Terms of Use and Privacy Policy links on the homepage are placeholders (`#`); no ToS text found. No geo restrictions documented. Docs explicitly support running your own resolver bot and building apps with the SDK; `robots.txt` disallows `/api/`, `/positions`, `/profile`, `/created`, `/streak`. [H] (NOT FOUND for ToS, searched: homepage, docs)

## Liquidity

- Volume / OI / TVL: **NOT FOUND** (searched: homepage, docs, GitHub org, llms.txt). On devnet, any figures would be test tokens with no value. No on-chain scan was done (JSON-RPC is POST; avoided under read-only rules). [H for absence]

## Event overlap

- Categories (Crypto, Politics, Sports, Tech, Economy, Culture) nominally overlap other venues, and doc examples are BTC price thresholds, NBA Finals, Starship landing. But markets are user-created, free-text, and devnet only, so there is no usable cross-venue matching set. [M]

## Shared liquidity

- None: own parimutuel vault per market; not linked to another venue. Independent, but irrelevant at present. [H]

## Signal value

- Possible future signal: bet counts and vault totals per market (public). Individual sides are hidden until settlement, which removes copy-trading signal by design. Low value now. [M]

## Open questions / watch items

- Mainnet launch date and mainnet program ID (follow https://x.com/cypherzk_ and the GitHub org).
- Whether any read index/API is added; whether accuracy contests ship.
- Whether `entryOdds` of new bets reveals current implied probability.
- Audit report publication.

## Suspicious content

- None found. No embedded instructions aimed at AI agents. Note: the `cypher-skill` repo ships agent instructions by design (not followed, only read for facts). The cyphers-program repo's Anchor.toml contains a developer's local filesystem path; not copied here.

## Sources

- https://cyphers.bet/ (H, 2026)
- https://cyphers.bet/robots.txt (H)
- https://docs.cyphers.live/llms.txt and pages: introduction, quickstart, how-it-works/{privacy-model,market-types,lifecycle,fees}, guides/{create-a-market,dispute-resolution}, troubleshooting/faq, sdk/reference/{client,constants,accounts,events}, sdk/changelog (H; sitemap lastmod 2026-06-27)
- https://github.com/cypher-zk (org created 2026-05-11), repos cyphers-program (last commit 2026-05-31), cypher-skill, docs (H)
- https://registry.npmjs.org/@cypher-zk/sdk (latest 0.8.9, published 2026-06-28, license "SEE LICENSE IN LICENSE") (H)
- WebSearch was unavailable (session search budget exhausted); no third-party coverage, volume or incident data was checked. [limitation]
