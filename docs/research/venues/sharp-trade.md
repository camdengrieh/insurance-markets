# Sharp Trade (sharptrade.fi) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock ~04:32-04:36 UTC). READ-ONLY: unauthenticated GETs of the marketing/doc hosts, `gh api` file reads, no account, wallet, key, signature, on-chain call or PayBox tool. WebSearch was unavailable (session budget used up), so no third-party press, X or Discord coverage was read (x.com returned HTTP 402 to WebFetch; no payment attempted). Third-party pages, repos and API responses were treated as untrusted data; nothing in them was followed.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/sharp-trade/` (section 13).

---

## 0. Bottom line

1. **The venue is, in practice, dead or hijacked.** The official app host `app.sharptrade.fi` (and `sharptrade.fi`, `www.`, `eclipse.`, `links.`, `api.`, and a random non-existent subdomain) all return the same 118,906-byte "Stockcoin bonus" page: a Russian-authored affiliate/deposit-bonus lure for `stockcoin.ai` with a referral code and a "deposit 100, get 30 USDT" ladder. The domain has a wildcard record; only `docs.sharptrade.fi` (GitBook) still resolves to real content. (H)
2. **Docs are frozen.** Newest docs page `lastmod` is 2025-08-18 (about 14 months old); the "Disclaimer" is dated May 28, 2025; the only GitHub repo named `sharptrade/sharptrade` is empty (0 bytes, created 2025-06-29). Nothing in 2026. (H)
3. **Even if it were live it would not be an arbitrage leg.** The product is a house-banked 30s+30s (or "one-minute") SOL/ETH/BTC up/down pari-mutuel game ("Moon"/"Doom") with a house counter-bet guaranteeing a minimum 1.75x payout, plus a tiny P2P 7-day options product. No event markets (sports, politics, macro), no public API, no published program IDs. (H)
4. **Prior evidence is wrong or stale.** PredictionIndex lists it as "Solana, live, binary, volume n/a" with no date. That listing evidently reflects the 2025 docs, not current reality. (H for the listing text; M for the inference)
5. **adapter_priority = skip.**

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://app.sharptrade.fi/` | HTTP 200, `<title>Stockcoin bonus</title>`, `x-robots-tag: noindex, nofollow`, `set-cookie: hv=neyasno`, `server: cloudflare`, `cache-control: no-store`. Body is a bonus-claim landing page. Inline script holds `var REF = 'https://stockcoin.ai/register?ref=9UCETA'`, a deposit ladder `[[100,30],[300,90],[500,150],[1000,300],[2000,600]]` ("deposited, received" USDT per a Russian comment), trial-futures coupon sizes, and a language switcher. Footer/links are placeholders. Fixture `app_homepage_hijack_evidence_2026-10-19.txt` | H |
| Other hosts | `sharptrade.fi`, `www.`, `eclipse.`, `links.`, `api.`, `app.sharptrade.fi/holders`, `/predictions`, and `zz-nonexistent-test-123.sharptrade.fi` all return the identical 118,906-byte page, i.e. wildcard DNS/route. `sharptrade.fi/robots.txt` = `User-agent: * / Disallow: /` | H |
| DNS | NS `fatima.ns.cloudflare.com` / `chase.ns.cloudflare.com`; apex and subdomains resolve to Cloudflare anycast (104.21.0.240, 172.67.128.121) | H |
| Docs host | `docs.sharptrade.fi` is a GitBook site (`x-gitbook-route-site`), still served, with `llms.txt` and `.md` page variants. Sitemap newest `lastmod` 2025-08-18T15:08:50Z | H |
| Docs disclaimer | "Last Updated: May 28, 2025" | H |
| GitHub | `sharptrade/sharptrade`: created 2025-06-29, pushed 2025-06-29, size 0, "This repository is empty". No contract/SDK repo found by `gh search repos` for sharptrade / decalls / sharp-trade predictions | H |
| Ecosystem listing | PredictionIndex `/ecosystem`: "Chain: Solana, Status: live, Outcome type: binary, Volume: n/a", link `https://app.sharptrade.fi/` (no date) | M (WebFetch summary of a JS-heavy page) |
| Integration mention | `onsol-labs/ans-documentation` lists "Sharp Trade -> https://app.sharptrade.fi/" (and `eclipse.sharptrade.fi/leaderboard`) among ANS integrations; undated | M |
| Social | `x.com/SharpTradeFi` not readable (HTTP 402); Discord invite not fetched | NOT FOUND (searched: WebFetch x.com) |

Not determinable from here: whether the original operators lost the domain (expiry/DNS hijack), repointed it deliberately, or were abandoned and the Solana program/UI is reachable some other way. Either way **there is no live official front end I can confirm in 2026**. `still_live = false` (for the purposes of an adapter).

**Security flag for anyone who follows the PI link:** the page is an affiliate-bonus lure promising USDT for deposits. Do not connect a wallet, register or deposit there. I did not open it in a browser or execute its script (read statically only).

---

## 2. Kind and market model (as documented in 2025 docs; not currently verifiable)

- **Kind (H, docs):** "social and gamified way to predict crypto prices on Solana or Eclipse" (`introduction.md`). Two products:
  1. **Sharp Predictions**: round-based SOL (also ETH, BTC, BONK historically) price up ("Moon") vs down ("Doom") games.
  2. **Sharp Options**: P2P order-book of 7-day American-style options on SOL, JUP, BONK (calls/puts, bids/asks per strike); roadmap-stage "Pro" tier.
- **Round structure (H, docs; internally inconsistent):** `sharp-predictions.md`: "total 2-minute round" = Prediction Phase + Anticipation Phase. `everything-you-need-to-know-...md` and `core-game-loop.md`: 30s Prediction + 30s Anticipation. `introduction.md` / FAQ: "one-minute rounds". Price locked at the start of Anticipation; result = final price vs locked price from the Pyth oracle. I cannot say which is current.
- **Pool mechanic (H, `faqs.md`, `predictions-details.md`):** every round has its own pool; all stakes on Moon and Doom go into one pool; winners split the whole pool pro rata to stake. A **house** adds a counter-stake so that the minimum payout is 1.75x (up to 2.33x or 2x when you are alone / on the same side below a minimum size). The worked example in the docs: Doom 3x2 SOL, Moon 2+1 SOL, house adds 1.5 SOL on Moon -> payouts x1.75 Doom, x2.33 Moon, pool 10.5 SOL; the house also takes a winner's share of the pool (house 3.495 SOL payout in the example).
- **Model class:** parimutuel with house backstop, binary, one-round horizon. **Not** an order book or AMM for the predictions product; not categorical or scalar.
- **Tokenisation:** no outcome tokens documented. Positions are program accounts per round and wallet ("on-chain status" account is created on first prediction, ~0.02 SOL, per `how-to-login-sign-up.md`); winners must **claim** manually (no auto-transfer) (H, docs).
- **Assets:** Predictions page says currently SOL only (`core-game-loop.md`), older pages list SOL/ETH/BTC (Solana) and SOL/ETH/BTC on Eclipse; options: SOL, JUP, BONK. (H docs, undated/inconsistent)
- **Credits:** `$freeUSD` is an in-game SPL token (1 = one free 1-USDC prediction, payout in USDC) (H, docs). Not a tradable collateral.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chains | Solana (SVM) and Eclipse (an SVM L2 settled on Ethereum; Sharp "live on Eclipse" per `eclipse.md`, Backpack wallet, bridge ETH via the Eclipse bridge) | H (docs, 2025) |
| Collateral (Solana) | SOL, USDC, `$freeUSD` credits | H (docs) |
| Collateral (Eclipse) | ETH (bridged), USDC, `$freeUSD`, "Free mode" | H (docs) |
| Oracle | Pyth Network price feeds | H (`pyth.md`) |
| Program IDs / addresses | NOT FOUND (searched: docs.sharptrade.fi llms.txt pages, GitHub org repo (empty), `gh search repos/code`) | - |
| NFT | "Sharp Trader" collection ("Future Traders" legacy), Tensor / Magic Eden; 60% of product revenue split to holders | H (docs) |

---

## 4. Read API

- **Existence:** NOT FOUND. No API, SDK, subgraph, WebSocket or OpenAPI is documented. `llms.txt` lists 50-odd pages; none is developer/API documentation (searched: llms.txt index, faqs, platform-overview, `api.sharptrade.fi` -> wildcard lure page). (H)
- **Docs URL:** https://docs.sharptrade.fi/ (GitBook; `llms.txt` and `<page>.md` available). (H)
- **On-chain read:** would require the Solana program ID and IDL, neither published. Round state is not reconstructable from public docs. (H for absence)
- **Auth / rate limits / WebSocket:** NOT FOUND.
- **Unauthenticated sample:** none possible; the only "API-like" host returns the lure page. The saved fixtures are documentation text and the hijack-page evidence only.

---

## 5. Trade path

- Documented path is the web UI only: connect a Solana wallet (Backpack for Eclipse), "Select Wallet", sign program transactions, adjustable Solana priority fees in Settings, manual claim of wins, RPC URL configurable in Settings (H, `how-to-login-sign-up.md`, `platform-overview.md`, `priority-fees.md`).
- No order API, no signed-order scheme (this is a transaction-per-bet program, not a CLOB), no program ID, and the UI host is not serving the app. **Programmatic path: none.** (H)

### PayBox reachability

- **Not reachable in practice.** Even in principle it is a Solana/Eclipse program call, not an EVM wallet interaction. Solana would need an arbitrary-program transaction proposal and the program ID/IDL, which are unpublished; Eclipse is a separate SVM L2 with its own RPC and no confirmed PayBox network. An EVM wallet on Base/Ethereum/BNB/Arbitrum/Polygon cannot place these bets. `paybox_reachable = no`. (M)

---

## 6. Fees

| Fee | Value | Payer | Tag |
|---|---|---|---|
| Platform fee | "We charge 3% of the volume generated on the platform" (login page) | bettor | H (docs) |
| Free-bet fee | 5% of the prediction size in USDC, paid in SOL, when betting with `$freeUSD` | bettor | H (docs) |
| Structural edge | Minimum payout is 1.75x on a binary outcome => break-even win rate 57.1% at the floor; a 50% win rate has EV = 0.5 x 1.75 - 1 = -12.5% before the 3% fee. Payout can be higher (2.00x / 2.33x) when alone or on the thin side | bettor | M (arithmetic from the docs figure) |
| Solana tx + priority fee | normal network fee; ~0.02 SOL one-off account creation on the first prediction | bettor | H (docs) |
| Referral | 10/15/20/30% of referred users' fees by tier (FAQ also says "up to 30%"; platform overview says 20%) | paid out of platform fee | H (docs, inconsistent) |

Doc inconsistencies worth noting: minimum-payout threshold is 0.05 SOL in `predictions-details.md` and 0.01 SOL in `faqs.md`; payout "2x" vs "2.33x" in the same sentence. Treat all numbers as stale.

---

## 7. Resolution and dispute risk

- Auto-resolved by comparing the Pyth price at the lock time with the Pyth price at round end; "the final price confirmation... still can slightly fluctuate as everything is done on the chain" (H, `predictions-details.md`). No dispute process, no UMA-style challenge. (H for absence in docs)
- Counterparty/solvency risk is the house wallet: the project's own history says the earlier "DegenMode" had a flaw "which meant that the housewallet could be drained through clever betting", fixed by a later team (`our-story.md`). A maximum prediction size is imposed to protect house funds. (H, docs)
- Governance/operator risk: three-phase history (Yawww NFT marketplace -> Decalls options / DegenMode -> Sharp Trade), the "old team" abandoned the project and a community "derug" took over; stated cumulative volume under the new team is "17.000 Solana" (read as about 17,000 SOL; undated, in the story page; USD value not computed because no SOL price was sourced). (H, docs)

---

## 8. Geo, ToS, automation

- No Terms of Service page is listed in `llms.txt`. The only legal text is the Disclaimer (last updated May 28, 2025): "The App is not intended for use in jurisdictions where its services may be prohibited"; users must ensure compliance; no financial advice; use at own risk. (H)
- No geo-block list, no KYC statement, no API/automation/bot policy. Docs describe the game as "skill-based" and note "Price prediction gaming can be addictive". (H)
- Treat as unlicensed crypto gambling-style product; legal exposure for an automated bettor is unassessed.

---

## 9. Liquidity

- Volume/OI/TVL: **NOT FOUND (searched: docs, PredictionIndex listing says "n/a", DefiLlama not queried this session).** The only figure is the docs' "volume of 17.000 Solana" achieved to date under the new team (undated, written in 2025 at latest; cumulative, not a 2026 figure). (H for the quote)
- Per-round pool sizes are small by design (per-bet cap, house-backed). Options product is "revival" stage with SOL/JUP/BONK only. (H, docs)
- **Liquidity shared with another venue:** no. It is standalone (house + player pool), so it would be an independent leg if it worked, but there is nothing live to trade. (M)

---

## 10. Event-category overlap (arbitrage relevance)

- Categories: crypto price only (SOL up/down within about 1 minute; options on SOL/JUP/BONK over 7 days). (H, docs)
- Overlap with other venues: only conceptually with ultra-short crypto up/down markets elsewhere (e.g. Polymarket/Limitless-style 5-15 minute BTC/ETH/SOL up/down). Horizon and settlement (Pyth snapshot, house-set floor payout of 1.75x) make a clean cross-venue hedge impractical. No sports, politics, macro. (M)
- **Signal value for Quotient/aggregation:** none beyond a toy sentiment tick; no data feed is available.

---

## 11. Adapter priority

**skip.** Reasons: (a) official app host is not serving the product and shows a wildcard affiliate-lure page; (b) no public API, no program ID, no repo; (c) product is a house-banked 1-minute coin-flip game with a 1.75x payout floor (about -12.5% EV at a 50% win rate before fees), not a market; (d) docs unmodified since Aug 2025; (e) no event-category overlap. Revisit only if the team publishes a new domain plus program IDs or an API and shows 2026 volume.

---

## 12. Suspicious content / injection log

- `https://app.sharptrade.fi/` (and every other host except docs.): affiliate/deposit-bonus lure for `stockcoin.ai` ("Official Stockcoin partner", "Real bonuses on Stockcoin - do one simple step, get your reward. Register through us and claim yours in minutes"), with a hard-coded referral code and a deposit-to-bonus ladder in USDT. Possible domain hijack or cloaked redirect; also sets cookie `hv=neyasno` and sends `noindex`. Not followed, not executed. (H)
- `docs.sharptrade.fi` pages carry a banner pointing AI tools to `llms.txt` and `.md` variants; benign navigation, used as a documentation index only, no instructions to act. (H)
- Unrelated GitHub search hits for "sharptrader" (e.g. a "Crack-Sharptrader" repo created 2026-10-07) are unrelated cracked-software bait; not opened. (M)

---

## 13. Fixtures saved

`docs/research/fixtures/sharp-trade/`
- `app_homepage_hijack_evidence_2026-10-19.txt`: response headers, `<title>`, visible text and the first 700 chars of the inline script from `app.sharptrade.fi` (a third party's first name in a code comment redacted).
- `docs_llms_2026-10-19.txt`: GitBook docs index (6 KB).
- `docs_faqs_2026-10-19.md`, `docs_predictions-details_2026-10-19.md`, `docs_how-to-login-sign-up_2026-10-19.md`: the pages that carry the pool math and fees.
No API responses exist to capture.

---

## 14. Open questions

1. Who controls `sharptrade.fi` now, and when did the app go dark? (WHOIS for `.fi` not reachable from the CLI, and no archive/third-party reader allowed here.)
2. Is the Solana program still deployed and funded (house wallet), and is there an alternate front end? Program ID unpublished; Discord and X not read.
3. Is Eclipse itself still operating in 2026? Not checked; matters only for `eclipse.sharptrade.fi`, which is also the lure page.
4. Why does PredictionIndex still show "live"? Likely a stale crawl; ask the PI maintainers, or re-check in the next sweep.

---

## Sources

1. https://app.sharptrade.fi/ (and apex, www, eclipse, links, api, random subdomain) - fetched 2026-10-19; wildcard "Stockcoin bonus" page (H)
2. https://sharptrade.fi/robots.txt - `Disallow: /` (H)
3. https://docs.sharptrade.fi/llms.txt - docs index (H)
4. https://docs.sharptrade.fi/sitemap-pages.xml - page `lastmod` values, newest 2025-08-18 (H)
5. https://docs.sharptrade.fi/introduction.md, `/faqs.md`, `/how-to-login-sign-up.md`, `/platform-overview.md`, `/official-links.md`, `/disclaimer.md` (H)
6. https://docs.sharptrade.fi/sharp-predictions.md, `/sharp-predictions/predictions-details.md`, `/token-selection.md`, `/predictions-size.md`, `/claiming-your-wins.md`, `/priority-fees.md`, `/usdfreeusd.md` (H)
7. https://docs.sharptrade.fi/everything-you-need-to-know-about-price-prediction-gaming.md and `/core-game-loop.md` (H)
8. https://docs.sharptrade.fi/sharp-options.md, `/sharp-options/sharp-options-overview.md`, `/options-lifecycle-and-exercise.md` (H)
9. https://docs.sharptrade.fi/sharp-trade-is-powered-by/pyth.md, `/solana.md`, `/eclipse.md` (H)
10. https://docs.sharptrade.fi/about-us/our-story.md, `/rebranding-sharp-trade.md`, `/roadmap.md`, `/about-us/team/developers.md`; `/holder-rewards.md`; `/referral-program.md` (H)
11. https://predictionindex.xyz/ecosystem - listing "Solana / live / binary / n/a" (M, WebFetch summary)
12. https://github.com/sharptrade/sharptrade - empty repo (`gh api repos/sharptrade/sharptrade`) (H)
13. https://github.com/onsol-labs/ans-documentation (integrations/solana.md, integrations/eclipse.md) - undated mention of Sharp Trade (M)
14. https://x.com/SharpTradeFi - HTTP 402 to WebFetch, not read; no payment attempted (NOT FOUND)
