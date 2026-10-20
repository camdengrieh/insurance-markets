# Finance.vote (FVT, "Vote Markets" / PermissionlessMarkets) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs, WebFetch, `gh api` search, a Sourcify v2 GET for verified contract source, a static JS bundle read as text (never executed). No account, wallet, key, signature, POST/PUT/DELETE, or PayBox tool used. The indexer GraphQL endpoint and the Base RPC were deliberately NOT called (both need POST). Third-party content was treated as untrusted data; nothing in it was followed.

Research limits: the shared WebSearch budget was exhausted before I started, so there was NO web search pass (no news, no TVL/volume aggregator search, no Discord/Twitter). `https://finance.vote` over HTTPS times out from this network (TCP connect timeout on both A records); plain HTTP is a Namecheap URL forward to `https://fvt.app`, which works. Blockscout (Cloudflare challenge) was not bypassed. Round-level activity on Base was therefore NOT measured.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary/inferred; **L** = weak/stale.

---

## 0. Bottom line

1. **It is not a tradeable prediction market.** It is a daily "vote on which token in a basket will outperform" tournament game with quadratic voting, identity NFTs and token rewards (H, contract source). There is no price per outcome, no order book, no AMM, no outcome tokens, no way to take a position against a counterparty, and no way to sell. Nothing here can be an arbitrage leg.
2. **Barely alive.** Front end at `fvt.app` is up and its Base contract is verified, but FVT trades ~$24/day against a ~$131k market cap (CoinGecko, 2026-10-19, H), CoinGecko lists zero tickers, the Medium blog stopped in Dec 2021, there is no GitHub org and no docs site (all H/NOT FOUND, see below). Whether tournament 4 is still running rounds is UNVERIFIED.
3. **Possible signal value: almost none.** The "market" is an aggregate of votes by identity-NFT holders on crypto token relative performance, resolved by Chainlink price feeds. Vote totals per token (`voteTotals`) exist in an indexer but I could not read it (POST only). Not an independent probability on any event that other venues list.
4. **adapter_priority = skip.**

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://finance.vote` (HTTPS) | TCP timeout x3 (174.138.7.222, 192.64.119.143) | H |
| `HEAD http://finance.vote` | `302 Location: https://fvt.app`, `X-Served-By: Namecheap URL Forward` | H |
| `GET https://fvt.app/` | 200, CRA single-page app, title "finance.vote Vote Markets", tagline "A new kind of prediction market. Quadratic Voting and Token Rewards. Earn $FVT for your research." Client-rendered, no market data in HTML (fixture `fvt-app-index.html`) | H |
| Bundle `https://fvt.app/static/js/main.6e663148.js` (1.3 MB, read as text) | Baked env: `REACT_APP_DEFAULT_CHAIN_ID=8453` (Base), `REACT_APP_TOURNAMENT_ID=4`, `REACT_APP_GRAPH_QL_ENDPOINT=https://indexer.fvt.app/graphql`. Build date NOT FOUND. Nav: "Mint an identity" -> `https://mint.fvt.app`, "Vote", "Account" | H |
| CoinGecko `GET /api/v3/coins/finance-vote` | `last_updated 2026-09-29`; categories include "Prediction Markets"; 24h volume $24.49, mcap $130,829, all-time low set 2026-07-02, price $0.000226; `/tickers` returns an empty list | H (fixtures `coingecko-*.json`) |
| Medium feed `medium.com/feed/@financedotvote` | newest post 11 Dec 2021 (stale, > 6 months by years); WebFetch of the blog gave HTTP 403 | H (stale) |
| Contract `PermissionlessMarkets` on Base `0x7Cd6AF066E32ed25eE3C971cEfBB05eD699AEa36` | Sourcify full match, verified 2024-08-22 (Sourcify says "verifiedAt"; deployment date NOT FOUND) | H |
| Recent rounds / last `VoteOccurred` | NOT FOUND (needs RPC/explorer/indexer; Blockscout blocked by Cloudflare challenge, indexer is POST-only) | - |

Verdict: **still_live = true in the weak sense** (front end serving, contract deployed, token category "Prediction Markets" updated by CoinGecko), but activity unverified and economically near-dead. The `finance.vote` apex HTTPS being unreachable is itself a negative signal (M).

---

## 2. Kind and market model

- Kind: on-chain tournament / quadratic-voting game ("Vote Markets", contract `PermissionlessMarkets`). CoinGecko tags it "Prediction Markets"; that is a stretch. (H, source below)
- Structure (H, Sourcify source, fixture `PermissionlessMarkets-key-excerpts.txt`):
  - A `Tournament` is a repeating sequence of `Round`s. Round length = `votingPeriodLengthSeconds + marketPeriodLengthSeconds + challengePeriodLengthSeconds` (values per tournament NOT FOUND). States: VOTING -> MARKET -> CHALLENGE -> COMPLETE.
  - Each round has a basket of tickers (`tickerSymbols[]`, each bound to a Chainlink `priceFeeds[]` address). Outcome = which basket token has the highest percentage price change between `startingPrices` (taken when the MARKET state begins) and `proposedFinalPrices` (taken at CHALLENGE). Categorical, N-way, 1-based index. Winner = max of `((final - start) * 1e6) / start`.
  - Voting: an identity-NFT holder calls `vote(voterId, tournamentId, choices[], weights[], votePayment, hash)`. Quadratic cost: `sum(weights^2) <= voiceUBI` voice credits per round; one vote per identity per round; the caller must own the identity ERC-721 (`mint.fvt.app`). The vote costs `voteCostTokens` of an ERC-20 `voteToken` (pulled by `transferFrom`).
  - Payout: `roundRewardTokens * myWeightOnWinner / totalWeightOnWinner`, paid in `rewardToken` from a pre-funded pool (`rewardFunding`); claim via `withdrawWinnings`. The vote payment is NOT redistributed to winners; it accrues to the tournament owner/tax man (`withdrawFees`). So losers lose only the vote fee; winners share a fixed subsidy. This is a loyalty/reward game, not a zero-sum bet.
- Tokenisation: no outcome tokens. Votes are stored as mappings inside the contract. Identity is an ERC-721. (H)
- Order book / AMM / parimutuel: none of these. Closest analogue is a subsidised, fixed-prize "vote-share" pool. (M, my characterisation)

## 3. Chains and collateral

- Contract addresses embedded in the front-end bundle (H): `PermissionlessMarkets` on Polygon 137 `0x79275171a5AFd93028D83245220203714a4F670c`, **Base 8453 `0x7Cd6AF066E32ed25eE3C971cEfBB05eD699AEa36`** (current default chain), plus testnets (Mumbai 80001, Base Sepolia 84532). `Token` contract on Base `0x6b37F4AD0022bbe32c21829Fa40FdAEcAD8C8d10` (Polygon `0x72a5a58f79FFc2102227B92fAeBA93B169a3A3F1`, which CoinGecko lists as FVT on Polygon).
- Whether the Base `Token` is the vote token or reward token, and the actual `voteCostTokens` / `roundRewardTokens` / `voiceUBI` values: NOT FOUND (needs `eth_call`, i.e. a POST to an RPC; not done).
- FVT also on Ethereum `0x45080a6531d671ddff20db42f93792a489685e32` and BSC `0x0a232cb2005bda62d3de7ab5deb3ffe4c456165a` (CoinGecko, H). Collateral is the project's own token, not USDC. No stablecoin collateral.

## 4. Read API

- Official public REST/WebSocket: **none found**. No docs site (`docs.finance.vote` and `docs.financevote.com` do not resolve), no GitHub org (`financedotvote`, `finance-vote`, `financevote`: 404; CoinGecko `repos_url.github` empty).
- Indexer: `https://indexer.fvt.app/graphql` (undocumented; used by the front end). Entities seen in the bundle query: `tournaments(where:{tournamentId_eq})`, `rounds(where:{roundId_eq})` with fields `roundId priceFeeds finalWinnerIndex finalPrices tickerSymbols voteTotals startingPrices`. `GET /graphql` returns "Cannot GET /graphql" (404), so only POST is accepted; not probed because POST is out of scope. Auth/limits: NOT FOUND. Treat as unofficial. (H for URL and query text, fixture `indexer-graphql-query-from-bundle.txt`)
- On-chain reads: the verified contract exposes `getCurrentRoundId`, `getCurrentRoundState`, `getRoundDetails`, `getVoteTotals(tournamentId, roundId, option)`, `getLivePrices`, `getTournament` (H). Any Base RPC works but needs an RPC POST.
- Other fixtures: Sourcify v2 `GET https://sourcify.dev/server/v2/contract/8453/<addr>?fields=sources` returns the full Solidity source (H); this is documented Sourcify API, not a venue API.

## 5. Trade path

- Programmatic: possible only as raw EVM transactions: ERC-20 `approve` + `vote(...)` on Base, requiring ownership of a minted identity NFT (`mint.fvt.app`, mint terms NOT FOUND). No signed-order scheme, no REST order API. (H for contract interface)
- Reachable via PayBox? **Partial in principle, pointless in practice.** A PayBox-controlled Base EVM wallet could submit a transaction proposal for `vote`, but there is nothing to buy or sell, no price to compare, and an unknown identity-mint prerequisite. `paybox_reachable = partial`.

## 6. Fees

- `vote()` requires paying at least `voteCostTokens` of `voteToken`; amount NOT FOUND. Voter pays. Accrued vote payments are split on `withdrawFees`: `tax = accumulated * tax / 1000` to `taxMan`, remainder to tournament `owner`. `MAX_TAX = 100` (i.e. at most 10%). (H)
- Gas on Base. No trading/maker/taker fee because there is no trading.

## 7. Resolution and dispute risk

- Resolution: keeper-driven (Chainlink Automation-compatible `checkUpkeep/performUpkeep`) reads Chainlink aggregator `latestRoundData` for start and end prices; `setFinalPrices` proposes a winner; a challenge window follows. (H)
- Challenge: anyone can post a challenge deposit in `oracle.challengeToken` and claim a different winner with evidence; `confirmWinnerChallenged` then lets a privileged party choose the winner (roles not fully reviewed). Thus a trusted-party fallback exists. The contract is `owner`/`taxMan` administered; there are no timelocks that I looked for. (M, partial source review; I only read about 40% of the contract logic)
- The oracle can also be swapped by the owner via `setOracle` (function exists, H; access control not reviewed).

## 8. Geo / ToS / automation

NOT FOUND. No ToS or geo-block page located at `fvt.app` (the SPA is client rendered; I did not run it). No automation policy found.

## 9. Liquidity (with dates)

- No market liquidity concept. Token liquidity: FVT 24h volume $24.49, market cap $130,829, FDV $223,490 (CoinGecko, 2026-10-19, H). Mean daily volume over the past 365 days ~$654, one-day max ~$71.4k (CoinGecko market_chart, H, `coingecko-market-chart-tail.json`). CoinGecko has no tickers (no CEX/DEX pair indexed).
- Reward pool size and vote counts: NOT FOUND.
- TVL (DefiLlama `/protocols` name search for finance.vote): no match (H, 2026-10-19).

## 10. Event overlap and arbitrage relevance

- Event categories: only crypto token relative-performance baskets (e.g. "which of N tokens gains most between T0 and T1"), over short windows. No sports, politics, macro. (M, from contract design; the actual baskets for tournament 4 NOT FOUND.)
- Overlap with other venues: effectively none; no other venue lists these basket questions with equivalent resolution rules. Also no tradable price. Not an arbitrage leg.
- Shared liquidity: none (self-contained contract, own token). `liquidity_shared_with` = none.

## 11. Adapter recommendation

- **skip.** If ever revisited: signal-only at most, via the unofficial indexer `voteTotals` per token per round; requires a POST GraphQL client against an undocumented endpoint and has no event overlap. Not worth building.

## 12. Suspicious content

None found in the pages or bundle read. Note for hygiene: the bundle embeds third-party RPC provider URLs with API keys in the path (Infura/BlastAPI). They were deliberately not copied into these notes and must not be used.

## 13. NOT FOUND (searched)

- Official docs / API reference (searched: `docs.finance.vote`, `docs.financevote.com`, fvt.app HTML + bundle, CoinGecko links)
- GitHub org/repos (searched: gh API users/orgs `financedotvote`, `finance-vote`, `financevote`, `fvt-finance`; gh repo search "finance.vote")
- ToS, geo restrictions, automation rules (searched: fvt.app HTML + bundle strings)
- Tournament parameters (vote cost, reward size, round length, basket tokens), last round activity (needs RPC/indexer POST or explorer; Blockscout blocked by Cloudflare)
- News or status 2025-2026 (web search budget exhausted; Medium last post 2021)

## Sources

- https://fvt.app/ (H) and https://fvt.app/static/js/main.6e663148.js (H, read as text only)
- http://finance.vote (HEAD only, 302 to fvt.app) (H); https://finance.vote HTTPS timeout (H)
- https://api.coingecko.com/api/v3/coins/finance-vote, `/market_chart`, `/tickers` (H)
- https://sourcify.dev/server/v2/contract/8453/0x7Cd6AF066E32ed25eE3C971cEfBB05eD699AEa36 (H, verified source)
- https://medium.com/feed/@financedotvote (H, newest item Dec 2021 = stale)
- https://api.llama.fi/protocols (H, no finance.vote entry)
- Fixtures: `docs/research/fixtures/finance-vote/`
