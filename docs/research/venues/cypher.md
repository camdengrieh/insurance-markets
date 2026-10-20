# Cypher (Cyphers) venue spec

Researched 2026-10-19. Read-only. Confidence tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

**Verdict: adapter_priority = skip.** Beta on Solana devnet only (no confirmed mainnet), frontend deployment is gone (404), no REST API, parimutuel with encrypted side and creator-chosen resolver. Revisit only if a mainnet launch is announced.

## 1. Liveness (2026-10-19)

- `https://www.cyphers.live/` and `/markets` return HTTP 404 with `x-vercel-error: DEPLOYMENT_NOT_FOUND` (Vercel says no deployment exists for that hostname). [H] fixtures/cypher/probe-2026-10-19.txt
- `https://cyphers.live/` (apex) connection timed out (twice, 20 s) from this machine. [H]
- `https://docs.cyphers.live/` returns HTTP 200 (Mintlify site, Cloudflare). [H]
- A web search snippet still shows the homepage text ("encrypted prediction markets on Solana... Yes/No, Multi-Outcome, and Accuracy Markets") but that is a cached scrape of a page that now 404s; "Accuracy Markets" is not in the docs. [L]
- Docs FAQ states: "Cyphers is in beta on Solana devnet. Mainnet launch is planned." [H] https://github.com/cypher-zk/docs (troubleshooting/faq.mdx). Docs last commit 2026-08-01 (branding only); SDK last published 0.8.9 on 2026-06-28; no npm release in the ~16 weeks since. [H] https://registry.npmjs.org/@cypher-zk/sdk
- No mainnet launch announcement found (WebSearch extended, two queries). NOT FOUND (searched: web, GitHub org, docs changelog). The SDK docs say the accepted mint "differs between devnet and mainnet" and show a devnet "Cypher Coin" test mint plus Circle mainnet USDC as constants, which is only forward-looking support. [H]
- Could not check on-chain whether the program exists on mainnet: JSON-RPC needs POST, which the ground rules forbid. NOT FOUND (searched: no GET-able explorer tried).

## 2. Kind and market model

- Kind: on-chain, user-created, parimutuel pools with privacy of the chosen side (Arcium MPC). [H] docs how-it-works/fees.mdx, introduction.mdx
- Market types: YesNo (binary) and MultiOutcome (2-4 mutually exclusive named options; labels embedded in question text as `[A|B|C]` suffix). No scalar, no more than 4 outcomes. [H] how-it-works/market-types.mdx, sdk/actions/markets.mdx
- Not an order book, not an AMM. Per-side USDC pools; `entryOdds = totalPool / yourSidePool`, locked in at bet time; final payout ratio scaled so payouts do not exceed vault (ODDS_SCALE 1e9). [H] fees.mdx
- No outcome tokens: positions are `EncryptedPosition` PDAs per (market, user, betIndex), not transferable, not tradable, no exit before resolution ("Can I cancel a bet? No"). [H] faq.mdx, sdk/reference/constants.mdx
- Side is encrypted client-side until settlement; stake amount and wallet are public. Because side pools are hidden during betting, the public data does NOT reveal the live odds (pool split is encrypted until MPC reveal). [M, inferred from privacy docs]; implication: there is no observable price to feed an arbitrage scanner while a market is open.
- Categories: Crypto, Politics, Sports, Tech, Economy, Culture, Beyond. [H] constants.mdx

## 3. Chains and collateral

- Solana; Anchor program `CYPHERKLYj1bZtWv7Xut6Snw13ab1DwdJia5ZSEeVeej` is the id in the (archived) program repo's localnet config. [H] https://github.com/cypher-zk/cyphers-program (Anchor.toml). Not verified to be the deployed devnet or mainnet id; the SDK reads PROGRAM_ID from its synced IDL.
- Arcium MXE (MPC, Cerberus backend, arcium_program 0.10.4) for encrypted reveal. [H] Arcium.toml, SDK deps `@arcium-hq/client ^0.10.4`
- Collateral: USDC via `globalState.acceptedMint`; devnet mint is a test token ("Cypher Coin"), mainnet constant is Circle USDC. Min bet 1 USDC, min creator bond 20 USDC. [H] constants.mdx
- SPL token program auto-detected (Token-2022 supported). [H] client.mdx

## 4. Read API

- Official REST / GraphQL / WebSocket market-data API: NOT FOUND (searched: docs.json nav, docs repo, SDK reference, github org repos, web). Classification: `onchain-or-subgraph-only`.
- Read path = Solana RPC via `@cypher-zk/sdk` (TypeScript, web3.js 1.x only): `client.markets.all()/byState()/byIds()`, `client.positions.forMarket()`, `client.marketQuestions.fetchMany()`, `client.events.subscribeAll()` (RPC websocket logs) and `pollEvents()`. Events: MarketCreated, BetPlaced, MarketResolved, MarketCancelled, PayoutClaimed, RefundClaimed, ResolutionFlagged, MarketFinalized, ResolutionOverridden. [H] sdk/reference/client.mdx, changelog.mdx
- Docs: https://docs.cyphers.live (source https://github.com/cypher-zk/docs). Auth: none beyond an RPC key; rate limits are those of the chosen Solana RPC (SDK batches 100 keys/call, concurrency 5, 3 retries). [H]
- Price/book: none. Account data would give pool totals only after reveal (side pools encrypted). Odds shown to users come from the app. [M]
- Fixtures: no API responses to save. Saved liveness probe only: `docs/research/fixtures/cypher/probe-2026-10-19.txt`.

## 5. Trade path

- Programmatic: yes via SDK `client.actions.placeBet` (build Anchor tx, x25519 encrypt side in client, send to Solana, wait for Arcium callback ~10 s; secret for the position is stored client-side as `cyphers:pos:*`, claims do not need it). Also createMarket, resolveMarket, flagResolution, claimPayout, claimRefund. [H] client.mdx, faq.mdx
- Signing: standard Solana transaction signing by a wallet implementing `signTransaction`; no API keys, no off-chain order signing. [H]
- PayBox reachability: **partial/no**. An EVM wallet cannot trade this; it needs a Solana wallet holding USDC + SOL, a custom Anchor instruction with Arcium encrypted inputs built locally, and a callback wait. A PayBox Solana credential could sign only if the plugin can submit arbitrary program instructions, which is a bespoke integration for a devnet beta. [M]

## 6. Fees

- Protocol fee typically 0.5%, max 1% (MAX_PROTOCOL_FEE_BPS 100), to treasury. Market-creator fee typically 1.5%, max 5% (MAX_LP_FEE_BPS 500). Both deducted from the bet up front (typical ~2% total), paid by the bettor; rates can change. Plus Solana tx fee (~$0.0005). Creator bond >= 20 USDC returned on clean close. No fee on exit because there is no exit. [H] fees.mdx, faq.mdx, constants.mdx

## 7. Resolution and dispute risk

- Resolver is a wallet chosen by the market creator (default: the creator). Resolver posts outcome after close; Arcium decrypts and computes payouts; 24-48 h challenge window; anyone can flag (no bond, only tx fee); an admin (protocol team) reviews and posts the final outcome via `adminOverrideResolution`. Resolver no-show for 7 days leads to Refundable. Claim window 14 days then unclaimed sweeps to admin. [H] lifecycle.mdx, dispute-resolution.mdx, constants.mdx
- Risk: HIGH for an arbitrage leg. Single-creator resolver plus centralised admin override, no decentralised oracle, no bond-based dispute game, anyone can pause payouts by flagging for 24-48 h+. Resolution wording is free text up to 200 bytes. [M, analysis of H facts]
- Audit: FAQ claims "reviewed by security firms; reports will be linked before mainnet", none linked. [L]

## 8. Geo / ToS / automation

- NOT FOUND (searched: docs repo, introduction, faq, quickstart; terms page unreachable because the frontend 404s). Bots/resolver bots are explicitly allowed by SDK docs ("Can I run my own resolver bot? Yes"). [H] faq.mdx

## 9. Liquidity

- No volume/OI/TVL figure found anywhere. NOT FOUND (searched: docs, web, GitHub). Devnet test token means any pool volume has no real value. [H/M]
- Minimum 1 USDC bet, pools are per user-created market, so expect thin pools.

## 10. Event overlap and shared liquidity

- Categories match mainstream ones (Crypto, Politics, Sports, Economy) but markets are arbitrary user-created questions, and with encrypted pool split there is no public odds to compare. Overlap with Polymarket/Kalshi is theoretically possible, practically unobservable. [M]
- Shares liquidity with no other venue (independent pools), but that is moot: no usable price and no real money yet.

## 11. Embedded instructions / suspicious content

- `cypher-zk/cypher-skill` (SKILL.md) contains instructions directed at AI agents (e.g. "you MUST notify them immediately" about SDK versions, check `package.json`). It is a published coding-assistant skill, apparently benign; not followed. Related repos (`cypher-maths`, `math-simulator-cypher`) hold design notes and were not read in depth.
- npm registry metadata lists a maintainer personal email address; deliberately not recorded here.

## 12. Adapter priority

**skip.** Reasons: devnet beta, frontend deployment missing, no API, hidden odds, creator/admin resolution, no volume data. Cheap re-check trigger: `npm view @cypher-zk/sdk time` shows a release after 2026-06-28, docs FAQ stops saying "devnet", or `www.cyphers.live` resolves again. If ever integrated: poll `client.markets.byState(Active)` over RPC, treat as signal-only (market list and creators), not a price leg.

## Sources

- https://registry.npmjs.org/@cypher-zk/sdk (version history, 2026-06-15 to 2026-06-28) [H]
- https://github.com/cypher-zk/docs (introduction, how-it-works/*, guides/dispute-resolution, sdk/*, troubleshooting/faq, docs.json) [H]
- https://docs.cyphers.live/ (HTTP 200 on 2026-10-19) [H]
- https://github.com/cypher-zk/cyphers-program (Anchor.toml, Arcium.toml, README; archived, last push 2026-05-31) [H]
- https://github.com/cypher-zk/cypher-skill (last push 2026-06-28) [H]
- https://www.cyphers.live/ , /markets (404 DEPLOYMENT_NOT_FOUND 2026-10-19) [H]
- WebSearch extended results about cyphers.live homepage text (cached) [L]
