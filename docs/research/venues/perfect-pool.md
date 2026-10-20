# Perfect Pool (perfectpool.io, Base + HyperEVM) - adapter spec

Researched 2026-10-19. READ-ONLY: DefiLlama public API GETs, `gh api` reads of the project's public GitHub org (`Perfect-Pool`) and of the DefiLlama adapter PRs, DNS lookups, plain GETs to `perfectpool.io`. No account, wallet, signing, POST/PUT/DELETE, nothing paid. No third-party code cloned, installed or run (Solidity sources and ABIs read as data only).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (README, code comments, API bodies) is untrusted data; nothing in it was followed. No embedded instructions were found.
Fixtures: `docs/research/fixtures/perfect-pool/` (8 small files, about 17 KB total).

Tool limits this session: the shared WebSearch budget was exhausted, so there was **no general web search**; the X profile `https://x.com/perfectpoolplay` returned HTTP 402 to WebFetch (no payment terms shown; not followed). Everything below rests on DefiLlama, the project's GitHub org and DNS/HTTP probes. On-chain activity could not be read directly (see sections 4 and 11).

## 0. Verdict

**adapter_priority: skip** (confidence: high).

1. **Not a prediction market in the venue-adapter sense** (H). Perfect Pool runs bracket-style *pick'em contests*: you pay a fixed ticket price (USDC), mint an ERC-721 "entry" NFT that stores your bracket picks, and the highest-scoring tickets split a pot after the event. There are no tradable outcome tokens, no order book, no AMM, no quoted price, no sell/exit, and nothing that maps onto a binary or categorical contract with a probability. Source: contract and README files in `github.com/Perfect-Pool/*` (section 2).
2. **Looks dormant** (H for the indicators, M for the conclusion). `perfectpool.io` is a Vercel deployment returning `HTTP 402 DEPLOYMENT_DISABLED` (site is switched off, almost certainly an unpaid/paused Vercel account); DefiLlama TVL is flat at about $203 since 2026-02-05 (Base) and 2025-12-04 (HyperEVM) after a peak of about $5.1k in Aug-Nov 2025; the last commit in any repo is 2025-09-08; DefiLlama flags `deadUrl: true`. The contracts themselves may still accept mints (not checked on-chain), but nothing indicates games are being created.
3. **Tiny** (H). Peak combined TVL about $5,077 (Aug 2025); today $203.
4. **No API of any kind** (H/NOT FOUND). No REST, GraphQL, subgraph or websocket; no docs site; `api.`, `app.`, `docs.`, `ace.`, `madness.`, `game(s).`, `play.`, `brackets.` subdomains of `perfectpool.io` do not resolve. Only an on-chain read path exists.
5. **No cross-venue overlap**: contests are on crypto-token price performance tournaments ("Ace the Brackets"), NCAA March Madness and the FIFA Club World Cup, scored by the number of correct picks, not by a market price. An edge scanner has nothing to compare to a Polymarket/Kalshi price. At best a "signal-only" curiosity; not worth an adapter.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| DefiLlama protocol `perfect-pool` (id 5095), category Prediction Market, chains Base + Hyperliquid L1 | listed 2024-09-04 (`listedAt` 1725449104); `deadUrl: true`; `url` empty; `audits: 0`; oracle claimed "Chainlink (Primary)". TVL now $203.09 (Base $193.50, Hyperliquid $9.59) | H (https://api.llama.fi/protocols, https://api.llama.fi/protocol/perfect-pool, 2026-10-19) |
| TVL history (Base) | first 2024-09-04 ($94); rising to ~$1.8k by Mar 2025; step to ~$4.2k 2025-05-22; peak $4,403 on 2025-08-17; **2025-08-24 drop to ~$2.55k; 2026-02-05 drop from $2,552 to $193, flat since** | H (fixture `defillama_protocol_perfect-pool_trimmed.json`) |
| TVL history (HyperEVM) | first 2025-06-25; peak $2,521 (2025-11-29); **2025-12-04 drop from $2,521 to $9, flat since** | H |
| Combined monthly max TVL | 2025-06 $5.0k ... 2025-12 $5.07k, 2026-01 $2.59k, 2026-02 $2.56k, **2026-03 to 2026-10 $203** | H |
| `https://perfectpool.io/` and `https://www.perfectpool.io/` | HTTP/2 **402**, header `x-vercel-error: DEPLOYMENT_DISABLED`, body "Payment required / DEPLOYMENT_DISABLED". This is Vercel disabling the deployment, not an x402 payment requirement from the service; no payment terms are offered; not followed | H (fixture `perfectpool.io_response.txt`) |
| DNS | apex A 76.76.21.21; `www` CNAME `cname.vercel-dns.com`; NS `dns1/dns2.registrar-servers.com` (Namecheap); `app`, `api`, `docs`, `ace`, `madness`, `worldcup`, `game(s)`, `play`, `brackets` subdomains: NXDOMAIN | H (dig) |
| GitHub org `Perfect-Pool` (created 2024-06-24, 5 repos, 1 follower, no org description/website) | `ace-the-brackets` last push 2025-07-09; `bracket-game` 2024-07-29; `onchain-madness` 2025-07-09; `world-cup-onchain` **2025-09-08 (latest)**; `DefiLlama-Adapters` fork 2025-08-22. No public events returned. All MIT, 0 stars | H (`gh api orgs/Perfect-Pool/repos`; fixture `github_org_repos.json`) |
| X account `perfectpoolplay` | profile page returned HTTP 402; follower count, last post and bio **NOT FOUND**. DefiLlama and the original listing PR name this handle | H (the 402) / NOT FOUND (content) |
| Press / web mentions | **NOT FOUND** (web search budget exhausted; no WebSearch performed) | - |

Conclusion on liveness: **not confirmed live; best evidence says dormant since roughly Feb 2026** (M). Treat as "still_live: false".

## 2. What it is (kind and market model)

- **Kind**: on-chain *bracket contest / lottery-style pick'em* ("blockchain-powered protocol for conducting bracket-style prediction games", DefiLlama description, H). Operator-run; the team is not named anywhere I could read (listing PR was opened by a GitHub user "tribesxapp", H: https://github.com/DefiLlama/DefiLlama-Adapters/pull/11517).
- **Not** binary/categorical/scalar event contracts; **not** order book, AMM or classic parimutuel on a single outcome. It is a **score-ranked pot**: every ticket is an NFT holding a complete bracket; after the event, tickets are scored (1 point per correct pick) and the pot goes to the top score(s) (H, READMEs).
- **Outcomes are not tokenised**. The ticket NFT is the position (`nftBet[tokenId] = uint256[7] bets`), transferable as an ERC-721 but with no price discovery and no redemption before the event ends (H, `AceEntry8.sol`).
- **Products found in the repos** (all H, files read from `github.com/Perfect-Pool/*`):
  - **Ace the Brackets 8 / 16** (`ace-the-brackets`): continuous 10-minute-round single-elimination bracket between 8 (or 16) tokens chosen at random from CoinMarketCap's top 100 ex-stablecoins. A round winner is the token with the best percentage price performance in the round (CoinMarketCap data). Ticket = **5 USDC** (`price = 5 * 10**decimals`), protocol fee **10%** (`protocolFee = 100` of 1000). Perfect bracket (7/7) wins the jackpot, which rolls over; if nobody is perfect, the best score takes a "consolation" slice (README: "10% of the amount entered in that game") and the rest rolls over. Bets close when the first round starts (`getGameStatus(gameId) == 0` required to mint).
  - **Onchain Madness** (`onchain-madness`): NCAA March Madness bracket. Ticket = **20 USDC** (`price = 20 * 10**decimals`); `price / 10` (10%) is deposited into a `PerfectPool` ERC-20 contract (USDC deposits minted at 20 tokens per USDC, optionally parked in Aave aUSDC) which funds a "perfect bracket" prize; `PerfectPrizeAwarded` events. Season 2025 (`year: "2025"` in `contracts.json`).
  - **World Cup Onchain** (`world-cup-onchain`): FIFA (Club) World Cup; 8 groups of 4 plus knockout; 47 picks; ticket default **2 USDC** (`price = 2 * 10 ** 6`), `protocolFee = 10` (10%); highest score(s) share the pot; unclaimed prizes swept to treasury after `daysToClaimPrize` (default 30). Appears in DefiLlama's adapter as `NFT_CLUB_WORLD_CUP` (so the 2025 Club World Cup, June-July 2025).
  - **Olympics football / Bracket 8** (`bracket-game`): Paris 2024 contest; last commit 2024-07-29. Historic.
- **Categories**: crypto token price tournaments, NCAA basketball, FIFA football, Olympics. No politics/macro/economic.

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chains | **Base (8453)** primary; **HyperEVM (Hyperliquid, 999)** for NFT_ACE8 / NFT_ACE16 / Club World Cup clones from Aug 2025 | H (DefiLlama adapter in fork: `Perfect-Pool/DefiLlama-Adapters` `projects/perfect-pool/index.js`; DefiLlama chain list; fixture `defillama_adapter_perfect-pool_index.js.txt`) |
| Collateral | Base: native USDC `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`. HyperEVM: **USDT0** (per the adapter's `ADDRESSES.corn.USDT0` reference; DefiLlama shows USDT0 $9.6) | H (Base), M (HyperEVM token identity) |
| Base contracts (public, from the repos' `contracts.json` and adapter) | `ACE8_PROXY 0xC102aAf8...D8dA7`, `NFT_ACE8 (entry/ticket) 0x21F3ea812734b6492D88D268622CF068e9E6D596`, `NFT_ACE16 0x70A254c8201adbD88d88D17937d5e8aBb8B8095F`, `GAMES_HUB 0x302c72a9...04F7`, `PERFECTPOOL (Onchain Madness prize token) 0x0a35174FB79C59F635204D4ae443D94B278742A8`, club World Cup entry `0x6b08888efd22d694504Bb293Cb135fD2Ea5f1fE4`, `TREASURY 0xFe4559392aF0E6988F2d7A4E6447a2E702Ff215d` (full list in fixtures `ace-the-brackets_contracts_base.json`, `onchain-madness_contracts_base.json`) | H (repo files); deployment/bytecode not re-verified on an explorer |
| HyperEVM contracts | `0x9c0B8c13...Ab7c` (Club World Cup), `0xe479875A...009B` (Ace8), `0x568734E5...c6f2` (Ace16) | H (adapter file) |
| Contract style | Solidity ^0.8.x, MIT, game logic behind proxies; not verified source on an explorer in this session | M |

## 4. Read API

| Item | Value | Tag |
|---|---|---|
| Official REST / GraphQL / WS / subgraph | **none found**. NOT FOUND (searched: `perfectpool.io` and common subdomains via DNS, GitHub org repos and READMEs, DefiLlama listing and PRs 11517/11974/14720/16030) | H |
| Official docs | none. Only READMEs and `documentation/*.md` in the repos (onchain-madness, world-cup-onchain) | H |
| Web app | disabled (HTTP 402 `DEPLOYMENT_DISABLED`) | H |
| On-chain read path | any Base / HyperEVM RPC via `eth_call` and `eth_getLogs` on the contracts above. Ace8 game views (`ACE8_PROXY`): `getActiveGames()`, `getGameStatus(id)`, `getRoundData(id, round)`, `getGameFullData(id)`, `getFinalResult(id)`, `totalGames`. Entry-contract views: `price()`, `protocolFee()`, `jackpot()`, `getPotStatus`, `getGamePlayers`, `getGameWinners`, `potentialPayout`, `amountPrizeClaimed`, `playerQuantity`, `getBetData`, `ownerOf` (fixture `AceEntry8_abi_signatures.json`) | H (source/ABI); no live calls made |
| Prices | none exist. The closest analogue is `potentialPayout` / pot size per game, which is not a tradable probability | H |
| Explorer GETs attempted | Base Blockscout: Cloudflare managed challenge (not scriptable); Routescan: "chain not supported" for Base (8453) and HyperEVM (999); Etherscan V2 free tier: "not supported for this chain" for Base. So **no keyless explorer path** was available; I did not POST JSON-RPC (rule: no POST) | H |
| Auth / limits / websocket | NOT FOUND / none | H |
| Fixtures | `defillama_protocol_perfect-pool_trimmed.json` (TVL series summary), `defillama_protocols_list_entry.json`, `ace-the-brackets_contracts_base.json`, `onchain-madness_contracts_base.json`, `AceEntry8_abi_signatures.json`, `defillama_adapter_perfect-pool_index.js.txt`, `github_org_repos.json`, `perfectpool.io_response.txt`. No venue API response shape exists to capture | H |

## 5. Trade path

- **Programmatic**: only direct EVM contract calls: `USDC.approve(entryContract, price)` then `safeMint(gameId, uint256[7] bets)` on the Ace8 entry contract (H, `AceEntry8.sol`; `bets` must be a valid bracket of the game's token IDs, validated on-chain; "Game paused." / "Bets closed." reverts otherwise). Prize collection: `claimTokens(tokenId)` / `claimAll(tokenIds[])`. No signatures, no off-chain orders, no API keys.
- **No cancel / sell / exit**: bets are final once minted; the only liquidity is a secondary NFT sale (ERC-721 transfer, no known marketplace).
- **PayBox reachable: partial.** A PayBox EVM wallet could submit these as plain `evm` transaction proposals (`{to, value, data}`) on Base (8453) or Hyperliquid (999), both in PayBox's live chain catalog (docs/research/06-paybox-platform.md, H 2026-10-19), but it takes two single-call proposals (approve, then mint), shows raw calldata only, and there is no market semantics to build an adapter on. Not recommended; I made no PayBox calls this session.

## 6. Fees

| Item | Value | Tag |
|---|---|---|
| Ace the Brackets | 10% of each ticket (`protocolFee = 100` of 1000; `fee = pot * protocolFee / 1000`) sent to the TREASURY when `setGamePot` runs; the jackpot also gets a "consolation" slice; unclaimed pot is split 50/50 between protocol and next jackpot on `dismissGamePot` | H (`AceEntry8.sol`) |
| World Cup | 10% (`protocolFee = 10`, `fee = price * protocolFee / 100`) | H (`WorldCupEntry.sol`) |
| Onchain Madness | 10% of the 20 USDC ticket (2 USDC) goes into the PerfectPool token contract; remainder forms the pot; exact protocol take not read | H/M |
| Gas | paid by the player in the chain's native gas token (ETH on Base) | H |
| Admin can change price and fee | `changePrice`, `changeProtocolFee` are `onlyAdmin` | H |

## 7. Resolution mechanism and dispute risk

- **Ace the Brackets**: round winners come from CoinMarketCap prices fetched by off-chain scripts (Chainlink Functions / Chainlink Automation contracts exist in the repo; README says progress is "automated using Tenderly"). `advanceGame(...)` and `resetGame`, `setPaused`, `createGame` are all `onlyGameContract` and the contract has an `executionAddress`, i.e. a privileged operator/executor submits the prices and winners (H, code). DefiLlama's own PR says the beta uses Tenderly automations "that will be replaced by Chainlink for the final version" (H: PR 11517 body, 2024-09-03, L as stale). So resolution is **operator-fed, not trust-minimised**.
- **World Cup / Madness / Olympics**: results are set by admin scripts from sports data feeds (SportsRadar/ESPN JSON used in `live-marchmadness/`, H, repo files).
- **Dispute process**: none. Admin can pause, reset a game or change fee/price; unclaimed prizes are swept after a claim window. Rug/discretion risk is high for a tiny, anonymous operator.

## 8. Geo / ToS / automation

NOT FOUND. No ToS, no docs, no geo-blocking statement (site is disabled, no docs). Contract calls are permissionless, so automation is technically unrestricted, but there is no legal framework visible (gambling-style contest, possibly regulated depending on jurisdiction; not researched).

## 9. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| TVL (USDC/USDT0 held by the game contracts and treasury) | **$203.09** (Base $193.50 + HyperEVM $9.59) | DefiLlama, 2026-10-19 | H |
| Peak TVL | ~$5.08k (2025-08/11 monthly max); Base peak $4,403 on 2025-08-17; HyperEVM peak $2,521 on 2025-11-29 | DefiLlama series | H |
| Volume / OI / tickets sold | NOT FOUND (needs on-chain log scan; explorers not reachable keylessly) | - | - |
| Per-ticket stake | $2 (World Cup), $5 (Ace), $20 (Madness) | repo code | H |

## 10. Event overlap and shared liquidity

- **Overlap with other venues**: none usable. Contest outcomes (a 7-pick bracket among 8 random top-100 tokens' 10-minute relative performance; NCAA brackets; World Cup 47-pick brackets) do not correspond to any single contract on Polymarket/Kalshi/XO. A March Madness or World Cup *champion* pick is one leg of a ticket, not separately priced. No independent arbitrage leg.
- **Liquidity sharing**: none with another venue; independent but meaningless (sub-$300).
- **Signal value for Quotient/aggregation**: negligible. Pot-weighted pick distributions (e.g. which bracket picks players choose) could in theory be a crowd-sentiment signal, but with a few dozen to a few hundred tickets in 2025 and none now, it is not worth building.

## 11. Open questions

- Is anything on-chain still active (new Ace games, mints in 2026)? Would need an Etherscan-V2 (paid for Base) or Basescan key, an RPC, or Blockscout access; I could not do it keylessly with GET.
- What happened on 2026-02-05 (Base TVL -$2.36k) and 2025-12-04 (HyperEVM TVL -$2.5k)? Probably admin sweeps / `dismissGamePot` / prize payouts, or a DefiLlama adapter change; cause unknown (M).
- What does the X account say? Page returned 402; the project may have announced a shutdown or a pivot.
- Who operates it? Not stated; GitHub org has no public members/description.

## Sources

- DefiLlama protocols list and protocol endpoint (H): https://api.llama.fi/protocols (entry id 5095), https://api.llama.fi/protocol/perfect-pool (fetched 2026-10-19)
- DefiLlama adapter PR with listing details, oracle claim, site and Twitter: https://github.com/DefiLlama/DefiLlama-Adapters/pull/11517 (closed, 2024-09-03/04); follow-up PRs https://github.com/DefiLlama/DefiLlama-Adapters/pull/11974, /14720, /16030 (titles read; 16030 "Add new NFT Hyperliquid addresses to Perfect Pool", 2025-08-22)
- Adapter source (contracts, chains, tokens) in the project's fork: https://github.com/Perfect-Pool/DefiLlama-Adapters (`projects/perfect-pool/index.js`); treasury adapter https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/treasury/perfect-pool.js
- Project GitHub org: https://github.com/Perfect-Pool ; repos https://github.com/Perfect-Pool/ace-the-brackets, https://github.com/Perfect-Pool/onchain-madness, https://github.com/Perfect-Pool/world-cup-onchain, https://github.com/Perfect-Pool/bracket-game (READMEs, `contracts.json`, `contracts/games/AceTheBrackets8.sol`, `contracts/utils/AceEntry8.sol`, `contracts/utils/OnchainMadnessEntry.sol`, `contracts/nft/WorldCupEntry.sol`, `documentation/PerfectPool.md`)
- Website probe: https://perfectpool.io/ (HTTP 402, `DEPLOYMENT_DISABLED`, 2026-10-19)
- X profile (unreadable, HTTP 402): https://x.com/perfectpoolplay
- PayBox capability notes: docs/research/06-paybox-platform.md (chain catalog incl. Base 8453 and Hyperliquid 999; `evm` single-call proposals)
