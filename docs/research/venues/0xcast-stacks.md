# 0xCast (Stacks) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. A solo-developer, hackathon-style parimutuel on Stacks (STX collateral). On-chain, the main market contract has 2 markets ever created (last 2026-06-15) and no recorded stake transactions in its history. No independent liquidity, no order book, no price API, and resolution is trusted to the market creator or an oracle contract. Not worth an adapter.

## Is it live?

- Contracts deployed to Stacks mainnet 2026-06-07 (README claims 13 contracts; deployer SP1W6X...). H - https://github.com/mosas2000/0xCast/blob/main/README.md
- Repo created 2026-01-20, last push 2026-06-18, 5 stars, no description or homepage set. H - `gh api repos/mosas2000/0xCast`
- Hiro API for `<deployer>.market-core`: **4 transactions total** - the deploy (2026-06-07), then 3 `create-market` calls (2 success, 1 aborted; 2026-06-14 and 2026-06-15). Zero `place-yes-stake` / `place-no-stake` / `claim-winnings` calls. H - https://api.hiro.so/extended/v2/addresses/SP1W6XQZ6XVYGTVW32SJW2ZG48ZJBW9BATRD19N60.market-core/transactions (fixture saved)
- `market-counter` data-var = u2 (two markets ever). H - https://api.hiro.so/v2/data_var/SP1W6XQZ6XVYGTVW32SJW2ZG48ZJBW9BATRD19N60/market-core/market-counter (fixture saved)
- Markets created were throwaway 24h crypto price questions ("Will STX reach $0.30 in the next 24 Hours ?", "Will Bitcoin reach $70,000 by the next 24 Hours ?"), created by a different address than the deployer. H - same tx fixture
- Other contracts: oxcast, market-multi, liquidity-pool, oracle-integration, market-fees each have 1-2 txs (deploy only); amm-pool has 0. H - Hiro API per-contract calls
- No live frontend URL found: repo homepage empty, README only lists localhost, WebSearch (extended) returned nothing for "0xCast" on Stacks. NOT FOUND (searched: GitHub repo/frontend README, WebSearch extended).
- README table lists market-core at a different address (SP31PKQ...), which has ~14.7k mostly STX-transfer txs and holds an NFT called haven-token, so it looks like an unrelated wallet. The README is inconsistent; the deployer address is the one that actually hosts `market-core`. H/M

## Kind and market model

- kind: onchain-other (Stacks / Clarity). H
- Binary YES/NO only in `market-core` (outcome constants YES=u1, NO=u2); a separate `market-multi` contract exists but has no activity. H - https://github.com/mosas2000/0xCast/blob/main/contracts/market-core.clar
- **Parimutuel pool, not an order book or AMM.** `place-yes-stake` / `place-no-stake` move STX into the contract and increment `total-yes-stake` / `total-no-stake`. There are no share tokens: positions live in a `user-positions` map keyed by (market-id, user). Payout = `stake * total_pool / winning_side_stake`. There are no cancels or exits before resolution. H - market-core.clar lines ~728-893
- The implied price is pool ratio, not a tradable quote. A separate AMM/liquidity-pool is claimed in the README but is unused on-chain (amm-pool 0 txs, liquidity-pool deploy only). H/M
- Categories: crypto, sports, politics, economics, other (constants). H

## Chains and collateral

- Stacks mainnet only; collateral = native STX (`stx-transfer?`). A governance token CAST exists, with no trading relevance. H
- Not an EVM chain and not Solana.

## Read API

- exists: **onchain-or-subgraph-only**. There is no 0xCast-operated API. H - repo docs/api-reference.md says the frontend talks directly to Hiro/Stacks node APIs.
- Base URLs: `https://api.hiro.so` (also `https://api.mainnet.hiro.so`), `https://stacks-node-api.mainnet.stacks.co`. H - https://github.com/mosas2000/0xCast/blob/main/docs/api-reference.md
- Docs: https://github.com/mosas2000/0xCast/blob/main/docs/api-reference.md and the npm SDK https://www.npmjs.com/package/oxcast-sdk (v1.0.0/1.0.1, both published 2026-05-18, never updated since). H
- Key calls (generic Stacks, not venue-specific):
  - `POST /v2/contracts/call-read/{addr}/market-core/{get-market|get-market-counter|get-market-pool-size|get-user-position}` for market state. Not exercised: POST is outside this session's rules. M (from docs)
  - `GET /v2/data_var/{addr}/market-core/market-counter` confirmed. H
  - `GET /extended/v2/addresses/{addr}.market-core/transactions` for activity. H
  - Hiro websocket `/extended/v1/ws`. M (from docs)
- Auth/limits: Hiro public endpoints are rate-limited (docs say so, no numbers); an API key is optional. M
- No prices, books or trades endpoints exist, because there is no order book. Prices would have to be derived from `total-yes-stake` / `total-no-stake`.

## Trade path

- Place a stake by calling the Clarity public functions `place-yes-stake(market-id, amount)` / `place-no-stake`, signed by a Stacks wallet (secp256k1 Stacks tx, SIP-005). Claim via `claim-winnings`. H
- Rate limits are enforced in-contract (max 10 stakes per 144-block window per address). H
- **PayBox reachability: no.** An EVM or Solana wallet cannot sign Stacks transactions and STX is not a PayBox-supported chain (as far as known; not verified against PayBox this session, and I did not call PayBox tools). The paybox_reason is chain mismatch. M

## Fees

- `market-fees` has `fee-rate` default u50 (0.5%) and `record-fee`, but `claim-winnings` in market-core does not call it: payout = full pool share with no fee deduction in the code read. So the effective fee is **0 in market-core**, plus Stacks tx fees (~0.003 STX seen). H (code) / M (could have changed through the migration-manager or proxy)

## Resolution and dispute risk

- Creator can call `resolve-market` (only the market creator, after resolution-date): single-party trust. Oracle path (`oracle-resolve`) is callable only by the oracle-integration contract; `community-resolve` likewise. H
- After a resolution there is a dispute window (default 144 blocks, about 1 day), then `finalize-market`; unresolved markets can be refunded after the deadline. H
- Owner can pause the contract and has an admin-force-refund. High centralisation and dispute risk. H

## Geo / ToS / automation

NOT FOUND (searched: README, repo docs, WebSearch). Permissionless contracts; no ToS located. Docs include a GDPR note for the frontend only.

## Liquidity

- Effectively zero: 2 markets, no stake txs in market-core history (Hiro API, checked 2026-10-19). H
- No volume/OI/TVL source exists; the contract's STX balance is 0. H (deployer balance 0; contract balance not queried separately)

## Event overlap / shared liquidity

- Nominally crypto price (BTC, STX) questions, which overlap Polymarket/Kalshi-style crypto markets, but with no liquidity and a trusted creator-resolver, there is no real arbitrage leg.
- Shares liquidity with no other venue: it is independent but empty. H

## Sibling Stacks projects seen (not researched in depth)

- Ooja (npm ooja-sdk, ooja.xyz): the site returns 200 and redirects client-side to /lander; no further research. L
- StackCast (https://github.com/stackcast/stackcast): a hackathon CLOB on Stacks with sBTC collateral, surfaced by WebSearch only; not verified. L
- BTC-blockhash-settled PM repos: not examined.

## Suspicious content

None found. Note: npm registry metadata lists the publisher's personal email; deliberately omitted here.

## Sources

- https://github.com/mosas2000/0xCast (README, contracts/market-core.clar, contracts/market-fees.clar, docs/api-reference.md)
- https://registry.npmjs.org/oxcast-sdk (publish times 2026-05-18)
- https://api.hiro.so (address transactions, data_var)
- WebSearch extended "0xCast prediction market Stacks mainnet live app" (nothing relevant)

## Fixtures

- docs/research/fixtures/0xcast-stacks/hiro-market-core-transactions.json (first 3 txs, trimmed)
- docs/research/fixtures/0xcast-stacks/hiro-data-var-market-counter.json
