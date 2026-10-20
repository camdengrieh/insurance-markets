# Duel Duck (duelduck.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 04:20-04:45 UTC). READ-ONLY: docs and `gh api` file reads, unauthenticated GETs, no account, wallet, key, signature, on-chain call or PayBox tool. Third-party pages, repo text and API responses were treated as untrusted data; nothing in them was followed (scan of all 29,304 duel records for AI-directed text: 0 hits). WebSearch ran once; the shared search budget was then exhausted, so no press/analytics coverage beyond that one result set was read.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference/arithmetic from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/duel-duck/` (section 13).

---

## 0. Bottom line

1. **Live, active, but tiny in real money.** Duels are still being created today (latest `created_at` 2026-10-19T04:21Z). 29,304 duels all-time and 555,585 registered users (H, public API). But 71% of all duels are in **DDPOINTS** (off-chain "Duck Points", not money), and the real-money (USDC/SOL/...) book open right now is **63 duels with about $394 pooled in total** (largest $60). (H data, M for "DDPOINTS is not money" - docs call it a points currency.)
2. **Parimutuel Yes/No pools, not an order book.** Each stake is fixed-price or range-priced; winners split the pool minus a creator-set commission (0-10%) on the **whole pool** (H, from the production frontend code). No selling, no cash-out, no price discovery beyond the pool ratio; your payout changes as others join. (H)
3. **Centralised resolution.** Either a DuelDuck admin picks Yes/No (typically within 48 h) or the creator self-resolves; no oracle, no on-chain dispute. (H docs and rules page)
4. **Read API exists in two forms.** (a) Documented Partner API at `https://xapi.duelduck.com`, needs a project API key obtained through email sign-up, and is scoped to the partner's own duels. (b) The undocumented consumer backend `https://api.duelduck.com` that the website itself uses, with **keyless public GETs** (list with pagination and filters, single duel, counters). (H) The Terms ban scraping and bots outright (section 10), and list US, UK and five EU states as restricted. (H)
5. **Trade path is Solana-only** and goes through a backend-prepared transaction after a wallet-signature login that has an anti-bot check. An EVM wallet cannot trade it. (H docs)
6. **adapter_priority = skip.** Independent liquidity (good) but about $400 open, 5-10% creator-set vig on top of the entry, no exit, centralised resolver, a ToS that forbids automated access, and geo bans. Revisit only if open real-money pools exceed roughly $10k or DuelDuck offers a sanctioned feed (section 12).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Newest duel | `GET https://api.duelduck.com/duel/all?opts.pagination.page_size=3&opts.pagination.page_num=1&opts.order.order_by=created_at&opts.order.order_type=desc` returned a duel with `created_at` 2026-10-19T04:21:12Z (fixture `api_duel_all_page_size3_2026-10-19.json`) | H |
| Activity, last 30 days (created since 2026-09-19) | 794 real-money duels and 794 - 191 (refund) - 170 (admin-cancelled) = 433 that were resolved or are still open, from the full list pulled 2026-10-19 | H (computed) |
| Public counters | `/duel/count` = 29304; `/stats/user/count` = `{"count":555585}` (fixtures) | H |
| Homepage | Shows live duels, a "Users Earned" figure of "302,053.41" linked to a Dune dashboard, 42 trending duels, Terms footer | M (WebFetch summary) |
| Blog / guide | "DuelDuck for Beginners" listed 2026-08-10; FIFA World Cup 2026 trading guide exists | M (dapp-registry entry, search result) |
| Mobile app | Android app `com.duelduck.mobile` on Google Play (search snippet); GitHub `DuelDuck/solana-mobile-app` last push 2025-08-02 | M |
| Terms | "Last updated: December 22, 2025" (about 10 months old: possibly stale) | H, stale flag |

Verdict: **still_live = true**, small, with the money side far smaller than the user count suggests.

---

## 2. Kind and market model

- **Kind (H):** parimutuel peer-to-peer binary "duels" (docs call them "predictions"; "Duel" is the internal name). Quote: "A social PvP prediction platform on Solana where users create duels, take different sides, resolve outcomes... no order book or house banking" (homepage, M; docs `prediction-lifecycle`, `probability-and-pricing`, H).
- **Outcomes (H):** exactly two, Yes (`answer: 1`) and No (`answer: 0`). Stakes are recorded on-chain "through the smart contract"; the data model has a per-duel `room_number` and a `room_token_pda` (a Solana PDA address, e.g. 44 base58 chars). I found **no outcome token**: positions are not tradable or transferable (inferred from docs: "Funds are not distributed immediately... locked... until the market is resolved"; M for absence of tokens).
- **Pricing models (H, docs `probability-and-pricing`):** `price_type: "fixed"` (everyone pays `duel_price`) or `"range"` (stake between `min_price` and `max_price`; observed ranges e.g. 3 to 1000 USDC).
- **Observed ticket sizes (H, computed 2026-10-19 over open real-money duels):** typically 1-10 USDC; median pool per open duel about $4 (from the 85 IN_PROCESS real-money records).
- **Deadline = entry cutoff** ("After the deadline is reached, voting is automatically closed"), after which the duel waits for resolution (H docs). Deadlines are creator-chosen, often hours to weeks away, some to Dec 2026 or later (a few records have 2027-2035 deadlines).
- **Price a scanner should use (H, frontend code `k()`):** implied P(Yes) = `yes_tvl / (yes_tvl + no_tvl)`. Note the docs say the "Chance" shows "how many participants" support Yes (count-based), but the production frontend uses stake-weighted TVL when `yes_tvl` is present. Count-based (`yes_count`, `no_count`) differs for range duels.
- **Status enum (H, production frontend JS chunk):** 0 CREATED, 1 IN_REVIEW, 2 AUTO_CANCELLED, 3 CANCELLED_BY_ADMIN, 4 IN_PROCESS (open or past deadline and waiting for resolution), 5 RESOLVED, 6 REFUND. **The Partner docs give a different enum** (2 = Active, 3 = WaitingForResolve, 4 = Resolved), which does not match what api.duelduck.com returns (every currently open duel has `status: 4`). Use the live enum for `api.duelduck.com`; treat the docs enum as unreliable. (see section 14)

---

## 3. Chains and collateral

- **Chain (H):** Solana only ("Powered by Solana smart contracts", docs; wallet login takes a Solana address).
- **Collateral (H, from all 29,304 records):** per-duel `symbol`. DDPOINTS 20,694 (points, no money), USDC 8,313, SOL 225, USDT 38, WBT 14, plus about 20 one-offs (neet, LYNK, HYPE, OPENCLAW, JUP, pippin, Pigeon, Lobstar...). The docs say "SOL, USDC, or other SPL tokens". USDC mint in `duel_info.token_mint` = `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (native USDC on Solana). `token_usd_price` is returned per duel.
- **Custody (M):** docs and homepage call it "non-custodial"; funds are held in per-duel on-chain accounts and paid out by the contract. The 2025 public backend repo (section 8) also contains an internal "wallet" API (`/wallet/swap`, `/wallet/transfer`, Duck Points transfers), so whether any balances are platform-custodied in 2026 is not confirmed. The Terms (a casino-style template) talk about deposits, withdrawals and "player balances" (section 10). (L on the custody story overall)
- **Program ID / contract address:** NOT FOUND (searched: the docs.duelduck.com pages listed in llms.txt (all downloaded, core pages read in full), duelduck.com HTML + 39 JS chunks, `DuelDuck/duel-duck-api` and `solana-mobile-app` repos, blog guide, dapp-registry entry). The blog says only "audited smart contracts on the Solana blockchain" with no auditor named (M). No Solana RPC call was made (JSON-RPC is POST), so the per-duel `room_token_pda` accounts were not inspected.

---

## 4. Read API

| Host | Status | Auth | Notes |
|---|---|---|---|
| `https://api.duelduck.com` | **Undocumented first-party consumer backend**, the one the website uses (image URLs and the 2025 repo both point at it; root returns `This is duel duck service`) | Public GET for list/detail/counters; JWT for user-scoped routes | H |
| `https://xapi.duelduck.com` | **Documented Partner Prediction API** (docs.duelduck.com), root returns `This is duel duck prediction service` | `X-API-Key: <project key>` for everything project-scoped; JWT bearer for user/admin routes | H |

Docs: `https://docs.duelduck.com/overview` (Mintlify; index `https://docs.duelduck.com/llms.txt`, every page also available as `.md`). The published `api-reference/openapi.json` is a **Mintlify template stub** ("OpenAPI Plant Store", `/plants`), not DuelDuck's schema (H). Endpoint pages show request/response shapes but the `quickstart` example blocks are literally `//code here` (H). No SDK repo found; the page `https://duelduck.com/api` mentions a "REST-style API and TypeScript SDK" (M).

### 4.1 Verified (unauthenticated GETs, 2026-10-19)

| Request | Result | Tag |
|---|---|---|
| `GET api.duelduck.com/duel/all` (no params) | **200, 50,174,458 bytes, 29,304 duels, all history, no pagination by default**. Do not call it without pagination | H |
| `GET api.duelduck.com/duel/all?opts.pagination.page_size=3&opts.pagination.page_num=1&opts.order.order_by=created_at&opts.order.order_type=desc` | 200, JSON array of 3, 6.8 KB (fixture) | H |
| Same with `opts.filters[0].column=status&opts.filters[0].operator==&opts.filters[0].value=4` | 200, filter works (returned 3 IN_PROCESS duels) | H |
| `GET api.duelduck.com/duel/public/{uuid}` | 200, 2.2 KB; headers `cache-control: public, s-maxage=60, stale-while-revalidate=600` (fixture) | H |
| `GET api.duelduck.com/duel/count` -> `29304`; `/duel/counters` -> per-topic totals; `/stats/user/count` -> `{"count":555585}`; `/duel/leaderboard` -> 200 (large, mixes points and money, not used) | 200 | H |
| `GET api.duelduck.com/duel/status-counts`, `/duel/history` | 401 `failed to parse token: failed to parse jwt token` | H |
| `GET api.duelduck.com/coins/solana-tokens` | 200 `null` | H |
| `GET xapi.duelduck.com/duel/all` and `/duel/status-counts` and `/duel/{id}` | 401 `{"message":"API key is required","status":401}` (fixture) | H |
| `GET xapi.duelduck.com/duel/public/{uuid of a main-site duel}` | 404 `duel not found` (the xapi host does not serve main-site duels) | H |
| `GET xapi.duelduck.com/duel/public/{slug}` | 400 `invalid duel ID` (UUID required) | H |

No `x-ratelimit-*` or `retry-after` headers were seen on either host; Cloudflare in front; `vary: Origin`.

### 4.2 Duel object (live, from `api.duelduck.com`, H)

Fields seen: `id` (uuid), `slug`, `question`, `source_of_truth` (URL), `symbol`, `duel_info.token_mint`, `price_type`, `duel_price`/`min_price`/`max_price`/`usd_price`/`token_usd_price`, `commission` (percent), `owner_commission`/`platform_commission`/`referrer_commission` (amounts, filled after payout), `deadline`, `created_at`, `updated_at`, `resolved_at`, `status`, `final_result` (null/0/1), `cancellation_reason`, `is_owner_resolving`, `self_resolve_status`, `owner_id`, `owner_role`, `resolved_by_role`, `category_name`/`topic`/`subtopic`, `yes_count`/`no_count`, **`yes_tvl`/`no_tvl`** (pool per side in token units), `players_count`, `winners_count`, `refunded_players_count`, `room_number`, `room_token_pda`, `multi_duel_id`/`multi_duel_slug` (grouping for multi-outcome sets, seen null in samples), `payouts_released`.

There is **no order book, no trade history and no per-user stake list** on public routes; the only price signal is the pool ratio. The Partner docs list `GET /duel/all`, `/duel/all-with-joined`, `/duel/history`, `/duel/my`, `/duel/participating`, `/duel/public/{id}`, `/duel/{id}`, `/duel/status-counts`, `/duel/token-accounts`, `/coins/*`, `/user/me`, `/user/me/financial-history`, `/me/projects` (H, llms.txt).

### 4.3 Websocket, limits

- **Websocket:** the `duelduck.com/api` product page says "Real-time data is available via WebSocket connections"; no URL, channel or message format is documented. NOT FOUND (searched: all docs pages, 39 frontend JS chunks for `wss://`). (M for the claim)
- **Rate limit:** "Standard integrations have generous rate limits (1000 requests/minute)" for the Partner API (M, product page). Nothing stated for `api.duelduck.com`.
- **Polling advice for an adapter if ever built:** `page_size` 100, filter `status = 4`, sort by `created_at desc`; cache `GET /duel/public/{id}` (CDN-cached 60 s).

---

## 5. Trade path

Documented in `docs.duelduck.com` (`admin-prediction-creation-and-resolve.md`, `user-prediction-creation-and-self-resolve.md`, `sign-in-wallet.md`, `duel-solana-join-sign-tx.md`), H:

1. `POST /auth/sign-in-wallet` body `{address, project_id, secret}` where `secret` = base64 **signature of the wallet's own public address**; returns `{jwt_info:{access_token, refresh_token}, user}`. A `403 "Bot detected - verification failed"` response is listed, so an anti-bot check sits on login. Partner flows also send `X-API-Key`.
2. `POST /duel/solana/join/sign-tx` body `{duel_id, answer, paid_price?, invited_by?, external_source?}` -> `{ "tx": "<base64 transaction>" }` ("Creates a signed transaction" = backend-prepared, probably partially signed by a platform authority; M).
3. The user's wallet signs and submits that transaction to Solana, obtaining `tx_hash`.
4. `POST /duel/solana/join` body `{duel:{duel_id, answer}, tx_hash}` to confirm with the backend.
5. Creating a duel is the same three-step flow (`/duel/solana/sign-tx`, submit, `/duel/solana`). Resolution is `PUT /duel/self-resolve` (creator) or `PUT /admin/duel/resolve` (admin) and returns payout `tx_hashes`.

**No cancel/exit/sell exists** for a joined position (H: no such endpoint in llms.txt; M: the beginner guide says "There are no 'stop-losses' in a yes/no duel"). You cannot hedge by selling; a hedge must be taken on another venue.

**PayBox reachability: partial.**
- An EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon...) cannot trade it: the venue is Solana-only and login requires an ed25519 signature of the Solana address.
- A **Solana** PayBox credential could in principle do both signing steps (`solanaMessage` intent for login, `solanaTransaction` for the join tx; intent ops listed in `docs/research/06-paybox-platform.md`, H from that note). Not tested (signing tools are off-limits here). Two blockers: (a) PayBox's `io.paybox/transactionProposal` Solana kind is documented as "legacy/v0, one signer who is fee payer, <= 1,232 bytes" (same note, line 81); a backend-prepared tx with a second (platform) signer may not fit. NOT FOUND whether it does. (b) The ToS bans automated betting (section 10) and login has a bot check.
- Funding: USDC/SOL on Solana only; PayBox `get_buy_link` supports Solana (same note).

---

## 6. Fees

- **Entry:** you pay exactly the ticket/stake. Solana network fees are separate and small ("Sub-cent transaction fees", homepage, M).
- **Commission:** per-duel `commission` set by the creator, **0-10%** (docs: "between 1% and 10%"; live data shows 0 in 2,142 real-money duels, 10 in 3,328, 5 in 2,059, 1 in 676, plus 2-9; max 10). (H)
- **Who pays and on what base:**
  - Docs (`duel-duck-prediction-api.md`): "deducted from the losing side's pool" and transferred to the creator (H for what docs say).
  - **Production frontend payout code (H, JS chunk c21):** winner payout = `pool x (1 - commission/100) x my_stake / winning_side_pool`, with `pool = yes_tvl + no_tvl` (range duels) and for fixed duels `price x (yes_count + no_count) x (1 - commission/100) / winners`. That deducts the commission from the **whole pool**, i.e. from winners' gross, not only from the loser pool. These two descriptions differ; assume the frontend formula (the more conservative one) until the contract is read. (M that the contract matches the frontend)
  - Split (H computed from 4,485 resolved real-money duels): recorded `owner_commission` is about commission/2 of the pool (c = 10 -> avg 5.2% of pool; c = 5 -> 2.49%; c = 1 -> 0.5%), matching the frontend `owner_commission = pool x c/100 / 2`. `platform_commission` is near 0 in the data (avg 0.0-0.7%) and `referrer_commission` about 0. Where the other half goes is not stated (platform treasury, L).
- **Partner revenue share:** DuelDuck takes 0% / 25% / 20% / 15% / 10% of a partner's commission income by monthly tier (docs; the `/api` page shows 50% for the first tier in one place, an inconsistency). Irrelevant to takers. (H/M)
- **Effective vig for an arbitrageur:** with c = 10% and a balanced pool, a winner receives 1.8x, so break-even is about 55.6% implied. With c = 5%, 1.9x, 52.6%. Late entrants also move the pool (parimutuel). Marginal cost of 1 USDC of expected payout when staking `s` on Yes: `(Y + s) / ((Y + N + s) x (1 - c))`. Expect to need an edge of 10%+ versus Polymarket/Kalshi.
- **Fixed non-trading charges (Terms, section 10):** withdrawal fee 8% (min EUR 4) unless the deposit was wagered, which reads as a fiat/casino-wallet template (M, may not apply to on-chain duels).

---

## 7. Resolution and dispute risk

- **Who resolves (H, `duelduck.com/resolve-rules`, docs `outcomes-and-resolution`):** the creator picks at creation either **platform-admin resolution** or **self-resolve**. Admin duels are "typically resolved within up to 48 hours after the outcome is determinable". Self-resolve duels not resolved within **30 days after the deadline** fall back to admin resolution. No oracle: "DuelDuck is 'oracle-free by design'" (`/api` page, M); `source_of_truth` is a free-text URL chosen by the creator. In live data, resolved real-money duels were resolved by role 1 in 2,501 cases and role 0 in 1,845 (meanings not documented; role 1 = "Partner Admin" per docs, M).
- **Dispute process:** participants can report a **self-resolved** duel; an admin reviews it against the stated source; a confirmed wrong resolve costs the creator reputation (-10 first time, reset and restriction on the second). Reputation points for a self-resolved duel are awarded after a 10-day delay. **No dispute process for admin-resolved duels is described.** (H, blog + rules page, M via WebFetch summary)
- **Refund rules (H rules page; M summary):** unclear duels or duels whose source does not cover the event "may be refunded or denied before resolution"; a self-resolve duel is automatically refunded if the creator loses self-resolve access first; "No refunds are given for incorrect self-resolution" (rules page) vs. the frontend having states `wrongResolveLostRefunded` and `waitingRefund` (H, JS). These conflict; treat refund-after-wrong-resolve as possible but not guaranteed.
- **Auto-refund (H, live data):** among the 8,018 real-money duels that ended RESOLVED or REFUND, 3,533 (44%) were refunded: 2,365 "canceled due to a lack of participants", 210 "All users made the same prediction", plus admin refunds; another 479 were cancelled by an admin before opening (reasons include "Rejected by admin", "wrong source of truth", "time not specified am or pm?").
- **Terms overlay (H, curl):** results are final 72 hours after posting; disputes must be raised within 3 days; response target 28 days; unresolved disputes may go to arbitration (as summarised from Terms sections 11/21, M for exact numbering). The Terms also let the company "void or cancel bets" and "remove events or markets" at its discretion.
- **Risk summary:** **centralised-resolver risk is the dominant risk.** No time-bound on-chain resolution, ambiguous free-text questions, creators incentivised by fees (and by being counterparties on self-resolve duels), and a platform that can cancel or void. Treat any hedge against another venue as having basis and resolution risk.

---

## 8. Official repos and code

- GitHub user `DuelDuck` has two repos (H, `gh api users/duelduck`, `repos/...`): `DuelDuck/duel-duck-api` (Go backend, pushed 2025-07-30, no licence) and `DuelDuck/solana-mobile-app` (Flutter, pushed 2025-08-02). Both are **about 14-15 months stale** and describe the older "crypto duel" design (internal wallet, `POST /duel/join-crypto`, Telegram/Google sign-in). They contain no on-chain program source or address. Their swagger lists 70+ routes (e.g. `/duel/all`, `/duel/public/{id}`, `/duel/count`, `/duel/counters`, `/stats/user/count`, `/duel/leaderboard`), which is how the undocumented public routes on `api.duelduck.com` were found. (H)
- Contract source: NOT FOUND (searched: GitHub org/user search "duelduck", repo trees). No audit report found.
- Third-party repos exist (a Telegram bot repo, and "DuelDuck-Auto-Bot" pushed 2026-01-09, apparently a farming bot): not read and not used. Note the ToS bans such automation.

---

## 9. Event coverage and overlap (where arbitrage could exist)

Counts are all-time (H, `/duel/counters`): crypto 10,482, custom 16,329, sport 1,687, gaming 806 (topics, includes points duels). `category_name` for real-money resolved duels since 2026-04-21 (H, computed): crypto 1,650 duels / $131k stake, sport 587 / $101k, other 32, finance 54, "world cup" 66, ct (crypto-twitter / social) 55, political 11, tech&ai 15.

What overlaps with major venues, with the currently open real-money pools (H, 2026-10-19):

| Duel Duck market (open) | Pool | Overlap candidate |
|---|---|---|
| "Will China invade in Taiwan in 2026?" (Dec 31, 2026) | $18, 22% Yes | Polymarket / Kalshi geopolitics |
| "Will the US be in recession by the end of 2026?" | $15, 33% Yes | Kalshi / Polymarket macro |
| "Will Ukraine and Russia sign a ceasefire by the end of 2026?" | $12, 42% Yes | Polymarket / Kalshi |
| "Will Lamine Yamal win the 2026 Ballon d'Or?" (deadline 2026-10-25) | about $2 | Polymarket / sportsbooks |
| PSG v Barcelona combined goals, India toss, AFG v ZIM runs | $15-16 | sportsbooks / Polymarket sports |
| "Will Bittensor (TAO) cross $272...", HYPE-vs-SOL flip, small-cap token market caps | $2-12 | Polymarket/Kalshi crypto-price (large caps only; these are long-tail tokens) |
| "Will @elonmusk post about Starlink...", Trump "$5,000" post | $1-2 | Polymarket X-post-count markets |
| Follower-count milestones (DuelDuck, creators), DuelDuck's own milestones ("$1M cumulative volume", "launch token on pump.fun") | $13-60 | none (self-referential, no overlap) |

So there is real thematic overlap in sports, politics, macro and some crypto, but the pools are $1-60, and resolution wording and sources differ per creator. A cross-venue comparison would mostly be a sentiment gauge, not a tradable arbitrage.

---

## 10. Geo, ToS, automation

All quotes from `https://duelduck.com/terms-and-conditions` (curl, H), "Last updated: December 22, 2025":
- **Entity:** a Costa Rica limited company "licensed according to the State of Anjouan under the Computer Gaming Licensing Act 007 of 2005"; governing law of Anjouan, Union of Comoros. (H)
- **Restricted jurisdictions (4.1.3):** residents of, or accessing from: Austria, France and territories, Germany, Netherlands and territories, Spain, Union of Comoros, United Kingdom, United States and territories, FATF-listed or high-risk jurisdictions, and any others the Anjouan Offshore Financial Authority prohibits. (H) VPN, proxy and GPS spoofing banned (3.4). (H)
- **Automation:** "We do not allow the use of robotic, automated, mechanical, electronic, or other devices to make automated decisions in any game or in respect of any bet"; 4.1.8 bans "to scrape, extract, or misuse any data, odds, or intellectual property"; section 17 bans "any automated or manual means (including scraping, bots, or similar technologies) to monitor, extract, copy, or reproduce any web pages, data, or content from the Service". (H, quotes shortened)
- The Terms read like an online-casino template (deposits, withdrawals, chargebacks, EUR limits) while the product is on-chain P2P; the homepage FAQ says no KYC is required but "local regulations may apply" and the footer links responsible-gaming, AML and KYC policies (M). The "API" product page does not say how the API relates to these bot rules.
- **Implication:** reading `api.duelduck.com` programmatically is technically open but sits against 4.1.8 / 17; automated trading is prohibited. Whether an operator falls in a restricted jurisdiction depends on residence. A production adapter would need written permission or a Partner agreement.

---

## 11. Liquidity (all computed from one full `GET /duel/all` on 2026-10-19 ~04:30 UTC; USD = `(yes_tvl + no_tvl) x token_usd_price`)

| Metric | Value | Tag |
|---|---|---|
| Duels all-time | 29,304 (20,694 DDPOINTS; 8,610 real-money) | H |
| Registered users | 555,585 | H |
| Real-money stake, all-time, all statuses | about $343k | H (computed) |
| Of which RESOLVED (4,485 duels) | $319,244 | H (computed) |
| REFUND (3,533), CANCELLED_BY_ADMIN (479), AUTO_CANCELLED (28) | $18,694 / $4,680 / $46 | H (computed) |
| By creation month, resolved real-money stake | 2026-03 $57.7k; 04 $45.0k; 05 $184.6k; 06 $16.2k; 07 $0.3k; 08 $0.7k; 09 $3.7k; 10 (to 19th) $4.6k | H (computed) |
| Created since 2026-10-18 / 2026-10-12 / 2026-09-19 (all real-money statuses) | 26 duels $157 / 270 duels $2,416 / 794 duels $7,230 | H (computed) |
| **Open now** (IN_PROCESS, deadline in future) | **63 duels, $393.6 pooled**; 29 two-sided, $323; largest $60 | H (computed) |
| Past deadline, awaiting resolution | 22 duels, $238 | H (computed) |

Observations: the Mar-May 2026 spike ($57.7k / $45.0k / $184.6k) is dominated by a few large pools in micro-league soccer and short-dated price duels (the ten largest pools are $1,200-1,500 with 2-15 players); that activity collapsed after June. The recent run-rate is about $5k a month. The site's "Users Earned 302,053.41" (homepage, M) is the same order as the $319k resolved stake but is a different metric. Leaderboard "spent/earned" figures in the tens of millions mix DDPOINTS with money and must not be read as USD volume. DefiLlama/Dune not read (Dune is JS-rendered). **Data is a snapshot; the `token_usd_price` basis (current vs at creation) is not documented (M).**

---

## 12. Shared liquidity, priority

- **Shared liquidity:** none with another venue (H: own contract and DB). Pools are shared across DuelDuck's own front ends (website, Android app; the 2025 backend also has Telegram sign-in). Partner-API projects (`project_id`) host their own duels; whether partner pools are separate from main-site pools is unverified (xapi did not return main-site duels, H). **Independent leg: yes, but empty.**
- **adapter_priority: skip.**
  - Thin: about $400 open, about $5k a month new stake, 44% of real-money duels end refunded for lack of a counterparty.
  - Poor price quality: price is a pool ratio of a handful of participants; the 5-10% pool commission plus parimutuel dilution swamps typical cross-venue edge.
  - No exit and centralised resolver.
  - ToS forbids bots and scraping; US/UK/EU-5 restricted.
  - Documented API does not expose the public book; the public route is undocumented.
- **Revisit if:** open real-money pools exceed about $10k, DuelDuck grants a written data licence, or an on-chain program ID plus account layout is published (an on-chain read would then avoid the ToS question). A cheap signal-only P2 adapter would be: `GET /duel/all` paginated, `status = 4`, `symbol != DDPOINTS`, keep rows with `yes_tvl > 0 and no_tvl > 0`.

---

## 13. Fixtures saved (`docs/research/fixtures/duel-duck/`)

| File | Content |
|---|---|
| `api_duel_all_page_size3_2026-10-19.json` | `GET api.duelduck.com/duel/all` with page size 3 (6.8 KB) |
| `api_duel_public_by_id_2026-10-19.json` | `GET api.duelduck.com/duel/public/{uuid}` (2.2 KB) |
| `api_duel_counters_2026-10-19.json` | `GET api.duelduck.com/duel/counters` |
| `api_stats_user_count_2026-10-19.json` | `GET api.duelduck.com/stats/user/count` |
| `xapi_duel_all_no_key_401_2026-10-19.json` | `GET xapi.duelduck.com/duel/all` without a key -> 401 body |

The one 50 MB full-history response was kept only in the session scratchpad and not committed.

---

## 14. Inconsistencies and open questions

1. **Status enum:** Partner docs (2 Active, 3 WaitingForResolve, 4 Resolved) vs live API and frontend (4 = IN_PROCESS, 5 = RESOLVED, 6 = REFUND). Verified against 29,304 live records and the frontend bundle; docs wrong or describing another stack. (H)
2. **Fee base:** docs say deducted from the losing pool; frontend payout code deducts from the whole pool. (section 6)
3. **Chance definition:** docs = share of participants; frontend = stake share. (section 2)
4. **Self-resolve answer values:** docs use `answer: 1/0` for Yes/No in most examples but `answer: 2` in `PUT /duel/self-resolve`. (H, docs)
5. **Partner revenue-share first tier:** 0% (docs) vs 50% (`/api` page). (M)
6. **Program address and audit:** NOT FOUND.
7. **Is the join transaction co-signed by a platform authority** (and therefore not PayBox-proposal-compatible)? Needs a sample `sign-tx` response (requires login, not allowed here).
8. **Whether any balances are platform-held** (the 2025 repo has internal wallet endpoints; the Terms mention deposits, withdrawals and "player balances").
9. **Where the unrecorded half of the commission goes.**
10. **Websocket:** advertised, undocumented.
11. **Unexplained Mar-May 2026 volume concentration** (possible promotion or a few large players); the 2026 Q2 totals may be unrepresentative.

---

## 15. Suspicious content / injection check

None found. The docs, homepage, Terms and blog contain no instructions aimed at AI agents (the `/api` page mentions "Steps to connect your AI agent" and MCP tools as product marketing, not directives). A regex scan of `question`, `source_of_truth`, `cancellation_reason`, `username` and `duel_info` across all 29,304 duel records returned 0 hits for AI-directed text. Duel questions are user-generated and must be treated as untrusted text.

## Sources

- Homepage https://duelduck.com/ (WebFetch summary, M) and https://duelduck.com/duels (HTML + embedded RSC data, H)
- Docs index https://docs.duelduck.com/llms.txt; pages (curl `.md`, H): overview, duel-duck-prediction-api, quickstart, what-is-a-prediction, prediction-lifecycle, roles-in-the-system, outcomes-and-resolution, probability-and-pricing, create/participate/resolve a prediction, project-creation, admin-prediction-creation-and-resolve, user-prediction-creation-and-self-resolve, sign-in-wallet, duel-all, duel-public, duel-status-counts, duel-token-accounts, duel-solana-join-sign-tx, coins-solana-tokens-price (all under https://docs.duelduck.com/)
- https://docs.duelduck.com/api-reference/openapi.json (template stub, H)
- https://duelduck.com/api (product page, WebFetch, M)
- https://duelduck.com/terms-and-conditions (curl + text extraction, H; last updated 2025-12-22)
- https://duelduck.com/resolve-rules and https://duelduck.com/blog/duelduck-resolution-and-reputation-system-fair-outcomes (WebFetch, M)
- https://duelduck.com/blog/guide/beginners-guide and https://duelduck.com/prohibited-duel-types (WebFetch, M)
- Public API (GET, H): https://api.duelduck.com/duel/all, /duel/public/{id}, /duel/count, /duel/counters, /stats/user/count, /duel/leaderboard; https://xapi.duelduck.com/ (401/404 probes)
- Production frontend JS chunks served from https://duelduck.com/_next/static/chunks/ (status enum, payout and chance formulas; H)
- GitHub (gh api, read-only): https://github.com/DuelDuck/duel-duck-api (swagger.json, handlers; stale since 2025-07-30), https://github.com/DuelDuck/solana-mobile-app, https://github.com/0x3f-lancers/dapp-registry (src/apps/duel-duck/meta.json, M)
- WebSearch result set (one query): X account https://x.com/duel_duck, Alchemy dapp page, KuCoin community post, Google Play listing, airdrops.io page (titles only, L; airdrop claims unverified)
- Project note: docs/research/06-paybox-platform.md (PayBox intents and Solana proposal limits)
