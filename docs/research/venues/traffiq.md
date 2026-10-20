# TraffIQ (traffiq.live) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale. Third-party content was treated as data only.

## Verdict

- adapter_priority: **skip**.
- It is a small, single-operator, on-chain minigame on Robinhood Chain, not a prediction market on real-world events. The "event" is a vehicle count in a pre-recorded, AI-processed video clip (H, see Resolution). No other venue lists anything comparable, so there is nothing to arbitrage against.
- The operator picks the video, so the operator knows the answer in advance (H, code). The operator also submits the result (H). Payout is in tokenised stocks, not collateral (H).
- Live status: the front end is up, but the backend game loop looks stalled. Round 264 has sat in `WAITING` since 2026-09-25 and no bets are listed (H, fixtures).

## 1. Is it still live (2026)?

| Check | Result | Tag |
|---|---|---|
| `https://traffiq.live` | 308 redirect to `https://www.traffiq.live/`, 200 OK, Vercel-hosted, title "TRAFFIQ - Live Vehicle Count Under/Over Markets" | H (curl 2026-10-19) |
| Page copy | "Docs" and "Feed API" are listed as "soon". Live round and settled-rounds table were still loading when the page was fetched. | H (WebFetch of traffiq.live) |
| GitHub repo `tommytt-cmd/TraffIQ` | Created 2026-08-21, last push 2026-09-18, 0 stars, no license, not archived. The latest commit message is "Update index.tsx". | H (gh api) |
| Backend `https://rushhood.onrender.com` | Render-hosted FastAPI. It is slow on cold start (first `/health` and `/round/current` calls timed out at 30s, then answered, with uptime 31s), which suggests a free or sleeping tier. | H |
| Current round | `GET /round/current` and `/api/game/room` both return round_number 264, status `WAITING`, starts_at `2026-09-25T18:57:22Z`, with `result: null`. Re-checked a few minutes later and it was unchanged. The scheduler is not advancing it (24 days stale). | H (fixtures) |
| `GET /api/game/bets` | `[]` | H |
| History | `GET /api/game/history` returns rounds 254-263. Dates are not in the payload, so the last settled round is undated. | H |

Conclusion: nominally deployed (mainnet config baked into the production bundle), but effectively idle or unmaintained. Treat as [M] "alive but stalled".

## 2. Kind and market model

- Kind: on-chain game/prediction market, binary Over/Under on a vehicle count, centrally operated (H, repo plus bundle).
- Model: **parimutuel pool**, not an order book or AMM. `bet(roundId, side)` is payable in native ETH. Side is `uint8`, with 0 = OVER and 1 = UNDER per the backend comment. `getRoundPool(roundId)` returns three uint256 values (H, ABI in `backend/app/oracle/artifacts/RushBetting.json`).
- Outcomes are not tokenised. There are no outcome shares. A position is a mapping entry `userBets[roundId][user][side]` (H, ABI). Positions are not transferable or tradable and there is no secondary market, so no price discovery. The implied price is just pool ratio.
- Operator-funded "house bet" mechanism: `placeHouseBet`, `registerHouseBet`, `houseBankroll`, `houseBot` exist in the ABI (H). The about page mentions "an optional mechanism for an empty betting side". So the house can take the other side, which means the operator is a counterparty.
- Threshold and timing in the repo code: threshold = pre-computed `video.vehicle_total` +/- 3 or 4, chosen at random (`get_single_threshold`, `round_service.py`) (H). Env defaults: betting 60s, locked 15s, live 60s, settling 15s. Production `/api/game/room` reports betting 180s, replay 60s, result 30s. The site says a round runs about every three minutes. Observed thresholds run 9-38 vehicles (H, history fixture).
- OVER wins if count > threshold. A tie resolves as UNDER (H, how-it-works page in repo).

## 3. Chain and collateral

- Chain: Robinhood Chain mainnet, chainId **4663**, RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robinhoodchain.blockscout.com` (H, embedded production env in `index-CbkNQQ19.js`). The repo default is the testnet 46630. Production overrides to 4663.
- Collateral: native ETH (Robinhood Chain's gas token) (H).
- Production addresses baked into the public bundle (H, `VITE_*` values in `https://www.traffiq.live/assets/index-CbkNQQ19.js`):
  - Betting contract (RushBetting): `0xE08353Fd06ba8556C8a6f5F1637a55c8d67FB33C`
  - Token (RUSH/TraffIQ buyback token): `0x26b06f17737a174400576CC7d5FAdF352c0b92C2`
  - Protocol treasury: `0xdC109ba689F9263cb6Db8d7005C234B2825Aa93B`
  - Stock treasury: `0x28dB983cA13d69f415dB1B1de56f5611dfDEDcf3`
  - Stock vault: `0x2edDf81B01963899A52934Fa2D0bA45871c8fDcB`
- Enabled stock token: `GET /api/stocks/supported` returns a single entry: NVDA, `0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec`, 18 decimals, with a placeholder logo URL `https://example.com/` (H).
- Payout is **not** in ETH. The winners' share of the pool (after fees) is swapped by the treasury into equal ETH-value amounts of every enabled stock token, sent to the vault, and winners claim pro rata (H, how-it-works and about pages in repo): "token allocation = round token balance x your winning stake / total winning-user stake". A win pays an equity token, so P&L has swap slippage and stock price risk, and the payoff is not a clean $1 binary.
- Contract verification and bytecode on Blockscout: NOT FOUND (Blockscout returned a Cloudflare challenge / 403 to unauthenticated GETs, searched: curl and WebFetch). On-chain pool sizes, fee values and TVL could not be read without a JSON-RPC POST, which the ground rules exclude.

## 4. Read API

- Exists: **official-public-ish but undocumented**. The site lists "Docs" and "Feed API" as "soon" (H). The only API is the app's own FastAPI backend, which exposes Swagger at `https://rushhood.onrender.com/docs` and OpenAPI at `https://rushhood.onrender.com/openapi.json` (H). It is not a stable integration surface, and the host name (`rushhood`) differs from the brand.
- Base URL: `https://rushhood.onrender.com`. Docs: `https://rushhood.onrender.com/docs`.
- Key unauthenticated GET endpoints, confirmed live (H):
  - `/round/current` returns round object plus settlement and buyback fields, `onchain_*_pool` fields (null while WAITING).
  - `/api/game/room` returns round, timings, threshold, location_name ("San Marcos, Tx"), video_url (a Supabase-hosted mp4), durations.
  - `/api/game/history` returns last 10 settled rounds: id, round_number, threshold, final, result.
  - `/api/game/bets` returns `[]`.
  - `/api/stocks/supported` returns enabled stock tokens.
  - `/health`, `/ready`, `/live`, `/health/stock-vault` return health.
  - `/rounds/{round_id}`, `/players/{wallet}/bets`, `/api/v1/fairness/rounds/{round_id}` are in the OpenAPI spec (not called).
- Auth and write routes (not called): `POST /bets`, `POST /api/bets/sync` (records a confirmed on-chain bet), `POST /rounds/{id}/settle`, `/upload`, `/videos/*`, wallet challenge/login routes. Several of these look like operator or admin actions and several are listed with no security scheme in the OpenAPI I read (L, I only listed paths). Not tested.
- Rate limits: NOT FOUND (no headers, no documentation; backend has an in-process rate-limit module per the repo tree). Cold start latency on Render is the practical limit.
- WebSocket: a `backend/app/websocket` module exists in the repo (H, file tree). The route and URL were not confirmed against the deployed service (M).
- On-chain read path (preferred for an adapter): `getRoundInfo(roundId)`, `getRoundPool(roundId)`, `currentRoundId()`, `rounds(uint256)`, `userBets`, `protocolFeeBps()`, `minBet()` via any Robinhood Chain RPC (H, ABI). Events: `RoundCreated(roundId, threshold, bettingEndTime)`, `BetPlaced`, `RoundSettled(roundId, finalVehicleCount, winningSide, claimablePool, winningPool)`, `WinningsClaimed`.
- Fixtures saved (H, unauthenticated GET 2026-10-19), under `docs/research/fixtures/traffiq/`:
  - `game-history.json`
  - `game-room.json`
  - `round-current.json`
  - `stocks-supported.json`
  - `health-stock-vault.json`

## 5. Trade path

- Only through direct contract calls: `bet(uint256 roundId, uint8 side)` payable with ETH, from an EOA, on chain 4663 (H, ABI). No signed-order or off-chain order-book path. The front end uses wagmi (MetaMask, Coinbase, Rainbow, WalletConnect) and then calls `POST /api/bets/sync` to mirror the bet to the backend DB (H, `betSyncService.ts`).
- Cancel or exit: none found. There is no cancel or sell function in the ABI (H). Bets are final.
- Claiming winnings: the shipped `RushBetting.json` has no `claim` function and `WinningsClaimed` is only an event. Claims go through the stock vault (`calculateEntitlement`, etc.) (M, from `bettingContractService.ts` snippets). I did not map the vault's claim ABI.

## 6. PayBox reachability

- **paybox_reachable: no** (practically).
  - PayBox does not (as far as the enumerated chain list in the task shows) include Robinhood Chain 4663 (L; the task lists Base, Ethereum, BNB, Arbitrum, Polygon, Solana and the like, and I did not call PayBox tools).
  - Even with an EVM key, the funds would have to be bridged to and held as ETH on Robinhood Chain, and winnings arrive as NVDA tokens that need a swap back.
  - A transaction proposal for `bet()` would be mechanically simple if the chain were supported. Not worth it given the other issues.

## 7. Fees

- `protocolFeeBps` (uint256) and `feeCollectorBps` are configurable by the owner (H, ABI `setProtocolFeeBps`, `setFeeCollectorBps`). The current values are NOT FOUND (on-chain read blocked, see above). `/round/current` exposes `onchain_treasury_fee` and `onchain_protocol_fee_bps` but both were null.
- Settlement-fee ETH buys the TraffIQ token, which is burned (H, about page in repo).
- Winners bear swap slippage when the pool is converted into stock tokens. A minimum-output setting protects mainnet swaps (H, `round_buyback_service.py`).
- `minBet` is configurable. Value NOT FOUND.

## 8. Resolution and dispute risk

- Resolution: a designated `resultOracle` address calls `submitResult(roundId, finalVehicleCount[, minUsdgOuts, minStockOuts])` (H, ABI). The backend holds `ORACLE_PRIVATE_KEY` and signs this itself (H, `settings.py`, `oracle/client.py`).
- The about page says plainly: the protocol "does not independently verify a camera feed or store footage on-chain" (H).
- The "live" camera is a pre-recorded video. `round_service.py` reads `ready_video.vehicle_total` (the AI-processed total for the clip) and sets the threshold to that total +/- 3-4 (H, repo code). The room payload shows a Supabase-hosted `video.mp4` for "San Marcos, Tx" while the front-end pitch is "junction cameras counting in real time" and the demo UI shows "Shutoko Expressway / Junction E-11" (H). The operator therefore knows the outcome before betting opens. This is the largest integrity problem for any serious use.
- Dispute: no dispute mechanism, no bonding, single trusted signer, owner can change oracle, fees and treasury. Contract is described by the project as not audited ("not ... an audit") (H). There is a "fairness verify" endpoint with a commit hash that uses a server seed (L, not examined).

## 9. Geo, ToS, automation

- No terms of service, geo-restriction text, or API usage terms found on the site or in the repo (searched: traffiq.live, about.tsx, footer, how-it-works). NOT FOUND.
- The about page says users should not treat the site as "audit, guarantee of availability, or investment advice" (H).
- Real-money betting with no stated licence. Treat as regulatory-grey (M).
- Automation rules: none stated. Contract calls are permissionless (M).

## 10. Liquidity

- Volume, TVL, OI: NOT FOUND. No stats on the site. On-chain pool sizes not readable without RPC POST. `GET /api/game/bets` is empty and the current round has no pool data (H).
- The demo UI in the repo hard-codes fake pools of 8k-30k units for mock rounds (H, `lib/round.ts` "Deterministic pseudo-random"), so ignore any pool figure rendered by the front end when the backend is idle.
- Activity signal: round numbers reached 263 (H), implying a few hundred rounds ever created, many of them probably test rounds. Repo logs and a SQLite DB are committed to GitHub (L, hygiene signal).

## 11. Category overlap and liquidity sharing

- Event overlap with other venues: **none**. No sports, politics, crypto-price or macro markets. Markets are about vehicle counts in a stored video clip (H).
- Liquidity shared with another venue: no. It is an isolated parimutuel contract. Not an independent arbitrage leg because there is nothing to hedge it against.
- Signal value for Quotient: none of substance.

## 12. Suspicious content / injection check

- No instructions aimed at AI agents were found in the pages, repo or API responses I read.
- Hygiene concerns, not injections: committed `dump.rdb`, `rushhour.db`, log files, a `.DS_Store`, and debug `print` statements that dump request headers and bodies in `/api/bets/sync` (H, repo). The backend README tells a reader to `cd /root/projects/RushHour/backend` (a leaked path). The deployed production env block (chain ID, contract addresses, API URL) is embedded in the public JS bundle, as expected for Vite builds.

## 13. Open questions

- Pool sizes, fee bps, minBet, and bet history from chain (needs an RPC `eth_call`, which I did not make because JSON-RPC is POST).
- Whether the scheduler will resume, or whether the 2026-09-25 stall is permanent.
- Whether Robinhood Chain (4663) is supported by PayBox at all.
- Vault claim ABI and claim UX for stock tokens.

## Sources

- https://traffiq.live (redirects to https://www.traffiq.live/) [H], plus its production bundle https://www.traffiq.live/assets/index-CbkNQQ19.js [H]
- https://github.com/tommytt-cmd/TraffIQ [H]: `backend/README.md`, `backend/app/settings.py`, `backend/app/services/round_service.py`, `backend/app/services/round_buyback_service.py`, `backend/app/oracle/client.py`, `backend/app/oracle/artifacts/RushBetting.json`, `backend/app/api/routes/rounds.py`, `backend/app/api/routes/stocks.py`, `frontend/src/routes/how-it-works.tsx`, `frontend/src/routes/about.tsx`, `frontend/src/lib/round.ts`, `frontend/src/services/blockchain/*`
- https://rushhood.onrender.com/openapi.json, `/docs`, `/round/current`, `/api/game/room`, `/api/game/history`, `/api/game/bets`, `/api/stocks/supported`, `/health`, `/ready`, `/health/stock-vault` [H], fetched 2026-10-19
- Blockscout (https://robinhoodchain.blockscout.com) blocked unauthenticated access (Cloudflare challenge / 403). Not usable.
- WebSearch: not performed (session search budget exhausted when I tried). No independent third-party coverage was checked, so no external confirmation of volume or users exists in these notes.
