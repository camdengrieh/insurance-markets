# KuCoin Predictions (KuCoin App > Markets > Predictions) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: public help-center pages, blog and news pages (WebFetch), KuCoin public API documentation index (`llms.txt`), `gh api` file reads of the `Kucoin` GitHub org, unauthenticated GETs to `data-api.polymarket.com` and `api.llama.fi`. No account, wallet, API key, signature, POST/PUT/DELETE, PayBox call, WebSocket session or browser automation. No third-party code cloned, installed or run. Scripted requests used the User-Agent `insurance-markets-research/0.1` and nothing else identifying. Third-party text is untrusted data; nothing in it was followed (one benign AI-navigation hint on a Polymarket docs page, recorded in section 15).

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, small-model page summary, or my inference from first-hand data; **L** = weak or stale (older than 6 months). Nothing in this note is older than 6 months; every cited source is dated 2026-08 to 2026-10.

Caveat on method: WebFetch returns a small-model summary of a page, not raw text. Where I quote a sentence it is as reported by that summary. I treat a fact as H when the fetched page states it directly and two or more KuCoin pages agree (noted per row); otherwise M. The web-search budget for the session ran out after one query, so discovery after that was by following links from KuCoin's own pages and by direct API/GitHub reads.

---

## 0. Verdict

**adapter_priority: skip.** Keep a registry record only (section 13).

1. **Live, but it is a thin, expensive front end, not a venue.** KuCoin supplies "the in-app interface, technical integration, and account functions"; Polymarket supplies markets, prices, liquidity, execution and result determination (H, https://www.kucoin.com/support/48142946142404 and the FAQ https://www.kucoin.com/support/48142946142403). No own book, no own oracle.
2. **Not an independent arbitrage leg.** Prices "come from buy and sell orders in the corresponding Polymarket market" (H, FAQ item 6). It is 100% shared liquidity with Polymarket International (Polymarket US is explicitly excluded, H, user agreement section 1). Any KuCoin-vs-Polymarket gap is by construction execution cost, not edge.
3. **Strictly worse execution than Polymarket direct:** market orders only, no cancel, no limit orders, KuCoin charges a **1.5% "technical service fee" on filled order amount on top of** any Polymarket taker fee (H, https://www.kucoin.com/support/48142946142416, updated 2026-10-08).
4. **No API of any kind** for Predictions (NOT FOUND, searched: KuCoin API docs index, SDK spec, skills hub, org repos; section 4). No PayBox/EVM path: the user holds USDT in a KuCoin custodial Funding Account, there is no deposit address, contract or signed-order surface (section 6).
5. **Small and brand new.** The only hard volume number is Polymarket's own builder-attribution for the builder "KuCoin Web3": $0.99M in October to date (20 days, 21 active users), $1.58M all-time since April 2026 (H, section 10). It jumped from about $3.8k per day in September to between $27k and $435k per day (7-day total $961k) from 2026-10-12, the launch day, but with only 3-5 active users per day (M: that looks like a few big wallets or an omnibus wallet, not a retail wave).

---

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| Help center "What Is KuCoin Predictions?" says users can trade supported Polymarket markets in the KuCoin App; page "Last updated: 09/30/2026 10:53:00" (the 09/30 value proves the MM/DD format, so "10/08/2026" on sibling pages = 8 October). | H | https://www.kucoin.com/support/48142946142404 |
| Trading-fee, order-execution, resolution, cancel/dispute, assets, 5-minute-BTC and access-FAQ articles all show "Last updated 10/08/2026 05:59" (i.e. 2026-10-08, four days before launch). FAQ and user agreement show 09/30/2026. | H | URLs in section 17 |
| KuCoin blog, dated 2026-10-16: "KuCoin Predictions, powered by an integration with Polymarket, launches on October 12" (tense inconsistent with the date; year implied 2026). | H (page) / M (tense) | https://www.kucoin.com/blog/why-prediction-markets-are-crypto-next-big-business-line |
| KuCoin news flash, release time 2026/10/16 10:16:54: "KuCoin Launches Predictions Feature for Trading Event Markets with USDT"; requires KuCoin App 5.0.1 or later. | H | https://www.kucoin.com/news/flash/kucoin-launches-predictions-feature-for-trading-event-markets-with-usdt |
| Coin Edition, 2026-10-16: calls the launch "planned", app 5.0.0 or later. App version differs across sources (5.0.0 vs 5.0.1); the help center says 5.0.0 or later. | M | https://coinedition.com/prediction-markets-move-into-familiar-financial-apps-as-kucoin-expands-access-to-polymarket/ |
| Independent confirmation of real trading: Polymarket's builder data for builder "KuCoin Web3" shows daily volume jumping from $3,437 (2026-10-11) to $92,282 (2026-10-12), $167,360 (10-13) and $434,878 (10-18). Causal link to the Predictions launch is my inference (same date as the announced launch). | H (numbers) / M (link) | fixture `polymarket_data-api_builders_volume_kucoin-web3_2026-10-19.json` |
| Earlier, separate product: KuCoin Web3 Wallet gives access to Polymarket directly on Polygon (blog dated 2026/08/26). That is a different path from Predictions; see section 6. | H | https://www.kucoin.com/blog/what-is-polymarket-how-to-trade-it-on-kucoin-web3 |

**still_live = true** (launched 2026-10-12, one week old at research time).

---

## 2. Kind and market model

- **Kind:** broker / front end (custodial exchange-app feature) routing to Polymarket International. KuCoin "does not act as your counterparty" and is "a technical facilitator that transmits your instructions" (H, user agreement section 2.5 and 4.3, https://www.kucoin.com/support/48142946142383).
- **Market model:** identical to Polymarket's. Each KuCoin market "maps to a Polymarket market" (H, https://www.kucoin.com/support/48142946142414). So binary YES/NO shares on a CLOB, plus Polymarket's neg-risk categorical events; shares pay $1 or $0. The KuCoin help pages describe only binary-style "outcome options" and a 5-minute "Up or Down" BTC market; categorical and scalar behaviour is not described (NOT FOUND on KuCoin; defer to the Polymarket venue note).
- **Which Polymarket markets:** only "supported" ones; availability differs by region and by market (H, help center). **No public market list** (NOT FOUND, searched: help center, blog, docs). Only the in-app list shows them, so the subset cannot be enumerated from outside.
- **Order types:** **market orders only**; "Predictions currently supports market orders only." Orders execute as taker orders on Polymarket. Price protection applies; fills can be partial or zero; unfilled USDT returns to the Funding Account. Submitted orders **cannot be canceled**. Selling is a new market order, not a reversal. Min/max order size: not stated on the fee/execution pages; the access FAQ says order amounts "must meet the minimum or maximum limits on the order page" without numbers (H, https://www.kucoin.com/support/48142946142413 , https://www.kucoin.com/support/48142946142417).
- **Tokenisation:** not exposed. The user sees positions in the app (Predictions > Assets), not tokens. Under the hood these are Polymarket conditional-token shares held through "KuCoin's Web3 wallet infrastructure" (H, user agreement section 2.3, 5.1). Whether it is an omnibus wallet or per-user proxy wallets is not stated (NOT FOUND).
- **Special market:** "5-Minute Bitcoin Up or Down". Resolves from the **Chainlink BTC/USD TWAP (60-second) data stream**; Up wins if the five-minute TWAP is >= the start price, **a tie resolves Up** (H, https://www.kucoin.com/support/48142946142410). No order cutoff time is stated.

---

## 3. Chains and collateral

- **User-facing collateral: USDT only**, held in the KuCoin **Funding Account**. Orders can be funded from Funding, Financial or Trading accounts (the app moves USDT to Funding first). USDC is not mentioned. Proceeds are credited automatically in USDT to the Funding Account, "subject to any applicable conversion and fees, disclosed in the product" (H, https://www.kucoin.com/support/48142946142411 and FAQ item 2, 13).
- **Underlying chain / collateral:** not stated for Predictions (NOT FOUND). Polymarket International trades on Polygon (DefiLlama lists chain Polygon, H) and KuCoin's separate Web3-wallet route uses USDC + POL gas on Polygon (H, blog 2026/08/26). So KuCoin must convert USDT to Polymarket's collateral behind the scenes (M, inference). Polymarket's V2 protocol reportedly launched 2026-10-06 with V2 markets from 2026-11-02 (M, KuCoin news-flash index via search result; not verified, covered by the Polymarket venue note).
- **No on-chain surface for the user:** there is no Predictions deposit address, contract or approval. Funding is an internal KuCoin account transfer.

---

## 4. Read API

- **exists = none** (no official, public or authenticated API for Predictions).
- Searched and found nothing:
  - KuCoin API documentation index https://www.kucoin.com/docs-new/llms.txt (96,660 bytes, fetched 2026-10-19): zero lines containing "predict" or "polymarket". Top-level sections: Introduction, Authentication, Enums, SDK, OpenClaw (skills hub), Rate Limit (UTA and Classic), Change Log, User Service, UTA REST V2 / WebSocket V2, Classic REST / WebSocket, **Web3 Wallet (only "Browser Extension Wallet", an injected EVM wallet provider with `enable`, `request` for `personal_sign` / `eth_sendTransaction`)**, Error Code. Docs page "Modified at 2026-08-29" (H).
  - Universal SDK spec `Kucoin/kucoin-universal-sdk/spec/apis.csv` (251 lines; groups: account, affiliate, broker, copytrading, earn, futures, margin, service, spot, viplending): zero matches for predict/polymarket/outcome/event. Repo pushed 2026-09-15 (H, `gh api`).
  - `Kucoin/kucoin-skills-hub` (agent skills marketplace, last push 2026-03-17): skills = assets, broker, convert, earn, futures-trading, margin-trading, spot. No predictions skill (H, tree read).
  - The Predictions help center has no article on API access; FAQ lists "API access" under "Not covered" (H).
- **Base URLs of KuCoin's general API** (not Predictions): `https://api.kucoin.com` (UTA and Classic Spot/Margin), `https://api-futures.kucoin.com`, `https://api-broker.kucoin.com` (H, docs-new index). Irrelevant to this venue.
- **WebSocket, rate limits, pagination for Predictions:** NOT FOUND (none exist publicly).
- **User agreement mentions that orders "may be sent through APIs or technical connections" (section 2.2)**, which is KuCoin-to-Polymarket plumbing, not a user API (H text, M reading).
- **Practical read path for an aggregator:** none from KuCoin. Everything KuCoin shows (market, price, depth) is Polymarket's, which the Polymarket adapter already reads (Gamma / CLOB / Data APIs, covered by the parallel Polymarket note).

### Fixtures (the only machine-readable KuCoin-related data that exists)

The one public, unauthenticated, machine-readable footprint of KuCoin Predictions is Polymarket's own builder-attribution data for the builder profile "KuCoin Web3" (builder code `0xc67de09acf34a47952d0402ecb26e0a9e02f6a80e7d60f6ee267988f9eaadb69`, a public attribution identifier, not a secret). Shapes confirmed 2026-10-19:

- `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=DAY|WEEK|MONTH|ALL` returns a flat list of `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}` (DAY response was 17 MB, so filter client-side). Undocumented path on a Data API reported (by a sibling note, M) to be retired around 2026-10-24.
- `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY|WEEK|MONTH|ALL&limit=50&offset=N` returns `[{rank, builder, builderCode, builderLogo, verified, volume, activeUsers}]`; `limit` is capped at 50, `offset` works (I used 100 to find the all-time rank).
- Consistency check: the sum of KuCoin Web3's seven monthly buckets (Apr 2026 $89.52 through Oct 2026 $985,851.45) equals the yearly ALL bucket exactly ($1,576,572.12) (H, my computation on the fixture).
- Whether builder "KuCoin Web3" is the code attached by the Predictions feature (versus KuCoin's Web3-wallet-to-Polymarket route) is not stated anywhere I could read (M). The timing match with the 2026-10-12 launch and the earlier trickle from 2026-04-24 (first row: $1.11, 1 user) suggest both products share one code.

---

## 5. Trade path

- **None for an aggregator.** No programmatic order placement, no signing scheme, no API key for Predictions. Orders are placed by a logged-in, KYC-verified human in the KuCoin App (Pro mode), amount entered in USDT, source account chosen, confirmation page shows estimate and fees (H, FAQ item 3, access article).
- Inside KuCoin the order is turned into a Polymarket order by KuCoin (it "transmits your instructions"; section 4.3 of the user agreement) and, by the evidence in section 4, carries the "KuCoin Web3" builder code (M).
- Automating the app with a browser or reverse-engineering its private endpoints is out of scope (read-only brief) and unwise given the ToS (section 9).
- **Correct route for an agent that wants this exposure:** trade the same market on Polymarket directly (covered by the Polymarket adapter). Same book, no 1.5% KuCoin fee, limit orders, cancel, real API.

---

## 6. PayBox reachability

**paybox_reachable = no.**

- Funds live in a KuCoin custodial account (Funding Account, USDT). There is no user-controlled address, no approval to a KuCoin contract, no signed-order endpoint. A PayBox EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) or Solana wallet cannot place or cancel a KuCoin Predictions order; it could only fund a KuCoin account by an ordinary on-chain deposit to KuCoin, which still leaves ordering to the app (and KuCoin deposit addresses and KYC are out of scope here).
- The adjacent **KuCoin Web3 Wallet** is a separate non-custodial browser-extension/mobile wallet that can use Polymarket on Polygon (USDC + POL gas, H, blog 2026/08/26). A PayBox wallet gets nothing from that either; a PayBox Polygon wallet should talk to Polymarket directly instead.
- Nothing here needs a PayBox contract read or call; none was made.

---

## 7. Fees

| Fee | Formula / amount | Who pays | Tag | Source |
|---|---|---|---|---|
| KuCoin "technical service fee" | **1.5% x actual filled order amount**; applies "even in markets with no Polymarket taker fee"; based on filled amount, so partial fills pay less | The user, charged on the order, shown at the confirmation page (the article does not say explicitly whether it is added on top of or taken out of the USDT amount) | H | https://www.kucoin.com/support/48142946142416 (updated 2026-10-08); FAQ item 15 |
| Polymarket taker fee (passed through) | "depends on the market and share price", some markets none; **no percentage or formula on KuCoin pages** (NOT FOUND on KuCoin; see the Polymarket note for the formula) | The user (all KuCoin orders are market = taker) | H (that it exists) | same |
| Sell-side KuCoin fee | Not stated whether the 1.5% also applies to sells. A sell is "a new market order" and the fee article says it applies to "Predictions orders", so probably yes (M, inference) | User | M | execution + fee articles |
| Spread / markup | Not stated; "no KuCoin fee, spread, or markup" beyond "applicable fees" in the agreement (section 5.1) | | H (absence) | user agreement |
| Gas, deposit, withdrawal | Not covered. Conversion on the way back is "subject to any applicable conversion and fees, disclosed in the product" | | H (absence) | assets article |

**Arbitrage implication:** a round trip through KuCoin costs about 3% of notional (1.5% on the buy, probably 1.5% on the sell) plus two Polymarket taker fees, versus Polymarket-direct maker/taker fees. No cross-venue edge can come from KuCoin.

---

## 8. Resolution mechanism and dispute risk

- **Resolver:** Polymarket, under each market's own rules and result source. KuCoin "does not independently determine results" and "does not verify outcomes" (H, user agreement section 2.5 and 4.4; resolution article https://www.kucoin.com/support/48142946142414). UMA is **not named** on any KuCoin page (the Polymarket venue note covers Polymarket's UMA-based resolution; M here).
- **Payout:** winning shares $1, losing $0, credited automatically in USDT to the Funding Account; "no manual on-chain redemption" (H, blog 2026-10-16, resolution article). Records under Predictions > Assets > History.
- **Timing:** event end is not settlement; settlement waits for Polymarket's confirmation "plus any challenge or dispute process". No fixed window or dispute length stated (H).
- **Cancel / dispute:** KuCoin does not decide; no 50/50 or refund formula is described; "Do not treat cancellation as though one outcome simply lost"; do not assume funds are returned on a schedule (H, https://www.kucoin.com/support/48142946142415).
- **Extra layers of risk beyond Polymarket's own** (all H, user agreement https://www.kucoin.com/support/48142946142383, updated 2026-09-30):
  - Displayed amounts "may be provisional until final execution" (section 5.4); KuCoin may correct account records to match Polymarket's result (5.5).
  - Funds can be locked or unavailable for withdrawal while orders or disputes are pending (5.2).
  - If KuCoin restricts service it may permit closing trades only, cancel unexecuted orders, or process redemptions from Polymarket or protocol data, and "existing positions are not guaranteed to be closable" (section 11).
  - "Polymarket's records, together with the relevant blockchain and smart-contract records, will prevail" (section 4.5).
  - Counterparty risk on KuCoin itself (custodial exchange account).

---

## 9. Geo, ToS, automation

- **Eligibility:** Identity Verification (KYC) required, completing KYC "does not guarantee access"; KuCoin App 5.0.0+ (news flash says 5.0.1+), **Pro mode** (Markets > Predictions); "supported countries and regions" based on location and ordinary residence; unavailable in "certain countries and regions". **No country list anywhere** (NOT FOUND, searched: "Who Can Use Predictions?" https://www.kucoin.com/support/48142946142405 , "Why Can't I Access" https://www.kucoin.com/support/48142946142417 , FAQ, blog, user agreement). Eligibility is KuCoin's call "based on law, sanctions, and internal compliance" (agreement section 3.1) (H).
- **Polymarket US and other US-regulated platforms are excluded** from what "Polymarket" means in the agreement (section 1, H). Whether US persons can use KuCoin Predictions at all is therefore NOT FOUND (do not assume).
- **VPN / location:** prohibited to "use a virtual private network, proxy or other method to conceal or misrepresent your location" (agreement section 3.3, H). FAQ: "not to bypass access restrictions".
- **Automation:** the agreement sets no bot or API rules for users; it bans manipulation, abusive trading and "interference with the service" (section 9) (H, absence + text). Since no API exists, automation would mean driving the app, which I treat as unsupported.
- **Entity:** the agreement does not name a KuCoin legal entity (NOT FOUND; it refers only to "KuCoin's Web3 Wallet").

---

## 10. Liquidity

| Metric | Value | Tag | Source / date |
|---|---|---|---|
| Own order book / TVL / OI | none (shares Polymarket's) | H | help center FAQ; DefiLlama has no "KuCoin Predictions" protocol (`https://api.llama.fi/protocols` returned KuCoin id 2274 CEX, Polymarket International 711, US 7656, Combos 8223, Perps 8583; no KuCoin Predictions entry) 2026-10-19 |
| Polymarket-attributed volume, builder "KuCoin Web3", all time | **$1.576M**, 311 active users; ALL-window leaderboard rank 132 | H | Polymarket Data API, 2026-10-19 (fixture) |
| Monthly (builder data) | Apr 2026 $89.52 (1 user); May $36,142 (48); Jun $193,478 (142); Jul $131,904 (108); Aug $115,410 (102); Sep $113,697 (36); **Oct 1-19 $985,851 (21 users, rank 47 in MONTH)** | H | `/v1/builders/volume?timePeriod=MONTH`, 2026-10-19 |
| Weekly | week starting 2026-10-11: $529,699 (13 users); week starting 2026-10-18 (partial, 2 days): $435,009 (4 users, rank 17) | H | `/v1/builders/volume?timePeriod=WEEK` |
| Daily since launch | 10-12 $92,282; 10-13 $167,360; 10-14 $45,801; 10-15 $27,098; 10-16 $65,917; 10-17 $127,803; 10-18 $434,878 (4 users); 10-19 partial $538 | H | `/v1/builders/volume?timePeriod=DAY` |
| Daily in September (baseline) | median about $1.7k, mean $3.8k, 2-9 active users | H | same, my computation on the fixture |
| Scale vs another front end | MetaMask-attributed volume was $28.9M in September 2026 per the sibling note (H there); KuCoin's whole October to date is about 3% of that | M | `docs/research/venues/metamask-polymarket-integration.md` |
| Marketing figures on KuCoin's blog | industry-wide only ($63.5B notional 2025, >$50B in June 2026, Bernstein projections); **no KuCoin Predictions volume published** | H | blog 2026-10-16 |

Caveats: (a) "volume" is Polymarket's definition: "credited to your builder account for every matched trade where your code is attached"; whether both sides of a trade count is not stated (H, https://docs.polymarket.com/programs/builders/overview.md). (b) Matched volume can take up to 24 hours to appear (same page), so the 2026-10-19 row is incomplete. (c) The KuCoin Web3 builder may include the Web3-wallet route as well as Predictions. (d) 3-5 active users on a $435k day means a few very large accounts or a shared wallet: do not read it as a broad retail base.

---

## 11. Event categories and overlap

- Categories named by KuCoin: crypto, sports, politics and "other topics"; "popular events"; a 5-minute BTC Up/Down market (H). The exact subset of Polymarket's catalog is NOT FOUND (no public list).
- **Overlap = total.** Every KuCoin market is a Polymarket market, so each overlaps with whatever other venues overlap Polymarket (sports with Kalshi/Betfair/books, politics with Kalshi/PredictIt, crypto price with Kalshi/Limitless/Aster-style 5-minute products, macro with Kalshi). But KuCoin is never the better place to take either side, so it adds no leg.

---

## 12. Shared liquidity

**Shares liquidity with: Polymarket International (Polygon CLOB). Not an independent arbitrage leg** (H: KuCoin says "Polymarket supplies the markets, prices, liquidity, order execution, and result determination"). Same pool as MetaMask Predictions, Gate/other Polymarket builders, and every other builder-code front end.

---

## 13. Priority and registry recommendation

- **adapter_priority: skip.** Reasons: no API, duplicate liquidity, worse fee stack, no trade path, tiny and concentrated flow. Revisit only if KuCoin publishes a Predictions/Event API, or if its own non-Polymarket markets appear (the agreement is Polymarket-specific, so none are signalled).
- **Registry record only** (consistent with the pool-graph rule in `docs/platform-registry-design.md`): `kind: broker`, `routes_to: polymarket-international`, `pool: polymarket-international`, `independent_liquidity: false`, `fee_stack: {front_end: 0.015 of filled amount, plus Polymarket taker fee (market/price dependent)}`, `order_types: [market]`, `cancel: false`, `collateral_user_side: USDT (custodial)`, `builder_code: 0xc67de09a...adb69 (Polymarket builder "KuCoin Web3", M)`, `geo: unspecified (KYC, supported regions only, VPN banned)`, `platform: mobile/desktop app Pro mode`, `api: none`, `state: live since 2026-10-12`.
- **Optional P2-style signal, not recommended:** Polymarket builder volume for "KuCoin Web3" as a flow indicator. Too few users and an undocumented endpoint with a reported retirement; low value.
- **Quotient angle:** none; no data feed to ingest.

---

## 14. NOT FOUND (what I looked for)

- Any official API (REST, WebSocket, SDK, OpenAPI) for Predictions. (searched: docs-new llms.txt, SDK `spec/apis.csv`, `kucoin-skills-hub` tree, the 29 repos of the `Kucoin` GitHub org, help-center FAQ.)
- List of supported or restricted countries/regions. (searched: 7 help-center articles, user agreement, blog, news flash, Coin Edition.)
- Minimum and maximum order size; price-protection thresholds; order rate limits. (searched: execution, fee, access, 5-minute-BTC articles.)
- Polymarket taker fee percentage or formula on KuCoin pages.
- Whether the 1.5% applies to sells; whether the fee is added on top of or deducted from the USDT order amount.
- Custody structure (omnibus vs per-user Polymarket wallets), underlying collateral and chain, contract or wallet addresses. (searched: user agreement, FAQ.)
- KuCoin legal entity operating Predictions.
- KuCoin-reported volume, users, OI or TVL; DefiLlama listing.
- Public enumeration of the supported-market subset.
- Confirmation that builder "KuCoin Web3" equals the Predictions integration.
- Help-center articles not read: "How to Trade Prediction Markets on KuCoin" (48142946142408), "How to Sell a Prediction Position Before Settlement" (48142946142409), "Understand Prices and Probabilities" (48142946142412), "Why Hasn't My Market Settled" (48142946142420), "Why Is a Market Paused" (48142946142419), "Why Does My Execution Price Differ" (48142946142418). Titles known from section indexes; their content should add little beyond the pages read.
- Further web searches (budget exhausted after one extended query).

---

## 15. Open questions and suspicious content

Open questions:
1. Is the 1.5% added on top of the USDT order amount or carved out of it, and does it apply on sells? (changes round-trip cost between about 1.5% and about 3.0%)
2. Does KuCoin hold Polymarket positions in one or a few omnibus wallets (consistent with 3-5 "active users" per day at $100k+ volume)?
3. Are US persons excluded? Is the region list obtainable without an account?
4. Does the Polymarket V2 migration (reported 2026-10-06 / 2026-11-02, M) change collateral or fees for KuCoin?
5. Does the Polymarket Data API v1 builder endpoint survive (reported retirement 2026-10-24, M, from the MetaMask sibling note)?

Suspicious / embedded-instruction content: **none aimed at agents on any KuCoin page** (every fetched KuCoin page was checked; the only AI-adjacent items were a navigation-menu label "AI Kia", an "OpenClaw" docs-sidebar entry and a `llms.txt` footer link, all inert). One benign hint on Polymarket's docs page https://docs.polymarket.com/programs/builders/overview.md: header text "Use this file to discover all available pages before exploring further." It is a navigation hint for AI tools; not followed.

---

## 16. Fixtures

Directory `docs/research/fixtures/kucoin-predictions/` (2 files, largest 21 KB):

| File | Source | Shows |
|---|---|---|
| `polymarket_data-api_builders_volume_kucoin-web3_2026-10-19.json` | `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=DAY/WEEK/MONTH/ALL`, filtered client-side to builder `KuCoin Web3`, logo URL dropped | row shape, daily rows 2026-09-01..2026-10-19, all weekly and monthly rows, yearly all-time bucket |
| `polymarket_data-api_builders_leaderboard_kucoin-web3_2026-10-19.json` | `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=...&limit=50[&offset=100]` filtered to `KuCoin Web3` | rank and volume per window (WEEK rank 18, MONTH rank 47, ALL rank 132) |

No KuCoin API fixture exists because there is no KuCoin Predictions API.

---

## 17. Sources

KuCoin (primary, all fetched 2026-10-19):
- What Is KuCoin Predictions? https://www.kucoin.com/support/48142946142404 (updated 09/30/2026) (H)
- KuCoin Predictions FAQ https://www.kucoin.com/support/48142946142403 (09/30/2026) (H)
- Who Can Use Predictions? https://www.kucoin.com/support/48142946142405 (09/30/2026) (H)
- Why Can't I Access KuCoin Predictions? https://www.kucoin.com/support/48142946142417 (10/08/2026) (H)
- Predictions Trading Fees https://www.kucoin.com/support/48142946142416 (10/08/2026) (H)
- How Prediction Market Orders Are Executed https://www.kucoin.com/support/48142946142413 (10/08/2026) (H)
- How Are Prediction Markets Resolved and Settled? https://www.kucoin.com/support/48142946142414 (10/08/2026) (H)
- What Happens If a Prediction Market Is Canceled or Disputed? https://www.kucoin.com/support/48142946142415 (10/08/2026) (H)
- Which Assets Can I Use https://www.kucoin.com/support/48142946142411 (10/08/2026) (H)
- How to Trade the 5-Minute Bitcoin Up or Down Market https://www.kucoin.com/support/48142946142410 (10/08/2026) (H)
- Polymarket Integration User Agreement and Risk Disclosure https://www.kucoin.com/support/48142946142383 (09/30/2026) (H)
- Help-center category and section indexes https://www.kucoin.com/support/categories/47134508281836 , .../sections/47134508281844 , .../47134508281843 , .../47134508281845 (H)
- Blog (2026-10-16) https://www.kucoin.com/blog/why-prediction-markets-are-crypto-next-big-business-line (H)
- News flash (2026-10-16) https://www.kucoin.com/news/flash/kucoin-launches-predictions-feature-for-trading-event-markets-with-usdt (H)
- Blog on Polymarket via KuCoin Web3 Wallet (2026-08-26) https://www.kucoin.com/blog/what-is-polymarket-how-to-trade-it-on-kucoin-web3 (H)
- API docs https://www.kucoin.com/docs-new , index https://www.kucoin.com/docs-new/llms.txt , Web3 wallet page https://www.kucoin.com/docs-new/web3/browser-extension-wallet.md (H)
- GitHub `Kucoin/kucoin-universal-sdk` (`spec/apis.csv`), `Kucoin/kucoin-skills-hub`, org repo list via `gh api` (H)

Secondary / other:
- Coin Edition, 2026-10-16 https://coinedition.com/prediction-markets-move-into-familiar-financial-apps-as-kucoin-expands-access-to-polymarket/ (M)
- Polymarket builder program https://docs.polymarket.com/programs/builders/overview.md (H); Polymarket Data API builder endpoints `https://data-api.polymarket.com/v1/builders/leaderboard` and `/v1/builders/volume` (H, undocumented paths)
- DefiLlama protocol list https://api.llama.fi/protocols (H)
- Sibling note `docs/research/venues/metamask-polymarket-integration.md` (M, for scale comparison and Data API retirement report)
- One web-search result summary (launch coverage, Polymarket V2 dates) (M)
