# Fibo (fibo.fun) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: page reads, `gh api` file reads, unauthenticated GETs (api.llama.fi, sourcify.dev, the project's own static site and JS chunks read as text), web search. No account, wallet, key, signature, POST/PUT/DELETE (so no JSON-RPC `eth_call` / `eth_getLogs`), no PayBox tool call (repo note `docs/research/06-paybox-platform.md` used for PayBox facts), no browser automation, no third-party code cloned, installed or run. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`. All third-party text is untrusted data; nothing in it was followed.

Tags: **H** = read first-hand this session in a primary source (URL cited); **M** = secondary source or my inference; **L** = weak/stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.
Fixtures: `docs/research/fixtures/fibo/` (7 files, all <= 38 KB).

## 0. Verdict

- **Kind:** on-chain, USDC-collateralised, **pari-mutuel binary UP/DOWN rounds on one Pyth price feed (ETH/USD)** on Base. Not an order book, not an AMM, no outcome tokens. A round is a ~100 s betting window followed by a ~20 s measurement window (section 2). (H, verified contract source)
- **Live?** **Dormant / most likely abandoned after a one-week soft launch.** Contract deployed 2026-06-16; DefiLlama shows volume only on 2026-06-20..2026-06-26 (total $14,502) and zero afterwards; Basescan shows the market contract's last transaction at 2026-06-28 12:14:15 (113 days before today); the treasury EOA's last transaction is 2026-06-26. The marketing site and app shell still return HTTP 200, but the project API host `api.fibo.fun` does not accept connections, the Telegram channel has 1 subscriber, and the app HTML is a ~116-day-old cache entry. Not provably shut down; no sign of trading in 3.5 months. (H for each datum, M for the conclusion)
- **No docs, no public API, no ToS.** The only machine-readable surface is the verified contract (excellent) and an undocumented first-party REST/WebSocket API that is currently unreachable.
- **adapter_priority: skip.** Dead-looking, lifetime volume about $14.5k, one 20-second ETH direction product with a different oracle and horizon from anything on the major venues (no arbitrage leg), owner-controlled fee/oracle/upgrade/late-bettor levers, no API. If it revives, an on-chain-only adapter is trivial because the contract is verified, but that is not worth building now.

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| DefiLlama lists "Fibo", id 8118, category Prediction Market, chain Base, oracle Pyth, description "Fibo is a prediction game on Base chain." | H | https://api.llama.fi/protocol/fibo (`fixtures/fibo/defillama_protocol_fibo_2026-10-19.json`) |
| DefiLlama volume series 2026-06-17..2026-07-14: non-zero only 06-20 $394, 06-21 $1,190, 06-22 $2,509, 06-23 $3,753, 06-24 $2,744, 06-25 $2,935, 06-26 $977; all zero 06-27..07-14; `totalAllTime` $14,502; `total24h` null; chart stops 2026-07-14 (adapter stale or API unreachable). | H | https://api.llama.fi/summary/dexs/fibo (`defillama_summary_dexs_fibo_2026-10-19.json`) |
| DefiLlama fees: $647.86 all time, same seven days. Fee/volume: 0.97% (06-20), 1.34% (06-21), then 4.82-4.91% daily from 06-22. | H (data), M (ratio is mine) | https://api.llama.fi/summary/fees/fibo (`defillama_summary_fees_fibo_2026-10-19.json`) |
| Market proxy `0x2ddFbB97f2fb00E3BFf66CE42863d831861BB57B` (Base): 27,017 transactions in total, latest 2026-06-28 12:14:15; USDC balance 13.983172; ETH 0; verified on Sourcify 2026-06-16. Figures extracted by a summarising fetch of the Basescan page; the page's relative-age strings were internally inconsistent so I used the absolute timestamps. | H (moderate: summariser) | https://basescan.org/address/0x2ddFbB97f2fb00E3BFf66CE42863d831861BB57B |
| Treasury `0x511006a8...7add` looks like an EOA (98 txs, latest 2026-06-26 05:40:57, 0.00096 ETH). | H (moderate: summariser) | https://basescan.org/address/0x511006a8d7ee0ddd26d7b33e1175731643257add |
| `api.fibo.fun` resolves (A 178.156.132.204 via 1.1.1.1) but TCP 443 times out from this host and a second vantage got ECONNREFUSED; port 80 refused. Cannot confirm any API response. | H | `dig`, `nc`, `curl -m 15`, WebFetch, 2026-10-19 |
| Marketing site https://fibo.fun and app https://app.fibo.fun return 200. App response header `age: 10068919` (~116 days) with `cache-status: Netlify Durable hit`, i.e. it is a stale static cache of a June build, and the app "Arena" shell renders only "Loading...". Landing says "Live on Base Mainnet / Season 1 Open", ticker "SEASON 1 LAUNCHING", Season 1 "Starts: Soon", footer "(c) 2026 fibo.fun". | H | https://fibo.fun , https://app.fibo.fun |
| Telegram `t.me/s/fibofuncommunity`: public channel, 1 subscriber, two posts ("Channel created", Collab.Land verification notice); no dates shown. | H (summariser) | https://t.me/s/fibofuncommunity |
| X `x.com/fibodotfun`: WebFetch returned HTTP 402 (X-side wall, no payment requirements captured, stopped). Account state unknown. | H (for the 402) | https://x.com/fibodotfun |
| DefiLlama adapter: first PR #7773 opened 2026-06-22 (closed unmerged), re-done and merged by a DefiLlama maintainer as #7894 on 2026-06-30; adapter `start: 2026-06-16`. | H | https://github.com/DefiLlama/dimension-adapters/pull/7773 ; commit "Add Fibo (#7894)" 2026-06-30 |

Team footprint (M): the adapter PR author's fork and the brand-asset repo sit in GitHub org `Vestra-one`, whose other public repo ("core", last push 2026-02-16) is a NEAR payroll product; `fibo-brand-assets` and the fork were last pushed 2026-06-22. https://github.com/Vestra-one

## 2. Market model

- **Pari-mutuel binary UP/DOWN.** Bettors stake USDC on UP or DOWN in a numbered round ("epoch"); winners split the pool pro rata to stake after the fee. No order book, no AMM, no transferable position token: the position is a row `bets[epoch][address] = {side, amount, claimed}` inside the market contract. A wallet may only hold one side per round (`OppositeSideAlreadyBet`) but can add to it. (H, verified source)
  Source: https://sourcify.dev/server/v2/contract/8453/0xaA00CD3e6456FB500781a87705Dd67F48B72be39 (`BinaryPredictionMarketUSDC`, solc 0.8.24, exact match, verified 2026-06-22).
- **Timing (initial config, H from deployment calldata):** `roundDuration` 120 s, `lockOffset` 20 s. Betting runs `startAt` to `lockAt = startAt + 100 s`; the **lock price** is the Pyth price at exactly `lockAt`; the **close price** is the Pyth price at exactly `closeAt = startAt + 120 s`. The next round's `startAt` is the previous round's `lockAt`, so a new epoch opens about every 100 s and rounds overlap. Net effect: bettors do not know the strike when they bet, and the outcome is the ETH/USD direction over the 20 s after betting closes. (H for the code; the current config could have been changed by the owner, not read.)
- **Outcome rule:** close > lock = UP; close < lock = DOWN; **equal = Tie, and the whole pool goes to the treasury with no user claims** (`treasuryAccrued += pool`). No bets or a one-sided pool (one side zero) = round cancelled, stakes refunded in full, no fee. (H)
- **Implied odds:** payout multiple for side S = `(pool * (1 - feeBps/10000)) / totalS`, known only at lock. There is no cash-out and no secondary market, so "price" = pool ratio at lock. Not a tradeable quote.
- **Limits:** `minBet` 1 USDC initially (raw 1000000, 6 decimals), per-wallet and per-round pool caps initially 0 = unlimited; owner can change them. App UI defaults: min play 1 USDC, session cap 200 USDC, quick chips 1/5/25. (H for initial config and for env defaults in the client JS; current values NOT read)
- **Markets offered:** exactly one market, "ETH-USD" (symbol ETHUSD, Pyth feed id `0xff61491a...fd0ace`). The landing page lists BTC as "Coming Soon" and a "Season 1 Grand Prix / SOL Championship" ticker with no launch. (H)
- **Marketing vs contract contradiction:** the landing page says "Stake your ETH", "<5-min rounds", payout "1.9x", "$2.84M total pool", "$18.4M live volume", leaderboard all "+$0". The verified contract, DefiLlama methodology and the app code say USDC collateral and 120 s rounds, and DefiLlama shows $14.5k lifetime. Treat all landing-page numbers as placeholder (L); trust the contract. (H for both sides of the contradiction)

## 3. Chains and collateral

- **Base mainnet (chain 8453), collateral native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`** (6 decimals). Gas in ETH on Base; Pyth update fees are paid in ETH by whoever calls the round-transition functions (the `msg.value` surplus is refunded). (H)
- Market proxy (ERC-1967 / UUPS) `0x2ddFbB97f2fb00E3BFf66CE42863d831861BB57B`; implementation `0xaA00CD3e6456FB500781a87705Dd67F48B72be39`; Pyth contract (Base) `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a`; deployer `0x0f88f66A...Fa50`; initial owner `0x15dea525...58a55ef` (EOA vs multisig NOT checked); treasury `0x511006a8...7add`. Deploy tx `0x457a3381...34572` block 47428431. (H, decoded from Sourcify creation bytecode: `fixtures/fibo/decoded_initialize_args_2026-10-19.json`)
- The front end can also be pointed at a custom "battle chain" via env vars (a dev/localnet hook named "Vestra Localnet"); default is Base. No production deployment elsewhere found. (H, client JS)

## 4. Read API

- **exists: onchain-or-subgraph-only** (plus an undocumented, currently unreachable first-party API).
- **On-chain (public, free, no auth):** the market ABI is on Sourcify (`fixtures/fibo/sourcify_impl_BinaryPredictionMarketUSDC_abi_2026-10-19.json`). View functions: `getCurrentEpoch()`, `getMarketState()` (betting / settlement / latest-created epoch), `getRound(epoch)` (startAt, lockAt, closeAt, lockPrice, closePrice, totalUp, totalDown, totalPool, feeAmount, feeBpsSnapshot, status, result, cancelReason, distributable, winningSideTotal), `canBet(epoch)`, `marketConfig()`, `getBetInfo(epoch,user)`, `claimable(user,epoch)`, `previewPayout(epoch,user)`, `treasuryAccrued`, `bettingPaused`, `owner()`, `priceId()`, `collateral()`, `pyth()`. Events for indexing: `RoundCreated`, `BetPlaced(epoch idx, user idx, side, amount)`, `RoundLocked`, `RoundSettled(epoch, result, closePrice, fee, closeAt)`, `RoundCancelled`, `Claimed`, `Refunded`, `ConfigUpdated`, `Upgraded`. All reads need JSON-RPC (POST), which this research did not use; no subgraph, no Dune dashboard found. (H for ABI; M that no subgraph exists)
- **Undocumented first-party API (observed only in the app's static JS, H for strings, NOT confirmed live):** base `https://api.fibo.fun/api/pulse`; `GET /markets?size=100`, `GET /markets/{marketAddress}/live?pendingSize=`, `GET /markets/{marketAddress}/active-round`, `GET /hermes/price-at/{unix}?feedId=`, `GET /users/{address}/dashboard|profile|round-payouts|activity`, `GET /defillama/daily?start=&end=` (used by DefiLlama adapters; returns `dailyVolumeUsdc`, `dailyFeesUsdc`, `dailyRevenueUsdc`, ...), `WS wss://api.fibo.fun/ws/pulse/markets/{marketAddress}/activity`; Privy-JWT-authenticated `POST /og/claim`, `POST|PATCH /users/profile`; a `POST /faucet/drip` string also exists (purpose unread, not called). Full list: `fixtures/fibo/app_client_api_routes_2026-10-19.json`. **No response shape could be confirmed**: `api.fibo.fun:443` does not accept TCP from here. No docs, no OpenAPI, no stated rate limits. Reference prices come from Pyth Hermes (`https://hermes.pyth.network/v2/updates/price/stream`, public).
- docs URL: NOT FOUND (searched: fibo.fun and app.fibo.fun `/docs`, `/terms`, `/privacy`, `/robots.txt` (fibo.fun serves its landing page for every path via a catch-all rewrite, identical md5; app.fibo.fun returns 404), the landing page links, GitHub org `Vestra-one`, web search "fibo.fun" / "fibodotfun").

## 5. Trade path

- **No off-chain order flow.** Anyone can call the contract directly from any EVM account on Base: `USDC.approve(market, amount)`, then `betUp(epoch, amount)` or `betDown(epoch, amount)` where `epoch` must satisfy `canBet(epoch)` (between `currentEpoch` and `latestCreatedEpoch`, round Open, before `lockAt`, and before the optional public cutoff), then after settlement `claim(uint256[] epochs)` (max 256 per tx; also used to collect refunds for cancelled rounds). (H, verified source)
- **Keepers:** `executeRoundLockAndAdvance(bytes[] pythUpdates)` and `executeRoundTransition(bytes[] lockUpdates, bytes[] closeUpdates)` are permissionless but require Pyth update data whose `publishTime` equals `lockAt` / `closeAt` exactly; ETH for the Pyth fee is sent as `msg.value`. Fibo's own keeper stopped (no txs since 2026-06-28), so any open round is stuck until someone calls them or the owner cancels. (H code, M inference on the keeper)
- **The app's own path** is a Privy embedded/smart wallet with ERC-4337 gas sponsorship via a third-party bundler/paymaster on Base (client JS). That path is not available to an external signer. A third-party bundler API key is embedded in the public JS; I did not copy or use it. (H)
- **Programmatic trading API / signed orders: none.**

## 6. PayBox reachability

- **paybox_reachable: partial.** Base (8453) and USDC are in PayBox's chain catalog (live `discover_tokens mode=chains` on 2026-10-19 per `docs/research/06-paybox-platform.md`), and the plugin `io.paybox/transactionProposal` `evm` kind accepts any single `{to, value, data}` call, so `approve`, `betUp/betDown` and `claim` are each expressible as one proposal. The EOA pays gas in ETH on Base (no paymaster path for plugin proposals). Practical blockers: (a) a ~100 s betting window per epoch versus human approval latency and the 10 s plugin sandbox, (b) the market is dormant with no keeper, (c) PayBox shows raw calldata only. (H for the cited PayBox facts as recorded in the repo note; M for the conclusion)

## 7. Fees

- **Formula (H, source):** at settlement of a decided round `fee = totalPool * feeBpsSnapshot / 10_000`; `distributable = totalPool - fee`; each winner receives `distributable * stake / winningSideTotal`; fee accrues to `treasuryAccrued` and is withdrawable by the owner to the treasury. Rounding dust also goes to the treasury. The fee is effectively borne by winners (it reduces the pot). No fee on cancelled/refunded rounds; **Tie = 100% of pool to treasury**. `feeBps` is snapshotted at round creation, owner-settable, **hard cap `MAX_FEE_BPS` = 2000 (20%)**.
- **Initial `feeBps` = 100 (1%)** (H, deployment calldata). **Current value NOT read.** DefiLlama's fee/volume ratio jumps from ~1% on 2026-06-20/21 to ~4.8-4.9% from 2026-06-22, which is consistent with the owner raising it to about 500 bps (5%) around 2026-06-21/22; the landing page's "1.9x" payout also equals 2 x (1 - 5%). (M inference)
- Gas: ETH on Base for approve/bet/claim (EOA path). No deposit/withdraw fee in the contract; there is an app "Withdraw" page whose mechanics were not read.

## 8. Resolution and dispute risk

- **Mechanism:** Pyth Network price feed read through `parsePriceFeedUpdates(updateData, [priceId], t, t)` at exactly `lockAt` and `closeAt` (the contract rejects non-positive prices and any `publishTime != target`). Anyone can submit the signed Hermes update. The landing "Fairness & Trust" page says oracle = Pyth, "No human intervention after a round starts", "funds are held in escrow by the contract"; no addresses, fees, feed ids or admin powers are stated there. (H)
- **No dispute process.** Stale oracle: round stays Locked until the **owner** calls `cancelRoundOracleStale` after `oracleCancelGrace` (3600 s initially), which refunds stakes. (H)
- **Owner/admin levers (single `owner`, UUPS upgradeable) (H, source):** `upgradeToAndCall` (can replace all logic), `setPyth` (can repoint the oracle contract to any address, with the same `priceId`), `setFeeBps` (<= 20%), `pause`, `setMinBet`, caps, timing, `cancelRoundByAdmin` (any Open/Locked round once `closeAt` has passed, i.e. after the close price is knowable), `withdrawTreasury`, session mode. **`setPublicBetCutoff` + `setLateBettor(s)`: the owner can whitelist addresses to bet after the public cutoff, with no event emitted ("intentionally not logged")**; a privileged late-bettor can bet with knowledge of the price drift before lock, so default-off (cutoff 0) but a real insider-edge vector. `renounceOwnership` is disabled. Whether the owner is an EOA or a multisig/timelock was not checked. No audit (DefiLlama `audits: "0"`; none linked).
- Dispute risk vs other venues: low for price truth (signed Pyth data), high for governance/rug risk. Pyth vs the Chainlink-based resolution I recall for Polymarket's 5/15-minute crypto markets (M, from background knowledge, not verified this session) would differ at the margin.

## 9. Geo / ToS / automation

- **NOT FOUND (searched: fibo.fun and app.fibo.fun `/terms`, `/privacy`, `/docs`, page text and links, landing/app HTML, "Fairness & Trust" page).** No terms, no restricted-jurisdiction list, no API/automation policy. `fibo.fun/*` returns the landing page for every path; `app.fibo.fun/terms` and `/privacy` return 404.
- Contract is permissionless: no allowlist on `betUp/betDown` unless the owner enables the late-bettor window. The app gates users with Privy login, an "OG founder" invite-code flow and an "Elite Access Only" Season 1. Unclear whether a US-person or other geo restriction applies; unknown.

## 10. Liquidity

- Lifetime volume **$14,502** (7 active days, peak $3,753 on 2026-06-23; ~$2.1k/day on active days); fees $647.86; both from DefiLlama, data to 2026-07-14, zero after 2026-06-26 (H, https://api.llama.fi/summary/dexs/fibo and /fees/fibo, fetched 2026-10-19).
- Market contract USDC balance **$13.98**, 27,017 total transactions (includes keeper transitions) as of the Basescan page read 2026-10-19 (H, moderate). DefiLlama reports no TVL (methodology: "TVL is not applicable (2-minute rounds)"), no open interest.
- Landing-page "Total Pool $2.84M", "Live Volume $18.4M", "Pool $1.2M / 187 players" are not backed by any on-chain or DefiLlama data (L; treat as placeholders).

## 11. Event coverage and overlap

- Only **ETH/USD short-horizon direction** (a 20 s window after a 100 s betting period). Nearest analogues elsewhere: "ETH Up or Down 5m / 15m" crypto markets on Polymarket and others (the parallel workflow covers those venues). Overlap in subject, but different horizon (20 s vs 5 min+), different strike mechanics (strike unknown at bet time), different oracle (Pyth), no exit, and a pari-mutuel payout that is unknowable until lock. No sports, politics, macro. So **no clean arbitrage leg**; at most a weak signal of retail ETH sentiment (pool split), and it is dormant. (H for Fibo side, M for the comparison)

## 12. Shared liquidity

None: self-contained pool inside its own contract. It is not an independent arbitrage leg only because of the product mismatch above, not because of shared liquidity. (H)

## 13. Adapter priority

**skip.** Reasons: dormant since 2026-06-28; lifetime volume about $14.5k; one ETH 20-second product that cannot be hedged against any listed market; no docs/API/ToS; heavy owner discretion (upgrade, oracle repoint, fee up to 20%, admin-cancel after close, silent late-bettor whitelist); ties go entirely to the treasury. Revisit only if on-chain activity resumes (check `getMarketState()` / DefiLlama daily volume) and a venue-agnostic "short-horizon crypto direction" family is added to the linking layer.

## 14. Open questions

1. Current `feeBps`, `minBet`, caps, `publicBetCutoff` and `owner` type (needs `eth_call`, a POST; not done).
2. Is `api.fibo.fun` down, or only blocking this network? (TCP 443 times out, port 80 refused.)
3. Did Season 1 or the BTC market ever launch? (No on-chain evidence.)
4. Was the 2026-06-22 fee jump a `setFeeBps` call? (Needs `ConfigUpdated` logs.)
5. Why does the DefiLlama chart end 2026-07-14 (adapter failing on the dead API vs no data)?

## 15. Suspicious content

- No text aimed at AI agents found on fibo.fun, app.fibo.fun, the Fairness & Trust page, the JS chunks, DefiLlama responses or the Telegram preview.
- Observation: the public JS bundle embeds a third-party bundler/paymaster API key and a Privy app id; I did not copy, record or use them.

## Sources

- https://fibo.fun (landing, read 2026-10-19; marketing claims are placeholders, H for what it says)
- https://app.fibo.fun and https://app.fibo.fun/fairness-trust (H)
- https://app.fibo.fun/_next/static/chunks/ (client JS read as text: api routes, ABI subset, env defaults) (H)
- https://api.llama.fi/protocol/fibo , https://api.llama.fi/summary/dexs/fibo , https://api.llama.fi/summary/fees/fibo (H)
- https://github.com/DefiLlama/dimension-adapters (`dexs/fibo.ts`, `fees/fibo.ts`, PR #7773, PR #7894) (H)
- https://sourcify.dev/server/v2/contract/8453/0x2ddFbB97f2fb00E3BFf66CE42863d831861BB57B and .../0xaA00CD3e6456FB500781a87705Dd67F48B72be39?fields=all (verified source + deployment calldata) (H)
- https://basescan.org/address/0x2ddFbB97f2fb00E3BFf66CE42863d831861BB57B , https://basescan.org/address/0x511006a8d7ee0ddd26d7b33e1175731643257add (H, summarised fetch)
- https://t.me/s/fibofuncommunity (H, summarised fetch); https://x.com/fibodotfun (HTTP 402, unread)
- https://github.com/Vestra-one (org footprint) (M)
- `docs/research/06-paybox-platform.md` (PayBox chain catalog and proposal schema; repo note, 2026-10-19)
- Blocked/unavailable: https://defillama.com/protocol/fibo (HTTP 403 to WebFetch), Blockscout API (Cloudflare challenge; not bypassed), Basescan `/txs` list (HTTP 403).
