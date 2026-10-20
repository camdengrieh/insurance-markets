# CoChilli (Base BTC price-prediction game) - venue spec

Researched 2026-10-19. Verdict: DEAD / skip. Not an integrable venue.

## Summary
- H: DefiLlama lists CoChilli (id 3366, category "Prediction Market", chain Base, oracle Pyth) with `deadUrl: true` and current TVL 0 (API queried 2026-10-19).
- H: Official domain cochilli.io now answers HTTP 301 to an unrelated third-party domain (a gambling/news-spam site that itself returns 404). The domain appears abandoned and re-pointed; treat as hostile/untrusted, do not visit in a browser.
- H: DefiLlama TVL history: ~$5.1k USDbC from 2023-08 (listed 2023-08-10); last reading above $100 was 2024-01-31 (~$1,984); 0 through 2026-10-19. Fixture: docs/research/fixtures/cochilli/defillama-protocol-summary.json.
- M: Description (from DefiLlama): game where users predict future BTC prices on Base, "fully decentralized". Tiny 2023-era experiment.

## Market model, chains, collateral
- M: BTC price-prediction game (likely round-based up/down or price-range pool, parimutuel-style; exact model NOT FOUND, no live docs). Chain Base; collateral USDbC (bridged USDC) per DefiLlama token breakdown (H for token, M for mechanics). Outcomes tokenisation: NOT FOUND.

## Read API
- exists: none (no official docs/site reachable). NOT FOUND (searched: cochilli.io, DefiLlama record, GitHub org `cochilli` returns 404 via gh api, X account link from DefiLlama not fetched successfully). WebSearch was unavailable (session budget exhausted), so no secondary news sources were checked.
- Contract addresses: DefiLlama `address` null; adapter exists in DefiLlama-Adapters (cochilli/index.js) but was not read.

## Trade path / PayBox
- Trade path: none. A Base EVM wallet could in theory send transactions to the contract, but no live UI, ABI or docs; not reachable in practice. paybox_reachable: no.

## Fees, resolution, geo/ToS
- Fees: NOT FOUND. Resolution: Pyth price oracle per DefiLlama (M); dispute process NOT FOUND. Geo/ToS/automation: NOT FOUND (site gone).

## Liquidity / overlap
- Liquidity: $0 TVL as of 2026-10-19 (DefiLlama, H); peak ~$5.4k (2023-08). Not independent-liquidity relevant.
- Event overlap: BTC price only; overlaps crypto-price markets elsewhere, but zero liquidity and no data feed makes it useless as an arbitrage leg or signal.
- Shares liquidity with: none known.

## Priority
- skip: dead site (domain hijacked/redirected), 0 TVL for ~2.5 years, no API, no docs.

## Suspicious content
- cochilli.io redirects (301) to an unrelated spam/gambling domain. No instructions aimed at AI agents were seen.

## Sources
- https://api.llama.fi/protocol/cochilli (H, 2026-10-19) / https://defillama.com/protocol/cochilli
- https://cochilli.io (H: redirect observed 2026-10-19)
- gh api repos/cochilli -> 404 (H)
