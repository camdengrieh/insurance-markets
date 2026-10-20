# Spindash (Sonic) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to public APIs and docs pages, `gh` searches, one read-only PayBox `discover_tokens` (mode=chains) call. No account, no key, no wallet, nothing signed, no POST/PUT/DELETE, no third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party pages (explorer, docs, landing page) are untrusted data; nothing in them was followed. No instructions aimed at agents were seen.
Limit: WebSearch budget for the session was exhausted, so no independent news/search coverage was possible (the web search tool refused). Findings rest on DefiLlama, the project's own site and docs, the Sonic block explorer, and GeckoTerminal/DexScreener.
Fixtures: `docs/research/fixtures/spindash/` (5 small files).

## 0. Verdict

**adapter_priority: skip.** Effectively dead and never meaningful.

1. Last user activity on the only contract: a `Claim` tx on 2025-10-24 21:26:34 (SonicScan, ~359 days before 2026-10-19) [H]. No activity for ~12 months.
2. DefiLlama TVL is $0 (since 2025-10-28, apart from ~$70 dust 2025-10-23..27); peak was $7,376 on 2025-03-31 (listing day) [H].
3. The app domain `spindash.gg` has no A record and is on DNS-parking nameservers (`dig`, 2026-10-19) [H]. DefiLlama flags `deadUrl: true` and has no protocol URL [H].
4. Small-stake token-game, not a general market venue. Single custom pari-mutuel contract, owner-resolved, in a meme token (SPINDASH) on Sonic, with no API. Nothing overlaps a venue an arbitrage scanner would use.
5. Signal value is nil: no price discovery, no volume.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| DefiLlama `api.llama.fi/protocol/spindash` | `deadUrl: true`, `url: ""`, TVL `0` on 2026-10-18; 568 daily points; 150 non-zero days; last non-zero 2025-10-27 ($73); first 2025-03-31 ($7,376). Listed 2025-03-31 21:30Z. `audits: "0"`, `raises: []`, `hacks: []` | H (fixture `defillama_protocol_spindash_trimmed.json`) |
| SonicScan `0x486b750b2DB5d8B1548A78319F6CF8D95501Ff58` ("SonicPredicts") | 3,637 total txs; latest 2025-10-24 21:26:34 ("Claim"); holds 23,577,555 SpinDash valued $0.00, 0 S. Creation tx `0x73674e65...e08b97` shown as "1 yr 229 days ago" (~2025-03) | H (https://sonicscan.org/address/0x486b750b2DB5d8B1548A78319F6CF8D95501Ff58), page summarised by a fetch tool, ABI/figures not re-derived on-chain |
| GeckoTerminal token `sonic/0x5fd9...64d9` | `price_usd: null`, 24h volume 0, reserve ~$1.55 total; pool SpinDash/wS 0.3% reserve ~$3.90, zero buys/sells on every window (m5..h24); second pool (2%) reserve ~$0 | H (fixtures `geckoterminal_*`) |
| DexScreener `latest/dex/tokens/0x5fd9...` | `pairs: null` | H (fixture `dexscreener_token_spindash.json`) |
| `spindash.gg` (app) | A record absent, NS = `ns1/ns2.dns-parking.com`; HTTPS connect fails. `spindash333.spindash.gg` also fails to connect | H (dig/curl 2026-10-19) |
| `https://www.spindash.fun/` | Loads (HTTP 200), still markets two products, copyright 2025, no shutdown notice, no contract address listed | H (fetched 2026-10-19). A live landing page is not evidence of a live product |
| Other `spindash.*` domains | `spindash.xyz` redirects to a GoDaddy for-sale page; `spindash.io` is an unrelated "CRT TV Frame" page. Not the project | H |
| GitHub | `gh search repos/code` for "spindash"/"SonicPredicts": only unrelated Sonic-the-Hedgehog repos. No project repo | H (searched 2026-10-19) |

Everything about the product is dated 2025; treat any claim here as **L (stale)** except the 2026-10-19 liveness probes.

## 2. What it is

- **Kind**: onchain-other (Sonic, chain id 146), "prediction market game" per DefiLlama [H]. Operator: NOT FOUND (searched: DefiLlama, landing page, docs, SonicScan; creator is an anonymous EOA). Twitter `@spindash_sonic` (DefiLlama, landing page) [H]; Discord and Telegram links are on the landing page [H].
- **Token**: SPINDASH, `0x5fD9CD00c975CcEDB4298A562d132fb2683164D9`, 18 decimals, supply 1,000,000,000, "launched through Degen Express on the Sonic Chain" (docs whitepaper). Meme/utility token [H].
- **Products per docs (2025)** [H, https://spindash.gitbook.io/spindash-docs/llms.txt and sub-pages]:
  1. "Decentralized Predictions market": users create markets or bet on existing ones; creators receive "a percentage of the protocol fees"; "All predictions will be resolved through an Language Learning Model (AI)". Future tense ("will feature"), no mechanism detail.
  2. "$SpinDash420 Game" (landing page calls it Spindash333): up/down price bet on a token over 4 min 20 s (333 variant: 3 min 33 s); correct prediction "will earn 1.6 times the amount of their initial bet". Fixed-payout binary option, not a market.
  3. Fee revenue goes partly to buybacks/burns (docs). No numbers.

## 3. Market model (from verified contract ABI) [H for names, M for semantics]

Source: SonicScan "SonicPredicts" verified contract (Solidity 0.8.24, MIT, optimizer 200, imports OpenZeppelin Ownable/ReentrancyGuard/SafeERC20). The Solidity text itself was not readable through the fetch tool, so payout math is **NOT FOUND (searched: SonicScan Code tab via fetch, Sourcify chain 146 returned 404, Etherscan v2 API requires a key)**.

- **Pari-mutuel, two-sided pools, one stake token (SPINDASH).** `deposit(uint256 gameId, uint8 option, uint256 amount)` pulls the ERC-20 stake into pool A or B; `claim(uint256 gameId)` pays winners (event `Payout`). No order book, no AMM, no tokenised outcome shares (positions are plain mappings `depositsA(gameId,addr)` / `depositsB(gameId,addr)`; not transferable).
- **Game struct**: `id, gameName, banner, gameType, candidateA, candidateB, initialPrice, finalPrice, expiryTime, lockTime, totalPoolA, totalPoolB, resolved, winnerPool, feePercent, market, creator, status`.
- **Two game types**: coin games `createCoinGame(string name, uint256 expiry, uint256 lock, string market, uint256 initialPrice, string banner, address creator)` (up/down on a price) and election games `createElectionGame(name, expiry, lock, market, candidateA, candidateB, banner, creator)` (A vs B). Binary only; no categorical or scalar.
- **Lock/expiry**: deposits revert after `lockTime` ("Deposits are locked for this game"); `lockTime < expiryTime` enforced (revert strings in bytecode, via fetch summary) [M].
- **Views useful to a reader**: `getGames(bool includeResolved, uint256 status, address creator)`, `getGameDetails(uint256)`, `getDepositsForGame(uint256)`, `getClaimableOrPendingGames(address)`, `gameCount()`, `games(uint256)`, `getLeaderboard()`. Events: `GameCreated`, `Deposit`, `GameResolved(uint256 gameId, uint8 winner)`, `Payout`, `FeeUpdated`.
- No implied probability exists; the nearest thing is `totalPoolA/(totalPoolA+totalPoolB)` (pari-mutuel pool ratio), which is not an executable price.

## 4. Chains and collateral

- Sonic mainnet only (eip155:146). Stake/collateral: SPINDASH meme token, valued at ~$0 now [H]. Not USDC, not a stable. Gas in S.

## 5. Read API

**exists: onchain-or-subgraph-only.** No official REST/WS API, no subgraph found (NOT FOUND, searched: landing page links, docs llms.txt, `gh search`). Docs index lists only whitepaper pages [H]. Only route is JSON-RPC `eth_call`/`eth_getLogs` against the contract on Sonic (not performed here: the RPC transport is POST, which this run does not use). Docs URL: https://spindash.gitbook.io/spindash-docs. No auth model, rate limits or websocket documented (NOT FOUND).

## 6. Trade path

On-chain only: ERC-20 `approve(SonicPredicts, amount)` then `deposit(gameId, option, amount)`; later `claim(gameId)`. No signed-order or API route. An agent wallet on Sonic could do it with transaction proposals if it held SPINDASH, but there is no liquid market to acquire the token (pool reserve ~$3.90, zero trades) and no live games.

## 7. PayBox reachability

**partial / moot.** `discover_tokens mode=chains query=sonic` (2026-10-19) returns Sonic (`eip155:146`, native S) in the metadata catalog, with the tool's own notice that it is "not a support allowlist ... Signing permissions are unchanged" [H]. So a PayBox EVM wallet might reach Sonic, but signing support was not confirmed, and the venue is dead, so it does not matter.

## 8. Fees

- Default `feePercentage`, per-game `feePercent`, and `creatorFeePercentile` (creator share of fees), settable by the owner (`updateFeePercentage`, `updateCreatorFeePercentage`) [H names]. Revert "Creator fee cannot exceed 100%" and a divisor that appears to be 1000 are bytecode inferences [L/M]. Actual current values: NOT FOUND (read `feePercentage()`/`creatorFeePercentile()` on-chain to get them). Who pays: deducted from the losing/total pool, inferred, unverified [L].
- Docs mention a fixed 1.6x payout on the 420/333 game [H], implying a built-in house edge on that product.

## 9. Resolution and dispute risk

- Docs: all predictions "resolved through an Language Learning Model (AI)" (future tense) [H]. On-chain: `resolveGame(gameId, uint8 winner, uint256 _finalPrice)` is owner-gated; the explorer shows "Resolve Game" txs sent by the contract creator EOA [M, from fetch summary]. So resolution is one admin key, with `withdraw(uint256)` also owner-only. No dispute path, no timelock, no oracle in the ABI. Risk: total centralisation / rug.

## 10. Geo / ToS / automation

NOT FOUND (searched: landing page text, docs llms.txt and sub-pages). No terms page or geo block is documented. Not a regulated venue.

## 11. Liquidity

- DefiLlama TVL $0 as of 2026-10-18; all-time peak $7,376 on 2025-03-31 [H]. Contract still holds 23.58M SPINDASH worth $0 [H]. DEX pool depth ~ $4 [H]. 3,637 lifetime txs [H]. Effectively no volume.

## 12. Event categories / overlap

Games seen in the ABI: crypto price up/down (coin games) and two-candidate "election" games (title strings are free text). Overlap with Polymarket/Kalshi crypto-price and politics categories is nominal; sample of actual game titles: NOT FOUND (not enumerated; `getGames` not called). Not an arbitrage leg: pari-mutuel pools settle at final odds, no executable price, no liquidity.

## 13. Shared liquidity

None. Independent but also empty.

## 14. Open questions

- Actual fee parameters and payout formula (needs contract source or on-chain reads).
- Whether `forsale`/parked domains indicate the team abandoned the project (likely, unconfirmed).

## Sources

- DefiLlama API: https://api.llama.fi/protocol/spindash (fetched 2026-10-19) [H]; protocol page https://defillama.com/protocol/spindash (HTTP 403 to WebFetch, so the API was used instead); adapter https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/spindash/index.js (contract + token on Sonic) [H].
- SonicScan: https://sonicscan.org/address/0x486b750b2DB5d8B1548A78319F6CF8D95501Ff58 (contract page) [H]; token page returned 403.
- Project site: https://www.spindash.fun/ ; docs https://spindash.gitbook.io/spindash-docs (llms.txt, readme.md, spindash-ecosystem/publish-your-docs.md, .../usdspindash420-game.md, revenue-generation-and-deflationary-tokenomics/editor.md) [H, all 2025-era content].
- GeckoTerminal: https://api.geckoterminal.com/api/v2/networks/sonic/tokens/0x5fd9cd00c975ccedb4298a562d132fb2683164d9 and /pools [H]. DexScreener: https://api.dexscreener.com/latest/dex/tokens/0x5fd9cd00c975ccedb4298a562d132fb2683164d9 [H].
- PayBox `discover_tokens` mode=chains query=sonic (2026-10-19) [H].
- Sourcify v2 `contract/146/0x486b...` returned 404 (not verified there) [H]. CoinGecko `coins/sonic/contract/...` returned "coin not found" [H].
