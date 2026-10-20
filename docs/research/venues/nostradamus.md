# Nostradamus (imnostradamus.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of the public site and GitBook docs, public unauthenticated GETs to the site's own API host (3 GET endpoints + /health), one static JS bundle read as text (not executed), `gh search`. No account, wallet, signature, POST/PUT/DELETE or PayBox tool used. WebSearch was unavailable (session budget exhausted), so no third-party corroboration beyond predictionindex.xyz. Tags: H = read first-hand this session; M = secondary/inferred; L = weak/stale.

## Verdict

Adapter priority: **skip** (at most a P2 "signal-only" curiosity). The only product that is demonstrably live is a custodial 5-minute BTC/SOL/ETH up/down pool game with zero observed volume. The YES/NO AMM event markets described in the docs are not present in the live frontend bundle or API.

## Is it live (2026)?

- Site and API respond. Homepage is a Vite SPA shell, last-modified 2026-09-18 (H: https://www.imnostradamus.com/ response headers). API `GET /api/health` returned `status: healthy`, uptime ~1.97M s (~22.8 days), on 2026-10-19 (H: https://api.imnostradamus.com/api/health).
- 5-minute rounds are still being created automatically: round 157017 started 2026-10-19T04:45Z (H, fixture `prediction-last-rounds.json`). Round numbers imply ~157k rounds, consistent with the game running for a long time.
- BUT every one of the 5 latest rounds has `totalAmount=0`, `bullAmount=0`, `bearAmount=0`, `positions=[]` (H). A single 25-minute sample, not a volume study, but it shows no betting in that window. (Rounds still get BULL/BEAR `result` from the price feed.)
- Listed on predictionindex.xyz/ecosystem as "Nostradamus", tag "prediction game", X handle @SeerNostradamus (H: https://predictionindex.xyz/ecosystem). Launch-era image timestamp on that page suggests listing around Sept 2025 (M).
- The docs say "Release of Sports Prediction" and custom predictions are roadmap phase 4; Sports FAQ page says "This page is being updated" (H: sports/f.a.q..md). Docs also say "At launch, only Nostradamus creates prediction markets" (H: predictions/f.a.q..md) while the Create Prediction pages describe user-created markets with LP approval - the docs are internally inconsistent about what is shipped.
- Frontend bundle defines routes for `/prediction-events`, `/prediction-events/:id`, `/approval-curve`, `/user/market-positions` (H), but contains NO API calls for markets/events, and `GET /api/prediction-events`, `/api/active-predictions`, `/api/markets`, `/api/predictions`, `/api/sports`, `/api/events` all return 404 (H). `app.imnostradamus.com` (the WalletConnect metadata URL in the bundle) does not resolve in DNS (H). Conclusion: the AMM market product is at best not shipped in this build (M).

## Market model

Two distinct products (H unless noted):

1. **DEGEN "5-Min Cards"** (the live one): PancakeSwap-Prediction-style parimutuel rounds. Each 5-minute round locks a price (Pyth oracle) at `lockAt`, closes at `closeAt`; users bet UP/DOWN (API `BULL`/`BEAR`) on a token pair (SOL/ETH/BTC cited). Payout = `stake x (total pool / winning pool) x (1 - platform fee)`. One-sided rounds: winner gets stake back minus fee, loser's stake goes to treasury. Equal lock/close price = draw, everything to treasury. Bets are final (no cancel). Source: degen/5-min-cards/general-mechanics.md and f.a.q.md. Price scale in API: integer with 8 decimals (e.g. `lockPrice 105740000000` = 1057.40); asset not stated per round in the response (M: appears BNB-scale, but unlabelled; the round object has no asset field).
2. **Predictions / Sports (documented, not found live)**: binary YES/NO shares, AMM-priced ("no order books for now"), 1 USDC per winning share, price = probability, sell any time before close (H docs: predictions/trade-predictions-and-lp.md). Team-seeded liquidity; "I Am Nostradamus" user-created markets funded via an "Approval Curve" ($500-$20,000+ LP, 3h funding window). Not tokenised on a standard: no evidence of outcome tokens; positions appear to be database/contract-ledger entries in a custodial account (M).

## Chains and collateral

- Solana only. Docs: "All trading is done in USDC (on Solana)" for predictions; deposits page says "currently only Sol is available" / "Solana only for now" - the docs conflict on SOL vs USDC collateral (H: getting-started/deposit.md vs predictions pages). The 5-min game FAQ examples are denominated in SOL.
- Custodial model: signup creates "a personal Solana wallet" per user (H: general-mechanics.md); the bundle has email/password auth (`/auth/register`, `/auth/login`, `/auth/forgot-password`) plus `/auth/wallet-login` and "hybrid" endpoints `/solana-hybrid/prepare-place-bet` and `/prepare-claim-bet` that return prepared Solana transactions (H endpoint names from bundle; payload semantics not verified, POST not called).
- No program ID / contract address is published in the docs (NOT FOUND, searched: gitbook llms.txt + all key pages, bundle for base58 addresses; the only 44-char hits were Solana system programs and an unrelated `...pump` mint). Token ($NOSTRA) is described as pre-/at-TGE; no address found.

## Read API

- Official docs: NONE for the API (NOT FOUND, searched: gitbook llms.txt index, site, bundle). Classification: `unofficial-only` (undocumented first-party backend used by its own SPA).
- Base: `https://api.imnostradamus.com/api` (Express behind nginx, CORS `*`) plus Socket.IO on the same origin, event `all_game_events` (H: bundle).
- Unauthenticated GETs that work (H): `/health`, `/prediction/last-rounds` (last 5 rounds: `num`, `startAt`, `lockAt`, `closeAt`, `lockPrice`, `closePrice`, `totalAmount`, `bullAmount`, `bearAmount`, `positions[]`, `lockPriceSignature`, `closePriceSignature`, `result`). `/prediction/last-positions` returns 401 (auth). Others in the bundle need a Bearer JWT: `/auth/profile`, `/prediction/prediction-logs`, `/prediction/user-history`.
- No endpoint found for event markets, order books/prices, or trades of the YES/NO product.
- Rate limits: NOT FOUND (no headers observed).
- Fixtures: `docs/research/fixtures/nostradamus/prediction-last-rounds.json`, `health.json`.

## Trade path

- Programmatic only via the undocumented authenticated backend: `POST /prediction/place-position {amount, direction}` (custodial balance) and `POST /solana-hybrid/prepare-place-bet {amount, direction}` returning a transaction to sign (H: names from bundle; NOT called). Auth is a Bearer JWT from email/password or wallet-login (signing scheme unverified).
- Terms prohibit "automated scripts, bots, or exploits to influence predictions" (H: terms-and-conditions.md, section 9).
- PayBox reachability: **partial/no**. Venue is Solana-only, so EVM-only wallets (Base/Ethereum/BNB/Arbitrum/Polygon) cannot trade it. A PayBox Solana credential could in principle sign the `prepare-place-bet` transaction, or fund the custodial deposit wallet via `request_transfer`, but there is no documented API, so this would be reverse-engineering against ToS. Treat as `no` for planning.

## Fees

- 5-min game: platform fee by VIP tier of the stake/pool: VIP0 2.0%, Silver 1.8%, Gold 1.5%, Diamond 1.3%, Seer 1.0% (H: 5-min-cards/f.a.q.md). Terms section 5 says fees range "3.5% to 1.5%" and the Predictions FAQ says "1% fee on each trade" - three conflicting figures (H). Paid from the pool (winner side). Draws and one-sided losses go 100% to treasury.
- AMM markets: trading fee on each buy/sell by VIP tier; 60% to creators/LPs, 40% to treasury (team-listed markets: 100% treasury); LP add fee 0.75%; failed funding refunded minus 1% (docs) or 0.25% (terms) (H).
- No withdrawal fee stated; "All transactions are final, no refunds" (terms 5).

## Resolution and dispute risk

- 5-min game: Pyth price feed; a round can change after close if Pyth revises ("Why did the outcome of my round change after it ended?"), and rounds may be paused/voided if the feed fails (H: 5-min FAQ). Round objects carry `lockPriceSignature`/`closePriceSignature` (empty in samples, H).
- Event markets: UMA Optimistic Oracle - proposer submits outcome with news evidence, 2h dispute window, DVM vote on dispute (H: uma-resolution-system.md). Note UMA OO is natively EVM; how it settles a Solana-USDC venue is not explained (open question). Terms call it a "designated reporter" model, i.e. effectively centrally operated (M).
- Custodial, closed-source, no audit found (NOT FOUND, searched: gitbook, gh search "nostradamus prediction solana" and "imnostradamus": 0 repos). High counterparty risk.

## Geo / ToS / automation

- 18+; "reserves the right to restrict access to users from certain jurisdictions"; user responsible for local legality; no explicit jurisdiction list (H: terms sections 1, 4). Bots/automation prohibited (section 9). Provides "no refunds".

## Liquidity

- Observed: 0 stake in the 5 most recent rounds, 2026-10-19 04:25-04:55Z (H, fixture). No TVL, volume or OI published anywhere I could read (NOT FOUND, searched: gitbook, site, predictionindex page). Docs say LP requirement per market $500-$20,000+ (design target, not observed).
- Shared liquidity: none known; own pools/AMM. Uses Pyth only as oracle (not liquidity). Independent but effectively empty.

## Event overlap (arbitrage relevance)

- 5-min crypto up/down overlaps conceptually with short-dated crypto price markets on Polymarket/Kalshi/Limitless/Predict.fun, but parimutuel pooling with fees of 1-2% on the pool and zero liquidity gives no usable arbitrage leg.
- Docs' example event market ("Will Bitcoin close above $170k this month?") and "Candidate X win the election" are generic; sports/politics categories not confirmed live (L).

## Sources

- https://www.imnostradamus.com/ and /assets/index-Bm8MgOPQ.js (read as text) - H
- https://api.imnostradamus.com/api/health, /api/prediction/last-rounds (unauth GET, 2026-10-19) - H
- https://nostradamus-3.gitbook.io/nostradamus/llms.txt and pages: readme/introduction, readme/core-features, readme/roadmap, readme/token, degen/5-min-cards/general-mechanics, degen/5-min-cards/f.a.q, getting-started/deposit, i-am-nostradamus/create-prediction/funding-fees-and-revenue, .../resolution, predictions/trade-predictions-and-lp, predictions/f.a.q., uma-resolution-system, sports/f.a.q., terms-and-conditions (appended `.md`) - H (docs undated; roadmap and sports page suggest partially stale/in-progress, L for currency)
- https://predictionindex.xyz/ecosystem - H (listing only)
- Not found: GitHub repos, audits, on-chain program ID, Dune/DefiLlama volume, X/Telegram activity (@SeerNostradamus, t.me/NostradamusPortal not fetched).

## Embedded instructions / suspicious content

None found. Note: unrelated `...pump` Solana mint string appears in the bundle (likely a wallet-library or token list entry); not investigated.

## Open questions

- Does the YES/NO AMM product exist in production at another host/build? Is the asset for each 5-min round identified server-side?
- Real volume: no public stats; a longer sampling of `/prediction/last-rounds` would confirm whether the game is dead.
- Solana program ID and whether `prepare-place-bet` is a non-custodial on-chain program.
