# Kosh Finance (World Cup prediction market, Solana devnet) - venue spec

Researched 2026-10-19. Verdict: **skip**. Devnet-only demo, valueless faucet collateral (kUSD), empty market list, upstream oracle token expired, last commit 2026-07-19.

## Identity and name collision

- Same-name different product: `https://kosh.finance` is "Kosh Finance - the World's first ZK-ROSCA" (savings circles on Midnight Network, waitlist). It is not a prediction market and shows no link to this project. [H] https://kosh.finance
- The prediction market is the GitHub repo `snehendu098/koshfinance` (created 2026-07-16, last push 2026-07-19, 0 stars, homepage `https://koshfinance.vercel.app`). [H] https://github.com/snehendu098/koshfinance
- The homepage `koshfinance.vercel.app` returns 404 `DEPLOYMENT_NOT_FOUND` as of 2026-10-19: the frontend is gone. [H] curl 2026-10-19
- Two npm maintainers, no homepage/repository/license fields in the npm metadata. [H] https://registry.npmjs.org/@koshfinance%2Fsdk
- Web search was unavailable (session search budget exhausted), so no independent press/social coverage was checked. Absence of coverage is NOT confirmed.

## Still live?

- Backend API is up: `GET https://kosh-api.silonelabs.workers.dev/` -> `{"service":"kosh-finance-api","status":"ok"}` (2026-10-19). [H]
- `GET /markets` returns `[]` (no markets listed). [H] fixture `markets-empty.json`
- `GET /fixtures?startEpochDay=<day>` returns 502 `{"error":"TxODDS 403: API Token is invalid or expired."}` for 2026-06-15, 2026-07-18 and 2026-10-19. The upstream feed token has lapsed, so the keeper/bot cannot open or resolve markets. [H]
- Own README: "Everything below runs on Solana devnet." No mainnet deployment; mainnet txoracle address listed as "later". [H] https://github.com/snehendu098/koshfinance/blob/main/README.md , knowledgebase/IMPLEMENTATION.md
- Status: not live in any money-bearing sense. Hackathon-style demo.

## Market model

- Binary YES/NO only today (README). "Distribution markets" are designed, not live. [H]
- Pricing: pm-AMM (Paradigm), pool is always counterparty; no order book. State: pool score `z`; YES price = normal CDF of `z`; liquidity decays toward expiry. [H] README, kosh-docs/docs/pm-amm.md
- Outcomes are NOT tokenised: positions are `Position` accounts (PDA) holding shares; LPs hold `LpPosition`. Each betting line (e.g. over 2.5 goals) is its own market PDA derived from fixture, stat keys, period and predicate (Single / Sum / Diff of TxODDS stat keys). [H] kosh-docs/docs/on-chain-program.md
- Creation is curated: only allowlisted "opener" wallets can create markets; trade/LP/settle permissionless. [H]

## Chain and collateral

- Solana devnet. pm_market program `6yRqxBy8JykXZGybtrvMMYW7o7DWSiMt86Km8h5QJ7FE`; txoracle `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`. [H]
- Collateral pinned to "kUSD" (mint `D7r4FQS2ebZcs5tDvjDMmGCCHJoMo7Uj6bLw4hDq4woA`, 9 decimals), a protocol-controlled mint with a devnet faucet. Valueless. [H] IMPLEMENTATION.md
- Contract is not audited per anything found: NOT FOUND (searched: README, kosh-docs, repo tree).

## Read API

- Official-ish, public, unauthenticated Cloudflare Worker (Hono): `https://kosh-api.silonelabs.workers.dev`. CORS `*`. Docs: https://github.com/snehendu098/koshfinance/blob/main/kosh-docs/docs/api-reference.md [H]
- Routes: `GET /` liveness; `GET /fixtures?startEpochDay=&competitionId=`; `GET /odds/:fixtureId`; `GET /scores/:fixtureId`; `GET /proof?fixtureId&seq&statKeys`; `GET /markets` (undocumented in api-reference.md, exists in repo `api/src/routes/markets.route.ts`; observed returning `[]`); `GET /portfolio` route exists in repo (not probed). Keeper: `POST /keeper/register`, `GET /keeper/:market`. Admin/faucet/webhook routes exist. [H for documented, M for others]
- Fixtures/odds/scores are a proxy of TxODDS data, not Kosh's own prices.
- Rate limits / auth: none documented. NOT FOUND (searched: api-reference.md).
- Websocket: NOT FOUND. Prices could be read on-chain: `fetchMarket` in SDK, price = Phi(z) via `zToPrice`. [H] SDK README
- Fixtures saved: `docs/research/fixtures/kosh-finance/` (root.json, markets-empty.json, fixtures-400.json, fixtures-502.json). No populated market sample exists because the list is empty.

## Trade path

- On-chain only: sign Solana transactions with a keypair (`trade_binary` with `max_cost`, `sell_binary` with `min_proceeds`, `add_liquidity`, `claim`). SDK `@koshfinance/sdk` 0.1.1 (npm, published 2026-07-18, `@solana/kit`); `KoshClient.bet(market, mint, {toPrice, maxCost})`. [H] npm README
- PayBox reachability: an EVM-only wallet cannot trade this. A Solana PayBox wallet could in principle sign Solana transactions, but only on devnet with valueless kUSD, so there is nothing to trade. Reachable: **no**.

## Fees

- Per-market `fee_bps`, max 1000 (10%), set by opener at creation (README example 200 bps = 2%). Charged on collateral cost, rounded up in pool's favour, accrues to LPs. Sell also deducts fee. [H] on-chain-program.md

## Resolution

- Trustless-by-design: `resolve` after expiry does a CPI into TxODDS txoracle `validate_stat_v2` with a Merkle proof; boolean outcome. Keeper (Cloudflare Durable Object) auto-resolves; anyone with a valid proof can. `void` after `void_after_ts` refunds. [H] settlement.md
- Dependency risk: single oracle (TxODDS TxLINE) and a keeper API token that is currently expired. Dispute process: none (oracle-defined).

## Geo / ToS / automation

- NOT FOUND (searched: README, kosh-docs FAQ/support, kosh.finance). No ToS found. Bots are explicitly intended users of the SDK.

## Liquidity

- Effectively zero. Devnet faucet tokens; `/markets` empty on 2026-10-19; no volume/TVL source exists. [H]

## Event coverage / arbitrage overlap

- Would cover only World Cup match lines (match winner, over/under goals, margin) - overlapping sports markets on Polymarket/Kalshi - but the 2026 World Cup is over and there are no live markets. As a signal source: none (prices are devnet pool states, not real money).
- Shares liquidity with no other venue (independent, but empty).

## Adapter priority: skip

Devnet only, valueless collateral, no live markets, expired oracle token, frontend deployment removed, no mainnet path. Revisit only if a mainnet deployment with real collateral is announced; a Solana adapter would then read `Market` accounts on-chain (price = Phi(z)).

## Open questions

- Whether a mainnet launch is planned (docs reference a mainnet txoracle address "later").
- Whether the team is related to kosh.finance (ZK-ROSCA); no evidence.

## Sources

- [H] https://registry.npmjs.org/@koshfinance%2Fsdk (README, versions, publish times, 2026-07-18)
- [H] https://github.com/snehendu098/koshfinance (README.md, knowledgebase/IMPLEMENTATION.md, kosh-docs/docs/{api-reference,settlement,on-chain-program}.md; read via gh api 2026-10-19)
- [H] https://kosh-api.silonelabs.workers.dev (unauthenticated GETs 2026-10-19)
- [H] https://koshfinance.vercel.app (404 DEPLOYMENT_NOT_FOUND 2026-10-19)
- [H] https://kosh.finance (unrelated ZK-ROSCA site)
- Suspicious content: none found.
