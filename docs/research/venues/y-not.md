# Y NOT (yieldnot.app) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict
adapter_priority: **skip**. The site is live, but it is a devnet-only demo (test USDC) of a yield-staked parimutuel. It has no public read API, no SDK, no TVL, and no mainnet program ID. Its "Above/Below strike" markets are a capital-protected yield side-bet, not a price-for-event contract, so it cannot be matched or arbitraged against event markets.

## Liveness (H)
- https://yieldnot.app returns HTTP 200 (Vercel, Next.js), title "Y NOT - Parimutuel". [H: curl 2026-10-19]
- Docs page says "Y NOT currently runs on Solana devnet with test USDC" with an in-app faucet. The /markets page shows a badge "devnet - vault init pending" and a cluster="devnet" prop. [H: https://yieldnot.app/docs , https://yieldnot.app/markets]
- Conclusion: site live, product NOT live on mainnet. Not a real-money venue today.

## Market model (H, https://yieldnot.app/docs)
- Parimutuel pool, no market maker. Each market = Pyth price feed + strike + maturity (~1 month). Two sides: Above / Below.
- Collateral USDC (6 decimals) deposited into a vault; deposit is returned in full at maturity. Pooled deposits are lent on Kamino kLend (5-7% APY variable, per docs). Only the YIELD is the prize; the winning side splits the yield pot.
- Share weight = amount x seconds until maturity (earlier, less crowded positions get more).
- Outcomes are not tokenised: positions are PDA accounts (Position PDA seeds ["pos", market, owner]), non-transferable as documented. [H]
- Market PDA seeds ["market", feed, strike, maturity]; vault ["market_usdc", market]; authority ["market_auth", market]. [H]
- Instructions listed: create_pyth_market, init_market, market_deposit, market_supply, market_settle, market_redeem, market_early_withdraw, emergency_settle. [H]
- Landing page claims "any stock or coin on Solana" (tokenized equities supported). [H]

## Chain / collateral
Solana (Anchor program), devnet only; USDC (test USDC on devnet). No program ID or addresses published in docs or page HTML (searched docs.html and markets.html for base58 strings: none). [H]

## Read API
- exists: none documented. NOT FOUND (searched: /docs, /api/markets, /api/health, /robots.txt, /sitemap.xml, /llms.txt, /terms -> all 404 except /docs and /markets; no GitHub link in docs/markets HTML; WebSearch extended returned no pages about the project).
- Only route is reading Solana accounts directly (getProgramAccounts) once a program ID is known; the ID is not published. Frontend is client-rendered, so a data API may exist behind the app but is undocumented (connect-src 'self' in CSP suggests only same-origin calls plus RPC at most). [M]
- No websocket, auth or rate limits documented. No fixtures saved (no public JSON API to sample).

## Trade path
On-chain Anchor instructions (market_deposit etc.) signed by a Solana wallet. No order API. A PayBox Solana wallet could in principle sign a custom transaction, but there is no mainnet deployment, no IDL published, and no PayBox plugin; EVM wallets (Base/Ethereum/BNB/Arbitrum/Polygon) cannot reach it. paybox_reachable: no (devnet only, no IDL/program ID). [M]

## Fees (H)
- 20% protocol fee on the pot, taken at settlement only if contested (minority side >= 5% of pool); one-sided markets pay no fee.
- Early withdrawal: principal minus time-scaled penalty capped at 5%, penalty goes to pot. Min deposit 1 USDC.

## Resolution (H)
- Crypto: Pyth price at maturity vs strike. Tokenized equities: keeper-attested price (centralised trust). Settlement price must be within +/-30 min of maturity; feed exponent must equal strike exponent.
- Empty winning side: pot refunded across all weights. emergency_settle: governance can force-settle with no pot if oracle fails; freeze breaker gives neutral refund after 14 days. Kamino shortfall -> pro-rata haircut. Smart-contract and Kamino risk apply to principal. Dispute process: none beyond governance emergency path.

## Geo / ToS / automation
NOT FOUND (searched: /terms, /docs, homepage; docs page does not cover ToS, geo restrictions or automation rules).

## Liquidity
NOT FOUND (no TVL/volume published; devnet test USDC means any figure is non-economic). Live deposit feed component exists in the UI but is client-rendered. 

## Event-category overlap / arbitrage
Pyth-priced crypto strikes (SOL, BTC, ETH, JUP, BONK logos in markets page preload) and tokenized equities nominally overlap "crypto price above X on date" markets elsewhere, but payoff is yield share, not $1/$0, and principal is always returned, so it is not a hedgeable leg. Signal use only: pool ratio (Above/Below %) is a crowd-sentiment read, but it is devnet play money. No shared liquidity with another venue (own pools; yield sourced from Kamino).

## Open questions
- Mainnet launch date / program ID / IDL; whether a public indexer API appears.
- ToS and geo rules.

## Suspicious content
None found. Page contains no AI-directed instructions.

## Sources
- https://yieldnot.app (homepage, meta description) [H]
- https://yieldnot.app/docs (fetched via WebFetch and curl) [H]
- https://yieldnot.app/markets (curl; devnet badge) [H]
- WebSearch (extended) "Y NOT yieldnot.app parimutuel yield market Solana": no independent coverage found [H for absence]
