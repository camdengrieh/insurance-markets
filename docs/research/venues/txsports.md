# Txsports (txsports.fun) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

SKIP. Txsports is a hackathon project (TxODDS x Superteam World Cup hackathon, June-July 2026) deployed on **Solana devnet only**, so the SOL staked has no real value. Last commit 2026-07-25, 0 GitHub stars, no mainnet deployment found. Even on its own terms it is a parimutuel pool with no price discovery of its own and a $50 per-bet cap, and it is seeded by the operator's own "platform liquidity wallet". It is not an independent arbitrage leg.

## Liveness

- Site responds: https://txsports.fun 308-redirects to https://www.txsports.fun/ (Vercel), HTML title "Txsports  trustless permissionless  prediction markets" [H, curl 2026-10-19].
- Repo created 2026-07-20, last push 2026-07-25, 0 stars, not archived [H, gh api repos/cdeveloper28/Txsports247111]. No commits in the ~12 weeks since.
- The static https://www.txsports.fun/fixtures.json lists 88 fixtures: 85 "simulation" (replays of past World Cup matches, `simulated: true`, kickoff timestamps 2026-07-25 onward that are clearly synthetic) and 3 "real" friendlies (Australia v Brazil, Liechtenstein v Gibraltar, etc., kickoffs Sep-Nov 2026) [H]. Whether the site still serves live data or is simply frozen is unknown.
- Web search found no independent coverage of Txsports; it only returned generic hackathon pages (agbrief, superteam.fun) [M, WebSearch extended]. Traction: none found.
- Status: "live" as a demo site on devnet, not a live money venue.

## Kind and market model

- Kind: onchain-other; parimutuel pools on Solana via a custom Anchor program `worldcup_market` [H, README + idl.json].
- Market model: 3-way categorical (Home / Draw / Away, `OUTCOME_LABELS`) on football match result only; no binary/scalar markets [H, app/src/config.ts].
- Not an order book or AMM. "Live implied odds are simply each pool's share of the total; there is no order book and no matching engine." [H, README]. Payout = stake x total pool / winning pool [H, README].
- Outcome tokenisation: none. Positions are PDA accounts (`Position`, seed ["position", market, owner]); markets are PDAs (seed ["market", fixture_id u64 LE, host pubkey]). Not transferable, no SPL tokens [H, README + developers page].
- Market uniqueness: per (fixture, host). Default host `PublicKey.default` is the shared pool; any app can create its own white-label pool universe on the same program, so liquidity is fragmented by host [H, DevelopersPage.tsx].
- Betting closes at kickoff for real fixtures (on-chain `closes_at`); cancel_bet gives full refund before close. Bets capped at "up to 50 USD worth" of SOL (README; enforced in UI or program not verified) [H/M].

## Chains and collateral

- Solana **devnet** only: program 4jVqmpAD67c1153GvJv82R9bghvtwegDQ76v4LvT8M8U, TxLINE oracle 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J (devnet) [H, README "Deployed (devnet)"; config.ts default RPC https://api.devnet.solana.com].
- Collateral: native SOL lamports held in the market PDA. No SPL token, no USDC [H, README].
- No mainnet program ID found anywhere in README, config or developers page (NOT FOUND; searched: README, config.ts, DevelopersPage.tsx, repo tree).

## Read API

- Official docs: none beyond README and an in-site Developers page (rendered from app/src/pages/DevelopersPage.tsx) [H].
- No REST/WebSocket API. Documented read path is Solana RPC: `getProgramAccounts` for `Market` and `Position` accounts, log subscription for Anchor events (`MarketOpened`, `BetPlaced`, `BetCancelled`, `MarketResolved`, `Claimed`) [H, DevelopersPage.tsx + idl.json]. Classified onchain-or-subgraph-only.
- Static files served by the site (unauthenticated GET, verified 2026-10-19) [H]:
  - https://www.txsports.fun/fixtures.json (32 KB; fixtureId, home, away, competition, kickoff ms, status, category simulation|real, odds [home,draw,away] decimal, finalOutcome)
  - https://www.txsports.fun/idl.json (22 KB Anchor IDL; instructions cancel_bet, claim, init_market, place_bet, resolve; accounts Market, Position)
  - feed-<fixtureId>.json replay feeds and live-<id>.json relay files (latter documented in commit message; not fetched)
- Fixtures: fixtureIds come from TxLINE/TxODDS (a third party). Odds in fixtures.json are TxODDS demargined consensus odds, not Txsports pool odds [M].
- Auth/limits: none from Txsports; subject to the Solana RPC provider's limits. TxLINE data feed itself needs a free-tier subscription/activation (README) [M].
- Saved fixtures: docs/research/fixtures/txsports/fixtures.sample.json (2 simulation + 3 real rows), docs/research/fixtures/txsports/idl.json.
- Not done: no JSON-RPC calls (these are POSTs; ground rules forbid POST), so devnet pool sizes and the on-chain market count are unverified.

## Trade path

- Programmatic via Anchor instructions: `init_market(fixture_id, closes_at, host)`, `place_bet(outcome, amount)`, `cancel_bet(outcome)`, `resolve(claimed_outcome, payload)`, `claim()` [H, README + idl.json].
- Auth/signing: ordinary Solana transaction signed by the bettor wallet (UI uses Reown/WalletConnect). No API keys, no off-chain signed orders [H].
- Any Solana keypair can trade without whitelisting; there is no limit order concept (pari-mutuel: price moves as others bet, final odds unknown until close).

## PayBox reachability

- Partial / not useful. The program is Solana-only, so EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon) cannot reach it. A Solana wallet through PayBox could in principle sign a transaction calling place_bet, but only on devnet SOL, which has no value and which PayBox is unlikely to support. Rated "no" for practical purposes. [M: inferred, PayBox tools not called]

## Fees

- No house edge/rake: "Parimutuel winners split the whole pool" and the sum of payouts equals the total pool [H, README]. Only Solana network fees and account rent are paid by the bettor (inferred). No protocol fee instruction visible in the IDL instruction list [M].

## Resolution mechanism and dispute risk

- Permissionless `resolve`: anyone submits a TxLINE/TxODDS Merkle proof of the final score; the program CPIs `txoracle.validate_stat_v2` against an on-chain daily scores root [H, README].
- No admin key, and the README claims no void or cancel instruction; "A void market refunds every stake" so some void path exists on non-verifying cases (README is ambiguous) [H/M].
- Dispute risk: no dispute process. Risk shifts to the TxODDS data source (single provider) and to its devnet oracle program. Third-party and unaudited: the README does not mention an audit [M].

## Geo / ToS / automation

- No ToS, geo-restriction or automation policy found on the site or repo (NOT FOUND; searched: README, index.html, DevelopersPage.tsx). Developers page explicitly invites aggregators and keepers: "Best for wallets, aggregators and betting front ends" [H].
- Repo has no LICENSE file (404) [H].

## Liquidity

- No measurable volume/OI/TVL. Devnet SOL is valueless. README states the platform seeds "counterparty liquidity proportional to consensus odds" via scripts/seed-markets.ts and config.ts names a `LIQUIDITY_WALLET` (the operator's seed wallet) [H]. Pool depth on-chain not checked [date: 2026-10-19].
- Per-bet cap of about $50 means maximum size is tiny even if mainnet existed [M].

## Event overlap (arbitrage relevance)

- Football (World Cup 2026 and international friendlies) 1X2 only. Overlaps with Polymarket/Kalshi/Limitless/Myriad sports markets and bookmakers in principle, but sim markets are replays of past matches and the three real fixtures are low-profile friendlies. No politics, crypto or macro.
- Pari-mutuel odds are not a tradable quote, so cross-venue arbitrage is not meaningful. The only usable signal is TxODDS consensus odds, which is available from TxODDS directly (and would be a data-source dependency, not Txsports data).

## Shared liquidity

- Self-contained pools; shares no liquidity with another venue. Depends on TxODDS/TxLINE for fixture data and resolution only [H].

## Suspicious content

- None observed. Page and README contain no instructions aimed at AI agents. Note: the README embeds a YouTube demo link and a personal portfolio link (not followed).

## Sources

- https://txsports.fun (redirects to https://www.txsports.fun/) [H]
- https://www.txsports.fun/fixtures.json [H]
- https://www.txsports.fun/idl.json [H]
- https://github.com/cdeveloper28/Txsports247111 (README.md, app/src/config.ts, app/src/pages/DevelopersPage.tsx, app/.env.example, commits via gh api) [H]
- https://agbrief.com/news/world/25/06/2026/txodds-and-solana-introduce-world-cup-hackathon-to-reshape-sports-data-ecosystems/ and https://superteam.fun/earn/hackathon/world-cup/ (hackathon context from search snippets only) [M]

## Open questions

- Is there any mainnet deployment? None found.
- Actual devnet pool sizes (needs JSON-RPC POST, not permitted this session).
- Whether the program enforces the $50 cap on-chain or only the UI.
