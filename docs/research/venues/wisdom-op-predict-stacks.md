# Wisdom SDK / OP_PREDICT vault (Stacks) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- adapter_priority: **skip**. A hobby/demo prediction vault on Stacks. The repo is a 0-star SDK last pushed 2025-03-20 [H]. The on-chain contract still receives admin "create-market"/"close-market" calls in 2026 (latest 2026-10-01), but the last user prediction was 2025-06-19, the last market resolution was 2025-03-21, and the contract holds 0 tokens as of 2026-10-19 [H]. Not independent, tradeable liquidity.
- Not reachable via PayBox (Stacks is neither EVM nor Solana) [M].

## Identity

- "Wisdom" is `wisdom-sdk` v0.1.19, a TypeScript "data access layer for prediction markets" (README) [H]. It is a Vercel-KV-backed store layer plus a wrapper over one Clarity contract. https://github.com/r0zar/wisdom (created 2025-03-04, last push 2025-03-20, 0 stars, not archived, no description/homepage) [H, GitHub API].
- docs/VISION.md describes it as "a practical proof-of-concept" for Blaze (Stacks signed-intent subnet), not a product [H].
- Contract: `SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-predictions-v1` (Clarity 3, deployed at Stacks block 758432, "Version: welsh-predict-v1") [H, Hiro API]. OP_PREDICT is the constant `0xA1` for the signed predict opcode, `OP_CLAIM_REWARD = 0xA3` [H].
- Receipt NFT metadata at charisma.rocks/sip9/predictions/receipt.json, collection "Dexterity Prediction Vaults" (SIP-16) [H]. The charisma.rocks home page mentions no prediction-market product, no prediction API, no fees for it [H via WebFetch]. No official site, docs, status page or frontend URL found. NOT FOUND (searched: repo README/docs/package.json, charisma.rocks; WebSearch budget exhausted this session, so web search was NOT performed).
- Still live? Partially. Contract is not dead on-chain but has no trading (see Liquidity).

## Market model

- Parimutuel pool, no order book, no AMM, no prices [H, source]. Per market: `outcome-names (list 16)`, `outcome-pools (list 16 uint)`, `total-pool`, `is-open`, `is-resolved`, `winning-outcome`, `resolver`. Categorical up to 16 outcomes; observed markets are all Yes/No [H].
- Each bet mints an SIP-9-style NFT receipt (`prediction-receipt`, uint id) storing market-id/outcome-id/amount; claiming burns it. Receipts are transferable. Outcomes are not tokenised, only the receipt [H].
- Anyone can `create-market` (no permission, no fee, no liquidity seed) [H]. Only the deployer or an admin can close/resolve.
- Implied odds = outcome-pool / total-pool, final payout depends on closing pools (parimutuel), so no executable price exists before close [H, derived].

## Chains and collateral

- Stacks mainnet only. Collateral is a single SIP-010 token `SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v1` (WELSH-related memecoin vault token; Hiro FT metadata endpoint returned "Contract not found" for it, so decimals/price NOT CONFIRMED) [H for address, NOT FOUND for decimals]. Not USD-denominated, so pool sizes are not comparable to USD venues without a price feed.

## Read API

- Official: none. No hosted REST API, no docs site, no websocket. NOT FOUND (searched: repo, charisma.rocks).
- SDK reads Hiro (`https://api.mainnet.hiro.so/`, `https://stacks-node-api.mainnet.stacks.co/`) and a Vercel KV cache; KV is private to the app, so it is not usable [H, src/prediction-contract-store.ts].
- On-chain only (usable by third parties): Hiro public API.
  - Docs: https://docs.hiro.so/ (generic Hiro API; not fetched, M).
  - `GET /extended/v1/contract/{addr}.{name}` returns source and deploy info [H].
  - `GET /extended/v1/address/{addr}.{name}/transactions?limit&offset` lists calls; 286 txs total on 2026-10-19 [H].
  - `GET /extended/v1/address/{addr}.{name}/balances` returned stx 0 and `fungible_tokens: {}` [H].
  - `GET /v2/contracts/interface/{addr}/{name}` lists the functions below [H].
  - Read-only Clarity functions (callable via `POST /v2/contracts/call-read/...`, not called here per read-only/no-POST rule): `get-market-info(market-id)`, `quote-prediction(market-id, outcome-id)` (returns outcome pool and total pool, 0 when closed), `quote-reward(receipt-id)`, `get-receipt-info`, `get-owner`, `get-last-token-id`, `get-signer`, `verify-receipt-signer`, `make-redeem-receipt-hash` [H].
  - There is no on-chain market index. Market ids are arbitrary strings (UUIDs observed) discoverable only by scanning `create-market` txs [H].
- Auth/limits: Hiro public tier is rate-limited, specifics NOT FOUND this session. Untested for scale.
- Fixtures saved (public unauthenticated GET, date 2026-10-19): `docs/research/fixtures/wisdom-op-predict-stacks/contract-balances-2026-10-19.json`, `contract-interface.json`, `recent-txs-sample.json` (one recent tx per function, with args).

## Trade path

- Direct: Stacks tx calling `make-prediction(market-id, outcome-id, amount)` (user pays WELSH token to contract, mints receipt), then `claim-reward(receipt-id)` after resolution [H].
- Gasless-style: `signed-predict` / `signed-claim-reward` / `batch-predict` / `batch-claim-reward` take a signature tuple (nonce + secp256k1 sig over a SIP-018 structured-data hash) that a relayer/admin submits; the signer's WELSH is pulled from the signer principal [H, source]. In practice one admin address submitted all batches [H].
- No cancel, no sell, no exit before resolution. Positions can only be exited by selling the receipt NFT [H].
- PayBox: Stacks wallets and Stacks transactions are not EVM/Solana, so a PayBox EVM/Solana wallet cannot propose or sign these [M, based on the PayBox chain list given in the task]. A bridge/swap into Stacks WELSH would be needed and still requires a Stacks key. Practically unreachable.

## Fees

- Resolver fee: 5% (`ADMIN_FEE u50000` / `PRECISION u1000000`) of the total pool, paid to the admin who calls `resolve-market`. Winners receive `amount * total_pool * 0.95 / winning_pool`. Paid by all bettors pro rata via the pool [H, source lines 37, 200, 489-494].
- Stacks tx fees paid in STX (fee_rate seen ~1000 microSTX) [H].
- Edge case: if the admin picks an outcome with a 0 pool, `quote-reward` returns 0 for everyone and the pot is stuck in the contract (the fee still goes to the resolver) [H, derived from source].

## Resolution and risk

- Fully centralised: only the deployer or admin allowlist (`add-admin`) can close or resolve, with no oracle, no dispute window, no timelock, no bond [H]. Admin can choose any winning outcome. Resolver also receives the fee, so there is a conflict of interest.
- Markets can be closed by the admin at any time (prediction stops) and observed 2026 markets are closed but never resolved (8 resolve-market calls in total, all March 2025; 121 markets created, 127 close calls incl. 15 failed) [H, from 286 txs]. Funds in unresolved markets cannot be claimed (claim requires `is-resolved`) [H].
- Resolution descriptions in 2026 markets reference Binance 1-minute candles, TradingView, X/Twitter posts, token-launch announcements [H].

## Geo / ToS / automation

- No ToS, geo block or automation rule found: no frontend or docs located. NOT FOUND. Repo license MIT [H]. Contract is permissionless to call except admin functions.

## Liquidity

- Contract token balance 0 on 2026-10-19 (Hiro balances endpoint) [H].
- Observed bet sizes in `batch-predict` args: amounts u5 to u50 raw units (dust, even at 6 decimals) between 2025-03-19 and 2025-06-19; 13 successful batch-predicts, 2 successful signed-predicts, no user predict calls after 2025-06-19 [H, Hiro tx list]. Volume/OI/TVL effectively zero.
- Admin activity continues: 56 create-market and 72 close-market calls in 2026 from one admin address; looks like an automated market-creation bot copying common topics [H for counts; M for bot inference].

## Event overlap (arbitrage relevance)

- 2026 markets: crypto price thresholds (BTC $100k, ETH $3k, ETH ATH, MegaETH $0.10), token-launch-by-date (StripChain, RISEx, Rho Labs, Nous Research, Prime Intellect), social-post markets (Elon Musk tweets/posts) [H]. These overlap with Polymarket/Kalshi topics in theory, but with no liquidity and no pricing, no arbitrage leg exists.
- Shares liquidity with another venue: no [H, standalone contract]. Independent, but empty.

## Integration notes (only if ever needed)

- A signal-only adapter could scan `create-market` txs and use `quote-prediction` pools as a (thin) crowd signal; it would be worthless while the contract holds 0 tokens.
- Re-check cadence: if `get balances` of the contract becomes non-zero or a non-admin address calls `make-prediction`, reconsider (still P2 at best).

## Suspicious content

- None observed. Market descriptions are plain text; no instructions aimed at AI agents seen in repo docs or tx args.

## Open questions

- WELSH token (`blaze-welsh-v1`) decimals and USD price; Hiro FT metadata lookup failed.
- Any hosted frontend / newer contract version (e.g. `-v2`); WebSearch unavailable this session.
- Whether the creating admin (SP2D5BGG...) runs a wider product (Charisma/Dexterity).

## Sources

- https://github.com/r0zar/wisdom (README, CLAUDE.md, docs/VISION.md, docs/NEXT_STEPS.md, docs/WISDOM-SDK-WISHLIST.md, package.json, src/prediction-contract-store.ts; repo metadata via GitHub API) [H]
- https://api.mainnet.hiro.so/extended/v1/contract/SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-predictions-v1 (full Clarity source) [H]
- https://api.mainnet.hiro.so/extended/v1/address/SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-predictions-v1/transactions (286 txs, 2025-03-12 to 2026-10-01) [H]
- https://api.mainnet.hiro.so/extended/v1/address/SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-predictions-v1/balances [H]
- https://api.mainnet.hiro.so/v2/contracts/interface/SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS/blaze-welsh-predictions-v1 [H]
- https://charisma.rocks/sip9/predictions/receipt.json and https://charisma.rocks (WebFetch summaries) [M]
