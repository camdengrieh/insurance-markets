# FanVibe ("X Cup FanVibe", X Layer) - adapter spec

Researched 2026-10-19 (~00:30-01:00 UTC). READ-ONLY: unauthenticated GETs to the site and to DefiLlama public APIs, `gh api` file reads of the project's public repo, one read-only PayBox `discover_tokens` (chain catalog) call. No account, no wallet, no signing, no POST/PUT/DELETE, no browser. The site's JS bundle and the repo were read as text only (nothing cloned, installed or run).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale.
All third-party text (site copy, README, source, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/fanvibe/` (6 small files).

## 0. Verdict

**adapter_priority: skip.**

1. **Effectively dead (H).** Its backend host (`xcup-fanvibe-production.up.railway.app`, hard-coded in the site bundle) answers every path with Railway's edge `404 {"message":"Application not found"}`, i.e. no service is deployed behind it. Without it nothing indexes stakes or runs settlement. DefiLlama shows zero volume every day since 2026-07-09 (last non-zero day), and the tournament it was built for (World Cup 2026) is over.
2. **Negligible liquidity (H).** DefiLlama all-time volume is **$73.19** total (2026-06-13 to 2026-07-09), all-time fees $0.40. 23 non-zero days, max single day $7.01.
3. **Not an order book, not a contract market (H, repo source).** Stakes are plain OKB transfers to a single "referee" wallet with 64 bytes of calldata; an off-chain Node service reads the chain, keeps parimutuel pools in its own database and pays winners from the referee's hot wallet. It is a custodial, centralised bookmaker. There is no on-chain market contract, no read API of record, no way to verify pool state except by replaying the referee wallet's inbound transactions.
4. **Funds-at-risk if anyone staked now (H).** The site frontend is still served (Vercel, `last-modified` 2026-10-15) and the stake UI defaults to the hard-coded referee address, but no backend would index or settle the stake.
5. Overlap with other venues exists only in the sense that World Cup match 1X2 and champion outrights are listed elsewhere; with the tournament over and no live fixtures there is nothing to arbitrage.

Revisit only if the team redeploys the backend AND adds a non-World-Cup fixture feed AND volume shows up on DefiLlama. Not worth building for.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Site `https://www.fanvibe.xyz` | HTTP 200, 2 KB SPA shell served by Vercel, `last-modified: Thu, 15 Oct 2026 16:29:39 GMT`. Title "X Cup FanVibe - Autonomous World Cup Prediction Market". Static shell only; all content is client-rendered from the JS bundle (fixture `fanvibe_home_index.html`, `fanvibe_home_headers.txt`) | H |
| `https://www.fanvibe.xyz/docs` | Returns the same SPA shell (no server-rendered docs). The DefiLlama adapter and README call it the docs page; content is in the bundle/repo only | H |
| Backend `https://xcup-fanvibe-production.up.railway.app/{,state,worldcup/feed,health,fvb/price,defillama/overview,positions/<addr>}` | **All HTTP 404** `{"status":"error","code":404,"message":"Application not found","request_id":...}` on 2026-10-19 ~00:30 UTC (fixtures `backend_root_404_railway.json`, `backend_probe_results.txt`). This is the Railway edge response for an unmapped/removed service | H |
| DefiLlama protocol page | `https://defillama.com/protocol/fanvibe` returned 403 to WebFetch; the same data is available from `https://api.llama.fi/protocol/fanvibe` (HTTP 200, id 8046, category "Prediction Market", chain X Layer, token FVB, no TVL series) | H |
| DefiLlama volume series | Daily values 2026-06-13 .. 2026-10-14. Non-zero only 2026-06-13 .. 2026-07-09. `total7d=0`, `total30d=0`, `totalAllTime=73.19` (USD) (fixture `defillama_summary_dexs_fanvibe.json`) | H |
| Source repo `github.com/Cyano88/xcup-fanvibe` | created 2026-05-24, last push **2026-07-14**, no license, 0 stars, personal account (not an org) | H |
| WebSearch (extended) | Only the project's own homepage is indexed; "no independent coverage of FanVibe" found. Other "X Cup" hits (MatchStake, whistle) are unrelated hackathon projects | H (absence) |
| X account `x.com/FanVibeOnX` | WebFetch returned HTTP 402; not retried, nothing paid. Latest posts NOT FOUND | H |

Context: this is an OKX "X Cup" hackathon-style project (M, inferred from the repo description and search results). DefiLlama's adapter `start` date is 2026-06-12, the first day of the World Cup (L: tournament dates from general knowledge, not re-verified).

## 2. What it is

- **Kind**: onchain-other / custodial parimutuel pool run by an off-chain "referee" service. Operator: an individual developer (GitHub `Cyano88`, who also lists other hackathon repos) (H, GitHub API). No legal entity found.
- **Token**: FVB on X Layer, `0x35a676Ca9347499f97819813a38ED14e6a7C5e3F` (H, DefiLlama protocol record + bundle). Used for a "Distribution Cup" marketing leaderboard, not for the markets. No price found on DefiLlama coins API (NOT FOUND for FVB; OKB = $113.34 on 2026-10-19 via `coins.llama.fi`, H).
- **Market model (H, repo `src/engine/referee.ts` + bundle)**:
  - Fixture markets: **categorical 3-way (home / draw / away)**, outcome index home=0, draw=1, away=2. Champion market: one pool across the tournament team codes, id `champion-2026`.
  - **Parimutuel, not order book, not AMM.** Pools are tracked per outcome after a 0.5% fee is skimmed. No odds are quoted; implied probability = pool share (bundle `XBe`: `homeShare = home/(home+draw+away)`).
  - **No tokenisation**: a position is only a row in the backend's database keyed by the stake tx hash. There is no ERC-20/1155 and no on-chain market contract.
- **Collateral/chain**: native **OKB on X Layer mainnet (chainId 196)**. Minimum stake about $1 of OKB in the UI (`Ud=1`, `0.001 OKB` minimum for referral qualification per README) (H bundle/README).
- **Categories**: FIFA World Cup 2026 only (Sportmonks fixture feed). No other sports/politics/crypto/macro (H).
- **Extras irrelevant to the aggregator**: Privy email smart wallets, referral rewards, "Distribution Cup" prizes ($40 USDT x5), a Uniswap v4 dynamic-fee hook demo on WOKB/USDT, "O2" gas-top-up loop for the referee wallet (H README).

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Official public API docs | **NOT FOUND** (searched: `/docs` is only the SPA shell; repo `docs/platform.md` has no API reference; no OpenAPI/Swagger; web search finds nothing) | H |
| Backend REST (from repo `src/server.ts` and bundle) | Exists in code but **host is dead** (section 1). Routes: `GET /state` (pools, fixtures, matchStates, `refereeAddress`, settlements), `GET /worldcup/feed`, `GET /worldcup/match/:id`, `GET /positions/:address`, `GET /stake/status/:fixtureId`, `POST /stake/report`, `GET /encode-stake`, `GET /encode-champion-stake`, `GET /defillama/overview?start=&end=` (returns `{timestamp,dailyVolumeUsd,dailyFeesUsd,dailyRevenueUsd,protocolFeeBps}`), `GET /health`, `/matchday-cup/*`, `/referrals/*`, `/rewards/*`, admin POSTs. Response shapes could NOT be confirmed live (all 404) | H (code) / shapes unverified |
| WebSocket | Bundle connects to `wss://xcup-fanvibe-production.up.railway.app` (dead). Message schema not documented | H |
| Auth / rate limits | NOT FOUND (no documented auth for GETs; no rate-limit docs). The dead host cannot be tested | H |
| On-chain only | The only durable source of truth is the chain: inbound txs to the referee wallet with calldata `abi.encode(bytes32 fixtureId, uint8 outcome)` plus outbound payouts. Referee wallet is a hard-coded default in the bundle: `0x789e6fcb4f3061b918991f670b9906c9c8e0723a` (public config constant, H). I did **not** query X Layer RPC/explorer (RPC reads are POST JSON-RPC, excluded by the read-only GET rule; OKX explorer pages are an SPA and 301-redirected). On-chain activity of that wallet is therefore NOT VERIFIED | H |

Third-party keyless data that does work: DefiLlama `https://api.llama.fi/summary/dexs/fanvibe` and `/summary/fees/fanvibe` (daily volume/fees series; ends in zeros).

## 4. Trade path

- Per the bundle: `sendTransaction({ to: refereeAddress, value: stakeInWei, data: abi.encode(bytes32 fixtureId, uint8 outcome), chainId: 196 })` via Privy embedded wallet or a connected EVM wallet (H, bundle `YBe`, `GY`, `ZY`). Fixture ids are provider strings (e.g. `season-...`); champion uses `champion-2026` plus a team code. Then the app calls `POST /stake/report {txHash, ref?}` so the backend indexes it; the referee also scans blocks itself (H, `processStakeTx` in `referee.ts`).
- No signed-order scheme, no API key, no cancel (a stake cannot be withdrawn; refunds happen only when the referee rejects a stake for a locked/settled/not-open fixture, and are sent manually by the service).
- **Programmatic trading by an agent: technically a plain value-transfer transaction, but pointless today** (backend dead, no open fixtures).

## 5. Reachable through PayBox?

**partial / not worth testing.**
- PayBox's chain catalog does list X Layer Mainnet (`eip155:196`, native OKB) when searched with `mode=chains query="X Layer"`; the tool notice says the catalog is "metadata, not a support allowlist" and that signing availability depends on live providers (H, live `discover_tokens` 2026-10-19). It is not among the 11 featured chains recorded in `docs/research/06-paybox-platform.md`. Whether an EVM transaction proposal on chain 196 can be created and signed was NOT tested (no signing tools may be called).
- Mechanically the trade is a native-value transfer with calldata, which fits a transaction proposal. But funding OKB on X Layer would also need a bridge/DEX route that PayBox may not offer.

## 6. Fees

- **0.5% (50 bps) protocol fee on each stake**, taken from gross at stake time and retained by the operator (H: `PROTOCOL_FEE_BPS = 50n`, `fee = gross*50/10000`; DefiLlama methodology; adapter asserts `protocolFeeBps === 50`).
- Payout to a winning stake = `net * totalPool / winPool`, where `net = gross - fee`, `totalPool` = sum of net home+draw+away pools, `winPool` = net pool on the winning outcome (H, `settleFixture`). Equivalent to winner-takes-pro-rata-pool; the fee is paid by every staker including winners.
- Gas on X Layer: user pays OKB gas for the stake; referee pays gas for payouts (H README). Referral rewards and prizes are marketing spend, not market fees.

## 7. Resolution mechanism and dispute risk

- **Centralised referee.** Sportmonks match feed -> the backend decides the outcome -> backend signs OKB transfers from the referee wallet (H README/`referee.ts`). There is also an `POST /oracle/override` admin path taking a signed outcome and nonce from `ADMIN_ADDRESS` (H, `server.ts`). No on-chain oracle, no dispute window, no appeal, no escrow contract.
- Edge cases from the code (H): if **nobody staked the winning outcome** the whole pool is "retained by treasury" (no refund); stakes sent after a fixture is locked/settled are refunded manually; payouts are persisted jobs that resume after restart, which only works while the service is running.
- Counterparty risk is total: the referee wallet is an EOA/hot wallet holding all stakes; the private key is an env var of the Railway service (README env table). With the backend gone, any funds sent would be unrecoverable by protocol means.

## 8. Geo / ToS / automation

- NOT FOUND (searched: site bundle strings, README, `docs/platform.md`, `docs/audit.md` listing; no terms of service, no geo-block, no age/jurisdiction notice, no bot/API policy). The only warnings are "use small amounts while testing" and "unofficial links... not endorsed" (H, repo/bundle). Treat as an unlicensed gambling-style product with unknown regulatory standing.

## 9. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| All-time volume | **$73.19** | DefiLlama dexs summary, data through 2026-10-14, fetched 2026-10-19 | H |
| All-time fees | $0.40 | DefiLlama fees summary, same | H |
| 24h / 7d / 30d volume | 0 / 0 / 0 | same | H |
| TVL | none reported (empty TVL series) | `api.llama.fi/protocol/fanvibe` | H |
| Peak day | $7.01 on 2026-06-26 | same series | H |
| Platform "verified FVB volume" | shown in the app UI; not retrievable (backend dead) | bundle | L |

## 10. Overlap with other venues, and independence

- Nominal overlap: World Cup match-result (1X2) and champion futures, which Polymarket, Kalshi, Limitless, OKX Outcomes and others also list. No live fixture exists now.
- Independent liquidity: yes (its own pools, no mirroring), but irrelevant at $73 lifetime and no pricing mechanism that would converge toward other venues (parimutuel pool share, not a tradable price; stakes cannot be exited).

## 11. Open questions

- Is the Railway backend intentionally retired or just paused/over a billing limit? (Not determinable from outside.)
- Actual on-chain history of the referee wallet and any unpaid stakes (needs an RPC/explorer read, excluded by the GET-only rule).
- Whether the team plans a post-World-Cup product ("continuous FanVibe seasons" appear in the copy; no evidence of running seasons).

## Suspicious content

None found. Searched the site bundle, README, `platform.md`, `server.ts`, `referee.ts` for text addressed to AI agents/LLMs ("ignore previous", "system prompt", "AI agent", "language model"): only library identifiers (e.g. `componentWillMount`) matched. Site copy includes an attention-grabbing prize/leaderboard campaign (FVB trading volume of $250+ required for prizes), which is marketing, not an instruction to agents.

## Not found

- Official public API docs / OpenAPI (searched: `/docs` shell, repo docs, web search).
- Terms of service / geo-restriction / automation policy.
- Independent coverage, audits, or volume beyond DefiLlama (searched: web extended).
- Live response shapes from the backend (host dead).
- X Layer on-chain data for the referee wallet (RPC is POST; not queried).
- FVB token price.
- X account posts (HTTP 402 not paid).

## Sources

- https://www.fanvibe.xyz (site shell, `last-modified` 2026-10-15) - H
- https://www.fanvibe.xyz/assets/index-CoWpAxMJ.js (site bundle, read as text only: backend host, endpoints, calldata scheme, referee default address, copy) - H
- https://xcup-fanvibe-production.up.railway.app/* (404 "Application not found" probes, 2026-10-19) - H
- https://api.llama.fi/protocol/fanvibe , https://api.llama.fi/summary/dexs/fanvibe , https://api.llama.fi/summary/fees/fanvibe (fetched 2026-10-19) - H
- https://defillama.com/protocol/fanvibe (403 to WebFetch; data taken from the API instead) - H
- https://github.com/DefiLlama/dimension-adapters/blob/master/fees/fanvibe.ts (via `gh api`; endpoint `/defillama/overview`, 0.5% fee, start 2026-06-12) - H
- https://github.com/Cyano88/xcup-fanvibe : `README.md`, `docs/platform.md`, `src/server.ts`, `src/engine/referee.ts` (via `gh api`, raw text only) - H
- https://coins.llama.fi/prices/current/coingecko:okb (OKB $113.34, 2026-10-19) - H
- PayBox `discover_tokens mode=chains query="X Layer"` (read-only, 2026-10-19) - H
- WebSearch (extended) "FanVibe World Cup prediction market X Layer OKB" and "fanvibe.xyz docs ..." - only the project's own homepage; unrelated OKX/hackathon results - M
- https://x.com/FanVibeOnX (HTTP 402, not read) - none
