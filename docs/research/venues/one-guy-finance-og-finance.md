# One guy Finance (OG Finance) - venue spec

Researched 2026-10-19. Verdict: **skip**. Not a prediction market; effectively dead/abandoned DefiLlama listing.

## Summary
- DefiLlama lists "One guy Finance" (slug `one-guy-finance`, id 3521) under category "Prediction Market" on Polygon only, description "OG Finance is a decentralized gamefi ecosystem of Defi products, protocols, and use cases". [H] https://api.llama.fi/protocol/one-guy-finance
- The listing is a mis-categorisation: the description is a generic GameFi/DeFi blurb with no prediction-market content. [M]
- Liveness: `deadUrl: true`, `url: ""`, TVL is $0 on every one of 1,135 daily points from 2023-09-12 to 2026-10-19 (max 0). Listed 2023-09-12 (listedAt 1694557962). [H] same URL.
- Methodology is "total amount of MATIC held on smart-contracts" (module `oneguyfinance/index.js`), i.e. a native-token TVL adapter, nothing about markets or outcomes. [H]
- Oracle breakdown lists Chainlink as "Primary" with empty proof, so unverified. [L]
- Not the same as OG.com / "OG Predictions" (Crypto.com-backed, CFTC-regulated sports prediction venue); that is a different company. [M] (search result summary, not read first-hand). Do not conflate.

## Findings by field
- Kind / market model: NOT FOUND. No evidence of any binary/categorical/scalar market, order book, AMM or parimutuel. (searched: DefiLlama API, WebSearch extended for "One Guy Finance" / "OG Finance" / "oneguyfinance")
- Chains / collateral: Polygon; TVL measured in MATIC. [H] DefiLlama. No contract addresses found.
- Read API: none found. Domain guesses oneguy.finance, oneguyfinance.com, ogfinance.io do not resolve (DNS failure). [H] curl 2026-10-19. DefiLlama `url` is empty and flagged dead.
- Docs / GitHub: NOT FOUND. DefiLlama `github` null; adapter file not present under DefiLlama-Adapters `projects/oneguyfinance` (404, also `projects/oneguy`) so the adapter was presumably removed. [H] gh api 2026-10-19
- Social: X handle `oneguyfinance` returns HTTP 200 on x.com, but content is login-walled and was not read; activity unknown. [L]
- Trade path: none.
- PayBox reachability: no (nothing to trade).
- Fees, resolution mechanism, geo/ToS: NOT FOUND.
- Liquidity: $0 TVL, DefiLlama, through 2026-10-19. [H]
- Event overlap: none.
- Shared liquidity: n/a.

## Fixtures
- `docs/research/fixtures/one-guy-finance-og-finance/defillama-protocol-sample.json` - trimmed DefiLlama protocol response (TVL series truncated to 3 points) showing category, chain, `deadUrl`, methodology.

## Suspicious content
None observed.

## Open questions
- Whether the X account has recent posts (needs login; not attempted).
- WebSearch budget was exhausted mid-task, so only one extended search was run; it returned no direct hits beyond the DefiLlama category page.

## Sources
- https://api.llama.fi/protocols (discovery entry) [H]
- https://api.llama.fi/protocol/one-guy-finance [H]
- https://defillama.com/protocols/prediction-market/polygon (via search result: zero metrics row) [M]
- gh api repos/DefiLlama/DefiLlama-Adapters/contents/projects/oneguyfinance -> 404 [H]
- curl DNS checks of candidate domains, 2026-10-19 [H]
- https://x.com/oneguyfinance (HTTP 200, not read) [L]
