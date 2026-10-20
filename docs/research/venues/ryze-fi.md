# Ryze.fi venue spec

Researched 2026-10-19. Verdict: **appears dead / abandoned. adapter_priority = skip.**

## Summary

- Ryze.fi was an on-chain "one-tap" binary options product on Arbitrum (up/down on crypto price over 1 and 3 minute windows). It is NOT a prediction market in the event-contract sense: no event categories, no overlap with other venues' markets (H for description via DefiLlama, M for window lengths).
- Liveness evidence (all checked 2026-10-19):
  - `https://ryze.fi`, `https://www.ryze.fi`, `https://app.ryze.fi`, `https://docs.ryze.fi` all return HTTP 301. ryze.fi and www.ryze.fi redirect to an unrelated Indonesian-language blog post on kalkulator.now ("Ryze.fi Membawa Revolusi Keuangan Terdesentralisasi di Indonesia"). That explains the "Indonesian title" in the discovery hint. (H, curl headers)
  - DefiLlama marks the protocol `deadUrl: true`. TVL fell from ~$495k (Dec 2023) to ~$6.35k by Aug 2024 and has been flat at ~$6,353 for ~14 months to 2026-10-19 (no change = nobody depositing or withdrawing). (H, api.llama.fi/protocol/ryze.fi)
  - DefiLlama dex volume: cumulative all-time $3.16M, `total24h: null` (no recent volume data). (H, api.llama.fi/overview/dexs)
  - GitHub org `ryzefi` exists (created 2023) but has zero public repos. (H, gh api)
- Not to be confused with "Ryze Protocol" (DefiLlama id 7945, Base, ~$93k 24h volume) which is a different, unrelated project, and with Aryze (RYZE) token on Arbiscan.

## Market model (M, DefiLlama description only)
- Binary options, price-direction, short intervals, Arbitrum. Settlement oracle listed as "Ryze Oracle" (proprietary). LP-backed pool (DefiLlama methodology lists "SupplySideRevenue: LPs revenue"), i.e. counterparty is the pool, not an order book. Outcomes not tokenised as tradeable ERC-20/1155 (NOT FOUND, docs unreachable).

## Read API
- NOT FOUND (searched: ryze.fi, app.ryze.fi, docs.ryze.fi all redirect; GitHub org ryzefi has no repos; web search results). No public API, no subgraph located.
- Only third-party data: DefiLlama (TVL + volume), see fixture.

## Trade path
- none usable. Contracts/addresses not located (DefiLlama adapter uses sumTokens with addresses, not inspected). Frontend is gone. PayBox reachability: **no** (an EVM wallet could in theory send an Arbitrum tx to the contracts if they were still live, but there is no frontend, no docs, ~$6k TVL, and short-window binary options are not an arbitrage leg).

## Fees, resolution, geo/ToS
- Fees: NOT FOUND. Resolution: proprietary "Ryze Oracle" (M); dispute process NOT FOUND. Geo/ToS: NOT FOUND (site gone). Audit: DefiLlama links a Balance audit report from Sept 2023 (L, stale, not read).

## Liquidity
- TVL ~$6,353 on Arbitrum, flat, 2026-10-19 (H, DefiLlama). Cumulative volume $3.16M (H, DefiLlama). Peak TVL ~$495k Dec 2023.
- Shares liquidity with: nothing known.

## Event overlap
- Only "crypto price up/down in 1-3 min". Could be loosely compared to short-dated crypto price markets on other venues, but with a dead frontend and a pool counterparty there is nothing to scan.

## Open questions
- Whether the Arbitrum contracts still accept trades (would need DefiLlama adapter address list; not worth it).
- Web search budget was exhausted before a shutdown announcement could be searched for; X account @RyzeFi last activity not checked (X not fetched).

## Fixtures
- `docs/research/fixtures/ryze-fi/defillama-protocol-trimmed.json` (DefiLlama protocol record, TVL series trimmed to 8 points).

## Suspicious content
- None embedded as instructions. Note the ryze.fi domain now points at a third-party content/ads blog; treat as untrusted and do not link users to it.

## Sources
- https://ryze.fi (301 to https://kalkulator.now/blog/ryze-fi-revolusi-keuangan-terdesentralisasi-indonesia) (H)
- https://api.llama.fi/protocol/ryze.fi and https://defillama.com/protocol/ryze.fi (H)
- https://api.llama.fi/overview/dexs (H)
- https://github.com/ryzefi (H, no repos)
- WebSearch result snippets: Galxe campaign, Layer3 activation, X @RyzeFi (M, 2023-2024 era, stale)
