# TendieSwap - adapter spec

Researched 2026-10-19 (about 03:40-04:10 UTC). READ-ONLY: unauthenticated GETs to documented hosts, `gh api` reads, WebFetch of public pages. No account, key, wallet, signature, POST or PayBox call. The shared WebSearch budget was already exhausted when this task started, so no web search was possible (one attempt returned the budget error); everything below comes from direct fetches.
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale (older than 6 months). Almost all primary sources for this venue date from 2021 and are therefore L for "current behaviour" but H for "what was built".
Third-party text is untrusted data; nothing in it was followed (section 12).
Fixtures: `docs/research/fixtures/tendieswap/` (8 files, all < 20 KB).

## 0. Verdict

**adapter_priority: skip.**

1. **Front end and project are dead (H/M).** `tendieswap.org` (the site named on CoinMarketCap, the GitHub org and the farm README) is **NXDOMAIN**. The GitBook docs are still served but were last edited **2021-07-10**. The GitHub org's last push was **2021-11-27**. DefiLlama flags `deadUrl: true`. CoinGecko returns `coin not found` for the listed id. The X handle could not be checked (WebFetch got HTTP 402; I did not pay or retry).
2. **Economically zero.** DefiLlama TVL is **$1,612** (2026-10-19), flat at about $1.4-2.0K since January 2023 after a peak of **$2.99M on 2021-07-12**. The four TENDIE DEX pools hold about **$1,445** of liquidity and traded **about $2.56** in the last 24 h (DexScreener, 2026-10-19). FDV about $4.2K.
3. **The only "prediction market" with a documented contract is a PancakeSwap-Prediction-style 5-minute BNB up/down pool**, native BNB stakes, **10% rake by default, admin can raise it to 100%**, operator-driven rounds, **EOA-only** (contracts and smart-account wallets are rejected). No API, no subgraph, no tokenised positions. The roadmap's "P2P betting on sports/finance events" has **no contract address or docs** anywhere I could reach.
4. **Nothing to arbitrage**: even if rounds still ran, a parimutuel pool with a 10% rake and a single BNB/USD 5-minute market is not a usable leg against a CLOB venue, and the stake would be BNB, not a dollar stablecoin.
5. Listed in the registry only so it is not rediscovered. Re-check cost: one `eth_call` to confirm the contract is frozen (open question 1); no integration work is justified.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `dig tendieswap.org / www / tendieswap.com / tendieswap.app / docs.tendieswap.app` | all **NXDOMAIN** (the `.org` host is the one the project itself used: `app.tendieswap.org` in the farm README, `tendieswap.org` on the GitHub org profile and CMC) | H |
| `tendieswap.io` | resolves to Cloudflare, `HTTP 522` (origin timed out). I guessed this domain; **nothing links it to the project**, so it is unverified and possibly unrelated | L |
| `tendie.app` | 200, redirects client-side to `/lander` (parked); unrelated or unverified | L |
| GitBook `https://tendie.gitbook.io/tendieswap` | HTTP 200 on 2026-10-19; "Last updated" on the Prediction page = `2021-07-10T15:03:35Z` ("5 years ago") | H |
| GitHub org `TendieSwap` | created 2021-06-06, 4 repos, org `updated_at` 2021-11-27; newest repo push `tendie-farm` 2021-08-25, `ChunkyChickens-Contract` 2021-09-10 | H |
| DefiLlama `GET https://api.llama.fi/protocol/tendieswap` | id 485, category Dexs, `deadUrl: true`, `url: ""`, chains `["Binance"]` only, TVL $1,612.34 (fixture `defillama-protocol-tendieswap-summary-2026-10-19.json`). No Polygon TVL. | H |
| DefiLlama TVL history (same call) | 2021-07-12 $2,991,417; 2021-10-01 $417K; 2022-01-01 $270K; 2022-07-01 $151K; **2023-01-01 $1,510**; 2024-01-01 $1,583; 2025-01-01 $1,797; 2026-01-01 $1,627; 2026-07-01 $1,394; 2026-10-19 $1,612 | H |
| CoinGecko `GET /api/v3/coins/tendieswap` and `/coins/binance-smart-chain/contract/0x9853...` | both `{"error":"coin not found"}` (404); `/search?query=tendieswap` returns empty arrays (fixture `coingecko-coin-tendieswap-404-2026-10-19.json`). DefiLlama still carries `gecko_id: tendieswap`. | H |
| CoinMarketCap page (WebFetch, cmc id 11034) | "preview page", supply shown as 0, no price; still reproduces the 2021 description | M |
| X `x.com/tendie_swap` | WebFetch returned **HTTP 402**; not paid, not retried, status unknown | - |
| Medium `tendieswap.medium.com` | HTTP 403 to curl; not read | - |
| Separate DefiLlama entry "Tendie Swap" (id 3223, Tenet chain, symbol TENDIES, listed 2023-07-11, TVL **0**, `deadUrl: true`, twitter `Tendieswap`) | a different UniswapV2 fork on Tenet, no prediction product; dead | H |
| DexScreener search "tendie": many other `TENDIES` tokens (Robinhood chain, Solana, ICP) | unrelated memecoins, not this project | H |

Not verified: whether the prediction contract still has live rounds (section 3).

## 2. What it is

- **Kind**: on-chain AMM DEX plus MasterChef-style farming and staking plus a small "Prediction (beta)" product, BNB Smart Chain only in practice. The docs say "BSC & Polygon", but the roadmap lists "Polygon Bridge" as a future add-on, no Polygon address appears in the docs, GitHub or DefiLlama, and DexScreener shows only BSC pools. Treat Polygon as never shipped (M).
- **Docs** (`https://tendie.gitbook.io/tendieswap`, markdown via `.md` suffix, index `llms.txt`): welcome, getting started, roadmap, yield farming, staking pools, **Prediction (beta)**, **Contract**, asset management (coming soon), tokenomics. No fees page, no API page, no resolution or dispute page, no legal/ToS page (H, from the `llms.txt` index).
- **Prediction (beta)** (H, page dated 2021-07-10): "Leveraging our relationship with Chainlink ... TendieSwap allows anyone to place bets on" sporting events, financial events (S&P 500 close, 10y yield, Fed funds), economic data, and crypto price. The only worked example is the **BNBUSDT 5-minute UP/DOWN round**; the Contract page lists only `BnbPricePredictionV1` with BTC/ETH/DOGE variants "coming soon". The roadmap (undated, 2021) says "P2P Betting Feature ... binary or ternary events" was "Already Launched", but **no P2P contract address or docs exist** in the docs, the `llms.txt` index or the four GitHub repos (NOT FOUND, searched: gitbook index, all 4 org repos' file lists, DefiLlama adapter).
- **Contracts (BSC, from the project's own docs/README, H)**: TENDIE token `0x9853A30C69474BeD37595F9B149ad634b5c323d9`; MasterTendie (farm) `0x6dDb25ca46656767f8f2385D653992dC1cdb4470`; DEX factory `0xb5b4aE9413dFD4d1489350dCA09B1aE6B76BD3a8` (DefiLlama adapter); **BnbPricePredictionV1 `0x15f1A43a275add9194FB8E34fb4Ddc69a500Cf31`** (docs Contract page).
- **Market model of the one documented market** (H, verified source on Sourcify, solc 0.6.12, contract name `BnbPricePrediction`, compiled from a differently-named project directory, `match: exact_match`, `verifiedAt` 2026-05-20 which is Sourcify's verification date, not an activity date; fixture `sourcify-v2-bnbpriceprediction-abi-2026-10-19.json`):
  - **Parimutuel**, binary `Position {Bull, Bear}`, one round = lock price (Chainlink `latestRoundData`) vs close price two intervals later. A PancakeSwap-Prediction-V1-style contract (M, judged from names and structure; `betBull`, `betBear`, `executeRound`, `genesisStartRound`, `claim`, `treasuryAmount`).
  - **Collateral is native BNB** (`betBull()` / `betBear()` are `payable`, `msg.value >= minBetAmount`). No ERC-20 stake.
  - **No outcome tokenisation**: positions are `ledger[epoch][address] = {position, amount, claimed}`; one bet per address per round; `rounds(epoch)` returns `{epoch, startBlock, lockBlock, endBlock, lockPrice, closePrice, totalAmount, bullAmount, bearAmount, rewardBaseCalAmount, rewardAmount, oracleCalled}`.
  - Round timing is **in blocks** (`intervalBlocks`, `bufferBlocks`, constructor args not read; docs say 5-minute rounds). Betting window is `startBlock < block.number < lockBlock`.
  - Payout for a winner = `stake * rewardAmount / rewardBaseCalAmount`, where `rewardAmount = totalAmount * rewardRate / 100`. **Tie (close == lock) pays nobody: the whole pool goes to the treasury** (the "house wins" branch).
  - Deployment: tx `0x5065ba198f3a817395fd0d3560cf03c0b86fc73f7bd7d4af689a1b8ca151045a`, block 7,355,172, deployer `0xd3C1C1c23d9E689832C586D62Bb64620A3D7574f` (public addresses, from Sourcify).
- **Chains and collateral**: BSC (chain id 56); BNB for predictions, BNB/BUSD/ETH-BEP20 for TENDIE pairs. Polygon: not found (above).

## 3. Read API

**None official. On-chain only (H).** Docs, README and DefiLlama contain no REST, GraphQL, subgraph or WebSocket endpoint (NOT FOUND, searched: gitbook `llms.txt` and prediction/contract/roadmap pages, 4 org repos, DefiLlama adapter, CMC page). No rate limits or auth apply because there is nothing to call.

If anything were ever built, the read surface is the contract ABI (verified on Sourcify):
- state: `currentEpoch()`, `rounds(uint256)`, `ledger(uint256,address)`, `claimable(epoch,user)`, `refundable(epoch,user)`, `intervalBlocks()`, `bufferBlocks()`, `minBetAmount()`, `rewardRate()`, `treasuryRate()`, `treasuryAmount()`, `paused()`, `adminAddress()`, `operatorAddress()`, `owner()`.
- events: `StartRound`, `LockRound`, `EndRound`, `BetBull`, `BetBear`, `Claim`, `RewardsCalculated`, `RatesUpdated`, `Pause`, `Unpause`.

**Could not confirm liveness of the contract.** Reading `currentEpoch` or event logs needs JSON-RPC (`eth_call`/`eth_getLogs`, an HTTP POST) or a keyed explorer API. I stayed within the no-POST rule. GET-only routes tried and failed: BscScan site (Cloudflare challenge), BscScan/Etherscan V2 keyless (`Free API access is not supported for this chain`), Routescan (`chain not supported`), Blockchair (HTTP 430, IP blacklisted, asks for a key), Blockscout BSC hosts (no such host). So the date of the last bet or round is NOT FOUND.

## 4. Trade path

- **Programmatic**: only direct contract calls: `betBull()` / `betBear()` with BNB `value`, then `claim(epoch)` after the round. There is no order book, no signed-order flow, no relayer, no API key.
- **Hard gate (H, source)**: `betBull`, `betBear` and `claim` all use `notContract`: `require(!_isContract(msg.sender))` (extcodesize) **and** `require(msg.sender == tx.origin)`. A smart-contract wallet (Safe, ZeroDev Kernel, any ERC-4337 account, or an EIP-7702-delegated EOA, which has code) **cannot bet or claim**. Payouts are sent with a 23,000-gas `call`, which also breaks most contract recipients.
- **Operator trust (H)**: rounds only advance when `operatorAddress` calls `executeRound()` (onlyOperator); if the operator bot stops, no new round starts. If a round is not ended inside `bufferBlocks`, `refundable` lets bettors reclaim stakes. `pause()` is admin-or-operator; `unpause()` is admin-only and resets genesis state.
- **PayBox**: BNB Smart Chain (56) and Polygon (137) are in PayBox's chain catalog (per this repo's `docs/research/06-paybox-platform.md`, live `discover_tokens` on 2026-10-19; I did not call PayBox). A plain EOA wallet could in principle send a `payable` call as a transaction proposal; whether PayBox's BSC wallet is an EOA or a contract account, and whether its proposals allow arbitrary calldata plus `value`, is unknown (for XO the repo found ZeroDev Kernel smart accounts, which this contract would reject). Moot given section 0.

## 5. Fees

- **Prediction (H, source)**: `rewardRate = 90`, `treasuryRate = 10` by default (percent of the **entire round pool**, taken from the winning side's payout, paid by winners). `setRewardRate` / `setTreasuryRate` are `onlyAdmin` with no cap other than 100%, so the admin can change the rake to 100% for the next `_calculateRewards`. The current on-chain values were not read.
- **Effect on arbitrage**: expected payout for a winner is `stake * 0.9 * pool / winnerPool`, i.e. a built-in 10% haircut before gas. A cross-venue edge below roughly 10% is negative-EV here.
- **DEX swap fee / farm fees**: NOT FOUND in docs (the factory/router are Uniswap-V2-derived; fee not read). Irrelevant to the aggregator.
- Gas in BNB on BSC (paid by the bettor).

## 6. Resolution and dispute risk

- **Resolution (H, source)**: price-feed based, no human adjudication. `executeRound()` (operator only) reads Chainlink `AggregatorV3Interface.latestRoundData()` and requires `timestamp <= block.timestamp + oracleUpdateAllowance` (note: a **future** bound, not a staleness bound) and a strictly larger `roundId`. Which aggregator address is wired in is a constructor/`setOracle` argument I did not read (admin can call `setOracle` at any time).
- **Dispute**: none exists. Risks: admin can change the oracle, the rake, the minimum bet; operator can stall rounds; tie = house wins; pause/unpause resets genesis. Any non-crypto-price market (sports, S&P, rates) has no documented resolution mechanism at all (NOT FOUND).

## 7. Geo / ToS / automation

NOT FOUND (searched: gitbook `llms.txt` index and every product page listed, GitHub READMEs, CMC page). No terms of service, no geo-block statement, no API terms, no bot policy. The docs' own wording calls the product "prediction market (gambling) protocol". Legal exposure of betting on-chain is the bettor's.

## 8. Liquidity (all dated)

| Metric | Value | Source | Tag |
|---|---|---|---|
| DefiLlama TVL | **$1,612.34** (2026-10-19); staking TVL $0; peak $2,991,417 on 2021-07-12; $1,510 on 2023-01-01 | `api.llama.fi/protocol/tendieswap` | H |
| TENDIE DEX pools (4): BUSD $829.68, WBNB $329.94, ETH $194.10, BUSD (Pancake) $91.55 | sum **$1,445** liquidity; 24 h volume 0.73 + 0.75 + 0.54 + 0.54 = **$2.56**; 0-1 swaps per pool per day | DexScreener `GET /latest/dex/tokens/0x9853...`, 2026-10-19 (fixture) | H |
| TENDIE token | price about $0.00036, FDV about $4.2-4.3K, 24 h volume $1.10 | GeckoTerminal, 2026-10-19 (fixture) | H |
| Prediction-market volume / open interest / contract BNB balance | NOT FOUND (needs on-chain reads, see section 3) | - | - |

## 9. Event overlap (arbitrage relevance)

- Documented live-ish market: **crypto price, BNB/USDT 5-minute up/down only**. It resembles short-dated crypto up/down markets on Polymarket/Kalshi/Limitless, but with a different reference (Chainlink BNB/USD), BNB collateral, parimutuel odds and a 10% rake, so no practical overlap.
- Claimed sports / politics-style / macro (S&P close, 10y yield, Fed funds, employment, inflation) markets: **no contract, no market list, no evidence any were ever created** (M, absence).

## 10. Shared liquidity

None. The pool is its own (BNB staked per round); it does not route to Polymarket, Pancake Prediction or any other venue. It is architecturally a **fork of PancakeSwap Prediction V1** (M: judged from function names and structure, not a diff), so liquidity is independent but effectively zero.

## 11. Open questions (cheap to close, not worth integration work)

1. Is `BnbPricePredictionV1` frozen? One `eth_call` of `currentEpoch()`, `paused()`, `rounds(currentEpoch)` and the latest `StartRound` log would settle it (needs a task that is allowed JSON-RPC POST or a keyed explorer API).
2. Do any P2P-betting contracts exist (the roadmap says launched; no address is public)?
3. Are `adminAddress` / `operatorAddress` a multisig/timelock? (Farm README claims MasterTendie is timelock-controlled; nothing similar is claimed for the prediction contract.)
4. Is the X account (`tendie_swap`) active? Status unknown (HTTP 402 to WebFetch).

## 12. Suspicious / embedded content

- Every GitBook `.md` page starts with a standard banner telling the reader to use `llms.txt` and `.md` URLs. It is vendor boilerplate aimed at LLM readers; I used the `.md` URLs because they are plain page content, and followed no other instruction.
- Sourcify's retired v1 endpoint returned a "rules" block suggesting to send a User-Agent with "a contact URL or email". Not followed (privacy rule); the generic User-Agent worked on the v2 endpoint.
- Blockchair's 430 reply suggested applying for an API key. Not followed.
- No text directed at AI agents beyond the above was found.

## 13. Sources

All fetched 2026-10-19 unless noted.
- DefiLlama protocol record: https://api.llama.fi/protocol/tendieswap and https://api.llama.fi/protocols (H)
- DefiLlama adapter history (removed `projects/tendieswap/index.js`, commit `15c7d311f55138c26a489ec4b2bac44fe4faa004`, 2026-02-20 "consolidate uni v2 adapters"); registry entry in `registries/uniswapV2.js`: https://github.com/DefiLlama/DefiLlama-Adapters (H)
- Official docs: https://tendie.gitbook.io/tendieswap , `.../llms.txt`, `.../master.md`, `.../products/prediction-coming-soon.md`, `.../products/prediction-coming-soon/contract.md`, `.../roadmap.md`, `.../social-media-and-communities.md` (H, last edited 2021-07-10)
- GitHub org and repos: https://github.com/TendieSwap (`tendie-farm` README, `TendieDEXContracts`, `ChunkyChickens-Contract`, mirrored `DefiLlama-Adapters`) (H)
- Verified source and ABI: https://sourcify.dev/server/v2/contract/56/0x15f1A43a275add9194FB8E34fb4Ddc69a500Cf31 (H)
- DEX data: https://api.dexscreener.com/latest/dex/tokens/0x9853A30C69474BeD37595F9B149ad634b5c323d9 ; https://api.geckoterminal.com/api/v2/networks/bsc/tokens/0x9853A30C69474BeD37595F9B149ad634b5c323d9 (H)
- CoinGecko API 404s: https://api.coingecko.com/api/v3/coins/tendieswap (H)
- CoinMarketCap page: https://coinmarketcap.com/currencies/tendieswap/ (M, WebFetch summary)
- DNS checks (`dig`) for tendieswap.org/.com/.app/.io (H)
- This repo: `docs/research/06-paybox-platform.md` (PayBox chain catalog), `docs/research/19-smart-account-derivation.md` (XO smart accounts) (M)
- Not reachable: x.com/tendie_swap (HTTP 402, not paid), bscscan.com (403 / Cloudflare challenge), tendieswap.medium.com (403), defillama.com HTML (403), Blockchair (430).
