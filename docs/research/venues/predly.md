# Predly (predly.tech) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Predly is a paper-trading demo. There is no real order flow, no collateral, no on-chain market contract and no settlement. The "prices" are a closed-form touch-probability model of memecoin market caps (log-normal, realized vol), not a market. Nothing here is a tradable leg, and the quotes carry no information from other venues. The only thing an aggregator could use is the underlying real memecoin cap data, which is better read straight from GeckoTerminal or a DEX. The markets also do not overlap with any event on the other venues (all memecoin cap thresholds).

## Is it live?

- The website is up and serving fresh data: `https://predly.tech/api/snapshot.json` had `generated_at` 1792393771 = 2026-10-19 07:09:31 UTC when fetched (same minute as this research). H - https://predly.tech/api/snapshot.json
- The header shows a "LIVE" tag and the page is titled "Predly . prediction market on meme caps . Arc". The word "beta" is not used. H - https://predly.tech/
- GitHub repo `Denis101Ka/predly`: created 2026-09-09, last push 2026-10-19 04:47 UTC (scheduled "data: snapshot at block ..." commits every few hours), 0 stars, homepage predly.tech. H - `gh api repos/Denis101Ka/predly`
- Product is explicitly "Paper trading demo, real chain data" (meta description) and the README badge says `trading: paper only`. H - https://predly.tech/ , https://github.com/Denis101Ka/predly/blob/main/README.md
- Operator is a single X account linked in the footer (@zostaff). No company, legal entity, audit, token or funding found. WebSearch (extended) returned only the site itself; no third-party coverage. NOT FOUND (searched: WebSearch extended "Predly prediction markets meme coin market cap predly.tech").

## Chain conflict (Robinhood 4663 vs Arc 5042) - resolved

- The site frontend hard-codes `CHAIN_ID = 5042`, explorer `https://arc-scan.io`, and the live JSON says `"chain":{"id":5042,"name":"Arc"}`. Pools are Uniswap v3/v4 deployments on Arc with USDC (`0x3600...0000`) as quote. H - https://predly.tech/assets/js/dashboard.js , https://predly.tech/api/snapshot.json
- The GitHub README and docs/CHAIN.md and RULEBOOK still describe Robinhood Chain (4663, RPC `rpc.mainnet.chain.robinhood.com`, bonding-curve BUY/SELL events, ETH/USDG quote legs). The README's own `data/snapshot-latest.json` is Robinhood-based (block 92345555). H - https://github.com/Denis101Ka/predly/blob/main/docs/CHAIN.md
- Evidence the project pivoted: dashboard.js comments say the project "was renamed to Polyhood" and still uses localStorage key `hoodcap_paper_v1` ("hood" = Robinhood). So the deployed site now runs on Arc while the open-source repo is stale/inconsistent. H (comments in dashboard.js) / M (the pivot inference).
- Practical effect: the repo's chain readers do not feed the live site; the live site uses GeckoTerminal OHLCV plus a public Arc RPC (footer: "data: GeckoTerminal + public RPC"). H - https://predly.tech/

## Kind and market model

- kind: onchain-other in discovery; correct classification is **simulated / paper market** (no on-chain venue). H
- Binary YES/NO on a token's market cap. Three templates (H, https://github.com/Denis101Ka/predly/blob/main/docs/RULEBOOK.md):
  - `reach`: cap touches target above within 1 hour.
  - `hold`: cap never touches a floor below within 1 hour.
  - `double`: cap touches 2x opening cap within 1 day (site JSON also shows a non-2x "reach" variant for `double`-templated markets, e.g. target 1.3x for a $5.5M cap; so the template name is loose). H - api/markets.json
- Top 20 tokens by cap, 3 markets each = 60 open markets at a time. YES price in whole cents, NO = 100 - YES. H
- Pricing is a model, not a book: `touch d = ln(target/cap)/(sigma*sqrt(tau))`, `p_yes = clamp(2*(1-Phi(d)), 0.03, 0.97)`; floor is the complement. The README itself publishes a calibration backtest saying the model is "overconfident on near certainties and underprices the tails" (95c quotes hit about 79%). H - README
- The site's order book and fills are simulated client-side: dashboard.js stores a paper ledger in the visitor's localStorage with a $1000 start balance. H - dashboard.js (`PAPER_KEY`, `START_BALANCE_USD = 1000`)
- No tokenised outcomes, no share tokens, no contracts. NOT FOUND (searched: README, docs/, site JS, repo tree; no Solidity or contract address for a market).

## Chains and collateral

- None for the markets themselves: there is no collateral and no settlement. H
- Underlying reference data is Arc (chain 5042) memecoin pools, quoted vs USDC. M (5042 as the Arc mainnet id is taken from the site only; not independently verified against Arc docs).

## Read API

- exists: **unofficial-only** in effect. The site's own frontend JSON files are public, unauthenticated and undocumented. There is no documentation page. H (200 OK, no auth) / NOT FOUND (searched: predly.tech, /api, /robots.txt, /llms.txt all 404; README and docs/ have no API section).
- Base URL: `https://predly.tech`. Docs: none (README at https://github.com/Denis101Ka/predly only documents the offline verify tools and the Robinhood data snapshots).
- Endpoints (found in dashboard.js `fetchJson` calls; first two confirmed with GET):
  - `GET /api/snapshot.json` (~17 KB): `generated_at`, `sources`, `chain`, `eth_usd`, `tokens[20]` (address, symbol, `pool{id,kind,dex,quote_*}`, `price_usd`, `fdv_usd`, `mcap_usd`, `liquidity_usd`, `vol24_usd`, `chg`, `tx24`, `created_at`, `spark[]`), `launches[]`, `stats`. H - fixture `docs/research/fixtures/predly/api-snapshot.json`
  - `GET /api/markets.json` (~51 KB): `generated_at`, `markets[60]` (id `template:token:window_start`, `question`, `window_start`, `deadline`, `open_cap_usd`, `target_usd`, `cap_usd`, `p_yes`, `yes_c`, `no_c`, `sigma_h`, `status`, `outcome`, `resolved_at`), `resolved[]` (recent 40ish), `stats`. H - fixture `docs/research/fixtures/predly/api-markets-first12.json` (truncated to the first 12 open markets; `resolved` list kept)
  - `GET /api/ohlcv/{tokenAddress}.json?tf=5m` - referenced in JS, NOT called. M
- Auth: none. Rate limits: none documented; response headers show nginx, `cache-control: no-cache`. The upstream is paced by GeckoTerminal's limit (snapshot `last_error` shows a GT HTTP 429), so refresh is every few minutes. H
- Websocket: NOT FOUND (searched: dashboard.js for WebSocket/ws; the page polls JSON).
- Stability risk: undocumented, single-operator, and the repo is inconsistent with the live deployment, so the schema can change without notice. M

## Trade path

- **none.** The site never builds a transaction or asks for a signature ("wallet connect is ux only - no signatures - no transactions"; README: "It never asks for a signature, never builds a transaction"). H - dashboard.js, README FAQ
- PayBox/EVM reachability: nothing to reach. No contract to propose a transaction to, no signed-order scheme. paybox_reachable = no.

## Fees

- NOT FOUND (searched: site, README, docs; none mentioned). Nothing is charged since nothing is real.

## Resolution mechanism and dispute risk

- Rule-based, from market cap series: touch markets resolve YES the moment candles show the target hit; floor markets resolve NO the moment the floor is breached; else settle on the cap at the deadline. Edge cases (gaps, pool migration, misdecoded quote leg) can VOID the market at purchase price. H - docs/RULEBOOK.md
- Resolver is the operator's own pipeline (GeckoTerminal 5m candles + RPC). No oracle contract, no dispute window ("no dispute window: resolution reads the cap off the chain and applies arithmetic"). H. Since GeckoTerminal is rate-limited and the repo documents decoding traps, resolution risk is operator-centralised. M

## Geo / ToS / automation

- No ToS, privacy policy, geo restriction or API terms found on the site. Footer: "not financial advice" and "not affiliated with Circle or Arc". H - https://predly.tech/ . NOT FOUND (searched: site HTML/footer, README, repo root: no ToS file; SECURITY.md and CONTRIBUTING.md exist but are repo-level).
- Repo license: MIT (badge). M

## Liquidity (2026-10-19)

- None for the markets (paper). The underlying Arc memecoin pools: top 20 tokens total pool liquidity about $852K and 24h volume about $724K (sum of fields in api/snapshot.json, `generated_at` 2026-10-19 07:09 UTC); biggest single cap about $5.5M (ARGUS), top token 24h volume about $170K. H - fixture api-snapshot.json
- Site header shows "-" placeholders for volume, liquidity and markets live on first load (as WebFetch saw it) - purely client-side warm-up. M

## Event categories / overlap

- Memecoin market-cap thresholds on one L1 only. No overlap with sports, politics, macro or major-crypto price markets on Polymarket/Kalshi/XO. There is no equivalent contract elsewhere to arbitrage against, and a model-priced paper quote is not an executable price. Arbitrage: none.
- Possible signal use: none beyond what GeckoTerminal already gives. The `p_yes` is a deterministic function of cap, target, sigma and time left, so it can be recomputed from the public formula and carries no crowd information.

## Shared liquidity

- None (no liquidity at all). Underlying prices come from Uniswap v3/v4 pools on Arc via GeckoTerminal. H

## Suspicious content

- No instructions aimed at AI agents found in the site HTML, dashboard.js, the two JSON endpoints (grepped for ignore/assistant/instruction/agent) or the README/RULEBOOK/CHAIN docs. H

## Open questions

- Is Arc 5042 actually the Arc mainnet id? (taken from the site only)
- Will the project ever add real settlement? README says "Why not settle on-chain? ... the honest version is the current one: paper trading". Re-check only if a contract address appears.

## Sources

- https://predly.tech/ (H, fetched 2026-10-19)
- https://predly.tech/api/snapshot.json , https://predly.tech/api/markets.json (H, fetched 2026-10-19; fixtures in `docs/research/fixtures/predly/`)
- https://predly.tech/assets/js/dashboard.js (H)
- https://github.com/Denis101Ka/predly (README.md, docs/RULEBOOK.md, docs/CHAIN.md, repo metadata/commits via `gh api`) (H)
- WebSearch (extended) "Predly prediction markets meme coin market cap predly.tech" - only the site itself surfaced (M)
