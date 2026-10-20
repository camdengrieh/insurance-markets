# Rocket Markets (app.rocketmarkets.fun) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict
Skip as an arbitrage leg. Time-based "when will X happen" yield/decay market on Monad, curated markets only, one live market found (Elon Musk next post on X). No public API, on-chain only, no outcome price that maps to a YES/NO probability. Only conceivable value is a signal-only "expected timing distribution" for X-post-type events. adapter_priority: skip (could be P2 signal-only if timing distributions ever matter).

## Liveness
- App returns 200, Nuxt SPA, title "Rocket Markets - The First Time-based Prediction Yield Market." [H] https://app.rocketmarkets.fun/
- Listed live=true in Monad official registry, address of Market + SurvivorVaultImplementation [H] https://raw.githubusercontent.com/monad-crypto/protocols/main/mainnet/rocket_markets.jsonc (fixture: docs/research/fixtures/rocket-markets/monad-registry-rocket_markets.jsonc). Registry commit date NOT FOUND (gh commits query failed).
- App bundle contains one live market "Elon Musk posts on x.com" plus two placeholder "upcoming" markets with empty addresses ("Rain starts in NYC", "Touchdown scored in any NFL game") [H] https://app.rocketmarkets.fun/_nuxt/D1ZwTXhD.js
- Docs: https://rocket-markets.gitbook.io/rocket-markets-docs/ (index fixture docs-llms.txt). Docs have no dates. Page meta has robots noindex.
- Not the same as "Rocket" (userocket.app).

## Kind and market model
- kind: onchain-other. Time-decay / yield market; neither binary, categorical nor classic scalar. One event per market, no expiry. [H] docs basic-concept
- Survivors: deposit USDC into per-round ERC-4626 vault, earn yield per second while event has not happened; wiped if event fires. Detonators: buy a time window (amount, start, end), mint an ERC-721 position on the Market contract; decays while event delayed, share of Survivor pool if event lands in window ("time-concentrated liquidity", analogous to Uniswap v3 ticks over time). [H] docs liquidity-provision, rocket-markets-101; registry comments
- Outcomes tokenised: Detonator position = ERC-721 NFT (tokenId); Survivor = ERC-4626 vault shares (new vault clone per round). [H] registry; bundle ABI (depositNearestTicks returns tokenId; withdraw(tokenId); enterWithdrawalQueue(shares))
- Docs 101 says "time-range AMM"; there is no order book. Pricing is not a probability in [0,1]; implied signal is a density over time windows. [H]
- Docs inconsistency: 101 page says Detonators "split pool proportionally to position size" within winning window; liquidity-provision page says payout depends on time concentration. Exact payout formula NOT FOUND (only contract fn estimatePotentialPayout(amount, futureTick, rightTick) seen in front-end ABI). [H for ABI name]

## Chain and collateral
- Monad mainnet (rpc.monad.xyz, explorer monadvision.com referenced in app bundle) [H]. Collateral USDC [H docs/registry]. Monad USDC address 0x754704Bc059F8C67012fEd69BC8A327a5aafb603 appears in the bundle (M: assumed to be USDC).
- Market (ERC-721): 0x5fAbE7Eb6629058bcAa0d2041cACd32638A7480b; SurvivorVaultImplementation: 0x48d9392Db46b00C291a2e29B1aC6C703b57024E2; deployer 0xa81Fc03686883efA5b5cA4faC1437e6870216fD8 [H registry]. Other 0xB088.../0x4c4e... constants in bundle unidentified.
- Auth/wallet: Privy embedded wallets + external wallets (privyAppId in public config) [H].

## Read API
- exists: onchain-or-subgraph-only. No documented public REST/WS API. api.rocketmarkets.fun and app.rocketmarkets.fun/api/markets returned 404 [H]. Searched bundle chunks for backend/indexer/graphql hosts: none found (only Privy, RPC, wagmi/viem, MoonPay) [H]. Market list is hard-coded in the front-end bundle, so enumerating markets requires on-chain discovery (vault clones from deployer) [M].
- On-chain reads seen in front-end ABI: futureTick, tickSpacing, estimatePotentialPayout, resolvers, ERC-4626 balanceOf/totalSupply, ERC-721 tokenURI [H]. I did not perform JSON-RPC calls (POST). MonadVision API is Cloudflare-challenged (not bypassed).
- Rate limits: NOT FOUND. No fixtures of API responses possible; saved registry entry and docs index only.

## Trade path
- Programmatic only via direct contract calls: USDC approve then Market.depositNearestTicks(amount, numTicks) -> tokenId (Detonator); vault deposit/enterWithdrawalQueue (Survivor); withdraw(tokenId); resolve(...) [H bundle ABI, not verified on-chain].
- No signed-order / off-chain order scheme. Plain EVM transactions on Monad.
- PayBox reachability: partial/no. Monad is not in the chain list we expect for PayBox (Base, Ethereum, BNB, Arbitrum, Polygon, Solana ...); whether PayBox supports Monad was not checked (no money-moving tools called). If PayBox can propose arbitrary contract-call transactions on Monad, it is technically feasible; otherwise no. [M]

## Fees
Docs conflict [H]:
- 101 page: Detonator Decay Fee 1.1% (on positions as time decays), Event Resolution Fee 1.0% (of pooled stakes), Survivor Profit Fee 2.5% (profit only); "effective take rate roughly 0.5%".
- how-rocket-markets-makes-money page: Survivor profit fee 2%, event resolution fee 0.5% of Survivor capital, no Detonator fees.
Treat both as unverified. Gas on Monad. Early-LP fee-sharing bonding curve per market.

## Resolution and dispute risk
- Curated by the team initially; oracle-driven; freeze period upon trigger, timestamp cutoff, "final and non-reversible" [H docs market-resolution]. 
- Elon market resolves from Polymarket's xtracker post counter (xtracker.polymarket.com), X as secondary; markets without a clean API source use UMA Optimistic Oracle [H docs 101]. Dependency on a third-party tracker owned by a competitor; centralisation/oracle risk, "resolve" fn has per-address `resolvers` allowlist in ABI (M: suggests permissioned resolvers).
- Rounds roll: bundle string says open Detonator positions roll into the new market after a post [H bundle].
- Audit: NOT FOUND.

## Geo / ToS / automation
NOT FOUND (docs have no ToS/geo page; app not geoblocked to a plain GET). No explicit rule on bots; on-chain contracts are permissionless to call (M).

## Liquidity
- No TVL/volume found. Not in DefiLlama protocols list (checked api.llama.fi/protocols 2026-10-19, no Rocket Markets entry) [H]. Placeholder pool numbers in bundle (109k, 10.9k) are mock data, not real [M]. WebSearch budget was exhausted so no third-party coverage found. Assume thin (L).

## Event overlap / arbitrage
- Live event: Elon Musk post on X. Polymarket has Elon tweet-count markets (same resolution source xtracker), but Rocket's payoff is timing of the first post, not a count or YES/NO price; no clean mapping to a binary contract. Planned: rain in NYC, NFL touchdown (placeholders). No sports/politics/macro/crypto-price depth. Arbitrage overlap: essentially none; at most a hedge/signal using Polymarket time-bucket markets.
- Shares liquidity with another venue: No (own vaults), but resolution depends on Polymarket's xtracker.

## Priority
skip: thin or unknown liquidity, no API, non-probability payoff, curated single market, fee docs inconsistent.

## Open questions
- Does PayBox support Monad? Real TVL/volume (read vault totalAssets and Market events via RPC)? Payout formula? Contract verification/audit? ToS?

## Sources
- https://app.rocketmarkets.fun/ and /_nuxt/*.js bundle [H]
- https://rocket-markets.gitbook.io/rocket-markets-docs/ (llms.txt; welcome, basic-concept, liquidity-provision, market-creation, market-resolution, how-rocket-markets-makes-money, rocket-markets-101) [H]
- https://raw.githubusercontent.com/monad-crypto/protocols/main/mainnet/rocket_markets.jsonc [H]
- https://api.llama.fi/protocols [H, negative]
