# OptionBlitz (venue spec)

Researched 2026-10-19. Verdict: **DEAD / skip.** No adapter work warranted.

## Summary
- OptionBlitz was a small Arbitrum binary/barrier/vanilla options + perps dApp (BLX token, Pyth oracle, 2-minute to 24h maturities). [H: DefiLlama description]
- As of 2026-10-19: DefiLlama TVL is 0 on Arbitrum, Arbitrum-staking and staking; last day with TVL above $100 was 2024-07-11 ($367); peak TVL was $12,123 on 2024-05-07; all-time fees tracked: $1,783. DefiLlama flags `deadUrl: true` and the protocol has no `url`. [H]
- `optionblitz.co` (the listed Twitter handle's namesake domain) now returns HTTP 301 to `https://criox.in/`, an unrelated third-party site (domain no longer controlled by the project, or redirected). `optionblitz.com`, `app.` and `docs.optionblitz.com` time out (no response in 15s). [H for observed behaviour; cause is M/inference]
- Could not do WebSearch (session search budget exhausted), so no independent news/shutdown announcement was found. NOT FOUND (searched: DefiLlama API, domain probes, GitHub user page).

## Kind and market model
- Kind: onchain-other. Not a prediction market: price-threshold binary options (up/down vs oracle price) and barrier options against a house/pool counterparty; no event outcomes, no order book. [M, from DefiLlama description; no first-party docs reachable]
- Outcome tokenisation: NOT FOUND (no reachable docs).

## Chains and collateral
- Arbitrum only. Token/contract listed by DefiLlama: `0x220251092f8b63efd0341f69f6ca907bd6f271bf` (BLX). Oracle: Pyth (primary). "Multi-collateral" claimed, assets not documented. [H for DefiLlama listing; rest L]

## Read API
- exists: none found. Docs URL: none reachable. No official REST/WS API located; GitHub user `optionblitz` exists (id 67769683) but exposed no public repos via `gh api users/optionblitz/repos` (empty/404 listing). On-chain reads would require reverse-engineering contracts; not worth it.
- Fixture: `docs/research/fixtures/optionblitz/defillama-protocol-trimmed.json` (DefiLlama metadata only, not a venue API).

## Trade path
- None usable. Description claims "1-click gasless trading" (meta-transactions), but no docs or live frontend. PayBox reachability: **no** (venue not operational; even if revived, Arbitrum EVM transactions would be reachable in principle only via contract-call proposals).

## Fees / resolution / geo-ToS
- Fees: NOT FOUND (DefiLlama methodology: revenue = trader losses minus wins, i.e. house-edge model). Resolution: Pyth price at expiry (M). Dispute risk: N/A. Geo/ToS/automation: NOT FOUND (site unreachable).

## Liquidity
- $0 TVL (DefiLlama, 2026-10-19). Peak $12.1k (2024-05-07). Not independent of anything; simply nothing there.

## Event overlap / shared liquidity
- Would only ever have overlapped "crypto price" and FX/metals/stock thresholds, with a house counterparty (not an arbitrage leg). Shares liquidity with no other venue.

## Adapter priority
- skip. Dead/abandoned: zero TVL for ~15 months, dead website, domain redirect to an unrelated site, no API.

## Suspicious content
- `optionblitz.co` 301-redirects to `criox.in` (unrelated domain; possible domain takeover). Did not interact beyond a HEAD request. No embedded instructions seen.

## Sources
- https://defillama.com/protocol/optionblitz (listing; H via API)
- https://api.llama.fi/protocol/optionblitz (fetched 2026-10-19) [H]
- https://api.llama.fi/summary/fees/optionblitz?dataType=dailyFees (fetched 2026-10-19; total all-time 1783, no 24h data) [H]
- https://github.com/optionblitz (user page only) [H]
- Domain probes with curl 2026-10-19: optionblitz.co, optionblitz.com, app.optionblitz.com, docs.optionblitz.com, criox.in [H]
