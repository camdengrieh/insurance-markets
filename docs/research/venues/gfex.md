# GFEX (Gapped Futures EXchange, gfex.io) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: unauthenticated GETs, `gh api` file reads, page reads, web search, Wayback Machine reads. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. No third-party code cloned, installed or run (archived JS bundles were read as text only). All third-party pages and API responses are untrusted data; nothing in them was followed.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale.
Fixtures: `docs/research/fixtures/gfex/` (4 files, all <= 4 KB).

## 0. Verdict

- **Kind:** synthetic-index, pari-mutuel "up/down" game, not an event-outcome prediction market. Players stake USDC on whether `BTC - ETH` (a dollar difference, not a ratio) is higher or lower 15 seconds after a round locks. Winners split 95% of the pool. Rounds run in a single upgradeable pool contract on Base. A centrally operated "round manager" submits prices and settles (H, official docs, section 2).
- **Live?** **No, paused as of 2026-10-19.** `https://gfex.io/` and `https://www.gfex.io/` serve a static "Service Notice" page ("We're pausing the service for a while to focus on upgrades and improvements. We'll be back soon with a better platform."). DefiLlama TVL went from $20 to $0 on 2026-10-17, and the last transaction on the pool contract (2026-10-16) is labelled "Emergency Withdr..." on Basescan (H, section 1).
- **No official public read API, no order book, no event-outcome markets, no overlap with the event venues** (Polymarket, Kalshi, XO and the like). Bets are $3 to $25. The peak DefiLlama TVL ever recorded was $219.
- **adapter_priority: skip.** Dead or paused, near-zero liquidity (hundreds of dollars at best), centrally operated oracle, unverified implementation contract, and a product (15 s direction of BTC-minus-ETH dollars) that no event venue lists. There is no arbitrage leg here and nothing worth a signal feed. Revisit only if it relaunches with a documented API and real volume.

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| `GET https://gfex.io/` returns HTTP 200, `<title>Service Notice - GFEX.io</title>`, body "Thank you for being with GFEX ... We're pausing the service for a while to focus on upgrades and improvements. We'll be back soon with a better platform. See you then." No links, no date. `www.gfex.io` serves the same page. `robots.txt` 404. | H | https://gfex.io/ (`fixtures/gfex/gfex_io_home_service_notice_2026-10-19.html`) |
| `docs.gfex.io`, `app.gfex.io`, `api.gfex.io` do not resolve (curl error 6). | H | curl 2026-10-19 |
| DefiLlama lists "GFEX" (id 7474, category Prediction Market, chain Base, `listedAt` 1772205533 = 2026-02-27). Current TVL = 0. Daily TVL (USDC in the pool, incl. active bets, rewardpot, house pool): $148 on 2026-02-27, peak **$219 on 2026-04-04**, a flat **$20 from late September to 2026-10-16**, **$0 on 2026-10-17, 10-18**. `change_7d` = -100. | H | https://api.llama.fi/protocol/gfex (`fixtures/gfex/defillama_protocol_gfex_2026-10-19.json`, trimmed to first 3 and last 30 points of 235) |
| Basescan page for the pool proxy: 1,195 transactions in total, ETH balance 0, no USDC listed, most recent transaction 2026-10-16 06:12:49, method shown truncated as "Emergency Withdr...". Creation about 244 days before 2026-10-19 (about mid-Feb 2026). | H (read via WebFetch, which summarises the page; not byte-verified) | https://basescan.org/address/0x890bEe0Cf36A5d482c133e73Fe9d53B4aE7b52D4 |
| Putting these together: an emergency withdrawal on 2026-10-16 emptied the last $20, and the site was switched to the pause notice. The causal link and the date of the notice are my inference. | M | - |
| Wayback has full product-page captures on 2026-03-30 and 2026-04-14 (18 KB each, "Live Now"); the capture list ends 2026-04-14. When the notice page replaced it: NOT FOUND (searched: Wayback CDX for gfex.io). | H (captures exist), L (notice date) | https://web.archive.org/web/20260414233923id_/https://gfex.io/ |
| Web search (extended) for a pause, upgrade or relaunch announcement found nothing independent. X account `x.com/GFEXOFFICIAL` returned HTTP 402 via WebFetch (a block, not a payment request I could act on); not read further. | H (that nothing was found) | WebSearch, WebFetch |
| Scale evidence from the project's own GA4 report (Feb 2026, committed to its public repo): 165 active users, 315 sessions, 89 `investment_success` events from 7 users in 30 days; most sessions from South Korea. | H (document), M (representativeness) | https://github.com/GFEXOfficial/gitbook/blob/chinese/reports/ga4-daily-report-2026-02.html |

Conclusion: not live. Traction was tiny even before the pause.

## 2. Market model

Source: official GitBook "GFEX Docs V2.0" (English) read as Markdown via `https://gapped-futures-exchange-1.gitbook.io/gfex-docs-v2.0/<page>.md`, all H unless stated. The docs contradict each other in places; conflicts are flagged.

- **Single recurring market:** "GAP INDEX = BTC Price - ETH Price" (dollars; docs example BTC $65,000, ETH $3,200 gives $61,800). Users pick **UP** (long) or **DOWN** (short) for the next round. Core-concepts/gap-index.
- **Round cycle: 30 s.** 0-15 s "Placing" (bets accepted), at 15 s the round **locks** and the lock-time GAP INDEX is recorded as the opening price, 15-30 s "Locked", at 30 s the closing price is recorded and the round settles. Rounds run back to back. Marketing says "15 seconds" (the locked window). Core-concepts/round-cycle. Older docs (Chinese GitBook, ToS dated 2025-12-26) described **1-minute contracts in rooms of up to 50 users** with a 2% trade fee plus 6% profit fee; the product was evidently reworked in Jan-Feb 2026 (M). The pre-February contract address is NOT FOUND.
- **Outcomes:** two, UP or DOWN. Equal open and close = draw, all stakes refunded. One direction per wallet per round; no cancel or edit after placing. Bet size **$3 to $25 USDC** (presets $3, $5, $10, $25). FAQ, trading.
- **Pricing:** pure parimutuel. No quotes, no order book, no AMM. The "price" of a side is its pool share. Docs: `Distribution Pool = Total Pool x 95%`, `Payout = Stake x (Distribution Pool / Winning Side Total)`. Implied probability for one side with pool share `s` is `s / 0.95`; the two sides sum to 1.0526 (the 5% take-out). Payout-calculation. (Formulas H, implied-price algebra mine.)
- **Tokenisation:** none for positions; stakes are rows in the pool contract. A separate ERC-1155 "GFEX Token" holds points (id 0) and achievement badges (ids 1-99); it is not collateral and not an outcome token. Fees-and-economics/gfex-token.
- **House pool:** if one side has $0 at lock, the platform places a **$1** stake on the empty side so the round settles. A DefiLlama methodology line and an incident report also mention `fillHousePool` and a house pool balance, so the house is not purely passive (M). Core-concepts/house-pool.
- **Rewardpot (side game):** 2% of every pool feeds a pot; 3, 5 or 10 consecutive wins pay 7%, 20% or 50% of the pot. Irrelevant for pricing except that it is part of the take-out.
- **Why the dollar gap is effectively a BTC bet:** BTC trades at roughly 20x ETH's dollar price, so over 15 seconds the sign of `d(BTC) - d(ETH)` is dominated by the BTC move in most rounds. Docs example: BTC +$100, ETH -$50 gives GAP +$150. This is my analysis, not a project claim (M).

## 3. Chains and collateral

- **Base mainnet only** (chain id 8453). FAQ (Chinese GitBook): "currently GFEX only supports Base", other networks and a bridge "planned". Smart-contracts page. H.
- **Collateral:** native Circle USDC on Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (H, DefiLlama adapter in the project's fork: https://github.com/GFEXOfficial/DefiLlama-Adapters/blob/main/projects/gfex/index.js). ETH on Base for gas (< $0.01/tx per docs). A free-demo mode runs on Base Sepolia with a faucet token "GUSD" (H, Chinese GitBook `ru-he-shi-yong/mian-fei-ti-yan-yu-zhen-shi-jiao-yi.md`) and a no-wallet demo on the site (M, search snippet / archived homepage "Try Free Demo").
- **Pool contract (EIP-1967 proxy):** `0x890bEe0Cf36A5d482c133e73Fe9d53B4aE7b52D4` (H, DefiLlama fork adapter; Sourcify exact runtime match, verified 2026-02-16, compiler 0.8.22, `proxyType: EIP1967Proxy`). Proxy ABI contains only `Upgraded` plus OpenZeppelin errors. Creator per Basescan: `0x00006550103310bF180b93029ddFe6d5a56a60E6` (M, WebFetch summary).
- **Implementation:** `0xEFCfe69E3f8D11E18fb02dAD9C8BAA95708EFB91`. **Not verified on Sourcify** (HTTP 404). Verification status on Basescan unchecked (Basescan address page for the implementation was not fetched). The docs claim "all contracts verified on BaseScan"; I could not confirm that for the logic contract. Docs say UUPS; the verified proxy is a plain `ERC1967Proxy` (consistent with UUPS where upgrade logic lives in the implementation) (M).
- Contracts named in docs: `GFEXPool` (rounds, investment, settlement, payouts), `GFEXAccessControl`, `GFEXToken` (ERC-1155). Addresses for the latter two: NOT FOUND (searched: GitBook v2.0, GFEXOfficial repos, DefiLlama adapters).
- No governance or fee token. No audit published (DefiLlama `audits: "0"`; "audit" not mentioned in any GFEX doc page read). Wallet layer: **Dynamic** (embedded MPC wallets with Google/X/email login, plus MetaMask / Coinbase Wallet / WalletConnect). Wallet-integration page, H.

## 4. Read API

- **Official public read API: NOT FOUND.** Searched: gfex.io (pause page only), `docs/api/app` subdomains (no DNS), GitBook v2.0 `llms.txt` (27 pages: concepts, fees, guides, security, legal; no API page), GitHub org `GFEXOfficial` (3 repos: two forks and the GitBook source, no code), DefiLlama adapters.
- `exists`: **onchain-or-subgraph-only** in practice, and currently nothing to read.
  1. **Base chain** reads and events on the proxy. Docs name events `BetPlaced(player, round, direction, amount)`, `RoundSettled(round, open price, close price, result)`, `PayoutDistributed`, `RewardpotWon` (on-chain-transparency page, H as docs text; M that the deployed ABI matches since the implementation is unverified). View functions seen in the archived frontend bundle: `getUpMultiplier(roundId)`, `getDownMultiplier(roundId)`, `getPlayerCount()`, `getPlayersRange(start,count)`, `getUserStats(address)`, `getWeeklyUserStats(address,week)`, `getCurrentWeek()`; names `placeInvestment`, `getActiveRounds`, `getRewardpotPool`, `fillHousePool` appear in the project's own incident report (H for names, signatures NOT FOUND). `eth_call`/`eth_getLogs` are JSON-RPC POSTs and were out of scope.
  2. **Undocumented backend (do not rely on it):** the April 2026 Wayback copy of the frontend bundle hard-codes `https://round-manager-producing.up.railway.app` with routes `GET /rounds/current`, `GET /rounds/{id}`, `GET /rounds/{id}/confirmed-gap`, `GET /house/round/{id}`, and a price WebSocket `wss://price-feed-producing.up.railway.app/ws` (H that the bundle says so; M that they are still reachable). **I did not probe these hosts**: they are not documented API hosts and the service is paused. See `fixtures/gfex/frontend_endpoints_from_wayback_bundle_2026-04-14.json`. The project's incident report names the same service ("round-manager", Python, Railway, 3 operator addresses, Coinbase CDP RPC) (H, https://github.com/GFEXOfficial/gitbook/blob/chinese/reports/incident-2026-03-02.html).
  3. **DefiLlama aggregates**: `GET https://api.llama.fi/protocol/gfex` gives daily TVL only (shape confirmed, fixture saved). `/summary/dexs/gfex`, `/summary/fees/gfex`, `/summary/options/gfex` return "not found" (HTTP 400); `/summary/derivatives/gfex` returned HTTP 402 "Upgrade to the paid API plan" (recorded, not paid). So no volume series exists there.
- Auth: none documented. Rate limits: NOT FOUND. WebSocket: only the undocumented price feed above.
- Block explorers: Blockscout API (Cloudflare challenge, HTTP 403, not bypassed), Dappradar and DefiLlama web UI (HTTP 403 via WebFetch). Basescan pages readable via WebFetch.

## 5. Trade path

- **Programmatic placement:** on-chain only. Per docs and the incident report the flow is `USDC.approve(pool, amount)` then `placeInvestment(roundId, direction, amount)` on the pool during the 15 s placing window; a bet sent after the lock reverts (`placeInvestment reverted` is a listed Sentry issue). No signed-order scheme, no off-chain order API, no cancel. Exact function signature and argument order: NOT FOUND (implementation unverified).
- "Quick Trade" mode: after setting a USDC allowance, one-tap betting with no wallet pop-up. The mechanism (embedded-wallet auto-sign, session key, or relayer) is not documented (NOT FOUND). Telegram bot `@GFEXOfficialBot` and alerts `@GFEX_alerts` are linked from the April 2026 homepage (H, Wayback).
- Settlement and payout are pushed by the operator; players do not claim (except Rewardpot, which is auto-claimed per docs).

### PayBox reachability

**partial (effectively no today).** A PayBox EVM wallet on Base could in principle submit plain contract calls (USDC approve, then the pool call) as transaction proposals, because it is a normal Base contract with no EIP-712 order signing and no allowlist. In practice: (1) the contract is drained and the app paused; (2) the placing window is 15 s per 30 s round, shorter than a human-approved PayBox signing round trip, and the exact bet calldata is unknown without the implementation ABI; (3) stakes are capped at $25. Nothing here justifies building the plugin path.

## 6. Fees

- **Current model (docs V2.0, ToS "last updated February 2026", archived homepage April 2026): 5% of the total pool per round**, taken before distribution: **3% platform + 2% Rewardpot**, paid implicitly by all bettors (winners share 95% of the combined pool). Plus Base gas (< $0.01). No deposit or withdrawal fee. Fee-structure, ToS section 6, H.
- Break-even maths for an aggregator: back a side with pool share `s` and a true win probability `p`; EV per $1 = `p * 0.95 / s - 1`. Need `p > s / 0.95`.
- **Superseded model (Chinese GitBook, ToS 2025-12-26): 2% trade fee on all trades + 6% on profit.** Referral program: 5% of referred users' trading fees (also from the older docs; status in V2.0 unknown). Treat as stale (L).

## 7. Resolution mechanism and dispute risk

- **Operator-submitted prices, no on-chain oracle.** "Prices are submitted to the smart contract by the operator at the moment of round settlement." Source: "real-time price feeds from Coinbase via WebSocket" (gap-index page) but the on-chain-transparency page says "Price feeds from Binance are submitted by the operator". The docs conflict; the Dec 2025 disclaimer says only "external exchange APIs, including major exchanges and crypto price providers". Which exchange is authoritative: unresolved (H for both statements, conflict flagged).
- Roles: ADMIN (full contract management), OPERATOR (price submission, settlement), FEE_MANAGER. The pool is an **upgradeable proxy**, so ADMIN can change logic (H docs, M inference on impact). The project's own incident report (2026-03-02) shows rounds stuck "Pending" after a service restart because the settlement cache was in memory only, and that TX timeouts and nonce collisions occurred across 3 operator keys (H, project document).
- **No dispute process, no challenge window, no refund path documented** apart from an exact-tie refund. Players trust the operator for 15-second price snapshots that cannot be audited after the fact. Settlement risk: **high**. `Emergency Withdr...` on 2026-10-16 shows the admin can sweep the pool.

## 8. Geo, ToS and automation

- ToS (GitBook V2.0, last updated February 2026): 18+ "or the legal age in your jurisdiction"; "You must not be located in a jurisdiction where prediction trading is prohibited"; users responsible for local law; the platform "may need to restrict access in certain regions". No KYC (FAQ). Prohibited: money laundering/illicit activity and "attempt to manipulate or exploit the smart contracts". Dec 2025 ToS adds that access may be affected by "geographical restrictions". H.
- **No explicit bot/API/automation clause found** in the ToS or disclaimer; a Telegram trading bot is run by the project itself. The absence is a finding, not a licence. NOT FOUND (searched: ToS and disclaimer in both GitBook versions).
- The site has no geo-block I could observe (single page, no wallet check). Regulatory status: GFEX presents itself as a "decentralized prediction trading platform"; nothing about licences. Fixed-odds-style betting on a crypto index with a 5% take-out is plausibly gambling-regulated in many jurisdictions (M, my reading, not legal advice).

## 9. Liquidity

| Metric | Value | Tag | Source and date |
|---|---|---|---|
| TVL now | $0 | H | DefiLlama, 2026-10-18 point, queried 2026-10-19 |
| TVL peak | $219 (2026-04-04) | H | DefiLlama series |
| TVL late Sep to 2026-10-16 | $20 flat | H | DefiLlama series |
| Lifetime txs on pool proxy | 1,195 | H (WebFetch summary) | Basescan, read 2026-10-19 |
| Feb 2026 usage | 165 active users, 89 successful bets by 7 users in 30 days | H (project's own GA4 export) | `reports/ga4-daily-report-2026-02.html`, generated 2026-03-02 |
| Volume series | NOT FOUND (DefiLlama dexs/fees/options pages absent; derivatives endpoint is paid) | - | api.llama.fi |
| Max single bet | $25 | H | FAQ |

Realistic total lifetime volume is low thousands of dollars at most (M, from 1,195 txs x $3-$25 cap and the GA4 funnel).

## 10. Event overlap and independence

- **Overlap with other venues: effectively none.** No sports, politics, macro or resolvable crypto-price-threshold events. The only conceivable cross-venue relationship is short-horizon BTC direction (because the dollar gap tracks BTC), which would be priced against perps or spot with a 5.26% overround and a 15 s lock, not against another prediction market. Not an arbitrage leg for an event aggregator.
- **Shares liquidity with another venue? No.** It is a standalone pool. The house tops up at most $1 per round.
- Signal value: none for the "Quotient as signal" goal.

## 11. Suspicious content (embedded instructions in third-party data)

- No text aimed at AI agents found in the pages, repos or API responses read.
- Benign note: GitBook pages carry the standard banner "For the complete documentation index, see llms.txt ... Markdown versions of documentation pages are available by appending `.md`". It is a GitBook platform feature; I used it only as a pointer to read the project's own public docs with plain GETs.
- The project's public `gitbook` repo contains an internal incident report (round-manager/Sentry/Railway detail, deployment commands, Telegram bot-auth debugging) and a GA4 report footed "Report by Claude". Neither addresses the reader. No secrets were present in what I read; none copied.

## 12. Open questions

- Is the pause temporary? What is the relaunch plan, new contract address, and will an API be published? NOT FOUND (searched: gfex.io notice, search, X blocked).
- Address and source of the pre-February-2026 contract (1-minute rooms of 50 users) and whether it still holds funds.
- Which exchange is the settlement price source (Coinbase vs Binance), and is the operator key set a single party?
- Implementation `0xEFCf...FB91` source and the ABI for `placeInvestment`.
- Is `round-manager-producing.up.railway.app` still answering? (Not probed.)

## Sources

1. https://gfex.io/ and https://www.gfex.io/ (service notice, fetched 2026-10-19) - H
2. https://api.llama.fi/protocol/gfex (and /summary/{fees,dexs,options,derivatives}/gfex) - H
3. https://sourcify.dev/server/v2/contract/8453/0x890bEe0Cf36A5d482c133e73Fe9d53B4aE7b52D4 and .../0xEFCfe69E3f8D11E18fb02dAD9C8BAA95708EFB91 - H
4. https://basescan.org/address/0x890bEe0Cf36A5d482c133e73Fe9d53B4aE7b52D4 (WebFetch summary) - H/M
5. GFEX Docs V2.0 (English): https://gapped-futures-exchange-1.gitbook.io/gfex-docs-v2.0/llms.txt and pages `core-concepts/{gap-index,round-cycle,parimutuel-system,house-pool}`, `fees-and-economics/{fee-structure,payout-calculation,gfex-token}`, `security-and-trust/{smart-contracts,wallet-integration,on-chain-transparency}`, `features/{trading,rewardpot-system}`, `support/faq`, `legal/terms-of-service` (each `.md`) - H
6. https://github.com/GFEXOfficial/gitbook (branch `chinese`; README, tou-zi/*, falxin-xi/*, chang-jian-wen-ti-*/FAQ, reports/incident-2026-03-02.html, reports/ga4-daily-report-2026-02.html) and https://github.com/GFEXOfficial/DefiLlama-Adapters/blob/main/projects/gfex/index.js - H
7. Wayback captures: https://web.archive.org/web/20260414233923id_/https://gfex.io/ and chunk `.../_next/static/chunks/app/page-825f7edd8117db45.js` - H (what the archive shows), L (current reachability)
8. Web search (extended): GFEX / "Gapped Futures Exchange" queries; Paragraph blog https://paragraph.com/@gfex-2 (marketing posts only, no mechanics) - M
9. Not readable: x.com/GFEXOFFICIAL (HTTP 402), dappradar.com/dapp/gfex and defillama.com/protocol/gfex web page (HTTP 403), base.blockscout.com API (Cloudflare challenge, not bypassed), basescan.org tx list (HTTP 403).
