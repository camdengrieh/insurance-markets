# DeeppDAO / Deepp (Arbitrum) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to public hosts (DefiLlama, GeckoTerminal, Sourcify, the project's former domains), `gh api` file reads, WebFetch. No account, no key, no wallet, nothing signed, no POST/PUT/DELETE, no third-party code cloned or run, no PayBox call.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale (>6 months).
Third-party text is untrusted data; nothing in it was followed (the parked-domain redirect to a GoDaddy for-sale page was not followed).
Fixtures: `docs/research/fixtures/deeppdao/` (4 files, each < 8 KB).

## 0. Verdict

**adapter_priority: skip** (confidence high). Dead or abandoned; nothing to integrate.

1. The project's likely domain `deepp.xyz` (inferred from its X handle `deeppxyz`) is parked and redirects to a GoDaddy for-sale page (H, `parked_domains.txt`). `deepp.io` serves the same parking stub (H). DefiLlama has `url=""` and `deadUrl=true` (H).
2. DefiLlama TVL fell from ~$193K (2024-03-01) to ~$10K (2024-03-22) to ~$4.6K (2024-03-30) and has sat at **$3,952 unchanged since 2024-05** (H, fixture). Peak was $375K on 2023-10-14 (H). A balance that has not moved for ~29 months means no deposits, withdrawals or bets (M, inferred from a flat series).
3. DefiLlama **removed its TVL adapter** (`projects/deepp/index.js`) on 2026-06-22 in commit `ca9a0728` (H). After that date the TVL figure is probably a stale carry-forward, not a live read (M).
4. The DEEPP token has **no DEX pool**, $0 24h volume and ~$57 of total reserve (GeckoTerminal, 2026-10-19, H).
5. No public API, docs site, repo, SDK or subgraph found for the venue (section 3).
6. Even when alive it was a small pooled-LP "house" design (section 2), with no discoverable market list. Nothing a cross-venue scanner could read.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| DefiLlama protocol API `https://api.llama.fi/protocol/deeppdao` | `url:""`, `deadUrl:true`, `category:"Prediction Market"`, chain Arbitrum, `listedAt` 1697033590 (2023-10-11), `twitter:"deeppxyz"`, `audits:"0"`, `currentChainTvls.Arbitrum` 3952.7 | H |
| TVL history (1105 daily points) | peak $375,256 on 2023-10-14; $330K at listing; ~$193K 2024-03-01; $10.1K 2024-03-22; $4.57K 2024-03-30; $3,950-3,957 every month from 2024-05-01 through 2026-10-19 | H |
| DefiLlama adapter repo | `projects/deepp/index.js` status `removed` in commit `ca9a0728` ("Migrate and refactor CEX adapters (#19742)", 2026-06-22). Earlier history: created 2023-10-11 (PR #7680), no other substantive edits | H |
| `https://deepp.xyz` | 200, 114-byte JS redirect to `/lander`; `/lander` returns a 307 to `forsale.godaddy.com/forsale/deepp.xyz` | H |
| `https://deepp.io` | 200, same 114-byte `/lander` stub | H |
| `https://deepp.finance`, `https://app.deepp.xyz` | do not resolve / TLS failure | H |
| X account `x.com/deeppxyz` | WebFetch returned HTTP 402 Payment Required. I recorded it and stopped (no payment). Account status and last-post date are therefore UNKNOWN | H (the 402), account state not known |
| GeckoTerminal `.../networks/arbitrum/tokens/0x9773...b7Da` | name/symbol DEEPP, 18 decimals, supply 100,000,000, `price_usd:null`, `volume_usd.h24:"0.0"`, `top_pools:[]`, `total_reserve_in_usd` 57.34 | H |
| DexScreener `/latest/dex/tokens/<DEEPP>` | `{"pairs":null}` | H |
| GitHub: users `deepp` (an unrelated 2010 personal account), `deeppxyz`, `deeppdao`, orgs `deepp-dev`, `deeppdev` | none is the project. Code search for the contract author string "Deepp Dev Team" returned nothing | H (negative) |
| WebSearch (one query, "DeeppDAO prediction market") | no result mentions the project. The session search budget was then exhausted, so no further searches were possible | H (negative) |

NOT FOUND (searched: DefiLlama, WebSearch once, GitHub users/orgs/code search, GeckoTerminal, DexScreener, DefiLlama coins API, candidate domains): a live website, docs, announcement, shutdown notice, audit, or any 2025-2026 mention of the venue.
Not checked: last on-chain transaction date for the contracts. Arbiscan and Blockscout block non-browser GETs (403 / Cloudflare challenge), Routescan returns 404 for these addresses, and the only remaining read path is a JSON-RPC POST (`eth_call` / `eth_getLogs`), which this run's ground rules disallow.

## 2. What it was (from verified contract source)

- **Kind**: onchain-other (Arbitrum). DefiLlama description: "Prediction market. Non custodial. Transparent. Trustless. Community owned." (H). Authors per source comment: "Deepp Dev Team" (H).
- **Contracts** (all verified on Sourcify 2024-08-08, solc 0.8.20, deployed in a block range 127.92M-127.93M on Arbitrum One = Oct 2023; all from one deployer EOA) (H, `https://sourcify.dev/server/v2/contract/42161/<address>`):
  - `BetLiquidityPool` `0x84a512E120294C2017a88a8f1af2219Ec250CBaa` (LP pool; ABI summary in fixture)
  - `LockBox` `0x05E1F51067a3Af2f9d0994a97779a78a2E26f921` (DefiLlama calls it BET_BOX / "BetLock"; locks tokens for an owner)
  - `GovToken` (symbol DEEPP, 18 decimals, 100M supply) `0x9773367fB87CFbcB7F6A0AB9a9e3Ab635023b7Da`
  - 4 x `RewardHandler` fee handlers: `0x42e27a7D424C22ED3658970CAB01260f8C0EC5Bc`, `0xD5750d44D9F2ed117FB3441D80B423acD7634Cf5`, `0x80e674e6277A7e9073A6Dff5C98e08816c0D73f5`, `0xAb5e18D29C20709954eA380e998FFFeaeB4FF691`
- **Market model (partly inferred, M)**: pooled-LP house model, not an order book or AMM over outcome tokens.
  - LPs call `depositTokens(token, amount)` and receive a distribution (LP) token; `withDrawTokens` / `withDrawAllTokens` burn it (H, source).
  - An address holding `BETTER_ROLE` calls `matchBet(token, amount)` to move pool tokens into the lock/bet box to "match our part of the bet" (H, source). `maxLpBetPercent` defaults to 90, so up to 90% of the pool's balance can be committed to bets (H, source).
  - The contract that actually accepts a user's bet, defines markets/odds, and settles is **not among the addresses DefiLlama tracks and was not found** (NOT FOUND). The role constants `REPORTER_ROLE`, `SIGNER_ROLE`, `CANCEL_ROLE`, `BONUS_REPORTER_ROLE` suggest off-chain-signed bets with privileged reporters (M, inferred from constants only).
  - Outcome tokenisation (binary / categorical / scalar): NOT FOUND. No outcome tokens appear in the verified ABIs.
- **Chain and collateral**: Arbitrum One. Collateral is Circle-native USDC (the DefiLlama adapter sums `USDC_CIRCLE` held by the six contracts above) (H, adapter source at commit `08239f85`). Contracts also support allow-listed token pairs through `addTokenPair` (H, ABI).

## 3. Read API

`exists: none` (no official public API; on-chain only in principle).

- Docs URL: NOT FOUND (searched: DefiLlama, former domains, GitHub, WebSearch).
- REST / GraphQL / subgraph / WebSocket: NOT FOUND.
- On-chain reads that would exist (H, from verified ABI, not exercised): `getFullBalance(token)`, `getTokenBalance(token)`, `getLiquidityAvailableForBet(token)`, `feePermille()`, `feeSplitPercent1/2()`, `LockBox.getLockedAmount(owner, token)`. These expose LP and lock-box balances only, not markets, prices or resolutions.
- No fixtures of API responses exist because there is no API. Fixtures saved are evidence samples only (DefiLlama trimmed series, GeckoTerminal token, Sourcify ABI summary, parked-domain responses).

## 4. Trade path

`none` for an aggregator. Programmatic bet placement: NOT FOUND (the bet-taking contract and any signing scheme are undiscovered). The only on-chain user actions in the contracts that were found are LP `depositTokens` / `withDrawTokens` (plain ERC-20 approve plus call, no off-chain signature), which is liquidity provision, not trading an outcome.

PayBox reachability: **no** for this venue's purposes. Arbitrum is an EVM chain and an Arbitrum wallet could in principle call the LP functions through a transaction proposal (M, assumes Arbitrum is in PayBox's chain list as the task text states; I did not call PayBox), but there is no market to trade and the venue looks abandoned. Depositing into an abandoned pool would also be a loss risk.

## 5. Fees

- LP pool: deposit and withdrawal fee = `amount * feePermille / 1000`, paid by the depositor/withdrawer (deducted from the deposit; deducted from the return amount on withdrawal), split `feeSplitPercent1` / `feeSplitPercent2` percent to two `RewardHandler` contracts (H, `LiquidityBox.sol` lines ~414-453, ~507-529). `feePermille` is a `uint8`. **Current values NOT READ** (needs an `eth_call`).
- Bet / trading fee: NOT FOUND.

## 6. Resolution mechanism and dispute risk

NOT FOUND. No oracle, UMA-style dispute, or resolution contract was located. Privileged roles (`REPORTER_ROLE`, `SIGNER_ROLE`, `CANCEL_ROLE`) imply trusted reporters can settle or cancel (M, from role constants). Dispute risk: unknown and treated as high.

## 7. Geo / ToS / automation

NOT FOUND (no site, no terms reachable). Contracts are permissionless to call (H, no allow-list on `depositTokens` other than a token allow-list), but nothing is known about off-chain restrictions.

## 8. Liquidity

- DefiLlama TVL **$3,952 as of 2026-10-19** (H, `api.llama.fi`), flat since 2024-05; peak $375K on 2023-10-14. After the adapter removal on 2026-06-22 the figure is likely a stale carry-forward (M).
- DEEPP token: $0 24h volume, $57 reserves, no pool (GeckoTerminal 2026-10-19, H).
- Volume and open interest: NOT FOUND.

## 9. Event overlap and shared liquidity

- Categories: NOT FOUND. No market list was ever visible, so no overlap with sports, politics, crypto-price or macro markets on other venues can be claimed.
- Shares liquidity with another venue: no evidence either way. Its own pool (USDC held in `BetLiquidityPool`) is separate, but it is effectively empty.

## 10. Adapter implications

- Do not build an adapter. If the aggregator keeps a venue registry, record this as `status: dead/abandoned`, `reason: parked domain + frozen TVL + adapter removed upstream`, so the discovery job does not re-surface it.
- Re-check triggers (cheap): `deepp.xyz` stops redirecting to the GoDaddy for-sale page; the `@deeppxyz` handle posts; DefiLlama TVL moves off $3,952; a Deepp bet contract appears with `BETTER_ROLE` on the pool.

## Open questions

- Last on-chain transaction date for the six contracts (needs an explorer API key or a JSON-RPC call).
- Address and ABI of the bet-taking contract, and whether any bettor funds remain locked in `LockBox` (`getLockedAmount`).
- Current `feePermille` and split values.
- Whether `@deeppxyz` still exists (X returned 402 to WebFetch).

## Sources

- DefiLlama protocol API (H): https://api.llama.fi/protocol/deeppdao , list entry https://api.llama.fi/protocols ; page https://defillama.com/protocol/deeppdao (WebFetch got 403; the API was used instead)
- DefiLlama adapter history (H): https://github.com/DefiLlama/DefiLlama-Adapters/blob/08239f85/projects/deepp/index.js (last version with the file; removal in commit `ca9a0728`, https://github.com/DefiLlama/DefiLlama-Adapters/commit/ca9a0728)
- Sourcify v2 verified contracts (H): https://sourcify.dev/server/v2/contract/42161/0x84a512E120294C2017a88a8f1af2219Ec250CBaa , `.../0x05E1F51067a3Af2f9d0994a97779a78a2E26f921` , `.../0x9773367fB87CFbcB7F6A0AB9a9e3Ab635023b7Da` , and the four RewardHandler addresses above
- GeckoTerminal token API (H): https://api.geckoterminal.com/api/v2/networks/arbitrum/tokens/0x9773367fB87CFbcB7F6A0AB9a9e3Ab635023b7Da
- DexScreener (H, empty): https://api.dexscreener.com/latest/dex/tokens/0x9773367fB87CFbcB7F6A0AB9a9e3Ab635023b7Da
- Parked domains (H): https://deepp.xyz , https://deepp.xyz/lander , https://deepp.io
- X (402, not readable): https://x.com/deeppxyz
- Blocked or empty (recorded for completeness): arbiscan.io (403), arbitrum.blockscout.com web and API (403 / Cloudflare challenge), Routescan chain 42161 (404)
- Sourcify's API guidance asks callers for a contact address in the User-Agent. Per the privacy rule none was supplied; the service answered normally with the generic UA.
