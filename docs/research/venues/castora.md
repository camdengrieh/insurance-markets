# Castora (castora.xyz) - adapter spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict
**adapter_priority: skip** (at most P2 signal-only). Backend host is dead, the site serves a mismatched TLS certificate, there is no public API, no documented volume, and the product is a niche price-guessing pool game, not a tradable market. No orderbook, no probabilities, no fixed outcomes to arbitrage against.

## Liveness
- https://www.castora.xyz/ and https://castora.xyz resolve to 66.29.146.144 (Namecheap shared hosting; NS dns1/dns2.namecheaphosting.com). TLS cert presented is `*.web-hosting.com`, so every verified HTTPS client fails (curl 60, WebFetch altnames error). H
- With cert verification off, the HTTP 200 returns a 565-byte SPA shell (`<title>Castora</title>`), `last-modified: Sat, 18 Jul 2026`, LiteSpeed. H. Fixture: fixtures/castora/homepage-2026-10-19.html
- Domain registered 2024-05-17, registry expiry 2027-05-17 (whois). H
- The frontend bundle hardcodes backend `https://server.castora.xyz` (VITE_SERVER_URL). That hostname does NOT resolve (dig returns nothing; curl exit 6) on 2026-10-19. docs./app./api.castora.xyz also do not resolve. H. Consequence: the web app's auth, leaderboard and pool-listing backend is down or removed; only direct on-chain interaction could remain.
- Bundle contains a Monad Mainnet chain definition (chainId 143, rpc.monad.xyz, monadvision.com) and no testnet-only config found. H (bundle). But Bitget Wallet dapp page links `?_needChain=monad_testnet` and reports no milestones/volume. M (https://web3.bitget.com/en/dapp/castora-29096; undated, AI-generated disclaimer).
- predictionindex.xyz/ecosystem lists: status Live, mechanism Parimutuel, outcome Scalar, chain Monad, volume n/a. H that PI says this; the status itself is M/L (an aggregator listing; PI search snippet elsewhere says waitlist, volume under $100k).
- Could not confirm any 2026 trading activity, announcement or social post. NOT FOUND (searched: web search "Castora prediction market Monad" (results 2024-2025 era, all stale); Bitget; PI; monad.xyz ecosystem (redirects to app.monad.xyz, not fetched); rootdata (host unreachable); explorer monadvision.com is Cloudflare-challenged, not bypassed; X account https://x.com/Castora_xyz not fetchable; web search budget exhausted so no further searches). Overall: **may be live on-chain but unproven; web backend dead. Treat as effectively dead/dormant.**

## Kind and market model
- On-chain peer-to-peer "prediction pool" game, NOT a binary/categorical market. Users stake a fixed `stakeAmount` of a `stakeToken` into a pool and submit a numeric price prediction for a `predictionToken` (Pyth-priced asset) at `snapshotTime`; entries closest to the Pyth snapshot price win; ~33.3% of entrants win with a 3x multiplier by default (code constants `multiplier:3, percentWinners:33.3`, default pair ETH/USD, base duration 3600 s). H (bundle) for the constants; M for the interpretation. Matches the Bitget description (entries nearest to price at snapshot share rewards). M
- Pool struct (ABI from bundle): `PoolSeeds{predictionToken, stakeToken, stakeAmount, snapshotTime, windowCloseTime, feesPercent(uint16), multiplier(uint16), isUnlisted}`; functions include createPool, finalizePoolCompletion, getPool, setWinnersInBatch, claimPoolCompletionFees(Bulk). H (bundle)
- Pool categories in the UI: crypto, stocks, community (user-created). Prediction tokens: MON, ETH, BTC, SOL, AAPL, TSLA, CRCL (Pyth price IDs in bundle). H (bundle)
- Outcomes are not tokenised: no share tokens, no tradable position, no secondary market. Parimutuel-style pool, scalar guess.

## Chain / collateral
- Monad mainnet (chainId 143) per bundle; testnet per Bitget link. Stake tokens are configurable per pool (stakeToken); which tokens are allowed on mainnet is NOT FOUND (token list in bundle shows only prediction assets). Contract addresses in bundle (labelled castora / pools-manager / getters): 0x9E1e6f277dF3f2cD150Ae1E08b05f45B3297bE6D, 0xF8f179Ab96165b61833F2930309bCE9c6aB281bE, 0xf08959E66614027AE76303F4C5359eBfFd00Bc30. Roles inferred from variable usage only; not verified on an explorer (Cloudflare challenge). L

## Read API
- Official public API: **none found**. Web app uses `https://server.castora.xyz` with `Authorization: Bearer <wallet signature>` + `user-wallet-address` header and routes such as /pools, /pools/crypto|stocks|community, /pools/create, /pool/:id, /activity, /leaderboard, /auth/firebase, /auth/telegram (frontend routes/paths from the bundle; exact server paths not confirmed). Host does not resolve, so unusable. H (bundle) / dead.
- On-chain only: eth_call on the Monad contracts (getPool, userWinnerRecordsPaginated, etc.) via https://rpc.monad.xyz. Not exercised (JSON-RPC is POST; out of scope for this read-only pass). No docs, no subgraph found. No docs site exists (docs.castora.xyz NXDOMAIN).
- No fixtures of API responses possible. Only fixture saved: homepage HTML.

## Trade path / PayBox
- Trading = on-chain EVM transactions (approve stakeToken, then create/join pool) with wagmi/viem; no off-chain signed orders. An EVM wallet on Monad could in principle send these via transaction proposals, but PayBox reachability for Monad (chain 143) is unknown/unlikely. paybox_reachable: no (unknown chain support, unverified contracts, dead backend; also nothing to quote against). 
- No programmatic bot/automation rules found. /terms and /privacy routes exist in the SPA but were not readable (site cert/backend); ToS NOT FOUND.

## Fees
- Per-pool `feesPercent` (basis points on-chain, shown /100), creator share via `creatorPoolCompletionFeesSplitPercent`, optional pool creation fee (`creationFeesAmount`, per allowed token), `feeCollector`. Amounts/default values NOT FOUND. H (function/event names in bundle) for existence only.

## Resolution
- Pyth Network price at snapshotTime (Hermes `https://hermes.pyth.network` referenced); winners computed off-chain/by keeper and submitted with `setWinnersInBatch`, then `finalizePoolCompletion`. A trusted keeper/admin posts winners (centralisation risk). Dispute process NOT FOUND. M (inferred from ABI names).

## Liquidity
- No volume/TVL published. PI: volume n/a; older search snippet "under $100k" (L, undated). Medium post says limited liquidity depth (L, ~2024-25). No DefiLlama check possible (search budget).

## Overlap / arbitrage
- Underlying is crypto/stock spot price at a timestamp (ETH, BTC, SOL, MON, AAPL, TSLA, CRCL). Conceptually overlaps with price-threshold markets on Polymarket/Kalshi, but Castora has no priced probability to compare: payoff depends on other entrants' guesses. Only possible use: signal of crowd price expectations, negligible volume. Independent liquidity (own pools, own contracts). No shared liquidity found.

## Open questions
- Is the contract actually deployed and active on Monad mainnet (143)? Needs explorer or RPC read.
- Why is castora.xyz on a shared-hosting default certificate and server.castora.xyz NXDOMAIN (project wound down or DNS lapse)?

## Suspicious content
- None found in fetched content. (Bundle includes a WalletConnect project id and Firebase/reCAPTCHA references; not used or recorded.)

## Sources
- https://www.castora.xyz/ (served with invalid cert; fetched with verification off, GET only) - H
- https://www.castora.xyz/assets/index-Bl4gwt5p.js (frontend bundle, untrusted data, read only) - H
- https://predictionindex.xyz/ecosystem - H (listing), M (status)
- https://web3.bitget.com/en/dapp/castora-29096 - M
- Web search results (Monad ecosystem page, Medium post on Monad prediction markets, Bitget news; all dated 2024-2025) - L
- DNS/whois lookups run locally on 2026-10-19 - H
