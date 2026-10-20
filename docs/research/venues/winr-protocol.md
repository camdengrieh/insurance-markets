# WINR Protocol (winr.games) - venue spec

Researched 2026-10-19. Verdict: NOT a prediction market. adapter_priority = skip.

## Summary
- [H] WINR describes itself as "the AI casino system, and its launchpad" (https://www.winr.games/). Products: shared WINR bankroll on Arbitrum (LP "Earn"), JustBet creator casino (slots, blackjack, roulette, PvP poker per https://just.bet), and a token launchpad on Robinhood Chain (chain id 4663) where each token is tied to a casino game.
- [H] No page on winr.games, docs.winr.games or just.bet mentions prediction markets, sports/event betting or outcome tokens.
- [H] DefiLlama lists it under category "Prediction Market" (https://api.llama.fi/protocol/winr-protocol); that categorisation is wrong for our purposes (legacy label). Its methodology text says it is a bankroll vault + escrow for JustBet gameplay.
- Still live: [H] docs "History & Roadmap" marked current phase, updated 2026-09-15 (https://docs.winr.games/history); [H] launchpad API returns 59 live tokens, newest launched 2026-10-02 (fixtures).

## Market model
No event markets. Casino games settle against a shared bankroll (house vs player); launchpad tokens are plain ERC-20s in Uniswap V3 token/WETH pools at the 1% fee tier (https://docs.winr.games/launchpad/trading) [H]. No outcome tokens, no resolution.

## Chains and collateral
- Bankroll/JustBet: Arbitrum One, denominated in WINR (players deposit USDC, auto-swapped to WINR) [H] https://docs.winr.games/bankroll , https://just.bet
- Launchpad: Robinhood Chain (4663), quote token WETH-style address 0x0bd7...ad73 [H] fixtures/tokens.json
- WINR token on Arbitrum: 0xd77b108d4f6cefaa0cae9506a934e825becca46e [H] DefiLlama (a public token address)

## Read API
- Official public, unauthenticated, GET only: base https://www.winr.games/api/v1 ; docs https://docs.winr.games/launchpad/api [H]
- Endpoints: /tokens, /tokens/{address}, /stats, /campaigns/early-creators. OpenAPI at the gateway /api/docs (not fetched).
- Limits: 30 req/min per caller, 600/min global, 429 + Retry-After; 60s cache. Intended use ~1 req/hour [H].
- Returns token list metadata only: no price, liquidity, volume, markets, books, trades or resolution [H].
- Fixtures (real unauthenticated GETs 2026-10-19): docs/research/fixtures/winr-protocol/stats.json , tokens.json (59 tokens, ~28KB). Shape: {data:{tokens:[{address,name,ticker,pairAddress,pairFeeBps,quoteTokenAddress,status,launchedAt,graduatedAt,gameSlug,gameUrl,pageUrl}]}}.
- No websocket found. NOT FOUND (searched: docs sections list, API page).

## Trade path
Launchpad tokens: ordinary Uniswap V3 swaps via SwapRouter02 exactInputSingle fee 10000 on Robinhood Chain [H]. Casino bets: on-chain via JustBet app; no documented programmatic bet API [NOT FOUND]. Neither is an event-outcome trade, so irrelevant to the aggregator.

## PayBox reachability
no. An EVM wallet could technically swap launchpad tokens (if PayBox supports chain 4663, unverified) but there is nothing to arbitrage or aggregate.

## Fees
Pool swap 1%; winr.games route adds 0.75% before graduation, 0% after [H] https://docs.winr.games/launchpad/trading. Casino house edge/fees not published [NOT FOUND]. Bankroll limits: max payout 2% of bankroll per bet, 3% daily drawdown tightens to 1%, 10% drawdown halts withdrawals [H] https://docs.winr.games/bankroll.

## Resolution
N/A (no events). Casino randomness method not documented [NOT FOUND]. DefiLlama notes Pyth as oracle [M].

## Geo / ToS / automation
Docs footer "18+ Gamble responsibly". Terms text not retrieved; restricted jurisdictions and bot rules NOT FOUND (searched: just.bet, winr.games, docs.winr.games).

## Liquidity
- DefiLlama (2026-10-19): Arbitrum TVL 0 for the bankroll export; staking TVL ~US$1.12M [M, https://api.llama.fi/protocol/winr-protocol]. Peak historical ~US$5.5M (May 2023) [M].
- Docs claim >US$250M cumulative volume across WINR apps by end of 2025 [L, project self-report].
- 59 launchpad tokens, none graduated (threshold 4.2 ETH pool depth) [H] fixtures/stats.json.

## Event coverage / overlap
None. Zero overlap with sports, politics, crypto price, macro event markets.

## Shared liquidity
N/A.

## Priority
skip: casino/launchpad infrastructure, not a prediction market; no event markets, no useful read API for pricing.

## Suspicious content
None observed (no AI-directed instructions in fetched pages).

## Sources
- https://www.winr.games/ , https://docs.winr.games/ , /history , /bankroll , /launchpad/trading , /launchpad/api
- https://just.bet
- https://api.llama.fi/protocol/winr-protocol
- WebSearch was unavailable (session budget exhausted); no third-party news corroboration.
