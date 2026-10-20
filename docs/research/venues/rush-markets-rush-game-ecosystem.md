# Rush Markets (Rush game ecosystem, Base): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public unauthenticated GETs to rushgame.vip, markets.rushgame.vip, the dead Railway API host, api.llama.fi, plus `gh api` raw reads of two public GitHub repos and a WebFetch of the docs page. Nothing was signed, posted, paid, installed or executed. No Base RPC (POST) calls were made, so no on-chain state was read directly; Blockscout GETs were blocked by a Cloudflare challenge and WebSearch budget was exhausted, so on-chain balances and any social/news signal are NOT FOUND.

Tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale.

## Verdict

**adapter_priority: skip.** Two separate products share the "Rush" name on Base, both parimutuel, ETH-only and single-oracle. Neither is worth an adapter:

1. **rushbase / rushgame.vip "Rush Protocol"** (the product behind the "Rush ecosystem online" banner): over/under on the number of vehicles crossing a live traffic camera in 5 minutes. No overlap with any event category on other venues. Last resolved round with bets was **2026-05-10**; every round since (to 2026-06-05, the newest ledger entry) was cancelled with zero bets. The site has since repositioned to "Royale" and "Tap Trading" games. [H]
2. **mktpredct / markets.rushgame.vip "Rush Markets"** (generic admin-created multi-outcome markets, e.g. "Will Bitcoin hit 200k by end of 2026?"): the only part that could overlap other venues, but its backend (`rush-api-production.up.railway.app`) returns `Application not found`, i.e. the Railway app is gone, so the frontend cannot load markets. Repo last pushed 2026-04-21. No evidence of any real liquidity. [H]

Revisit trigger: none worth scripting. If it ever matters, watch the MarketFactory `MarketCreated` events on Base (see addresses below).

## 1. Is it still live?

| Piece | Status 2026-10-19 | Evidence |
|---|---|---|
| https://rushgame.vip -> https://www.rushgame.vip | HTTP 200 on www, Next.js on Vercel. Title "Rush — Royale, Tap Trading and On-Chain Games". Banner "LIVE / Rush ecosystem online", "BASE MAINNET REAL ETH GAMES". Page still embeds the legacy vehicle over/under widget, with all counters at 0 / "No bets yet" in the HTML shell. | H: curl, https://www.rushgame.vip |
| www REST API (`/api/health`, `/api/stats`, `/api/ledger`, `/api/rounds/history`) | Up, HTTP 200, public. `/api/health` reports `status: ok` but `lastRound.timestamp` = 1778400651 (2026-05-10 08:10 UTC), "ago: 497391h" (a broken calc) | H: fixtures `rushgame-api-health.json` etc. |
| https://markets.rushgame.vip (mktpredct Rush Markets) | HTTP 200 static Next.js shell (client rendered, no market data in HTML) | H: curl |
| `rush-api-production.up.railway.app` (the API hardcoded in the markets.rushgame.vip JS bundle and in AGENT_API.md) | `{"status":"error","code":404,"message":"Application not found"}` on `/health` and `/api/markets` (Railway edge fallback) | H: curl, plus bundle `page-f7d9b71a15675182.js` shows it is the only API/WS host |
| `api.rushgame.vip` | A record exists (167.99.132.40) but TCP/HTTPS times out | H: dig, curl timeout |
| Last resolved round with ETH bets | 2026-05-10 07:46-08:10 UTC (pools 0.002-0.003 ETH) | H: `/api/ledger` full crawl (4,677 rows) |
| Newest ledger row | 2026-06-05 13:59 UTC, state `cancelled`, 0 pool. Last 200 rows are all cancelled, 0 bettors | H: `/api/ledger` |
| GitHub `rushgamebase-dev/mktpredct` | created 2026-04-02, last push 2026-04-21 | H: gh api |
| GitHub `rushgamebase-dev/rushbase` | created 2026-03-28, last push 2026-05-28 (Tap Trading hardening commits) | H: gh api |
| Docs page https://www.rushgame.vip/docs | Lists five surfaces: Royale, Tap Trading, Ranks, Stats, Ledger. Prediction Market Factory, $RUSH and RushTiles are listed as contracts; "legacy holder contracts remain available for claims and audit but are no longer a primary product path" | H (via WebFetch summary) |

Discrepancy to note: the task hint said the site showed 0.00 ETH volume and no resolved markets. That is the HTML placeholder shell. The API says 2,377 resolved rounds. Both are consistent with a dormant product whose real ETH volume is tiny (section 7).

## 2. Kind and market model

- **Kind:** parimutuel, binary-style over/under (rushbase) or multi-outcome 2-10 labels (mktpredct). No order book, no AMM, no shares/tokens. [H, `Market.sol`, `docs/CONTRACTS.md`]
- **Outcome tokenisation:** none. State is mappings inside each market contract: mktpredct `userBets[address][outcomeIndex]`, `totalPerOutcome[i]`, `totalPool`. No ERC-20/1155 position tokens, so positions cannot be traded or hedged on a secondary market. [H, source]
- **rushbase** `PredictionMarket` uses `placeBet(rangeIndex)`; ledger rows carry `overPool` / `underPool`, `threshold`, `winningRange` ("Under 50"), `actualCount`. A new contract is deployed per 5-minute round via `MarketFactory.createMarket`. [H]
- **Price/odds:** implied probability for outcome i = `totalPerOutcome[i] / totalPool` (pre-fee, and moves with every later bet, so there is no fixed price to arbitrage against, only a final payout multiple). Payout multiple = `(totalPool * 0.95) / outcomePool`. [H, derived from contract math]
- Min bet 0.001 ETH (mktpredct, `bet()` requires `msg.value >= 0.001 ether`). [H]

## 3. Chains and collateral

- Base mainnet (chain id 8453), native ETH only. [H]
- mktpredct MarketFactory `0x09257F570c77EdabfAcb7243712fFa8CcB0599f8`, Market #1 (BTC 200k, deadline 2026-12-31) `0x0880B8f8114a5a4b852a900826731E3F5A2500E4`. CLAUDE.md claims 21 markets deployed, 9 with seed bets, but the same file says Market #1 pool is 0 ETH. [H for addresses and claims as written in repo; the on-chain state itself was not read]
- rushbase MarketFactory `0x5b04F3DFaE780A7e109066E754d27f491Af55Af9`, oracle/admin `0x4c385830c2E241EfeEd070Eb92606B6AedeDA277`. Older factories V1-V3 and an archived `BurnMarketFactory` ($RUSH-denominated) exist. [H, README/CONTRACTS.md]
- `$RUSH` token (Flaunch) `0xB36A127dBa73F3aA7C70B4e00B7395B86A60e73b` is a trading asset, not market collateral in current markets. [H]

## 4. Read API

**exists: official-public** (for rushbase / www.rushgame.vip only); mktpredct's API is dead.

- Base URL: `https://www.rushgame.vip/api/` (`https://rushgame.vip` 307-redirects to www). Docs: https://github.com/rushgamebase-dev/rushbase/blob/main/docs/API.md (no hosted API docs). [H]
- Endpoints confirmed live with unauthenticated GET: `/api/health`, `/api/stats`, `/api/rounds/history?limit=N` (max 100), `/api/ledger?limit=N&offset=M` (max 200, 4,677 total rows). Documented but not called: `/api/ledger/[market]`, `/api/evidence/[market]`, `/api/profile/[address]`. [H]
- Rate limits per docs: stats 20/min, rounds 20/min, ledger 10/min, per IP. A full ledger crawl at 7s spacing succeeded. [H docs; H observed]
- Websocket: oracle live-count stream `wss://oracle.rushgame.vip` (from `/api/health`), Ably for market events; not probed. [M]
- mktpredct (dead) documented: `GET /api/markets`, `/api/markets/:address`, `/api/markets/:address/activity`, `/chart`, `/positions/:user`, `WS /ws/:address`, `GET /api/proposals/:id`. Odds are 0-100 integers, money as wei strings. [H, README/CLAUDE.md; endpoints not reachable]
- Fixtures: `docs/research/fixtures/rush-markets-rush-game-ecosystem/` contains `rushgame-api-health.json`, `rushgame-api-stats.json`, `rushgame-api-rounds-history.json`, `rushgame-api-ledger.sample.json` (trimmed). Shape notes: `/api/ledger` mixes number and string types for `totalPool` (`0` int vs `"0.002"` string), and `evidence` is `""` on cancelled rounds, an object on resolved ones. `/api/stats` `totalVolume` is polluted (see section 7). [H]
- On-chain alternative: both factories are verified on Basescan (per READMEs) with `MarketCreated` events and per-market `BetPlaced` / `MarketResolved` events. [M, not read on-chain]

## 5. Trade path

- Fully on-chain, no signed-order flow: call `bet(outcomeIndex)` (mktpredct) or `placeBet(rangeIndex)` (rushbase) with ETH as `msg.value`; then `claim()` (mktpredct) or `claimWinningsFor(addr)` / `distributeAll()` (rushbase) after resolution. No cancel of an individual bet. [H, source/docs]
- Agent API (mktpredct, dead host): `POST /api/agent/proposals` with `Authorization: Bearer rush_...` to propose markets; keys "issued by the Rush team"; 10 proposals/hour. This is market creation, not trading. [H, AGENT_API.md]
- **PayBox reachable: partial / not worth it.** A Base EVM wallet could send a plain payable transaction to a market address, so mechanically reachable by a transaction proposal (Base wallet, ETH). I did not call any PayBox tool; this is inferred from the contract ABI [M]. Practical blockers: rushbase rounds are 5 minutes with a 150s betting window, there is no liquid book, and there are currently no live rounds. mktpredct markets cannot be discovered without the dead API (only via factory events).

## 6. Fees

- 5% of total pool (`feeBps = 500`), taken from the pool at resolution, borne by winners (payout = `userBet * (totalPool - fee) / winningPool`). No fee on cancel/expire (refund). [H, `Market.sol`, `CONTRACTS.md`]
- mktpredct: fee goes to `feeRecipient` (owner wallet); agent-proposed markets share 4% of every bet with the proposer (80% of the 5%). [H, AGENT_API.md]
- rushbase: the 5% goes to RushTiles holders, protocol "takes zero" (claimed). [H as documented]
- Gas on Base is the only other cost. Zero-winner pool: refund of all bets. [H]

## 7. Liquidity (all low)

- rushbase ledger crawl on 2026-10-19 (4,677 rows, 2026-03-28 to 2026-06-05): 2,377 resolved, 2,300 cancelled. Of resolved rounds, 2,371 have pools under 100 (sum **10.62 ETH**, max single pool **0.112 ETH**, typical 0.002 ETH, about 2 bettors) and 6 have a pool of exactly 2000 on 2026-04-07 (1000/1000 over/under, almost certainly token-denominated or test, not ETH). Monthly resolved ETH: Mar about 2.3, Apr about 7.2, May about 1.1. [H, own computation from the crawl]
- `/api/stats` on 2026-10-19 reports `totalVolume: 12010.618`, `uniqueBettors: 4704`, `feesDistributed: 600.531`, `volume24h: 0`. The 12,010 figure equals the sum including the 6 x 2000 pools, so it is not real ETH volume. `volume24h = 0` confirms dormancy. [H data; interpretation M]
- mktpredct: CLAUDE.md says 21 markets with 9 seeded, Market #1 pool 0 ETH. No TVL/volume source found. DefiLlama has no listing for either (only unrelated "Sat Rush", "Rush Sports" on Solana, "ClaimRush"). [H: api.llama.fi/protocols filtered for "rush"; repo text]
- Newest data: rushbase last real-money round 2026-05-10 (about 5 months before today, **stale**).

## 8. Resolution and dispute risk

- mktpredct: single ECDSA signer (same wallet as owner and fee recipient) signs `resolve(winningOutcome)` after the deadline; `cancel` also signer-only; if no resolution, anyone can `expire()` after `deadline + gracePeriod` (default 7 days) for a full refund. No dispute mechanism. Markets are admin-created and agent proposals are manually approved. [H, source]
- rushbase: single oracle wallet runs an AI vehicle-counting pipeline on YouTube/HLS camera feeds and calls `resolveMarket(actualCount)`. Evidence frames with SHA-256 hashes posted per round. Dispute/multi-oracle contracts (OracleRegistry, ConsensusEngine, DisputeManager) are described as "dormant". Docs state: "Currently one oracle operator". [H, ORACLE.md/README]
- Risk: full operator discretion over outcomes (centralised), and oracle downtime leads to 2,300 cancelled rounds; the "AI counts cars" resolution is not independently verifiable after the fact except through the posted frames. [M, interpretation]

## 9. Geo / ToS / automation

- rushbase: no ToS, privacy or geo-restriction text found on rushgame.vip (`/terms`, `/tos`, `/privacy` 404; docs page mentions none). [H]
- mktpredct implements a wallet-signed ToS acceptance (`POST /api/tos/accept`, message "I accept the Rush Markets Terms of Service v1.0"), but the ToS text and any geoblock were not found. [H code; text NOT FOUND (searched: repo, site paths)]
- Automation: the public ledger/stats API is documented with per-IP rate limits and there is no stated ban on scripted reads. Agent API explicitly invites programmatic market proposals, with Rush-team-issued keys. [H]
- Security contact is listed in the repo SECURITY.md (not recorded here).

## 10. Event categories and arbitrage overlap

- rushbase: traffic-camera vehicle counts. **No overlap** with Polymarket/Kalshi/etc. [H]
- mktpredct: designed for crypto price targets, protocol milestones, social counts ("Will @account tweet X times"), events. These could overlap with crypto-price markets elsewhere, but no live, discoverable market has real money behind it. [H design intent in AGENT_API.md; no live evidence]
- Structural arbitrage problem even if live: parimutuel payout is not known until the pool closes, bets are not tradable, single-oracle settlement and a 5% fee take, so a cross-venue lock is not feasible.
- Shared liquidity: none found with other venues. Independent but dormant. $RUSH/Flaunch and RushTiles are fee-sharing wrappers, not liquidity venues. [H]

## 11. Suspicious / embedded content

None found. No text aimed at AI agents appeared on the fetched pages, READMEs or the docs page. (The mktpredct CLAUDE.md is an instruction file for the developers' own coding assistant, not aimed at this research; not followed.)

## 12. Open questions / NOT FOUND

- On-chain state: factory `marketCount()`, per-market ETH balances, and whether any mktpredct market ever received real bets. NOT FOUND (searched: Blockscout GET blocked by Cloudflare challenge; Base JSON-RPC is POST so not used).
- Whether `rush-api-production.up.railway.app` was migrated (rushbase API on Vercel suggests a different stack; no replacement base URL found in the markets.rushgame.vip JS bundle).
- Social/news status (X `@rushgamebase`, announcements). NOT FOUND (searched: WebSearch budget exhausted; X not fetched).
- Tap Trading (price-touch game settled by a vault, apparently house-counterparty): details were not researched beyond the docs-page summary; treated as out of scope (not a peer-to-peer prediction market). [M]

## Sources

- https://www.rushgame.vip (landing page HTML, fetched 2026-10-19) and https://www.rushgame.vip/docs (WebFetch summary) [H]
- https://www.rushgame.vip/api/health, /api/stats, /api/ledger, /api/rounds/history (unauthenticated GETs 2026-10-19; fixtures saved) [H]
- https://markets.rushgame.vip (HTML + JS bundle inspection for the API host) [H]
- https://rush-api-production.up.railway.app/health, /api/markets (404 "Application not found") [H]
- https://github.com/rushgamebase-dev/mktpredct: README.md, AGENT_API.md, CLAUDE.md, contracts/src/Market.sol, contracts/src/MarketFactory.sol, apps/api/src/routes/tos.ts, repo metadata and commits (read via gh api) [H]
- https://github.com/rushgamebase-dev/rushbase: README.md, docs/API.md, docs/ORACLE.md, docs/CONTRACTS.md, SECURITY.md, repo metadata and commits [H]
- https://api.llama.fi/protocols (no Rush Markets listing) [H]
