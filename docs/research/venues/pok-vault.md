# POK Vault (pokvault.xyz) - venue spec

Researched 2026-10-19. Read-only: the public site and its static JS bundle (read as text, not executed), unauthenticated GETs to DefiLlama, Yearn yDaemon and api.pokvault.xyz, `gh api` raw reads of the author's public repos, one Polygonscan page via WebFetch. No accounts, wallets, keys, signing or POSTs. No on-chain RPC calls were made (JSON-RPC is POST).

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak, stale or ambiguous.

## Verdict

- Adapter priority: **skip**.
- **POK Vault is not a prediction-market venue.** It has no markets, order book, AMM, oracle or resolution of its own. It is a yield / early-exit wrapper that sits on top of other venues' outcome tokens. (H, repos + site)
- Two generations exist, and the DefiLlama hint describes the first one:
  - **V1 "Early Exit Vault" (BSC, Jan 2026).** ERC-4626 USDT vault, owner-administered. Lets a Polymarket x Opinion (later also Probable) arbitrageur hand in YES on one venue plus NO on the other and get slightly under $1 USDT back immediately, instead of waiting for both markets to expire. This is the "prediction market arbitrage strategies" in the DefiLlama text. **Effectively dead:** DefiLlama TVL peaked about $10K (Jan-Feb 2026) and is $0.07 today. (H)
  - **V2 "Yield-Bearing Outcome Tokens" / YBOT (Polygon, deployed 2026-07-20).** Immutable, no-admin singleton. Users deposit Polymarket YES or NO tokens; the contract pairs opposite sides, merges complete sets into USDC.e and lends them through one Yearn vault. This is what pokvault.xyz serves today (site last modified 2026-10-18). **No evidence of meaningful deposits**, and the only configured yield source currently pays 0%. (H for code and yield, L for TVL)
- **Liquidity is not independent.** Every token it handles is a Polymarket ConditionalTokens position (V2) or a Polymarket / Opinion / Probable token (V1). It adds no tradable price and no independent arbitrage leg.
- Value to this project: a design precedent and competitor note only. (1) The V1 contract is a live-coded example of the cross-venue "merge opposite outcomes for ~$1" exit that an aggregator's arbitrage scanner would price. (2) V2 documents the par identity `1 YES + 1 NO <-> 1 collateral` used for complete-set arbitrage. No adapter is needed.

## Liveness (still live in 2026?)

- Site: `https://www.pokvault.xyz/` returns HTTP 200 on 2026-10-19; `last-modified: Sun, 18 Oct 2026 02:07:09 GMT`; Vercel-hosted React/Vite SPA. Title "POKVault | Earn yield on your YES or NO outcomes"; meta description "Deposit the outcome tokens already in your wallet and they start earning. Withdraw more than you put in, anytime." (H, `curl -i` of the page)
- Site code is V2 only. The current JS bundle has no strings for `earlyExit`, Axelar, Probable, or the V1 vault address; it calls the Polygon singleton (chainId 137) only. (H, bundle grep). The V1 frontend lives in a separate repo (`yashvshah/pok-vault`, last push 2026-04-25) and is no longer what the domain serves. (H for the repo, M for the inference that it was replaced)
- V2 contract `0xebabc0a1bf6cd56e0800403a957f4290ba5e168f` on Polygon: verified on Polygonscan as `YieldBearingOutcomeTokens`, compiler 0.8.34; broadcast record says deployed 2026-07-20 08:27 UTC (block 90,554,046). (H broadcast JSON; M for the Polygonscan summary, which came through WebFetch's summariser)
- Repo `yashnaman/yield-bearing-outcome-tokens`: created 2026-06-19, last commit 2026-08-12 "refactor: use factory model instead of singleton model". **That refactor is not what the website calls**: the site ABI is the older singleton (`deposit(yieldVault, conditionId, isYes, assets, to)`) at the July address. No new Polygon broadcast exists in the repo. (H for the commits and the ABI; M for "refactor not deployed")
- Activity: Polygonscan page for the V2 contract showed "no matching entries" for transactions and about $0.03 of ERC-20 dust (0.0252 pUSD, 0.000001 ysUSDC). ERC-1155 holdings (where deposited outcome tokens would sit) were not visible and the ERC-1155 transfer tab returned HTTP 403. (L: WebFetch summary, unverifiable)
- DefiLlama listing: protocol id 7303, category Yield, listed 2026-01-24 (`listedAt` 1769220984), `audits: "0"`, twitter handle `POKVault`. Tracks only the **V1 BSC** vault (see Liquidity). (H)
- Team: author handle `yashnaman` (repos) and `yashvshah` (V1 frontend); the README names no company. Discord invite is in the footer; not visited. (H)

## Kind and market model

- Kind: DeFi yield wrapper over Gnosis ConditionalTokens (CTF) binary outcome tokens. Not an exchange. (H)
- Market model: none of its own. It accepts "any Gnosis ConditionalTokens binary market" and requires exactly two outcome slots. (H, repo README, `NotBinaryCondition` error)
- Outcome tokenisation: the underlying Polymarket ERC-1155 positions (CTF at `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`, Polygon). Depositors receive vault shares per `(yieldVault, conditionId, side)`. In the HEAD design the shares are ERC-6909 ids on a factory (`uint160(pool) | (isYes ? 1<<160 : 0)`); in the deployed July singleton they are internal share ledgers keyed by the same tuple (`totalShares`, `sharesOf`). (H)
- Mechanism (H, README + FAQ): deposit YES or NO; the contract matches opposite sides into complete sets, `mergePositions` them into collateral at par, deposits the collateral into an ERC-4626 vault, and splits yield back into fresh YES/NO pairs. Unpaired tokens "dangle" and are never at risk. APY of a side = vault base rate x that side's utilisation; the scarce (fully matched) side earns the full base rate.
- V1 (legacy) model: ERC-4626 over USDT; owner whitelists opposite-outcome token pairs across venues; arbitrageurs call `earlyExit(tokenA, idA, tokenB, idB, amount, to)` and receive a discounted amount computed by an external `IGetEarlyExitAmount` contract (the BSC factory is "based on fixed APY"). Also `splitOppositeOutcomeTokens` to buy pairs with USDT. Polymarket tokens were bridged Polygon to BSC over Axelar GMP (custom ERC-1155 bridge). (H, `yashnaman/early-exit-vaults` README + `EarlyExitVault.sol`)

## Chains and collateral

- V2 (current): **Polygon PoS (137)**. Collateral: USDC.e (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`) for the configured vault. The site also resolves wrapper vaults for Polymarket's NegRisk wrapped collateral and for `pUSD` via two on-chain `getWrapperAddress(vault)` lookups, so negRisk and pUSD-collateral markets go through wrapper contracts (repo `yashnaman/erc4626-wrapper-contracts`, last push 2026-08-10). (H bundle + repo)
- Only one yield vault is configured in the site: Yearn V3 "Compound V3 USDC.e Lender" (ysUSDC) at `0xb1403908F772E4374BB151F7C67E88761a0Eb4f1` on Polygon. (H, bundle `dF` array)
- V1 (legacy): **BNB Smart Chain (56)**, USDT (`0x55d3...7955`), vault `0x5a791CCAB49931861056365eBC072653F3FA0ba0`, plus Axelar bridge `0xB42D95Bd05713eD14369fC1a1e4fAF107b27c464` on both chains. (H, V1 README)
- Contract-address discrepancy worth knowing: DefiLlama's chain label says "Binance" because its adapter reads the V1 BSC vault; the live site is Polygon. DefiLlama therefore says nothing about V2. (H)

## Read API

- Official public API for vault state: **none.** (NOT FOUND, searched: site, bundle, both repos, README, DefiLlama listing)
- Vault state is on-chain only. For V2 (deployed singleton ABI, H from bundle): `investedBalance(yieldVault, conditionId)`, `danglingBalance(yieldVault, conditionId, outcome)`, `totalShares(...)`, `sharesOf(...)`. For the HEAD factory design: derive the pool with CREATE2 from `(yieldVault, conditionId)`, read `conditionalTokens.balanceOf(pool, positionId)` and `yieldVault.previewRedeem`. Market discovery via the factory `PoolDeployed` event. (H)
- The site's own backend: `https://api.pokvault.xyz/api` (Express on Vercel behind Cloudflare). Root, `/api` and `/api/health` return 404 "Cannot GET". The only routes the frontend uses are thin **CORS proxies to Polymarket**: `/api/polymarket/markets?condition_ids=...` (Polymarket Gamma `/markets`) and `/api/polymarket-data/positions?user=...&sizeThreshold=0` (Polymarket Data API). The proxy forwards upstream response headers; the sample carried `deprecation: true`, `sunset: Fri, 01 May 2026`, `warning: 299 - "use /markets/keyset"` (Polymarket's deprecation notice for the Gamma `/markets` list endpoint, now past its sunset date but still answering). No POK-specific data is served. (H, 2026-10-19 GET). Auth: none. Rate limits: NOT FOUND.
- Sample shapes saved (see Fixtures). Do not build on this proxy; read Polymarket directly.
- Websocket: NOT FOUND.
- DefiLlama (third party, M for coverage): `https://api.llama.fi/protocol/pok-vault` (TVL history, V1 BSC only) and the yield-server adapter `src/adaptors/pok-vault` (V1, `getERC4626Info(..., 'bsc')`); the vault no longer appears in `https://yields.llama.fi/pools` (checked 2026-10-19, no "pok" project). (H)

## Trade path

- There is nothing to "trade" on a price. The only actions are `deposit` and `redeem` on the contract (and `mergeAndDeposit`, permissionless). Orders, cancels, quotes: none. (H)
- Deposit needs Polymarket outcome tokens already in the wallet, which only come from trading on Polymarket's CLOB or from `splitPosition` on the CTF. The site targets **Polymarket Safe / proxy wallets**: it calls `setApprovalForAll(vault)` on the CTF and then `deposit`, batched as a Safe multi-send, and uses Polymarket's gasless relayer, falling back to the user's wallet (POL gas). Error text: "No Safe. Connect a wallet with a Polymarket account." (H, bundle)
- Auth/signing: plain EVM transactions (or Safe transactions through Polymarket's relayer). No API signing scheme. (H)

## PayBox reachability

- `paybox_reachable = partial`.
- Polygon (137) is in PayBox's chain catalog (this repo's `docs/research/06-paybox-platform.md`, H, live 2026-10-19). `setApprovalForAll` and `deposit` / `redeem` are ordinary one-call EVM transactions that could each be a separate transaction proposal from an EVM wallet with POL for gas. ERC-1155 deposits could also be a single `safeTransferFrom` to the pool (HEAD design only, per README).
- But it only helps if the wallet already holds Polymarket outcome tokens, and the site's gasless path assumes a Polymarket-created Safe. There is no market to trade here and nothing for an arbitrage leg to execute. (M)

## Fees

- V2 pool/factory: **no protocol fee, no owner, no admin keys, no pause, no upgrade path** per README and FAQ; a grep of `OutcomeYieldPool.sol` finds no fee/owner/admin variables (H, HEAD source; the deployed July singleton source was not read separately, so M for the deployed bytecode).
- Costs borne by depositors: ERC-4626 vault rounding (up to `assetsPerShare - 1` per hop, ~1 wei for USDC-like vaults, per README "Accepted risks"); the underlying Yearn strategy's **5% performance fee, 0% management fee** (yDaemon, H); Polygon gas in POL when the Polymarket relayer is unavailable.
- V1 (legacy): `feesPercentage` in basis points, owner-set, capped at 50% (`FEE_DENOMINATOR/2`), taken as shares minted to the owner on reported profit; arbitrageurs' discount comes from the `IGetEarlyExitAmount` contract. Owner can change the underlying vault (`changeUnderlyingVault`) and add/remove/pause pairs. (H, `EarlyExitVault.sol`)

## Resolution mechanism and dispute risk

- None of its own. Resolution is whatever the underlying market uses (Polymarket: UMA Optimistic Oracle via CTF `reportPayouts`). `splitPosition` and `mergePositions` only require the condition to be prepared, not unresolved, so the vault says it keeps working through resolution; winners withdraw shares and redeem outcome tokens 1:1. (H, README + FAQ)
- Risks that matter for anyone depending on it: dispute risk is Polymarket/UMA's; V2 trusts the chosen ERC-4626 vault (a dead vault blocks redemptions that need to divest; a vault that books nothing destroys the merged collateral; stated "accepted risks"); the FAQ's "no price risk, you get back at least what you put in" claim is a design claim, not an audit. The site footer's "Audit" link points at the code repository itself, and DefiLlama lists `audits: 0`. No independent audit report found. (H for the link, M for the absence)
- V1 trust model: owner whitelists pairs, performs redemption after expiry and reports profit/loss manually. "Arbitragers do not have to trust the owner", depositors do. (H)

## Geo / ToS / automation

- NOT FOUND (searched: site bundle for terms/privacy/disclaimer strings, footer links, both READMEs): no terms of service, geo restriction or automation policy on pokvault.xyz. The only footer links are Markets, FAQs, Audit (GitHub), Discord.
- Inherited constraints: depositing and sourcing tokens runs through Polymarket, whose own geo and ToS rules apply (covered by the parallel Polymarket workflow). The `api.pokvault.xyz` proxy is an undocumented app backend; do not treat it as an integration surface.

## Liquidity

- V1 BSC vault (DefiLlama TVL, `api.llama.fi/protocol/pok-vault`, H): $103 on 2026-01-24; $10,015 on 2026-01-26; peak $10,064 on 2026-02-26; $2,836 on 2026-02-27; $1,606 on 2026-04-21; $0 from 2026-07-15; **$0.07 on 2026-10-19**. Methodology is ERC-4626 `totalAssets` of `0x5a79...0Ba0`. No volume, OI or early-exit statistics found.
- V2 Polygon: TVL source NOT FOUND (no DefiLlama adapter; no RPC reads made). Polygonscan snapshot shows ~$0.03 of ERC-20 dust and no listed transactions (L).
- Underlying yield source (Yearn yDaemon, 2026-10-19, H): Compound V3 USDC.e Lender TVL $767, `netAPR` 0, price-per-share 1.334027 unchanged today / 1 week / 1 month ago. So at present V2 would pay about 0% base rate times utilisation.
- The site hard-codes 25 Polymarket markets (Politics 10, Geopolitics 5, Sports 3, Science 2, Crypto 2, Finance 2, Health 1; end dates up to 2028-11-07), refreshed through the Gamma proxy. Several of the hard-coded markets have end dates already past (e.g. 2026-06-07, 2026-07-20 World Cup). This is a stale static list, not a measure of use. (H, bundle)

## Event coverage and overlap

- All events are Polymarket events (V2) or Polymarket x Opinion x Probable pairs (V1). Overlap with other venues is therefore total by construction, which is the point of V1, but the vault adds no price source. For this project the relevant Polymarket categories (politics, geopolitics, sports, crypto, finance, science, health) are already covered via the Polymarket adapter.

## Shared liquidity

- **Shares liquidity with Polymarket** (V2: same CTF tokens, same Polygon positions, collateral rehypothecated into a Yearn/Compound vault). V1 additionally touched Opinion (BSC) and Probable (BSC) tokens. Not an independent arbitrage leg. (H)

## Adapter priority

- **skip.** Reasons: not a venue; no independent liquidity; no read API of its own; V1 TVL ~$0 and V2 usage unproven with a 0% yield source; owner-administered legacy contract.
- If the project wants a "yield on idle outcome tokens" or "early-exit pricing" signal, the cheapest path is to read the contracts directly (no adapter required) and re-evaluate only if V2 TVL becomes material (watch the `Deposit` events on `0xebab...e168f`, or a `PoolDeployed` event if the factory refactor is deployed).

## Open questions

- Actual V2 deposits / TVL on Polygon (needs an RPC or an indexer; I made no JSON-RPC POSTs). Check `totalShares`/`investedBalance` for the 25 listed markets, or the CTF `balanceOf` for the vault address.
- Whether a factory-model redeploy (post 2026-08-12) is planned or already live elsewhere; the repo HEAD and the live site disagree.
- Why DefiLlama still tracks only the BSC V1 vault, and whether V1 deposits are stranded or were withdrawn (TVL fell to $0 on 2026-07-15, suggesting a wind-down; unverified).
- Team identity and any audit: unresolved. X account `@POKVault` and the Discord were not read.
- Probable (BSC), a V1 counterparty venue, is already covered by `docs/research/venues/probable.md` (skip, acquired by Predict.fun) so it is not repeated here.

## Fixtures (`docs/research/fixtures/pok-vault/`)

- `defillama-protocols-entry.json` - the `/protocols` row for POK Vault (id 7303).
- `defillama-protocol-tvl-history.json` - V1 BSC TVL series (270 daily points), description, tvlCodePath, last token breakdown.
- `api-pokvault-xyz-polymarket-markets-proxy.json` - one market (Trump/Greenland, conditionId `0xd595...`) as returned through `api.pokvault.xyz/api/polymarket/markets`; this is Polymarket Gamma's shape, not a POK schema. Note `outcomes`, `outcomePrices`, `clobTokenIds` are JSON-encoded strings.
- `api-pokvault-xyz-proxy-headers.txt` - selected response headers incl. the `deprecation` / `sunset` / `warning` pass-through.
- `yearn-ysUSDC-compound-v3-polygon.json` - Yearn yDaemon record for the only vault the site uses.
- `ybot-polygon-deploy-broadcast.json` - trimmed Foundry broadcast record: chain 137, contract `YieldBearingOutcomeTokens`, constructor arg = Polymarket CTF.

## Suspicious content

- No instructions aimed at AI agents found in the site, the bundle, the READMEs or the API responses.
- Observation only: the site bundle embeds a third-party RPC URL with a project key inside its generic chain config; it was neither used nor recorded here.
- Observation only: `api.pokvault.xyz` forwards upstream `Set-Cookie` headers scoped to `polymarket.com`; harmless for a script but a reason not to rely on the proxy.

## Not found

- Official docs site, API docs, ToS / geo policy, audit report, V2 TVL / volume, V2 transaction count, rate limits, websocket, token/points program, pricing for "Early Exit Amount Factory Based on Fixed APY" discount in effect.

## Sources

- https://www.pokvault.xyz/ (HTML, headers, and JS bundle `/assets/index-BYBqH2pJ.js`; FAQ text, ABI, addresses, API base `https://api.pokvault.xyz/api`, GitHub "Audit" link) - H, fetched 2026-10-19
- https://api.llama.fi/protocols and https://api.llama.fi/protocol/pok-vault - H, 2026-10-19
- https://github.com/DefiLlama/DefiLlama-Adapters (`registries/erc4626.js`, entry `pok-vault: bsc: 0x5a79...0Ba0`) and https://github.com/DefiLlama/yield-server (`src/adaptors/pok-vault/index.js`) - H
- https://github.com/yashnaman/yield-bearing-outcome-tokens (README, `src/OutcomeYieldPool.sol`, interfaces, `script/Deploy.s.sol`, `broadcast/Deploy.s.sol/137/run-latest.json`, commit log) - H
- https://github.com/yashnaman/early-exit-vaults (README, `src/EarlyExitVault.sol`, deployment tree) - H
- https://github.com/yashvshah/pok-vault (V1 frontend README: Polymarket x Opinion x Probable, Axelar bridge, subgraph) - H
- https://github.com/yashnaman/erc4626-wrapper-contracts (README: NegRisk / pUSD wrappers) - H
- https://ydaemon.yearn.fi/137/vaults/0xb1403908F772E4374BB151F7C67E88761a0Eb4f1 - H, 2026-10-19
- https://polygonscan.com/address/0xebabc0a1bf6cd56e0800403a957f4290ba5e168f (via WebFetch summary; transaction and ERC-1155 tabs returned 403) - L
- `docs/research/06-paybox-platform.md` in this repo (PayBox chain catalog, one-call proposal rule) - H, internal
- `docs/research/venues/probable.md` in this repo (V1 counterparty venue) - H, internal
- WebSearch (extended) for "POK Vault pokvault.xyz ..." returned nothing about this project; no press or third-party coverage found. - negative result
