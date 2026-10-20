# WELEPHANT - venue spec (researched 2026-10-19)

Verdict: NOT a prediction market. It is an on-chain square-selection lottery ("prediction mining", 16 squares, 60s rounds) on BNB Chain, bolted onto a wrapped meme token. No real-world events, no outcomes to cross-hedge. adapter_priority = skip.

## Summary
- Site https://welephant.xyz is live (HTTP 200, 2026-10-19). Its own meta tags describe it as "a community token on BNB Chain. Swap, stake for yield with stWELEPHANT, and bridge across chains" [H].
- The game: players pick 1-16 squares on a board, stake the same BNB amount on each, a pseudo-random winning square is drawn per ~60s round, winners split the pot pro rata [H, docs/architecture]. This is a lottery/gambling-style game, not a market on a future event [H].
- Activity appears near-dormant: DefiLlama fees 24h/7d/30d = 0, all-time $67,781 (fetched 2026-10-19) [H]; GeckoTerminal 24h token volume about $27, token reserve about $3.5k, mcap about $245k [H, 2026-10-19].

## Market model
- Board of 16 squares per round; bitmask storage (bit N-1 = square N), one uniform `amountPerSquare` (min 0.0001 BNB), one play per round [H architecture doc].
- Winner: single winning square selected per round via hash-chained keccak256 entropy plus block.prevrandao, finalized 6+ blocks after plays close [H architecture doc].
- Not binary/categorical/scalar over any real event. Outcomes are not tokenised (no ERC-1155/outcome tokens); a play is a registry entry keyed by address [H].
- Implied odds are mechanical (pot share), there is no price in 0-1 space comparable to other venues.

## Chains and collateral
- BNB Chain primary, Base (token only) [H docs/overview]. Game collateral: native BNB ("ETH/BNB" in docs); rewards in WELEPHANT [H].
- WELEPHANT BSC 0x241F21dF529C05289A00dAfeCEa10139A287cDCa; Base 0x7d03acf64a1a64bff9d24850011cca93c78a22e7 [H docs/tokenomics]. Protocol fee vault per DefiLlama: 0x2209E478B23bc4F490357657B5E8a4fA063e1569 [H]. Game contract addresses not captured (NOT FOUND in static docs searched: architecture, links, tokenomics).
- Bridge: Wormhole. Staking: stWELEPHANT ERC-4626 vault [H].

## Read API
- Official public REST/WS API: NOT FOUND (searched: robots.txt, sitemap.xml, static docs links/architecture/overview, the 5.4MB JS bundle for endpoint URLs; only third-party hosts found: GeckoTerminal, Wormholescan, executor.labsapis.com quote). 
- Read path is on-chain only: `RaffleMiningViews.sol` read-only paginated views and `GameHistory.sol` on-chain round history [H architecture doc]. A BSC RPC (eth_call) is the only integration route.
- Docs say state is stored on-chain "instead of relying on external indexers" [H].
- No fixtures saved except a DefiLlama fees summary sample (third-party aggregator, not a venue API): docs/research/fixtures/welephant/defillama_fees_summary.json.

## Trade path
- Contract call `play(players[], ...)` on RaffleMining with BNB value; sponsorship supported (msg.sender pays for players[]) [H]. An EVM wallet could do this via a plain BNB-Chain transaction proposal (PayBox BNB support is a separate question), but there is nothing worth trading: no hedgeable event, negative expected value by design.
- No order book, no signed orders, no cancel (plays are final per round, auto-play can be cancelled by self) [H].

## Fees
- Game fee 10% of play amount [H, "gameFee = playAmount x 10%"]. Docs are internally inconsistent: one section splits 10% admin / 20% staking / 20% payday / 50% winners; another gives 90% to winners pool with admin 10% and staking 20% of the fee [H, both in architecture doc]. Treat as unverified. DefiLlama: 90% of fee buys back WELEPHANT for miners/stakers, 10% protocol [H].
- Wrap fee 2%; ELEPHANT 10% transfer fee [H tokenomics].

## Resolution / dispute risk
- Randomness = on-chain hash-chained entropy, no oracle, no human resolution, no dispute process [H]. Risks: validator-influenced prevrandao, admin pause (docs say admin cannot change fees or randomness) [H]. Contracts upgradable via stateless coordinator pattern [H].
- Audit: self-published AI-assisted review (Claude Opus 4.6 / Codex GPT-5.2 plus "volunteers"), Jan 23 - Mar 7 2026; no independent audit firm [H audit page]. DefiLlama lists "audits: 2" pointing at the same page.

## Geo / ToS / automation
- Bots/automation explicitly welcomed (sponsorship, auto-play, third-party services) [H]. /terms and /privacy exist in the sitemap but are SPA-rendered; contents NOT READ. Gambling-type product, jurisdictional restrictions unknown (NOT FOUND).

## Liquidity
- Game volume: NOT FOUND directly. DefiLlama protocol fees all-time $67,781 at 10% fee implies roughly $680k cumulative wagered (M, derived) with zero in the last 30 days (H, 2026-10-19). Token liquidity about $3.5k (GeckoTerminal, 2026-10-19). Docs claim ">$40 million locked liquidity" via ELEPHANT (stale marketing, L).

## Event coverage / arbitrage overlap
- None. No sports, politics, crypto-price or macro markets. No overlap with other venues; no shared liquidity with another venue (but shares the WELEPHANT/ELEPHANT token pools via buybacks).

## Open questions
- Game contract addresses and exact play ABI; exact fee split.
- Whether the game still has players (DefiLlama dimension shows 0 fees recent days).

## Suspicious content
- None found aimed at AI agents. Note the audit page credits AI models as auditors.

## Sources
- https://welephant.xyz (homepage meta) [H]
- https://welephant.xyz/static/docs/overview, /tokenomics, /architecture, /audit, /links [H]
- https://welephant.xyz/robots.txt, /sitemap.xml [H]
- https://api.llama.fi/protocol/welephant and /summary/fees/welephant (2026-10-19) [H]
- https://api.geckoterminal.com/api/v2/networks/bsc/tokens/0x241F21dF529C05289A00dAfeCEa10139A287cDCa (2026-10-19) [H]
- WebSearch unavailable (session budget exhausted); no social/news corroboration.
