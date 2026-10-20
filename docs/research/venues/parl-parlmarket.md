# Parl (parlmarket) - venue spec

Researched 2026-10-19. Verdict: **skip** (testnet-only hobby project; domain now serves an unrelated site; API unreachable).

## Liveness [H]
- parlmarket.xyz DNS resolves (169.58.159.131) and returns HTTP 200, but the page is an Inertia/Laravel app titled "SPMB JABAR" (Indonesian school admissions, Disdik Jabar branding, zonasi/afirmasi paths). It is NOT a prediction market. Domain was apparently repurposed/hijacked or reassigned since the repo was published. (curl of https://parlmarket.xyz, 2026-10-19; fixture saved.)
- api.parlmarket.xyz (README's API host): connection timed out (20s) on /health. https://parlmarket.xyz/api/markets returns 404. www/docs/app subdomains do not resolve. [H]
- GitHub repo Prometheus-agent/parl: created 2026-07-02, last push 2026-07-05, 0 stars, 0 forks, no license file reported by API (README claims MIT), homepage = parlmarket.xyz. [H] https://github.com/Prometheus-agent/parl
- README footer credits "Zyrian Dev". Single-developer MVP.

## Kind / market model [H, from README + repo tree]
- Parimutuel pool per market; no AMM, no order book, no LPs. Winners split pot pro rata. No tradable outcome tokens documented (bets recorded in PoolEngine and indexed to Postgres); NOT FOUND (searched: README, contracts tree) any ERC-1155/ERC-20 outcome token.
- Binary/categorical shape not confirmed; NOT FOUND in the files read. Markets have a `description` field and auto-category (Sports, Crypto, Politics, Weather, Technology, General).
- Parimutuel means no price discovery until close and payout odds move with later bets, so it is poor as an arbitrage leg regardless.

## Chains and collateral [H]
- Deployed only on Avalanche Fuji TESTNET (chain 43113): PoolEngine 0xb4f8D67b6E614FcF5fC6bF195bF50380C2086d95, MarketFactory 0x06eD03E5A7F771bfA4E8fB9E81a0b6e0D9466277, ParlOracle 0xfb4B68186875fb5200cC3Cf21591b3A6f7d94EC9 (V3, from README; contract addresses are public project data). Broadcast folders in the repo only have 43113.
- Collateral: native AVAX (market creation fee 0.01 AVAX, oracle bond 1 AVAX). Roadmap lists Sepolia and Polygon Amoy (testnets) as unchecked. No mainnet deployment found.

## Read API [M: documented in README, not reachable]
- Docs: README only. Base `https://api.parlmarket.xyz` (or `https://parlmarket.xyz/api` rewrite; the latter 404s now).
- Endpoints per README and backend/src/routes/markets.rs: GET /api/simplified-markets?category=, /api/markets, /api/markets/:id, /api/markets/:id/bets, /api/markets/:id/payout/:bettor, /api/categories, /api/bets?bettor=. Health route exists (routes/health.rs).
- Auth/rate limits/websocket: NOT FOUND (searched: README, routes). No live response could be fetched, so no response-shape fixtures exist beyond the unrelated root HTML.
- On-chain reads of Fuji contracts would be possible but testnet funds have no value.

## Trade path
- Via browser wallet calling PoolEngine.placeBet() (README). No signed-order/CLOB path. A PayBox EVM wallet could in principle send a tx proposal to Fuji, but it is a testnet with no real-money value, so paybox_reachable = no (no mainnet deployment; Avalanche C-Chain not confirmed as a PayBox network here).

## Fees [H, README]
- Platform fee 200 bps default (owner-configurable 1-5%) on winning pools; 0.01 AVAX market creation spam fee.

## Resolution [H, README]
- Optimistic oracle ParlOracle (propose, dispute, execute; bond, dispute window 100 blocks ~5 min on Fuji). Planned Chainlink Functions auto-resolver (roadmap item unchecked, though commit message mentions v2). Very short dispute window and owner-controlled fees imply high resolution/admin risk. No audit mentioned.

## Geo/ToS/automation
- NOT FOUND (searched: README, live site). No ToS (live site is unrelated).

## Liquidity
- None meaningful: testnet. No volume/TVL source. Repo commit message says "3 market live: crypto, sports, politics" on Fuji test deployment (2026-07-02).

## Event overlap / shared liquidity
- Nominal categories overlap (sports, crypto, politics) but markets are test markets with no real liquidity. Independent of other venues, but irrelevant.

## Suspicious content
- None directed at AI agents found. Note: the domain now serves an unrelated third-party site, so any link from the repo to parlmarket.xyz should be treated as untrusted.

## Adapter priority: skip
Dead/testnet-only, domain repurposed, API host unreachable. Revisit only if a mainnet deployment appears.

## Sources
- https://github.com/Prometheus-agent/parl (repo, README.md, BLUEPRINT.md listed, backend/src/routes/markets.rs, git commits) [H]
- https://parlmarket.xyz (curl 2026-10-19) [H]
- https://api.parlmarket.xyz (timeout 2026-10-19) [H]
- Fixtures: docs/research/fixtures/parl-parlmarket/ (root HTML snippet, repo metadata)
