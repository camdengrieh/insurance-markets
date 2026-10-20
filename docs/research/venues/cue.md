# Cue (cue.fun) venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## Verdict

Skip. Cue is a tiny, referral-gated, Solana "opinion market" parimutuel app. It is not a prediction market on real-world events (the docs and press say price, politics and sports are excluded), so it has no arbitrage overlap with other venues. It has no documented API, and it looks dormant: its own backend lists zero OPEN markets, and the newest market was created 2026-06-30.

## Liveness

- cue.fun returns 307 to https://www.cue.fun/. The www root is a Next.js shell titled "CUE - Markets For Popular Culture" (H, curl 2026-10-19). Description meta: "Create cliques with your friends, make and trade on opinion markets" (H).
- https://www.cue.fun/app/markets returns HTTP 200, but it is a client-rendered shell (H).
- The site's own JSON API answers (see Read API), so the backend is running (H). It is not actively used:
  - `GET /api/markets?status=OPEN` returns `{"markets":[]}` (H, 2026-10-19). The status `PENDING_NEWS` is also empty (H).
  - The unfiltered `GET /api/markets` returns 50 markets, all `RESOLVED` (33) or `CANCELLED` (17). The newest `created_at` is 2026-06-30 and the oldest is 2026-02-22 (H).
- Verdict: the site is up but the venue is effectively dormant. The last market was created about 3.5 months ago and nothing is currently open (H for the data, M for the "dormant" inference).
- predictionindex.xyz/ecosystem lists Cue as Solana, binary, Live, with mechanism "n/a" and volume "n/a" (H). Its "Live" status is not borne out by the API.

## Market model

- Binary or two-image opinion markets. In the API, `type` is `BINARY` (41) or `IMAGE` (9), `experienceType` is `OPINION` (50 of 50), and `primaryCategory` is `POP_CULTURE` (50 of 50) (H, API sample).
- Each market has two outcomes with `poolSize` and `impliedOdds`. It is a pooled (parimutuel-style) market, not an order book or AMM (H for pools in the API; M for the parimutuel label).
- Resolution rule, from the Bankless article (Jan 12, 2026): the side with more capital committed at close wins, and the winners split the pool in proportion to their shares (H, Bankless). Market descriptions say "Resolution is based on the highest weighted side at close" (H, API).
- Earlier entries get more shares per dollar. No formula is published: NOT FOUND (searched: Bankless articles, site HTML, JS bundle strings for docs links).
- Outcomes are not tokenised as tradable tokens. Positions are bets in a pool, recorded by the app and on chain. Each market has an `onChainMarketId` that looks like a Solana address (H, API field). There is no secondary market (M).
- There is no external truth. "There are no objectively wrong answers" (H, Bankless). A hedge leg on another venue cannot lock in a payoff against a Cue outcome.

## Chains and collateral

- Solana, funded with USDC (H, Bankless). Wallets are Privy embedded wallets created at email sign-in. The JS bundle also shows Privy auth, MoonPay and Coinbase on-ramps, and Solana RPC (H, JS bundle; tooling only).
- NOT FOUND: program ID, USDC mint, or contract source (searched: site JS, Bankless articles; GitHub was not searched in depth and no repo is linked from the site).

## Read API

- Docs: NOT FOUND (searched: cue.fun, www.cue.fun/app/markets, docs.cue.fun and api.cue.fun, which do not resolve; Bankless; predictionindex.xyz). Classification: unofficial-only.
- The site frontend calls an undocumented same-origin JSON API (H, read from the site's JS bundle and a live GET).
  - Base URL: `https://www.cue.fun`.
  - `GET /api/markets` returns all markets. The response was 13.5 MB because every market embeds a base64 image, which is impractical to poll (H).
  - `GET /api/markets?status=OPEN|PENDING_NEWS|RESOLVED` filters by status (H).
  - Other paths seen in the bundle, not called (M): `/api/markets/first`, `/api/feed/clique-markets?privyId=`, `/api/feed/following-bets?privyId=`, `/api/user?privyId=`, `/api/bets/sync-onchain`, `/api/points/verify`. The user and feed paths need a Privy identity.
- Response shape: see `docs/research/fixtures/cue/markets_sample.json` and `markets_open_empty.json`.
  - Market fields: `id`, `title`, `description`, `status`, `type`, `experienceType`, `primaryCategory`, `outcomes[]` (`id`, `label`, `poolSize`, `impliedOdds`), `totalPool`, `volume_usd`, `participants`, `totalBets`, `created_at`, `resolveAt`, `resolutionOutcomeId`, `onChainMarketId`, `cliqueId`.
- Auth and limits: none needed for the GET. Rate limits are not documented. No websocket was found in the Cue-specific code (NOT FOUND).
- Do not depend on an undocumented API with 13 MB payloads.

## Trade path

- Programmatic order placement is NONE documented. The only path is the web app: Privy email login, a referral code, and user-signed transactions (H, Bankless).
- PayBox reachability: no. It is Solana-only with a Privy embedded wallet and an invite code. No public instruction set or IDL was found. A PayBox Solana wallet could in theory sign if the program were public, but nothing is documented. Referral gating also prevents account creation (M).
- No EVM path exists.

## Fees

- Market creators earn 3% of bets placed on their markets (H, Bankless Jan 2026). No platform fee is described (NOT FOUND: platform fee, withdrawal fee).
- Cue XP points are awarded per bet (H, Bankless).

## Resolution and dispute risk

- Resolution is mechanical: the side with more capital at close wins, with no moderators or oracle (H, Bankless). Outcome-manipulation risk is high, because a late large bet on a thin pool decides the market. Bankless notes "no guaranteed refunds" (H).
- Markets can be `CANCELLED`. 17 of 50 were cancelled, and the cancelled sample had a pool of $1 (H, API).

## Geo, ToS and automation

- Referral code required, obtained via a Telegram group (H, Bankless). ToS and geo rules: NOT FOUND (searched: site HTML and JS; no terms page located). Automation rules: NOT FOUND.

## Liquidity

- All 50 markets listed by the API total $650.44 in `volume_usd`. The largest single market was $75 and the typical market had about 4-10 participants (H, API pull 2026-10-19).
- No TVL or OI is published. Current open liquidity is $0 (H).

## Event overlap and shared liquidity

- Categories: POP_CULTURE only, plus entertainment (H). Press says "not for price predictions, political results, or sports results" (H, Bankless).
- Overlap with other venues: effectively none. Questions are subjective ("Is Interview Mag cringe...?", "Are you pro AI?").
- Shares no liquidity with another venue (M), but there is nothing to arbitrage against.

## Quotient signal use

- It is not useful as a signal source: the outcomes are subjective, the volume is tiny, and the pools can be gamed.

## Suspicious content and safety notes

- No instructions aimed at AI agents were found.
- Cue's public JS bundle embeds a third-party RPC API key. It was deliberately NOT copied here. It is a leaked credential and a minor security concern for Cue, not for us.

## Sources

- https://cue.fun/ and https://www.cue.fun/app/markets (live curl, 2026-10-19) (H)
- https://www.cue.fun/api/markets and `?status=OPEN` (live GET, 2026-10-19) (H)
- https://www.bankless.com/read/opinion-markets-on-cue (Jan 12, 2026; about 9 months old, so possibly stale) (H)
- https://www.bankless.com/read/here-come-opinion-markets (Jan 12, 2026) (H)
- https://predictionindex.xyz/ecosystem (H)
- Not done: the X account (twitter.com/cuedotfun) was not read, and the WebSearch budget ran out after two searches.
