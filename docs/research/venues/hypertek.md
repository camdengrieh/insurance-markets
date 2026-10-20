# HyperTek (venue spec)

Date of research: 2026-10-19. Verdict: **skip**. Not a prediction market; effectively dead.

Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Identity

- DefiLlama protocol id 6743, slug `hypertek`, symbol HYPER, category "Prediction Market", chain Solana, `url: ""`, `deadUrl: true`, twitter `hyperonsol`, audits 0, no TVL. [H] https://api.llama.fi/protocols and https://api.llama.fi/summary/fees/hypertek
- DefiLlama description: "Web3 engagement platform offering on-chain games, community content tools, and AI-powered meme generation, enabling projects to monetize and engage their token holders." [H] same URL. This matches the hint: it is mis-categorised and is not an event-outcome market.
- Fee methodology on DefiLlama: "Fees collected (3%) from PvH (Player vs House) and PvP (Player vs Player) games across all supported tokens". So the product is casino-style games, not event markets. [H]
- Token mint `Aq8Gocyvyyi8xk5EYxd6viUfVmVvs9T9R6mZFzZFpump` (pump.fun launch). DexScreener lists the base token name as "Hyperpigmentation" (symbol HYPER), so the name/branding mapping to "HyperTek" is only via DefiLlama's address field. [H] https://api.dexscreener.com/latest/dex/tokens/Aq8Gocyvyyi8xk5EYxd6viUfVmVvs9T9R6mZFzZFpump

## Still live?

- No: effectively dead. [H/M]
  - DefiLlama fees: total24h = 0, total30d = 0, totalAllTime = 55,120 (USD). Daily chart is all zeros for the last 3+ days sampled. [H] https://api.llama.fi/summary/fees/hypertek
  - DefiLlama flags the project URL as dead (`deadUrl: true`), no URL on file. [H]
  - DexScreener (2026-10-19): Raydium HYPER/SOL pool liquidity about $23.5k, mcap about $25.9k, 24h volume about $1.59, 10 txns in 24h. DexScreener lists no website or socials for the token. [H]
- The X account `hyperonsol` could not be read: x.com returned HTTP 402 to WebFetch (payment/login wall; nothing paid, stopped). [H]
- WebSearch was unavailable this session (budget exhausted), so no independent web evidence of an official site or docs. NOT FOUND (searched: DefiLlama protocols/fees APIs, DexScreener, GitHub DefiLlama adapters path guesses, x.com, hypertek.app (no DNS), hypertek.io (timeout), hypertek.xyz (JS redirect to `/lander`, looks like a parked domain; not followed or attributed)).

## Spec fields

- kind / market model: casino-style on-chain games (PvH and PvP) plus meme-generation and community tools. No binary, categorical or scalar event markets, no order book, no AMM of outcomes. [M]
- chains / collateral: Solana; "all supported tokens" (project tokens). [M]
- read API: NOT FOUND (searched: DefiLlama metadata, DexScreener, GitHub). No official docs URL. Only third-party aggregates exist (DefiLlama fees summary, DexScreener token pairs). Fixtures saved from those, which describe the token/fees, not markets.
- trade path: none for event markets. NOT FOUND.
- PayBox reachability: no. There is no market to trade; a Solana wallet could only swap the HYPER token on Raydium, which is irrelevant to arbitrage.
- fees: 3% on game stakes per DefiLlama methodology. [M, secondhand]
- resolution mechanism: not applicable (game RNG/house outcomes). NOT FOUND.
- geo/ToS/automation: NOT FOUND.
- liquidity: all-time fees USD 55,120 (DefiLlama, as of 2026-10-19); token pool about USD 23.5k (DexScreener, 2026-10-19). No OI/TVL. [H]
- event category overlap: none (no sports, politics, crypto price or macro event markets).
- shared liquidity: none; not applicable.

## Adapter priority

**skip**: mis-categorised, dead URL, zero current fees, no API, no event markets.

## Suspicious content

None observed in the API responses. hypertek.xyz returned only a JS redirect to `/lander` and was not followed (unrelated parked-domain risk).

## Sources

- https://api.llama.fi/protocols (entry id 6743) [H]
- https://api.llama.fi/summary/fees/hypertek [H]
- https://api.dexscreener.com/latest/dex/tokens/Aq8Gocyvyyi8xk5EYxd6viUfVmVvs9T9R6mZFzZFpump [H]
- https://x.com/hyperonsol (HTTP 402, unread) [no data]

Fixtures: `docs/research/fixtures/hypertek/defillama-fees-summary.json`, `docs/research/fixtures/hypertek/dexscreener-hyper-token.json`.
