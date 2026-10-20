# Fortell (fortell.finance) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.
Note: WebSearch budget was exhausted for the session, so no third-party corroboration (press, X, DeFiLlama) was gathered. Everything below is from Fortell's own site and API host.

## Verdict
Fortell is a funded-trader (prop) layer that sits on top of other venues (World for prediction rounds, Phoenix for perps). It is not a market. It has no order book of its own, no independent liquidity, and no public data API. Adapter priority: **skip** as a trading/arbitrage leg. Revisit only if a signal is wanted from it, and then World (the underlying venue) is the thing to research.

## Still live?
- Site up and serving 2026-10-19; World challenge tiers marked "live", Funded World seats "coming soon" [H https://fortell.finance/]. Solana mainnet programs claimed live [H https://fortell.finance/docs].
- API host `api.fortell.finance` responds (OAuth metadata, 401 on /mcp) [H, fixtures].
- No launch date found. Product is new and thin (see Liquidity). No third-party audit completed [H https://fortell.finance/docs/verifying].

## Kind and market model
- kind: broker-or-frontend / prop-firm. Traders buy a "challenge" (entry fee) and trade rounds with Fortell-provided capital; passing yields a funded seat backed by "backer" capital in a pool [H /docs, /faq].
- Underlying instruments: World "Up or Down" prediction rounds on BTC, ETH, SOL, XRP, HYPE, lengths 5 min, 15 min, 1 hour [H /docs]; Phoenix perps (82 markets per glossary, up to 5x isolated margin) [H /docs/glossary, /docs].
- Round model: binary, Up + Down prices sum to 1.00; winning side settles at 1.00, loser at 0 [H /docs/glossary]. Fills "at live onchain prices, with spread, fees, and slippage" [H /docs]. How outcomes are tokenised on World: NOT FOUND on Fortell's site (searched: /docs, /docs/rails, /docs/glossary, /markets, /faq).
- Fortell-specific constraints: price band 0.10-0.90, min hold 20 s, no new positions in last 30 s before resolution, per-round size $2.50 (Starter) to $50 (Elite), total exposure $10 to $200 [H /docs/rails].

## Chains and collateral
- Solana only [H]. Collateral: CASH (World entry fees and rewards) and USDC (Perps, USDC pool) [H /docs/verifying, glossary].
- Programs (Solana mainnet) [H /docs/verifying]: pool `PooLjHpuy15gQErxXkFD7Q2a8nZHpHSwjK7NtaQ1VUn`, vault `VauLHY9dmzdUngUjywbQyb23WnzCc5qv6WDX98NeD6W`, treasury `TreawnNic83RGHGAfsEEP5p9ipT1fMvWuHwYvqyeyt1`, share hook `HookyLyVXRbnq3ViBxbybqnmHxsg7JD6JaDCnfQtNVnK`. CASH treasury `Cz6p6wnkGvuX1BpgsB4PSDdLDTKW5uWZ4m1r54Y2sP26`. World venue account `FPUtHn2WnuDQaQg4N3Cexd64EoGErz2BfWd17KHC2EUg` [H /transparency]. These are public protocol addresses, not user wallets. Not independently checked on-chain.

## Read API
- exists: **none public**. Only an authenticated MCP server.
- MCP: `https://api.fortell.finance/mcp` (HTTP). Unauthenticated GET returns 401 with OAuth 2.1 requirement [H fixtures/mcp-401-body.json]. Discovery: `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server` (dynamic client registration at `/oauth/register`, auth code + PKCE S256, scopes `mcp offline_access`) [H fixtures]. User signs in with email or connects trading wallet and approves [H /mcp].
- Tool names, schemas, rate limits: NOT FOUND (searched: /mcp, /connect, /docs; authenticating would require creating an account, which was out of scope).
- Site preconnects to `https://prediction-market-price-service.fly.dev` (seen in homepage HTML head) [H]. Undocumented; not probed. Likely a price feed for the front end [L].
- Websocket: NOT FOUND. Docs URL: https://fortell.finance/docs (a product book, not an API reference).
- Per-seat data is on chain (each funded seat is its own Solana account) and the transparency page reads pool/seat accounts live [H /docs/verifying]; no indexer or subgraph is documented.

## Trade path
- Through the MCP server: read challenge, watch markets, place trades [H /mcp]. Buying a challenge and claiming profit are Solana transactions Fortell does not sign; Fortell's page tells users to add the **PayBox MCP server** as the separate signer [H https://fortell.finance/mcp]. So Fortell already names PayBox as a signing companion.
- Trading is on Fortell's own challenge/seat ledger with capped sizes ($2.50-$50 per round), not a general order book. You cannot place arbitrary orders against World liquidity at size through Fortell.

## PayBox reachability
- partial. A Solana PayBox wallet could pay challenge entry in CASH/USDC and sign payout claims (per Fortell's own MCP page). An EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot: Fortell is Solana-only. Trading itself goes via the Fortell MCP (OAuth), not via transaction proposals from PayBox.
- Even where reachable, it is not a useful arbitrage execution path: trade size is capped by tier and the product is a paid evaluation (entry fee), not a venue.

## Fees
- Entry fee only: Starter 9 CASH ($9), Growth 19, Pro 49, Elite 79; each challenge lasts 14 days [H /, /docs]. A World pass returns entry plus a bonus of up to $10 in CASH [H /docs, glossary].
- Profit split on funded seats: trader 90%, Fortell 10%, taken in the claim instruction [H /faq]. Underlying venue spread/fees/slippage borne in fills [H /docs]. World/Phoenix native fee schedules: NOT FOUND on Fortell's site.
- Pass rates: simulated 13.3% for a no-edge trader; blind trading 0.1% [H /transparency]. The economics are a paid challenge with a low pass rate, so the entry fee is the revenue source.

## Resolution
- Round settlement: winning side 1.00, losing side 0 at round end [H glossary]. Price source/oracle for World rounds: NOT FOUND (searched: /docs/rails, /docs/verifying, /docs/glossary, /markets). Dispute process: NOT FOUND.
- Challenge grading is off-chain, by a Fortell indexer; "No Solana program checks the grade" [H /docs/evaluation, /faq]. Criteria: at least 30 scored calls, trade quality at least 55, max drawdown 2.5%, profit at least +0.5%, no more than 50% of profit from one day [H /faq].
- Admin risk: one Fortell key can upgrade the programs and holds admin roles (multisig planned); no third-party audit [H /docs/verifying].

## Geo / ToS / automation
- Geo restrictions, ToS page content, bot/automation rules, rate limits: NOT FOUND (searched: /, /faq, /docs, /mcp, /connect; /terms returned the generic app shell with no extractable terms). Agent trading is explicitly supported via MCP with user approval [H /mcp]. Regulatory status of a paid "funded trader" challenge on prediction rounds is unclear [M].

## Liquidity
- No TVL, volume or OI figures on the site: /transparency lists Backer capital, Pool NAV, funded traders etc. but the values did not render in the fetched text, and "Not reported" for volume [H /transparency, fetched 2026-10-19].
- Launch seat capital is tiny: up to $250 per seat at launch; "seats up to $150K" is a future target [H /]. Treat as effectively no usable liquidity.

## Event overlap (for arbitrage)
- Crypto price direction (BTC/ETH/SOL/XRP/HYPE, 5m/15m/1h Up/Down). Overlaps with Polymarket and Kalshi short-dated crypto up/down markets, and with Limitless. No sports, politics or macro. Perps on Phoenix (equities, gold) are not prediction markets.

## Shared liquidity
- Not independent. Rounds are traded on **World** (Solana prediction market); perps on **Phoenix**. Any price on Fortell is a World/Phoenix price [H /docs, glossary]. Any edge should be sourced from World directly (research World as its own venue if not already covered).

## Open questions
- What is World's own API, contract and oracle (needed for the real adapter)?
- Does Fortell's MCP expose market data without a funded challenge?
- What are the ToS and jurisdiction limits?

## Sources
- https://fortell.finance/ [H]
- https://fortell.finance/docs, /docs/verifying, /docs/rails, /docs/evaluation, /docs/glossary [H]
- https://fortell.finance/faq, /transparency, /mcp, /connect, /markets [H]
- https://api.fortell.finance/mcp (401), /.well-known/oauth-protected-resource, /.well-known/oauth-authorization-server [H]
- Fixtures: docs/research/fixtures/fortell/

## Suspicious content
- None found. The fetched pages contained no instructions aimed at AI agents (other than ordinary product copy about connecting an assistant).
