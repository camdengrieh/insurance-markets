# Fate Protocol (Stability Nexus) - venue spec

Researched 2026-10-19. Read-only. Verdict: **skip** (testnet-only; not a prediction market in the event-contract sense).

## Summary
- Fate = "perpetual prediction pools": a two-vault (bullCoin / bearCoin) leveraged price-direction pool on a Chainlink price feed. No expiry, no events, no yes/no outcome. [H, README + contracts ABI in Fate-EVM-Frontend]
- As of 2026-10-19 the frontend (main, last push 2026-10-19) is wired to **Sepolia testnet only**: one factory 0x5882604e18a295bbc904316e0ca872463b48f9ed (deployed 2026-10-14, 3 txs total). [H, src/utils/addresses.ts, src/utils/chainConfig.ts, Blockscout]
- The README still advertises Ethereum, Base, BNB, Polygon, ETC; every one except ETC/Sepolia is a 0x000 "Pending" placeholder; ETC wiring was removed from the frontend on 2026-09-19 (commit "Remove the Ethereum Classic wiring (#143)"); an earlier commit 2025-12-15 removed Ethereum/Polygon/BSC/Base. The old ETC factory 0x6eb2...c7db202 shows 0 transactions and no logs. [H]
- Site http://evm.fate.stability.nexus/ returns 200; names no chain, fees or contracts. [H]

## Market model [H unless noted]
- Pool = PredictionPool contract with `baseToken`, `oracle`, `leverage` (WAD), `bullCoin`, `bearCoin`, `bullReserves`, `bearReserves`, fees. Users mint/burn bull or bear coins (ERC20) against base-token collateral ("Coin.buy()"/sell; estimateBuy.ts, estimateSell.ts).
- `rebalance()` shifts reserves between vaults by (newPrice/oldPrice)^leverage using the oracle price: i.e. a leveraged long/short on one price feed (ETH/USD, BTC/USD, AUD/USD on Sepolia). Price-feed whitelist in supportedChainFeed.ts. Not binary/categorical/scalar event markets; no order book; AMM-like reserve pool, no bid/ask. Anyone can create a pool via /createPool (factory). Price of a coin is reserve/supply (inferred) [M].
- Closest analogue: perpetual/power-perp style index product, not an event contract. No cross-venue event match is possible except as a crypto-price directional signal.

## Chains and collateral
- Live: Sepolia (11155111) only. Collateral: any ERC20 `baseToken` chosen at pool creation, plus a native-ETH helper (WETH9 on Sepolia) added 2026-10-19. Testnet value = none. [H]
- Mainnet: none found. NOT FOUND (searched: addresses.ts, chainConfig.ts, README, docs.stability.nexus/llms.txt, Blockscout for ETC factory). Contracts repo is not in the StabilityNexus public org list (only Fate-EVM-Frontend, Fate-Sui-Frontend, Fate-Solana*, Fate-LandingPage) - NOT FOUND.

## Read API
- Official API: **none**. Frontend is a static export (`output: "export"`), "no API routes", every read is client-side on-chain via viem/ethers over public RPCs and a chunked getLogs scanner (AGENTS.md, lib/scanLogs.ts). [H]
- On-chain only: factory (PredictionPoolFactory ABI), pool getters `getCurrentPrice`, `getPoolStats`, `getPoolCounters`, `bullReserves/bearReserves`, fee fields, events `Rebalanced`, `beginTrade/endTrade`. No subgraph found. Fee denominator = 100000. [H]
- docs.stability.nexus has no Fate pages (llms.txt lists only Djed/Gluon/channels). [H]
- No websocket. Fixtures: none of API shape (no API); saved two Blockscout counters responses as evidence only.

## Trade path
- Direct contract calls (mint/burn coins, optional ERC-2612 permit helper `lib/permit.ts`, native helper contract 0x9198c4332845aba314f164be73a00619abb46606 on Sepolia). No signed-order flow. [H]
- PayBox reachability: an EVM wallet could in principle send tx proposals, but only on Sepolia, which is a testnet: **no** for real funds. paybox_reachable = no.

## Fees [H, UI defaults; contract is the authority]
- Per-pool, set at creation: mintFee, burnFee, creatorFee, treasuryFee (UI defaults 3.0%, 3.0%, 2.0%, 0.5%; 0-100% allowed), denominator 100000. Paid by trader on mint/burn. Fee is added to vault reserves ("balances vaults") plus creator/treasury cuts - exact split NOT FOUND (contract source not read).

## Resolution
- No resolution: perpetual; value driven by Chainlink (and README says "Hebeswap") oracle price each rebalance. Oracle adapter factory ChainlinkAdapterFactory; frontend has an oracle allowlist. Risks: oracle staleness/manipulation, pool-creator-chosen parameters, unaudited ("Audited" claim in README unsupported - no report found) [L].

## Geo / ToS / automation
- Terms of Use modal fetched from a TERMS_PAGE_URL (content not read); no automation rules found. NOT FOUND (searched: site, README, SECURITY.md).

## Liquidity
- Sepolia factory: 3 transactions, 12 token transfers (Blockscout counters, 2026-10-19). Testnet; TVL meaningless. Mainnet TVL: none. [H]

## Event overlap / shared liquidity
- Crypto price direction only, and not as event contracts; no independent arbitrage leg. Independent liquidity but zero.

## Priority
- skip: testnet only, no API, no event semantics, no liquidity. Revisit if a mainnet factory address appears in addresses.ts (watch repo).

## Open questions
- Is the contracts repo private? Planned mainnet date? Fee split formula?

## Sources
- http://evm.fate.stability.nexus/ (200, 2026-10-19) [H]
- https://github.com/StabilityNexus/Fate-EVM-Frontend (README, AGENTS.md, SECURITY.md, src/utils/addresses.ts, chainConfig.ts, supportedChainFeed.ts, rpcTransport.ts, abi/PredictionPool.ts, lib/estimateBuy.ts, FeeConfigurationStep.tsx, commit history) [H]
- https://docs.stability.nexus/llms.txt [H, no Fate content]
- https://eth-sepolia.blockscout.com/api/v2/addresses/0x5882604e18a295bbc904316e0ca872463b48f9ed(/counters), https://etc.blockscout.com/api/v2/addresses/0x6eb2eec7bcc4096e35d7bc467e411a505c7db202(/counters) [H]
- WebSearch unavailable (session budget exhausted); no secondary sources used.
