# Demented Games - venue spec

Researched 2026-10-19. Verdict: DEAD / NOT A PREDICTION MARKET. adapter_priority = skip.

## Summary
- [H] DefiLlama lists "Demented Games" (id 5013, slug demented-games) with category "Prediction Market", chain Fuse, twitter Playdemented, `url: ""`, `deadUrl: true`. The category is a mis-label: the only on-chain products are casino-style games (Roulette, "Pump or Rekt"), not event markets. Source: https://api.llama.fi/protocol/demented-games (fixture: docs/research/fixtures/demented-games/defillama-protocol.json).
- [H] DefiLlama's own fee adapter was moved to a `dead/` folder with `deadFrom: '2024-07-08'`, methodology "Sum of all fees from each game on the Demented Games platform". It tracks two Fuse contracts: Roulette 0x94ba26ee118ef6c407c75dbb23385b1ad71a4547 and Pump or Rekt 0xcbc003cb76c5d218cba2dfb3a2b2f101950ed7e7. Source: https://github.com/DefiLlama/dimension-adapters/blob/1e8620166b5772c02e5e68e9dcd2cbb818724d69/dead/fees/demented-games/index.ts
- [H] DefiLlama fee series: totalAllTime = 38 (USD, units per DefiLlama), 44 daily points from 2024-08-27 to 2025-01-17, last values 0. Source: https://api.llama.fi/summary/fees/demented-games (fixture: defillama-fees-summary.json).
- [H] Fuse explorer: both contracts are unverified, have 0 coin balance, and their latest transactions are a periodic same-selector call (0x93e84cd9, every ~3 min, looks like a keeper/round-advance) last seen 2024-11-27 (Roulette) and 2025-01-03 (Pump or Rekt). No activity in 2026 on the first page of results. Source: https://explorer.fuse.io/api/v2/addresses/{addr}/transactions (fixture: fuse-pump-or-rekt-latest-txs.json). Caveat: only the newest page was inspected.
- [M] Pump or Rekt by name is a price-direction gambling game (up/down bet on a token price); not confirmed from any primary doc since no site exists. Even if so, it is house-banked, not an event market and not a venue with a book.

## Still live?
No. [H] DefiLlama flags the URL dead; [H] candidate domains demented.games, www.demented.games, playdemented.com, demented.fi do not resolve (DNS failure, 2026-10-19); [H] last contract activity found is Jan 2025. [L] The X account @Playdemented was not checkable (no browser; WebSearch quota exhausted this session), so account status is unknown.

## Spec fields
- Kind / market model: casino-style games on Fuse (Roulette, Pump or Rekt). No binary/categorical/scalar markets, no order book or AMM, no outcome tokens. [M]
- Chains / collateral: Fuse (chain only; DefiLlama fees counted in gas token FUSE). Collateral presumably native FUSE. [M]
- Read API: none found. NOT FOUND (searched: DefiLlama protocol record, GitHub repo search for "demented games"/"Playdemented" (only unrelated repos), domain probes, Fuse explorer). On-chain events only, contracts unverified, no ABI. [H for absence of official site/docs]
- Trade path: none usable. Would be raw unverified-contract calls on Fuse; Fuse is not a PayBox chain in the project's list. PayBox reachable: no. [M]
- Fees: unknown (adapter only sums contract-accumulated fees). NOT FOUND.
- Resolution: house RNG/price keeper, unknown. NOT FOUND.
- Geo/ToS/automation: NOT FOUND (no site).
- Liquidity: effectively zero. Lifetime fees 38 USD per DefiLlama; contract balances 0 (explorer, checked 2026-10-19). [H]
- Event category overlap / arbitrage: none. Shares liquidity with no other venue; simply irrelevant.
- Quotient / signal value: none.

## Not found
- Official website, docs, API, whitepaper, repo, or active social.
- Any market list, price, or resolution source.

## Suspicious content
None observed. (Third-party content was only JSON from DefiLlama and Fuse explorer; no embedded instructions.)

## Sources
- https://api.llama.fi/protocols (entry id 5013) [H]
- https://api.llama.fi/protocol/demented-games [H]
- https://api.llama.fi/summary/fees/demented-games [H]
- https://github.com/DefiLlama/dimension-adapters/blob/1e8620166b5772c02e5e68e9dcd2cbb818724d69/dead/fees/demented-games/index.ts [H]
- https://explorer.fuse.io/api/v2/addresses/0x94ba26ee118ef6c407c75dbb23385b1ad71a4547 and .../0xcbc003cb76c5d218cba2dfb3a2b2f101950ed7e7 (+ /transactions) [H]
- GitHub repository search (gh api search/repositories) for "demented games", "Playdemented": no relevant results [H for absence]

## Open questions
- Whether @Playdemented still exists or relaunched under a new brand (not checkable without web search quota).
