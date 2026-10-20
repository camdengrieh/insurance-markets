# metapredict (metapredict.xyz) venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Adapter priority: **skip**. Technically live (site, API, mainnet program all respond) but de facto dormant and negligible: 5 markets, lifetime volume about 38.5 PAPER in total, last user bets 2026-08-27, settles in a house-issued token (PAPER) with no DEX market, and only crypto up/down 5/15-minute micro-markets. [H]
- Useful only as a design reference: the API is clean, public and anonymous-readable.

## Is it live in 2026?

- Homepage `https://www.metapredict.xyz` returns 200, Next.js on Vercel, served 2026-10-19. [H, curl]
- `GET /api/health` returns `{"ok":true,"data":{"ok":true,"version":"0.1.0","cluster":"mainnet",...}}`. [H, fixtures/metapredict/health.json]
- Five topics, all `isActive:true`, created 2026-08-18 (four) and 2026-08-23 (wpond-15m). [H, fixtures/metapredict/topics.json]
- Activity is very thin. Homepage "Recent predictions" lists nothing later than 2026-08-27 (about 7.5 weeks stale), and bets are $0.98 to $2. The frontend shows "$18 Vol", "$3 Vol", "$10 Vol", "$5 Vol", "$3 Vol" per market. [H, homepage text 2026-10-19]
- Rounds are started lazily by the first bettor (see `start-and-predict`), so an "active round" can be stale. `btc-up-5m` active round 15468 started 2026-10-16 18:55 UTC with both pools at 0 and was still the "active" round on 2026-10-19. [H]
- npm `@openpredict/metapredict-sdk@0.1.0`, published 2026-07-04, described as "the official TypeScript SDK for the Metapredict prediction-market API". Only one version, no repository field. [H, registry.npmjs.org]
- Correction to the discovery hint: the chain is **Solana mainnet**, not an EVM chain. "no Solana deps" in the SDK description means the SDK itself is fetch/SSE only. Evidence: CSP connect-src allows `*.solana.com` and `*.helius-rpc.com`; `/api/network` returns Solana program ids; all pubkeys are base58. [H]

## Kind and market model

- Kind: on-chain (Solana) parimutuel, binary, short-duration price-direction rounds. [H, site JS payout function + API]
- Each "topic" (e.g. `btc-up-5m`) repeats rounds. A round has `startTimestamp`, `lockTimestamp` (150 s after start for 5m topics, 450 s for 15m), `closeTimestamp` (300 s / 900 s), `yesPool`, `noPool`, `oracleStartValue`, `oracleOutcome`. [H, `/api/topics/btc-up-5m/round`, `/api/topics/btc-up-15m/round`]
- Outcomes are not tokenised. A user holds a `Prediction` account (position yes/no, amount, nonce) and there is no tradable YES/NO token or order book. No secondary trading, no exit before close. [H, user activity fixture]
- Payout logic (from site JS `derivePayout`): winner payout = stake + (losingPool - primePoolAmount) * stake / winningPool - claimFee, where claimFee = that profit * claimFeeBps / 10000. Tie refunds the stake. [H, site chunk 7e05acb0dd0ab2c4.js; read only, not executed]
- One-sided rounds are common: the sampled history shows `yesPool` > 0, `noPool` = 0, outcome "no" labelled `lost`; homepage lists "claimed ... (even)", which is consistent with refunds when a side is empty. [H for the data, M for the refund interpretation]
- Market types in client code: `price`, `sports`, `event` (resolve params `priceParams`, `sportsParams`). Only `crypto` price topics exist live. [H, chunk aa2afc72f7af0cfe.js; M that sports/event are not live]
- Topic fields seen: slug, pubkey, question, strategyName ("PAPER"), predictionMint, isActive, isPaused, streamSlug, oracleFeedId, oracleVaultPubkey, marketConfig{direction,streamSlug,type}, lifetimeVolume. Live topics: btc-up-5m, btc-up-15m, sol-up-5m, sol-up-15m, wpond-15m. [H]

## Chains and collateral

- Chain: Solana mainnet. Program id `METAbUpvQptGqd6jgWHMUYxWLdF5ssMuGghTNP6Zqju`, proof program `METAPrfv6wozNPXa22ong6JxdVUeFHp5apqtpq5Ksvy`. [H, `/api/network`]
- Collateral: **PAPER** ("PaperUSD", 6 decimals, mint `PAPERu8xjrqfjBLj8XG6FCiokuk7pG1GzUbRTYwX1nU`). Bets settle in PAPER; UI text "Predictions settle in PAPER - SOL is converted when you confirm". [H, site chunks f176b8b4dd3403e7.js and 7cd5bdfda4c584b5.js]
- SOL to PAPER conversion goes through metapredict's own oracle-quoted swap (`/tx/swap`, `/oracle/swap-envelope`), with a `feeBps` in the quote. DexScreener returns no pairs for the PAPER mint, so there is no outside market for it. [H for swap endpoints and null DexScreener result; M that this is the only on/off ramp]
- The UI contains a "Claim 100 PAPER + 1 ..." starter grant described as enabled on devnet only. [H, chunk dbd56ec1ae4a7bbe.js]
- Whether PAPER is hard-pegged to $1 is NOT FOUND (quote fields `usdIn`, `lamportsIn`, `solUsdRate`, `paperOut` exist, so a USD-denominated quote is likely). [M]

## Read API

- Status: **official, public, anonymous for reads**. Docs: no standalone docs site (`/docs`, `/llms.txt`, `/api/docs`, `/api/openapi.json`, `/terms`, `/about` all 404); the documentation is the npm README of `@openpredict/metapredict-sdk`. [H]
- Base URL: `https://www.metapredict.xyz/api` (SDK default). Envelope `{ok:true,data,ts}` / `{ok:false,error:{code,message}}`. [H]
- Verified unauthenticated GETs on 2026-10-19 (all 200): `/topics?limit=N` (5 topics; has `nextCursor` paging per SDK), `/topics/{slug}`, `/topics/{slug}/round`, `/topics/{slug}/chart?windowMinutes=` (returned empty `points` for btc-up-5m), `/events?limit=` (empty list), `/health`, `/network`, `/version`, `/users/{wallet}/activity`, `/users/{wallet}/predictions`. [H]
- Documented in the SDK README, not individually tested: `/rounds/{pubkey}`, `/users/{wallet}/claimables`, `/tx/status/{sig}`, `/oracle/start-price`, `/oracle/swap-envelope`, `/referrals/leaderboard`. [H for README, untested]
- Live SSE (no websocket): `/sse/topic/{slug}/round` (events round.snapshot/update/resolved/next), `/sse/user/{wallet}/predictions`, `/sse/stream/{slug}/price` (price.tick). Heartbeat every 25 s. SSE needs `Authorization: Bearer` per README (not tested). [H README]
- Auth: anonymous works for reads and tx builds. API keys optional for "higher rate limits and reward attribution": `mp_pk_anon_...` (via `POST /keys/anonymous`), `mp_pk_live_...` (via `POST /keys/signup` with wallet signature). `/keys/me` without a bearer key returns 401. I did not create keys. [H]
- Rate limits: numeric limits NOT FOUND (searched README, response headers; no RateLimit headers seen; the anonymous-key response reportedly contains a `rateLimits` object, but obtaining it needs a POST which was off limits). Responses carry `x-key-tier: none`. [H]
- Pools in the round endpoint are raw base units (6 decimals). Prices: there is no probability or order book; implied odds = pool ratio only, available at lock/close. Price implied for an arbitrage engine would be `yesPool/(yesPool+noPool)` before fees, and almost always undefined (0/0).
- Notable: the public `/api/network` response embeds a third-party RPC URL including an API key in the query string. I did not copy it into fixtures or notes. Do not use it (not ours to use). [H]

## Trade path

- Official, but Solana only: `POST /tx/predict` (body: topicSlug, side yes/no, amount, wallet) returns `txBase64` (unsigned) plus `expiresAt` and a `debug` object of wired accounts; `POST /tx/start-and-predict` for a stale topic; `POST /tx/claim`; `POST /tx/swap` + `POST /tx/swap/confirm`; `POST /tx/submit` relays a signed tx; `GET /tx/status/{sig}`. [H, SDK README; not called]
- Alternative: build instructions locally with the oracle quote from `/oracle/start-price` (README). [H]
- Settlement/reaping is permissionless: any wallet may pay to verify/claim for an owner and reap losers; payout pinned to the owner ATA. [H, IDL docs in chunk fa0901cc99b10014.js]
- Can an EVM wallet via PayBox trade it? **No.** The venue is Solana-only. [H]
- Can a PayBox Solana credential? **Partial.** PayBox supports `solanaTransaction` signing via `request_wallet_sign` and a `solana:mainnet` transaction-proposal kind (<= 1,232 bytes, one signer who is fee payer, no durable nonce) (see docs/research/06-paybox-platform.md, H). A `/tx/predict` base64 tx fits that shape in principle, but the wallet would first need PAPER (SOL to PAPER swap through metapredict's own oracle swap, 2 round trips) and the tx size and signer count were not checked. Never tested. [M]
- Positions can only be held to close; no exit. A cross-venue hedge leg cannot be unwound.

## Fees

- Config has `feeBp` per topic/strategy (u16) in the `create_topic` instruction, a `fee_destination`, a "prime pool" fee capped at 10% (`PrimeBpTooHigh`: "Fee too high - must be 10% or less"), and `claimFeeBps` applied to winners' profit. Actual values on the live topics: NOT FOUND (on-chain config not read; only an unauthenticated JSON-RPC POST could read it and that was out of scope). [H for structure, value NOT FOUND]
- Swap SOL/PAPER includes `feeBps` in the quote; value not observed. [H for field, value NOT FOUND]
- Fee payer: the claimant (winner profit) pays the claim fee; the swap user pays swap fee. Gas by the signer unless the relay is used. [M]

## Resolution mechanism and dispute risk

- Oracle-signed prices: round start price and close price come from a signed quote (`/oracle/start-price`, `oracleFeedId`, `oracleVaultPubkey`, trusted-signer envelope; errors `WrongTrustedSigner`, `FeedNotInPayload`). The underlying streams are `built-in-coingecko-crypto-usd-btc` and `jup-price-v3-wpond`; SOL was not checked. [H]
- Dispute mechanism: none documented. Trust is in the oracle signer and the admin. Admin controls exist: `ProgramFrozen` ("Program is frozen"), pause/unpause topics, a function that forces Tie refund. [H, IDL docs and error table]
- Programme upgrade authority and audit status: NOT FOUND (searched site JS, npm).
- Tie/flat handling: tie refunds stake. Exact tie definition NOT FOUND.

## Geo, ToS, automation

- Wallet connect drawer says "By connecting, you agree to the Terms of Use." No `/terms` page exists (404). Geo-blocking or restricted-jurisdiction rules: NOT FOUND (searched homepage, site JS, 404 pages). [H]
- Automation: the SDK is the "official" public client, anonymous keys exist, and bots/agents appear to be expected. No explicit prohibition seen. [M]
- The product is real-money gambling-style markets on-chain; licensing: NOT FOUND.
- Could not use WebSearch for external coverage or operator identity (session search budget exhausted); operator identity NOT FOUND. GitHub org `OpenPredict` exists but no metapredict repo found by `gh search repos`; the link to the npm scope is unverified. [L]

## Liquidity

- Lifetime volume per topic (API `lifetimeVolume`, PAPER base units, 2026-10-19): btc-up-15m 17.79, sol-up-15m 9.87, wpond-15m 4.97, sol-up-5m 2.96, btc-up-5m 2.95. **Sum about 38.5 PAPER.** [H]
- Live per-market volume on homepage: $18, $10, $5, $3, $3. [H]
- TVL/OI: NOT FOUND; effectively near zero (active rounds had 0/0 pools on 2026-10-19).

## Event overlap with other venues (arbitrage)

- Only crypto price direction (BTC, SOL, wPOND up in 5 or 15 minutes). Overlap with Polymarket/Kalshi/Limitless 5m/15m/hourly crypto up/down markets exists in principle (BTC, SOL), but: window alignment differs (round start is when the first bet lands, not clock-aligned), pools are empty, no quoted odds exist, and no exit exists. Not a viable arbitrage leg. [M]
- Sports and event types are in the client code but have no live topics. [H]

## Shared liquidity

- Independent liquidity (own pools). No evidence of shared liquidity with another venue. [M]

## Fixtures

- `docs/research/fixtures/metapredict/topics.json` (GET /api/topics?limit=100)
- `docs/research/fixtures/metapredict/round-btc-up-15m.json` (GET /api/topics/btc-up-15m/round)
- `docs/research/fixtures/metapredict/health.json` (GET /api/health)
- `docs/research/fixtures/metapredict/user-activity-sample.json` (GET /api/users/{wallet}/activity?limit=2; the public on-chain wallet address in the userPubkey field was replaced by a placeholder; other fields untouched)

## Open questions

- Actual `feeBp`, `claimFeeBps`, swap `feeBps`, and min/max prediction values (needs an on-chain account read).
- Rate limits for anonymous and live API keys.
- Terms of Use text and geo restrictions.
- Whether PayBox can validate and sign a `/tx/predict` transaction within its Solana proposal constraints.
- Who operates it and whether it is audited.

## Sources

- https://www.metapredict.xyz (homepage, 2026-10-19) [H]
- https://www.metapredict.xyz/api/topics, /api/topics/{slug}, /api/topics/{slug}/round, /api/health, /api/network, /api/version, /api/events, /api/users/{wallet}/activity [H]
- https://www.metapredict.xyz/_next/static/chunks/ (site JS, read as text only: payout function, token constants, IDL docs, error table, devnet-only claim) [H]
- https://registry.npmjs.org/@openpredict/metapredict-sdk (README, published 2026-07-04) [H]
- https://api.dexscreener.com/latest/dex/tokens/PAPERu8xjrqfjBLj8XG6FCiokuk7pG1GzUbRTYwX1nU (no pairs) [H]
- Repo-internal: docs/research/06-paybox-platform.md for PayBox Solana signing constraints [H within repo]
