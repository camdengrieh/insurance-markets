# CipherMarket (venue spec)

Researched 2026-10-19. Confidence tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

**adapter_priority: skip.** It is a testnet-only hobby/hackathon-style project (Arbitrum Sepolia, chain 421614). It has no mainnet deployment, no real money, no real liquidity, no HTTP API, and no activity data. It could only matter later if it launches on mainnet. Re-check in 2027.

## Is it live?

- Live in the narrow sense: a demo web app answers HTTP 200 at https://cipher-market-fhe.vercel.app (H, curl 2026-10-19; Next.js client-rendered shell, no market data in the HTML).
- Testnet only. The SDK README lists a single supported network: Arbitrum Sepolia 421614, "Additional deployments will be added in future releases" (H, npm README, https://www.npmjs.com/package/@ciphermarket/sdk). The repo README says "protocol on Arbitrum Sepolia" (H, https://github.com/Psalmuel01/CipherMarket).
- Very recent and small: npm package created 2026-05-30, last modified 2026-05-31, versions 0.1.0 to 0.1.2 (H, https://registry.npmjs.org/@ciphermarket/sdk). Repo created 2026-03-28, last push 2026-06-03, 1 star (H, GitHub API). No commits seen after early June, so about 4.5 months without a push as of today (M, possibly stale).
- Not found: a production domain, docs site, mainnet addresses, audit, token, volume data (NOT FOUND, searched: web search x2, npm metadata, repo README, GitHub repo search). The npm package has no homepage or repository field (H); the repo was found via GitHub code search for the package name.
- Name collisions to avoid: github.com/jqlabonge/CipherMarket (a vulnerability-disclosure marketplace, unrelated), cyphers.live (encrypted prediction market on Solana, unrelated), github.com/elemuje/Ciphermarket ("the first prediction market where your bets are fully encrypted", pushed 2026-05-08; relationship to this project unknown) (M, search results only, not read).

## Kind and market model

- kind: onchain-other; singleton `PredictionMarket` EVM contract plus `OracleRegistry` (H, repo README).
- Binary or categorical markets, 2 to 8 outcomes (`MAX_OUTCOMES = 8`) (H, PredictionMarket.sol).
- Pricing: FPMM (fixed product market maker) AMM, no order book. Pool reserves, probabilities, liquidity, volume and lifecycle state are public; per-user share balances are CoFHE (Fhenix) encrypted handles (H, repo README, SDK README).
- Outcome tokenisation: not ERC20/ERC1155. Positions are encrypted contract-internal balances keyed by (market, outcome, user), so shares are non-transferable and not visible on chain (H, README "positions are encrypted"; M on non-transferability, inferred from design).
- Prices: `probability` per outcome scaled 1e18, computed from reserves (H, SDK dist/markets.js, marketMath.js).

## Chains and collateral

- Arbitrum Sepolia only (testnet). Collateral: native ETH or whitelisted ERC20 (owner `setAcceptedCollateral`), practically a test USDC (6 decimals) (H, PredictionMarket.sol, SDK addresses.js).
- Deployed addresses published in the repo (public contract addresses, saved as fixture `docs/research/fixtures/ciphermarket/deployed-addresses.json`): PredictionMarket 0x3104BA276c43da54551875d18E3a43AB3124F26C, OracleRegistry 0xD9228DFca1D1B857662Fe2D21DE50811f4EB10Eb, Reineira adapter 0x9Adb49cF84D3720185620e6f09B102d29ae5434c, USDC (test token) 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d (H, https://github.com/Psalmuel01/CipherMarket contracts/deployed-addresses.json). Whether these are the current deployment is unverified (no RPC or explorer check; see open questions).

## Read API

- exists: **onchain-or-subgraph-only**. No REST/GraphQL/websocket API, no subgraph, no indexer found (NOT FOUND, searched: README, SDK exports, site paths /docs /docs/sdk /markets which are client-rendered shells).
- Official SDK: `@ciphermarket/sdk` 0.1.2, MIT, TypeScript, peer deps `viem` ^2.37 and `@cofhe/sdk` ^0.5.2 (H, npm).
- Reads are contract calls: `nextMarketId()`, `getMarket(id)`, `poolBalances(id, outcomeIdx)`, `quoteBuy(id, outcome, collateralIn)` returning (sharesOut, fee, avgPrice, postTradeProbabilities[]), `quoteSell(...)` (H, SDK dist/markets.js and quotes.js). `listMarkets` loops over all ids (N+1 RPC calls).
- Market summary fields: title, description, category, oracleSource, type, expiryTime, status (ACTIVE, EXPIRED, RESOLUTION_OPEN, ESCALATED, FINALIZED), outcomes with labels, probability and reserve, totalCollateralCollected, tradeVolume, minimumTrade, collateralToken, proposed and final outcome (H, SDK dist/markets.js).
- Auth and rate limits: none from the project; limited by whichever Arbitrum Sepolia RPC is used.
- Attempted to read on-chain activity via Blockscout's GET API; blocked by a Cloudflare challenge, so no tx counts or TVL were obtained.
- Fixtures: no HTTP response shapes exist to save. Saved `fixtures/ciphermarket/deployed-addresses.json` (repo file) and `fixtures/ciphermarket/npm-registry-summary.json` (trimmed registry metadata). The maintainer contact email present in the registry was deliberately left out.

## Trade path

- Programmatic via SDK or direct contract calls from an EVM wallet: `buyShares(marketId, outcomeIndex, collateralAmount, minSharesOut, collateralToken)` (handles ERC20 approval), `sellShares`, `redeemShares(marketId, sharesOwned, signature)` (H, SDK README, PredictionMarket.sol).
- Selling and redeeming need a CoFHE `decryptForTx` result (Fhenix threshold-network signed decryption of your encrypted balance), verified on chain with `FHE.verifyDecryptResult`; viewing a portfolio needs a CoFHE permit (`decryptForView`, an EIP-712 signature) (H, repo README/update.md). This requires the `@cofhe/sdk` client, i.e. a service interaction beyond plain tx signing.
- Anyone can `createMarket` with seed liquidity (permissionless, no allowlist in the function) (H, PredictionMarket.sol).
- PayBox reachability: **no** in any practical sense. A PayBox EVM wallet could in principle send plain contract-call transactions, but only on Arbitrum Sepolia testnet, and sells and redeems need the CoFHE client. Nothing of value to trade. (M)

## Fees

- Trade fee 100 bps (1%) on collateral in (buy) or gross collateral out (sell), paid by the trader. 20% of that fee goes to the protocol (`DEFAULT_PROTOCOL_FEE_SHARE_BPS = 2000`), 80% to LPs (H, PredictionMarket.sol constants and `_allocateFee`). Dispute fees: 80% of a committee-resolved dispute amount to the oracle reward pool, rest to protocol (H, PredictionMarket.sol).

## Resolution and dispute risk

- Oracle-registry model: staked oracles (ETH stake, default 1 ETH) propose an outcome, a dispute window follows, then voting/quorum, with owner-only `resolveEscalated` as admin fallback; disputes can use a direct bond or a USDC bond via a Reineira escrow adapter (H, repo README, PredictionMarket.sol, SDK addresses.js).
- The SDK default dispute window is 5 minutes and escalation timeout 10 minutes, which are test settings (H, SDK addresses.js, PredictionMarket.sol). Resolution is centralised on the owner key in the worst case. High dispute and trust risk; unaudited (no audit found).

## Geo, ToS, automation

- NOT FOUND (searched: README, site shell). MIT license on the SDK. No ToS or geo restrictions published; testnet tokens only. The README says its own Telegram bot deliberately avoids in-bot signing (v1 is read and alerts only) (H).

## Liquidity

- NOT FOUND for any date. Testnet; the update.md example dashboard string "15 USDC · 1 ETH" suggests tiny dev-level amounts (L, a UI example string, not a measurement). Treat TVL as about zero and valueless.
- Shares liquidity with: nobody (own FPMM pools). Independent but irrelevant.

## Event coverage and overlap

- Markets are user-created with free-text title/category/oracleSource; no curated catalogue found. Any overlap with sports, politics or crypto price would be incidental and untradeable for value. Useful as neither arbitrage leg nor signal source (M).

## Adapter notes (only if it reaches mainnet)

- Adapter would be a viem-based on-chain reader (multicall `getMarket` + `poolBalances` + `quoteBuy`), no API. Price signal = FPMM probability; fee 1%. Trading needs a CoFHE client. Revisit only if a mainnet address and real TVL appear.

## Suspicious content

- None observed. The npm README and repo contain no instructions aimed at AI agents.

## Open questions

- Are the published testnet addresses still the current deployment, and how many markets/trades exist? (Needs an RPC `eth_call` or an explorer that does not block scripted GETs; a JSON-RPC call is a POST, which the ground rules forbid, so it was not done.)
- Is there a mainnet roadmap? Is elemuje/Ciphermarket related?

## Sources

- https://www.npmjs.com/package/@ciphermarket/sdk (README via registry JSON) - H
- https://registry.npmjs.org/@ciphermarket/sdk - H
- https://unpkg.com/@ciphermarket/sdk@0.1.2/dist/ (addresses.js, markets.js, quotes.js) - H
- https://github.com/Psalmuel01/CipherMarket (README.md, update.md, contracts/contracts/PredictionMarket.sol, contracts/deployed-addresses.json) - H
- https://cipher-market-fhe.vercel.app (HTTP 200, client-rendered shell) - H
- Web searches (extended) for CipherMarket/Fhenix CoFHE/Reineira - M (no project site found); https://github.com/pplmaverick/fhenix-confidential-prediction-market appeared as an unrelated similar project - L
