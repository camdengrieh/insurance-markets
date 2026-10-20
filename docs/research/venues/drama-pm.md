# Drama PM (drama-pm-client) - venue spec

Researched 2026-10-19. Verdict: **skip**. Only artefact found is a Solana Anchor SDK on npm; no website, no public API, no evidence of mainnet deployment or any volume. WebSearch budget was exhausted this session, so web-search-based discovery was NOT performed (see Gaps).

## Summary

- kind: onchain-other (Solana Anchor program, admin-created fixed-price Yes/No markets). [H, from npm package contents]
- Live status: UNKNOWN / no evidence of being live. npm package last published 2026-03-02 (v0.4.14), about 7.5 months before today. 10 npm downloads in the last month (2026-09-17..2026-10-16). README examples use devnet only. [H: registry.npmjs.org, api.npmjs.org]
- No website, docs site, repo, or app URL is linked from npm metadata (no `homepage`, `repository`, `bugs`). [H]

## Market model [H, read from package IDL `dist/idl.js`, v0.4.14]

- Binary Yes/No only. `Outcome` enum = {No, Yes}. No categorical or scalar.
- NOT an order book and NOT an AMM. It is a fixed-price share sale: admin sets `yes_price` and `no_price` (u64 raw units of the betting token, README example 1.2 and 0.8 USDC) at `create_market`. `place_bet` takes `amount` and `buy_outcome`; error 6007 "Amount must be an exact multiple of the outcome price" means shares = amount / price. Prices are static per market, so there is no price discovery and no book; implied probability would have to be inferred from the admin-set prices (and they sum to 2.0 in the README example, which is not a probability).
- Outcomes are tokenised as two SPL mints per market (PDA `yes_mint`, `no_mint`); a vault PDA holds the betting token (`bettingToken`, USDC in examples). `Market` account fields: admin, market_id, yes_mint, no_mint, betting_token, vault, yes_price, no_price, create_time, end_time, status {Active, Closed, Resolved, Refunded}, winning_outcome (Option), total_yes_supply, total_no_supply, bump.
- Instructions: add_admin, remove_admin, initialize_config, migrate_config, update_fee_config, create_market, place_bet, close_market, resolve_market, claim_rewards, claim_burn_market, burn_market_tokens, refund, close_market_account.
- Markets are keyed by (admin, market_id): multiple authorised admins can create markets (`GlobalConfig.authorized_admins`). So it is a permissioned/curated system, not permissionless.
- Nothing in the IDL describes secondary trading; outcome tokens are plain SPL tokens, so they could in theory be traded on a Solana DEX, but no evidence any pool exists.

## Chains and collateral

- Solana. Program id in IDL: `BqYjRiMGYHMfKTwwra7Lg8eMxEKF3oJiTkPEwir1hw3s` (public program address, not a user wallet). [H, from IDL]. I could NOT confirm it is deployed on mainnet (see Gaps).
- Collateral: any SPL mint chosen per market (`betting_token`); README says USDC. [H]

## Read API

- Official/public HTTP API: NONE FOUND (searched: npm metadata/readme, GitHub repo and code search, package contents, WebFetch of npm page [403]). exists = unknown, effectively on-chain only.
- On-chain read: `client.getMarketAccount(admin, marketId)` via Anchor `program.account.market`; PDAs derivable with exported helpers (seeds: config, market, yes mint, no mint, vault). Enumeration would need `getProgramAccounts` filtered by the Market discriminator against the program id on a Solana RPC. [M: derived from IDL; not exercised, because JSON-RPC is a POST and the ground rules forbid POST]
- Events in the IDL (could be indexed from logs): MarketCreated, PlaceBetEvent (market, user, outcome, amount, shares), ResolveMarketEvent (winning_outcome, status, fee_amount), ClaimRewardsEvent, RefundEvent, CloseMarketEvent etc. [H]
- Websocket / rate limits / auth: NOT FOUND (only Solana RPC provider limits apply).
- No fixtures saved: there is no public read API to hit.

## Trade path

- SDK `drama-pm-client` builds unsigned Solana `Transaction`/`TransactionInstruction` objects (`buildPlaceBetTx`, `buildClaimRewardsTx`, `buildRefundTx`), signed by the user's Solana keypair. [H]
- PayBox reachability: EVM-only wallets (Base/Ethereum/BNB/Arbitrum/Polygon) cannot trade it. A PayBox Solana wallet could in principle sign a raw Solana transaction proposal if PayBox supports arbitrary program-call transactions on Solana (not verified; PayBox tools were not called). paybox_reachable = no (partial at best, theoretical only), and there is nothing live to reach.

## Fees [H, IDL; amounts unknown]

- `GlobalConfig { authority, authorized_admins[], fee_bps: u16, fee_recipient, fee_claim_bps: u16 }`. `place_bet` has a `fee_recipient_token` account, so a fee appears to be taken on bet; `ResolveMarketEvent.fee_amount` implies a fee at resolution. Error 6027 caps fee at 10%. Actual fee_bps values on any deployment: NOT FOUND (would need on-chain read). Exact formula not confirmed (no source for the program, only the IDL).

## Resolution mechanism and risk

- Admin-only: `resolve_market(admin, marketId, winningOutcome | null)`; `null` => Refunded status (users `refund`). No oracle, no dispute window, no bonding, no decentralised resolution visible in the IDL. [H for instruction signature; M for the "no dispute" inference]
- Risk: full admin trust (centralised resolver also holds create/close/resolve powers and an authority can change fees via `update_fee_config`). Program upgradability / authority status NOT FOUND. Treat as unaudited; no audit found.

## Geo / ToS / automation

- NOT FOUND (no website or terms located).

## Liquidity

- NOT FOUND. No volume, TVL or OI source. Only usage signal: 10 npm downloads/month (api.npmjs.org, window 2026-09-17..2026-10-16) and package dev cadence (many versions between 2025-11-20 and 2026-03-02). The fixed-price design implies no resting liquidity at all; the program only sells shares against its vault.

## Event overlap with other venues

- Unknown; no known market list. Admin-created custom (probably Chinese-language "drama"/entertainment-style) markets are plausible but unverified [L]. No evidence of sports/politics/crypto/macro markets that could be arbed. Fixed prices that are not probabilities make cross-venue price comparison meaningless anyway.

## Shared liquidity

- None known; independent but empty.

## Name collision warning

- `https://drama.fun` (200 OK) is a Chinese-language meme-coin / pump.fun + Hyperliquid autonomous-trader project ("MEME 生存共赢"), with endpoints /api/dashboard, /api/standings, /api/token-stats. It mentions nothing about prediction markets or the program id, and I do NOT consider it the same venue. [H that the page content is as described; M that it is unrelated.] I only found it by guessing a domain, so this is not evidence of the venue's website.

## Adapter priority: skip

Reasons: no website, no API, no evidence of mainnet or any volume, devnet-only examples, fixed admin-set prices (no market-implied probability), centralised admin resolution, Solana-only, ~10 downloads/month. Revisit only if the program id shows mainnet activity or an official site appears.

## Gaps / not found

- NOT FOUND (searched: npm registry + readme + tarball contents, GitHub repo search for "drama-pm"/"drama_pm", GitHub code search for the program id, WebFetch of npm page [403], explorer.solana.com [429], solscan [403], solana.fm [502]). WebSearch could not be run (session budget exhausted), so social/Chinese-language-web discovery was not done.
- Not confirmed: whether the program is deployed on mainnet, whether any real markets exist, fees, upgrade authority.

## Sources

- https://registry.npmjs.org/drama-pm-client : package metadata, publish times, README (Chinese), v0.4.14 [H]
- https://registry.npmjs.org/drama-pm-client/-/drama-pm-client-0.4.14.tgz : package `dist/idl.js` (Anchor IDL: instructions, accounts, errors, program address); read statically only, no code executed [H]
- https://api.npmjs.org/downloads/point/last-month/drama-pm-client : 10 downloads (2026-09-17..2026-10-16) [H]
- https://drama.fun : unrelated-looking meme project, name collision [H on content]

## Suspicious content

- None found (no embedded instructions in README/IDL).
