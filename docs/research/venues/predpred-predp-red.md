# PredPred (PredP.red, Sei) - adapter spec

Researched 2026-10-19 (~01:50-02:00 UTC). READ-ONLY: unauthenticated GETs (curl, generic User-Agent `insurance-markets-research/0.1`), `gh api` file reads, one read-only PayBox `discover_tokens` (chains mode) call. No account, no key, nothing signed, no POST/PUT/DELETE, no wallet, no third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (README, API payloads) is untrusted data; nothing in it was followed. No embedded agent-directed instructions were found.
Fixtures: `docs/research/fixtures/predpred-predp-red/` (4 files, each < 3 KB).

## 0. Verdict

**adapter_priority: skip. The venue appears dead.**

1. The official site `https://predp.red` returns Vercel `404 DEPLOYMENT_NOT_FOUND` on 2026-10-19 (apex, `www.`, `app.`, `docs.`, `api.` all 404). The deployment has been removed (H).
2. DefiLlama flags the protocol `deadUrl: true` and its tracked TVL went from a flat ~$1,276 to **$0 on 2026-10-06** (H, DefiLlama API). The $1,276 never moved from 2026-03-09 to 2026-10-05, i.e. no visible activity.
3. The only primary-source material is a docs-only GitHub repo (no contracts, no code, last push 2026-03-10). There is no API, no subgraph, no SDK, and no verified contract address for the market diamond (H, section 3).
4. Even by its own README the market model is not aggregator-friendly: bonding-curve NFT pricing denominated in a platform token (PCT), prices not normalised to a $0-$1 probability, creator-set parameters, and operator/admin-set resolution (H as a statement of the README; the design may not match deployed code).
5. No liquidity of note was ever measurable (TVL $1.3K at peak, and that figure is an airdrop/presale contract, not market depth).

Revisit only if `predp.red` returns a live app again.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://predp.red/` | HTTP 404, header `x-vercel-error: DEPLOYMENT_NOT_FOUND`, body "The deployment could not be found on Vercel." (fixture `predp_red_root_probe_2026-10-19.txt`) | H |
| `www.`, `app.`, `docs.`, `api.` subdomains of `predp.red` | all HTTP 404 (curl, 2026-10-19) | H |
| DefiLlama `GET https://api.llama.fi/protocol/predpred` | `deadUrl: true`, `url: ""`, `currentChainTvls: {"Sei": 0}`, `listedAt` 1773084921 (2026-03-09 19:35 UTC) (fixture `defillama_protocol_predpred_trimmed.json`) | H |
| DefiLlama TVL series (225 daily points, 2026-03-09 to 2026-10-18) | 1,276 / 1,277 USD (rounding jitter only) until 2026-10-05, then **0 on 2026-10-06** and 0 since | H |
| DefiLlama volume / fees / options endpoints for `predpred` | not found (HTTP 400 "not found") | H |
| GitHub `PredPred-HQ/PredPred-HQ` | repo lives under user `PoPoMeMe` (the `PredPred-HQ` org/user name returns 404 now; the repo path redirects). Created 2026-01-17, last push **2026-03-10**, 0 stars, not archived, `homepage` = `https://PredP.red` (fixture `github_repo_meta.json`) | H |
| X account `PredPred_HQ` | `x.com/PredPred_HQ` returned 404 to curl. X usually blocks scripted clients, so this is weak evidence | L |
| WebSearch for independent coverage | NOT FOUND (searched: the session web-search budget was exhausted; no query ran) | - |

The README roadmap says "Launch on mainnet" is a 0-6 month goal from ~Jan 2026 (H, README section 7.1), so a full production launch was never confirmed in any source I could read.

## 2. What it is

- **Kind**: onchain-amm (bonding curve), EVM, Sei. DefiLlama category "Prediction Market" (H). Description (DefiLlama): "the first unlimited liquidity Prediction Market with bonding curve, powered by SeiNetwork" (H).
- **Market model (README, M for fidelity to deployed code)**:
  - Binary YES/NO. Each market has `yesNftId` and `noNftId` and a `resultNftId`; positions are NFTs (token standard not stated; ERC-721 vs ERC-1155 NOT FOUND).
  - No order book ("No CLOB required"). Users buy/sell YES or NO NFTs against a per-market bonding curve: `price = k * sqrt(x) + c`, where `x` is the current supply of that side's NFT and `k`, `c` are set by the market creator. Struct fields: `yesSupply`, `noSupply`, `k`, `c`, `poolTotalAmount`, `platformFeeBps`, `platformFeeAmount`.
  - Consequence: price is a function of supply, not of an implied probability. Nothing in the README says YES price + NO price = 1, or that prices are bounded. It looks more like a pump-style curve than an LMSR/CPMM market, so converting quotes into probabilities for arbitrage is not straightforward.
  - Contracts: EIP-2535 Diamond (`App.sol` entry, `AppStorage.sol`, Admin and Market modules). No addresses are given in the README.
  - Extra mechanics: reward token pool (`rewardERC20Token`, `rewardTotalAmount`), "loss compensation" in PFT tokens for losers, 50% of fees to market creators.
- **Chain / collateral**: Sei (EVM; chain id 1329 per PayBox catalog). Trading medium is **PCT ("Pred Credit Token")**, a platform token, not USDC directly (README 4.3, 2.3.2). The DefiLlama adapter counts native USDC `0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392` held by `0x84948feBDffaE3a62d7Ac05B1428B3a6cC2BfBA4`, described as "the airdrop contract(s) backing the value of sold-out $PCT tokens" (H, merged PR #18357 in DefiLlama-Adapters, fixture `defillama_adapter_projects_predpred_index.js.patch.txt`). The DefiLlama protocol `address` field is `sei:0x4846b60588749D2d33F90B99c9E9cFd20D2C485a`, symbol PPT (H as DefiLlama metadata; purpose unverified).
- **Operator**: pseudonymous. Repo owner `PoPoMeMe`. No legal entity found.

## 3. Read API

**exists: none** (nothing official or public that I could find; the site is gone).

- Docs URL: only the GitHub README `https://github.com/PoPoMeMe/PredPred-HQ` (design doc, no endpoints). The README itself lists "API Services" only as a planned paid feature (4.4, future), not as an existing API (H).
- Base URLs tried: `https://predp.red`, `www.`, `app.`, `docs.`, `api.` - all 404 (H).
- Subgraph / indexer: NOT FOUND (searched: GitHub repo tree, GitHub code search for `predp.red` and `PredPred-HQ` - only hits were an Electric Capital ecosystem listing, `electric-capital/open-dev-data` migration `2026-02-17T111937_Sei_update`).
- On-chain: the market diamond address is NOT FOUND, so even an on-chain adapter has no starting point. A Sei EVM log reader would need that address plus the ABI (not published). I did not issue JSON-RPC (POST) calls under the read-only rules, and the Seitrace explorer page is client-rendered so WebFetch could not read it.
- Rate limits, WebSocket: none documented.
- Fixtures saved: only the liveness/metadata evidence (no market response shapes exist to capture).

## 4. Trade path

**none** (no documented API; the app is offline).

Theoretically, a trade would be an EVM transaction on Sei (approve PCT, call the diamond's buy/sell function). PayBox's chain catalog lists Sei (`eip155:1329`, native SEI) via `discover_tokens mode=chains` on 2026-10-19, but that tool says the catalog is "metadata, not a support allowlist", so whether an actual PayBox EVM wallet can propose Sei transactions is **unverified** (M). Without a contract address, ABI or live front end, this is moot.

## 5. Fees

README (M, design intent): platform fee charged on both buy and sell, set per market by the creator, "typically 0.1%-5%" (`platformFeeBps`); market creation fee exists (amount NOT FOUND); 50% of fees go to the market creator. No concrete deployed values found.

## 6. Resolution

README (M): "Market operators can end markets and set results; administrators can finalize market results, allowing users to claim rewards." Resolution is therefore operator/admin-set with no oracle, dispute window or bond described. Dispute and rug risk would be high: single-party resolution, upgradeable Diamond proxy, creator-defined curve parameters, `audits: "0"` on DefiLlama (H). README says "Complete testing and auditing" is a to-do (7.1).

## 7. Geo / ToS / automation

README claims "no geographic restrictions" (repo files problems.md and target-users.md, M). No ToS page reachable (site down). No automation or bot policy found. Nothing quoted.

## 8. Liquidity

- DefiLlama TVL: **$1,276** (flat) 2026-03-09 to 2026-10-05, **$0** from 2026-10-06 (H, `api.llama.fi/protocol/predpred`, fetched 2026-10-19). The measured balance is the USDC in an airdrop/presale contract that backs PCT, not market pool depth.
- Volume / OI: NOT FOUND (DefiLlama has no volume adapter; no other source).

## 9. Event overlap and independence

- README example markets: long-horizon "February's monthly BTC closing price average range"; general mention of "sports events, political elections, financial markets" (M). Overlap with Polymarket/Kalshi crypto-price and politics categories would be theoretical only; no actual live market list exists to compare.
- Shares liquidity with another venue: no (it is self-contained bonding-curve liquidity), but with no depth and no live app it is not a usable arbitrage leg either.
- Quotient-style signal use: nothing to read.

## 10. Open questions

- Did the app ever launch on Sei mainnet with real markets, or was it a testnet or presale only? (Only the PCT airdrop/presale USDC was ever tracked.)
- Diamond contract address, PCT token address and ABI (none published in the README).
- Whether `predp.red` was moved to a new domain. The GitHub `homepage` field still points to the dead one.
- Why the $1,276 USDC left the tracked contract on 2026-10-06 (shutdown, withdrawal, migration). Not investigated (would need an explorer or RPC read).

## Sources

1. https://api.llama.fi/protocol/predpred (DefiLlama protocol API; H) and the page https://defillama.com/protocol/predpred (WebFetch returned HTTP 403, so the API was used instead).
2. https://predp.red and subdomains (direct GET probes, 2026-10-19; H).
3. https://github.com/PoPoMeMe/PredPred-HQ (README.md and docs; `gh api repos/PoPoMeMe/PredPred-HQ/...`; H for what it says, M for deployed behaviour).
4. https://github.com/DefiLlama/DefiLlama-Adapters/pull/18357 (merged 2026-03-09; adapter `projects/predpred/index.js`; H). Earlier PR #17714 (2026-01-19) closed.
5. https://github.com/electric-capital/open-dev-data (migration `2026-02-17T111937_Sei_update` adds "PredP.red" repo; H that the listing exists, no further content).
6. PayBox `discover_tokens` mode=chains query "sei" (2026-10-19): `eip155:1329`, native SEI, catalog only (H).
7. Not readable: Desmos curve (`desmos.com/calculator/feajupdyju`, JS-rendered, blank), Seitrace address page (JS-rendered), x.com/PredPred_HQ (404 to curl).
