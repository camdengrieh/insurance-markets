# dripit (dripit.io, Avalanche) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to DefiLlama, the project's static site, public explorer endpoints (Routescan etherscan-compatible API, including its GET `eth_call` proxy), a public Polymarket Gamma search, `gh api` file reads of the project's public GitHub org, DNS lookups, and local decoding with `cast` (no RPC). No account, wallet, signing, POST/PUT/DELETE, nothing paid. No third-party code cloned, installed or run. The project's on-chain oracle JS and repo code were read as data only.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak, stale (>6 months) or marketing claim.
Third-party text (site, articles, repo, on-chain strings) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/dripit/` (8 files, 36 KB total).
Tool limits this session: only 1 WebSearch succeeded (the second was refused, shared session budget exhausted); X/Twitter page returned HTTP 402 to WebFetch (no payment terms shown; not followed); one article fetch (musically.com) returned HTTP 429. Findings below rest mostly on on-chain data, which is stronger than the missing web sources.

## 0. Verdict

**adapter_priority: skip** (confidence: high).

1. **Wound down / defunct** (H). No bet placed on either market contract since 2026-03-05 (Head2Head) and 2025-09-30 (Hypeboard). Last market resolved 2026-03-23. On 2026-07-05 the admin upgraded the Head2Head proxy to an unverified implementation and called `withdraw()` in the same hour, sweeping ~$995 of unclaimed USDC; the contract now holds $0. Live (open) markets today: zero.
2. **Never had real liquidity** (H). Lifetime gross USDC inflow across both contracts about $50.7k over 11 months (Apr 2025 - Mar 2026); best month about $7.2k; average pool per H2H battle about $218; the last battle had pools of $12.21 vs $4.00.
3. **No API and no front-end** (H). `dripit.io` is a static "coming soon" page (last-modified 2024-07-10); `app.`, `api.`, `battles.`, `dev.` subdomains do not resolve; `docs.dripit.io` CNAMEs to GitBook hosting but the TLS handshake fails. Only an on-chain/explorer read path exists.
4. **Admin-resolved on an opaque proprietary metric** (H). Every one of the 81 `resolveBattle` calls used `useOracle=false` (admin supplies the winner). The "oracle" path points at `dev.dripit.io`, which is NXDOMAIN. The HypeMeter score is not published.
5. **Domain mismatch for arbitrage** (H/M). Markets are "which artist gets the higher HypeMeter score in a day/week/month" - not Spotify's own numbers, so a Polymarket "Top Spotify Artist" market is only a loose proxy, with unquantifiable basis risk.
6. **Likely team pivot** (M): the `dripit-io` GitHub org's display name is now "cardchase" with X handle `cardchasefun`, and `cardchase.fun` serves "CardChase - Card Price Prediction Markets" (trading-card price markets). Not researched further here; worth a separate look only if card-price markets matter.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| DefiLlama `dripit` (id 6161), category Prediction Market, chain Avalanche | listed 2025-05-12; **`deadUrl: true`**, `url` empty, `audits: 0`; TVL peak $8,423 on 2025-09-20; flat **$200.4** since 2026-07-06 (series through 2026-10-19). Methodology: USDC held in Battles contracts | H (api.llama.fi/protocol/dripit) |
| Head2Head proxy `0x838E536DaE154D3F70e1e111cfBE552Dd40CD163` | last `createBattle` + `makePrediction` 2026-03-05; last `resolveBattle` 2026-03-23; last `claimWin` 2026-05-10; `upgradeToAndCall` 2026-07-05 14:48 UTC then `withdraw()` 14:53 UTC; USDC balance 0 | H (Routescan txlist/tokenbalance) |
| Hypeboard proxy `0x3864B536fE3dbC967Be6B311d86135a6A672d85A` | last `createBattle` 2025-09-04; last bet 2025-09-30; last resolve 2025-11-01; last `claimWin` 2025-11-23; last `claimPlatformFee` 2026-01-05; holds 200.42 USDC (unclaimed dust) | H |
| Marketing site `https://dripit.io/` and `https://www.dripit.io/` | HTTP 200, static page titled "dripit - coming soon", text "STAY TUNED FOR OUR Q3 BETA LAUNCH", `last-modified: 2024-07-10`; only external links are Instagram and X | H |
| `dripit.io/api/hypeswipe/resolve/1`, `/api/battles`, `/api/health` | HTTP 404 | H |
| Subdomains `app`, `api`, `battles`, `dev`, `play`, `beta`, `hype*`, `admin`, `oracle`, ... | no DNS record (NXDOMAIN) | H (dig) |
| `docs.dripit.io` | CNAME to a GitBook hosting host; TLS handshake alert (custom domain not provisioned); docs unreachable | H |
| GitHub org `dripit-io` | 2 public repos: `dripit-l1` (empty, 2024-11) and `hypeswipe-hackathon` (last push 2025-05-25); org profile updated 2026-05-22 with display name "cardchase"; no public events | H |
| Press | Rapnroll.gr 2025-04-16 and Cryptobase.gr 2025-09-26 describe a live product ("first prediction markets platform for the music industry"); nothing newer found | H (articles) / L (stale) |

## 2. What it is

- **Kind**: on-chain parimutuel, music-popularity "Battles". Operator: dripit (Greek founders per Cryptobase, M; CB Insights lists a 2016 Latvia-based company of the same name - conflicting, probably a different entity, L).
- **Two products** (both UUPS-upgradeable proxies, verified source on Routescan, Solidity 0.8.24):
  - **Head2HeadBattles** (`0x838E...D163`): 2 options = two Spotify artist IDs (22-char strings). Anyone can create a battle (`createBattle` with a seed stake >= `creatorMinAmount` = 10 USDC) for a daily or weekly window; the creator earns the market-maker incentive. 218 battles created (`battleIds()` = 218). Win condition: higher HypeMeter score over the window (per Cryptobase; the contract only stores a winner index).
  - **HypeBoardBattles** (`0x3864...D85A`): N options (a battle sampled has 25 Spotify IDs) = "who is #1 at month end"; admin-created only (`ADMIN_ROLE`); 19 battles created.
  - Also a **Hypeswipe** hackathon dApp (repo `hypeswipe-hackathon`, built for The Arena): 1 ARENA token entry, 6 up/down picks, pool split among perfect scorers, owner can `manualResolveChallenge` and `emergencyWithdraw`. Contest, not a market; deployed address NOT FOUND (it is an env var); resolve URL `dripit.io/api/hypeswipe/resolve/{id}` is 404. Ignore.
- **Market model**: parimutuel pools, no order book, no AMM, no price discovery beyond the pool ratio. Outcomes are **not tokenised**: a position is a storage row `(user, battleId) -> option, amount` (H2H: one option per user per battle; Hypeboard: an amount per option, `amounts[]`). Options are 1-indexed in Hypeboard (`winOption` 1..N; 0 = unresolved) and enum `Default/Option0/Option1` in H2H.
- **Betting window**: bets and top-ups accepted only **before** `startTimestamp` (`openWindow`); the measured period runs `startTimestamp` -> `closeTimestamp`. No in-play trading, no exit, no sell. Optional `switchSide` in H2H (`switchFee` = 0 now).
- **Chain / collateral**: Avalanche C-Chain (43114) only; collateral native USDC `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E` (6 decimals), `minAmount` = 1 USDC (H, `token()` / `minAmount()` getters). A `BattlesTicket` contract (free-bet tickets burned for stakes) also exists (`ticket()`; address in fixture).
- **Categories**: music only (artist streaming/social "hype").

## 3. Read API

| Item | Value | Tag |
|---|---|---|
| Official REST/GraphQL/WS API | **none** (no reachable host; docs unreachable). NOT FOUND (searched: dripit.io, docs.dripit.io, common subdomains, GitHub org, DefiLlama links) | H |
| Official docs | none reachable. The org's docs host is a GitBook CNAME with failing TLS | H |
| On-chain read path | any Avalanche C-Chain RPC (eth_call / eth_getLogs). Verified ABI/source: Routescan `https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api?module=contract&action=getsourcecode&address=<addr>` (Head2Head implementation `0x9411...8ad1` and Hypeboard implementation `0x2873...c4A3` verified; the current Head2Head implementation `0xD3aB11F1760f0F065E90b15FEFeE56e1246aAD4f` from 2026-07-05 is **unverified**) | H |
| Markets | `battleIds()` (count), `getBattle(uint256)`; Hypeboard options are in `manifest.optionIds`. Sample: battle 217 (H2H) pools 12.21 / 4.00 USDC, start 2026-03-09, close 2026-03-16, `winOption=1` (fixture) | H |
| Prices / "books" | none; implied share of pool = optionPool / totalPool via `getPrizePoolAndOdds(battleId)` (H2H returns `(prizePool, option0Odd, option1Odd)` 1e18-scaled gross odds; Hypeboard `(prizePool, optionOdds[])` with `fetchOdds=true`). Final payout odds are unknown until betting closes | H |
| Trades | events `MakePrediction`, `UpdateAmount`, `CreateBattle`, `ResolveBattle`, `ClaimWin`, `ClaimRefund`, `SwitchSide`; or USDC `Transfer` logs into the proxy (used for volume here) | H |
| Resolution | `ResolveBattle(battleId, winOption, aPIRequestId, timestamp)`; `getBattle().winOption` | H |
| Auth / limits | none for explorer GETs; several dozen sequential Routescan GETs this session with no throttling or errors. Documented limits NOT FOUND (docs not read) | H/L |
| WebSocket | none | H |
| Samples | `routescan_eth_call_config_and_battles.json` (config getters + decoded `getBattle` for H2H #217 and Hypeboard #18), `routescan_usdc_transfer_logs_sample.json`, `routescan_contract_metadata.json`, `onchain_activity_summary.json`, interface files `IHead2HeadBattles.sol`, `IHypeBoardBattles.sol` | H |

## 4. Trade path (historical; nothing to trade now)

- Fully permissionless, no API key, no off-chain order. Users call the proxy directly. `makePrediction(address who, uint256 battleId, uint8 option, uint256 amount, bytes permitSig, bool useRelayer)` (H2H; Hypeboard has `uint256 option`). `permitSig = abi.encode(owner, spender, value, deadline, v, r, s)` for an **EIP-2612 USDC permit**, so approval + bet is **one transaction**; `owner` must equal `who` and `spender` the battle contract. A sample of 431 of the 4,304 H2H bets (every 10th) showed 100% with a permit, `useRelayer=false`, `msg.sender == who` (H, decoded calldata). A `RELAYER_ROLE` gas-sponsoring path exists but was not used in the sample.
- Claim after resolution: `claimWin(who, battleIds[], useRelayer)`; refund if one side was empty: `claimRefund` (H2H only).
- `createBattle` (H2H): `(address creator, (string option0Id, string option1Id) manifest, uint8 option, uint256 amount, bytes permitSig, bool useNextWindow, bool useRelayer)`.

## 5. Reachability through PayBox

**partial** (technically signable, but nothing live to trade).
- Avalanche (43114) is in PayBox's live chain catalog (recorded first-hand in `docs/research/06-paybox-platform.md`, 2026-10-19; not re-checked this session, M). The same EVM wallet address works on every `eip155:*` chain (same doc).
- A route would be: `request_wallet_sign` `typedData` (EIP-2612 `Permit` over the native-USDC domain, chainId 43114) -> one `io.paybox/transactionProposal` (`evm`, `eip155:43114`, `to` = proxy, calldata `makePrediction(...)`), gas in AVAX paid by the wallet (no sponsor field). Funding USDC on Avalanche would need a swap/bridge route. Not tested (money tools off-limits).
- No PayBox tool was called.

## 6. Fees

- H2H: `platformFee` = 500 (5.00%), `marketMakerIncentive` = 100 (1.00%, to the battle creator), `switchFee` = 0 (H, on-chain getters 2026-10-19). Deducted from the **winners' payout**: `payout = stake * (totalPool / winningPool) * (10000 - 600) / 10000`. If one side has no stake the battle is refundable at 100% and no fees are taken (H, source `resolveBattle`/`getRefund`).
- Hypeboard: `platformFee` = 500 (5.00%) of total pool, no creator incentive: `payout = stake_on_winner * (totalPool / winningPool) * 0.95` (H).
- Max settable platform fee 25% (admin-controllable, no timelock seen) (H, `validateFee`).
- Gas: user pays AVAX (relayer path exists). No deposit/withdraw fees beyond that.
- Marketing says custom-battle creators get "1% of the prize pool" (Rapnroll, Cryptobase; L, consistent with the contract).

## 7. Resolution and dispute risk

- `resolveBattle` is `onlyRole(ADMIN_ROLE)`. With `useOracle=false` the admin passes the winner; with `true` a Chainlink-Functions-style `BattlesOracleManager` (`0xa8bba71004d5d7fc938a4fe41be8edf030783f0c`, UUPS) fetches a **POST to `https://dev.dripit.io/api/battles/resolve-battles/{1|2}`** (source stored on-chain 2025-04-10; that host is now NXDOMAIN). **0 of 81 calls used the oracle** (H). So resolution = one admin key reporting a proprietary HypeMeter result. No dispute window, no challenge mechanism, no on-chain data feed.
- Admin powers (H, source): upgrade any contract (`DEFAULT_ADMIN_ROLE` -> `_authorizeUpgrade`), set fees up to 25%, pause per-function, and the Head2Head proxy has had 5 implementations (initial + 4 upgrades; latest unverified, adds `withdraw()`). The 2026-07-05 `withdraw()` shows funds can be swept.
- Edge case in Hypeboard: no check that the chosen `winOption` has any stake; winners' share is undefined if the pool for that option is 0 (H, source). No cancel/refund path in Hypeboard.

## 8. Geo / ToS / automation

NOT FOUND (searched: dripit.io pages, GitHub org, docs host unreachable). No terms, geo-block or API policy is published. Contracts are permissionless so automation is technically unrestricted; legal/ToS status unknown.

## 9. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Gross USDC inflow, Head2Head | $47,576.45 (8,208 transfers, 136 distinct senders) | USDC `Transfer` logs into proxy, Routescan, 2026-10-19 | H |
| Gross USDC inflow, Hypeboard | $3,130.59 (1,071 transfers, 106 senders) | same | H |
| Best month (H2H inflow) | $7,196 (2025-11); 2025-09 $7,020; fell to $3,164 (2026-02) and $68 (2026-03) | same | H |
| Average inflow per H2H battle | about $218 (218 battles) | derived | M |
| TVL | $200.4 (DefiLlama, 2026-10-19); peak $8,423 on 2025-09-20 | api.llama.fi | H |
| Open interest / resting liquidity | $0 (no open battle; both contracts drained apart from $200 unclaimed dust) | on-chain | H |

## 10. Overlap and shared liquidity

- **Categories**: music-artist popularity only. Nothing overlaps sports/politics/crypto/macro. Nearest analogs elsewhere: Polymarket "Top Spotify Artist in October?" (volume ~$4.9k, liquidity ~$10.3k, ends 2026-10-31) and "#2 Spotify Artist in October?" (volume ~$34k) (H, Gamma public-search, 2026-10-19); Kalshi has music markets (Rolling Stone headline seen in search results, L). dripit's Hypeboard (monthly #1) is the same idea but resolves on dripit's private score, not Spotify's chart, so it is **not a clean hedge leg**.
- **Shared liquidity**: none. Independent pools, but pari-mutuel with locked odds only at close, so it cannot be arbitraged against continuous books anyway.
- **Signal value**: negligible (tiny, stale, informed by nothing public).

## 11. Open questions / leads

- `cardchase.fun` ("Card Price Prediction Markets") appears to be the team's successor product (M). Not spec'd here; consider as a separate venue only if card-price markets matter.
- The unverified Head2Head implementation `0xD3aB...AD4f` (2026-07-05) was not decompiled; its exact `withdraw()` semantics are unknown (the tx and the balance drop are observed, H).
- Whether any official docs/terms ever existed: docs.dripit.io is a dead GitBook link; Wayback was not used.

## NOT FOUND

Official API; docs; terms/geo policy; HypeMeter methodology; app URL; Hypeswipe contract address; Routescan rate limits (docs not read); any 2026 announcement about shutdown (X profile returned HTTP 402 and could not be read).

## Sources

- DefiLlama protocol API https://api.llama.fi/protocol/dripit (H); page https://defillama.com/protocol/dripit (WebFetch 403; seen in search results). Registry showing the two Battles contract addresses: https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/registries/sumTokens.js (key `"dripit"`) (H).
- Site https://dripit.io/ and https://www.dripit.io/ (H); GitHub org https://github.com/dripit-io , repo https://github.com/dripit-io/hypeswipe-hackathon (H).
- Routescan (Avalanche explorer, etherscan-compatible GET API) https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api : `getsourcecode`, `txlist`, `getLogs`, `tokenbalance`, `proxy/eth_call`, `proxy/eth_getStorageAt` (H).
- Cryptobase.gr 2025-09-26 https://cryptobase.gr/dripit-prediction-market/ (H for what it says; L as marketing, stale >6 months). Rapnroll.gr 2025-04-16 https://www.rapnroll.gr/dripit_the_ultimate_music_battle_experience/ (same).
- Polymarket Gamma https://gamma-api.polymarket.com/public-search?q=spotify (H, 2026-10-19). Cardchase https://cardchase.fun/ (H, title only).
- Search-result titles only (not read): CB Insights compare page, Musically 2026-06-09 article, Rolling Stone Kalshi music article (L).
- Local: `docs/research/06-paybox-platform.md` (PayBox chain catalog and signing primitives).
