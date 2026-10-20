# Mako Market (Mako Markets) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip** (monitor only). Monad TESTNET only (chain 10143), small hackathon-origin project, ~$687 cumulative testnet pool volume, no independent liquidity, no documented API, centralised single-resolver for pools. Revisit only if a mainnet deploy is announced.

## Is it live (2026)?
- Live as a testnet beta: site header "BETA", "MONAD TESTNET" label, "Rounds are not live on Mako Market yet. Pools are open now." on mako-markets.vercel.app [H] (https://mako-markets.vercel.app). Same app is canonical at https://makomarket.xyz (HTTP 200; vercel.app alias also serves /api/stats) [H].
- Repos pushed 2026-10-14 (contracts) and 2026-10-17 (app) [H] (gh api repos/jesterkeri/mako-contracts, repos/jesterkeri/mako-markets).
- The repo README says rounds exist ("15-minute Up or Down rounds ... every two hours, starting with BTC/USD") and one round was settled end to end 2026-10-12 via a Chainlink CRE workflow [H]. The vercel.app page text says rounds are not live yet; /api/stats shows 84 rounds scheduled, 79 refunded one-sided, 6 entries, 2 entrants [H]. So rounds are effectively a trial.
- No mainnet. Whitepaper: "Mainnet deployment requires an audit pass"; "L2 or mainnet" listed as future work, "pending audit" [H] (WHITEPAPER.md, possibly stale: it still describes the April native-MON contract).

## Kind and market model
- Kind: onchain-other, parimutuel (no order book, no AMM, no prices) [H].
- Pools (MakoMarketsV4): anyone creates a binary YES/NO pool; bets go into one pot, winners split the pot pro rata. Outcome enum UNRESOLVED/YES/NO/REFUND. Market types FOOTBALL, CRYPTO, BASKETBALL, FOREX, COMMODITIES, STOCKS, MAKO (house-curated "anything goes", resolved manually). Duration 5 min to 7 days. Outcomes are NOT tokenised: stakes are stored in contract mappings (yesBets/noBets per address), no ERC-1155/ERC-20 position tokens [H] (src/MakoMarketsV4.sol).
- Rounds (MakoRoundsV1): 15-minute BTC/USD Up or Down, entries close at round start; one-sided or no-valid-price rounds refund everyone [H] (README, deployments json).
- Implied odds only: multiplier(id,isYes) and previewPayout(id,isYes,amount) views give the live parimutuel payout multiple; it moves with later bets, so there is no firm quote [H].

## Chains and collateral
- Monad testnet, chain id 10143 [H].
- Collateral: USDC-compatible ERC-20 at 0x534b2f3A21130d7a60830c2Df862319e593943A3 (6 decimals) on the testnet [H]. Whether it is a faucet/test token: NOT FOUND (searched: contracts README, AGENTS.md, deployments json). Assume no real value on testnet [M].
- Contracts (testnet): Pools 0xbC5A58487D7949dA2B76aC84AfC032fD0aa26195; Rounds 0x9dC0e0b9E8F1905740D8B98E90fe07288dcC2921 [H].
- Original April 2026 contract was native MON (MakoMarkets.sol, Monad Blitz Lagos hackathon), superseded [H].

## Read API
Exists: **partial / unofficial**. No documented public API or docs site (NOT FOUND: searched site, both READMEs, WHITEPAPER, file trees).
- Base: https://makomarket.xyz (alias https://mako-markets.vercel.app).
- `GET /api/stats` works unauthenticated, `cache-control: no-store`, returns aggregate indexer totals (wallets, bets, volume in 6-dec USDC base units, communityPools, rounds{...}, growth[] daily series, indexedStatus, readAt) [H]. Fixture: docs/research/fixtures/mako-markets/api-stats.sample.json.
- `GET /api/discover/crypto` returns reference spot prices (BTC, ETH, SOL, ... MON flagged testnet) for market creation, not market data [H]. `GET /api/charts` returned `{"error":"bad_params"}` without params (not explored) [H].
- Per-market data is not exposed on a documented REST route. Routes seen in the app source (auth, comments, leaderboard, news, aa/send, aa/sponsor, pm/markets/draft, me/rounds) are app-internal [H]. Do not assume stability.
- Real read path = on-chain: eth_call getMarket(id), getUserBet, previewPayout, multiplier, marketMinLiquidityRatioBps, nextMarketId; events MarketCreated, BetPlaced, MarketResolved, Claimed, CreatorFeePaid [H]. There is also a project Envio indexer (GraphQL/Hasura, URL is env-configured and not published) [H]; ABI file MakoMarkets.dune.abi.json in app repo [H].
- Auth/limits/websocket: none documented. Envio project budget noted in source as 100 queries/min shared with the app [H]. No websocket [NOT FOUND].

## Trade path
- On-chain only: approve USDC to the pool contract, then `placeBet(id, isYes, amount)`; `claim(id)` after resolution; `forceRefund(id)` by anyone 24h after close if unresolved; `createMarket(...)` [H].
- Constraints: MIN_BET 0.10 USDC, 30 s cooldown between bets per wallet per market, per-wallet cap and wallet-share cap (admin-tunable), owner `setBlocked(wallet)` blocklist, MIN_CREATOR_SEED 1 USDC, max 10 market creations/day/wallet [H].
- App users sign in with Privy email and get ERC-4337 Safe accounts with Pimlico gas sponsorship [H]; a plain EOA/wagmi path also exists.
- No signed-order / off-chain order API [H].

## PayBox reachability
**no** (for now). PayBox EVM wallets could in principle submit `approve` + `placeBet` transaction proposals, but the venue exists only on Monad testnet (chain 10143) with no real-value collateral, and Monad is not among PayBox's usual chains (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) [M; PayBox chain list not re-verified this session]. Would only become reachable if a mainnet deploy lands on a supported chain.

## Fees
- Pools: protocolFeeBps 100 (1%) + creatorFeeBps 200 (2%) of the pot, defaults, owner-tunable up to MAX_TOTAL_FEE_BPS 500 (5%); snapshotted per market at creation. Creator fee only paid if both sides hold real money and loser side >= minLiquidityRatio (~4.08% of winner side at 2% fee); otherwise market refunds, no fees [H] (V4 source, WHITEPAPER section 6).
- Gas: sponsored for email accounts; otherwise MON testnet gas [H].
- Rounds fee: NOT FOUND (not read).

## Resolution and dispute risk
- Pools: single permissioned `resolver` hot wallet calls `resolveMarket(id, outcome)`, driven by an off-chain Cloudflare Worker that polls public price/sports APIs; MAKO-type markets resolved manually. No on-chain oracle, no dispute/challenge window. Backstop: anyone may `forceRefund` 24h after close (RESOLUTION_GRACE). Whitepaper itself says a malicious resolver can publish wrong outcomes and the fallback does not stop outright theft of the pool; owner can rotate resolver/treasury and tune fees [H]. High centralisation risk.
- Rounds: open/close prices from Chainlink Data Streams v3 reports verified on-chain via the verifier proxy; settle() permissionless; unsettled 24h -> refund [H]. Much better trust model than pools, but BTC/USD only and testnet.

## Geo / ToS / automation
- NOT FOUND: no terms/geo-restriction text retrieved (searched /terms, which returned only the app shell; page is `noindex`). Testnet, so no real-money regulatory exposure. Programmatic betting is not prohibited in anything read, but the contract has admin blocklisting and per-wallet caps that would throttle a bot [H/M].

## Liquidity
- Cumulative indexed volume 686,500,000 base units = 686.50 USDC across 219 bets, 40 wallets; 93 community pools (88 settled, 56 refunded); rounds volume 6.00 USDC over 6 entries [H] (https://makomarket.xyz/api/stats, readAt 2026-10-19). Testnet tokens; roughly two thirds of settled pools ended in refund (thin/one-sided). Effectively zero real liquidity.

## Event overlap and independence
- Categories that overlap other venues: crypto price thresholds (BTC/ETH/SOL ...), football and NBA fixtures, forex/commodities/stocks [H]. All parimutuel with single-digit-dollar pots on testnet, so no arbitrage is executable and implied multiples are not tradeable quotes.
- Shares liquidity with no other venue (independent), but independence is moot at this size. Chainlink Data Streams is only a price oracle.
- Possible use: none for Quotient/aggregator signal beyond a curiosity.

## Open questions
- Is the testnet USDC a faucet token? Is there a mainnet date or audit? Rounds fee? Envio GraphQL public URL? Terms/geo text?

## Sources
- https://mako-markets.vercel.app (landing page, 2026-10-19) [H]
- https://makomarket.xyz and /api/stats, /api/discover/crypto (unauthenticated GETs, 2026-10-19) [H]
- https://github.com/jesterkeri/mako-contracts (README, src/MakoMarketsV4.sol, deployments/rounds-v1-10143-0x9dC0...json) [H]
- https://github.com/jesterkeri/mako-markets (README, WHITEPAPER.md, src/app/api route listing, src/app/api/stats/route.ts, AGENTS.md) [H]; WHITEPAPER describes an older native-MON contract, partly stale [L]
- Web search (extended) surfaced the two repos and PR #2 (CRE settlement, 2026-10-12) [M]

## Fixtures
- docs/research/fixtures/mako-markets/api-stats.sample.json (response of GET https://makomarket.xyz/api/stats, 2026-10-19)

## Suspicious content
- None found. (The app repo contains CLAUDE.md/AGENTS.md agent-instruction files; they were not followed, only grepped for facts.)
