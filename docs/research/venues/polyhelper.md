# PolyHelper (polyhelper.io) - venue spec

Researched 2026-10-19. Read-only: public web pages, GitBook `.md` mirrors, the Chrome Web Store listing, DefiLlama public API and adapter source (via `gh api`), and unauthenticated GETs to Polymarket's Data API and CLOB builder-trades endpoint. No account, no wallet, no POST, no signing, no payments, no browser automation, no third-party code run. Generic User-Agent `insurance-markets-research/0.1` only. WebSearch was unavailable (the session's search budget was exhausted), so no independent press or social coverage was checked; claims below come from first-party pages and public APIs only.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak, stale or ambiguous.

## Verdict

- Adapter priority: **skip**.
- PolyHelper is **not a venue**. It is a Chrome (Chromium) browser extension that overlays research panels on polymarket.com, plus a rewards/points programme, a small backend API used by the extension, and (per its newest privacy policy) an order-submission feature that sends orders to **Polymarket's CLOB** with PolyHelper's own Polymarket **builder code** attached (H: docs.gitbook, privacy policy dated 2026-09-25, Polymarket leaderboard, builder-trades endpoint). Every market, price, book and fill is Polymarket's, so it has **no independent liquidity** and can never be an independent arbitrage leg.
- It has **no public or documented API** of its own (the privacy policy says an "API" exists, but no host, docs or schema is published anywhere I could reach).
- It is **live** but **tiny as an order router**: about 15 builder-attributed active users per day, about 0.46M shares per day (about 1.5% of builder-attributed Polymarket share volume), and in the 1,500-trade sample about **$22k USD notional over 17 hours**, with **0 bps builder fee**. Volume is incentive-shaped (see Liquidity).
- Residual value for this project is small: (a) a labelled flow slice from Polymarket's public builder-trades feed (low signal, see below); (b) a product idea worth copying in the aggregator UI, a "Poly vs sportsbook books vs edge" comparison panel (the extension's Bookmaker Odds feature); (c) a cautionary example that DefiLlama's PolyHelper volume numbers are stale and in shares, not USD.

## Liveness (still live in 2026?)

Live as of 2026-10-19 (H).

- Builder-trades feed: `clob.polymarket.com/builder/trades?builder_code=0xb05677aa...a805` returned rows with `createdAt` up to 2026-10-19T03:54:26Z (H, fixture).
- Polymarket Data API v2 daily builder volume has a PolyHelper.io row every day from 2026-07-22 (start of the 90-day window) through 2026-10-19 (H, fixture `polymarket_data_api_v2_builders_volume_polyhelper_90d_2026-10-19.json`).
- Chrome Web Store listing: "Polyhelper", version 1.0.13, last updated **2026-09-30**, 693 users, 5.0 rating from 18 ratings, "Works only on polymarket.com, minimum permissions" (H, WebFetch of https://chromewebstore.google.com/detail/polyhelper/mebiclnfcnknilfaoanimpaeimjlafmg; summarised by the fetch tool, so exact wording may differ). Privacy policy dated 2026-09-25 (H).
- polyhelper.io (SvelteKit landing page), docs at polyhelper.gitbook.io, X @Poly_Helper, Telegram and Discord links all present (H). robots.txt allows everything; sitemap has only the landing page (H).
- DefiLlama record exists: id 7997, slug `polyhelper-predictions`, category `Interface`, tag `Polymarket Builder`, chain Polygon, twitter Poly_Helper, no `github`, no `deadUrl`/`deprecated` (H, https://api.llama.fi/protocol/polyhelper-predictions). **DefiLlama's volume series is stale**: its chart has 120 daily points from 2026-02-11 to **2026-06-10**, and `total24h` is null (H, fixture). Treat the DefiLlama "live" flag as weak evidence; the Polymarket feeds above are the real liveness signal.
- Trend (shares, see Liquidity): peaked in late May to early June 2026, lower since. Not dead.

## Kind and market model

- Kind: **broker / frontend / analytics overlay** (browser extension). Docs: "PolyHelper is a browser extension built specifically for Polymarket ... integrates seamlessly into the Polymarket interface" with 25+ panels (crypto context, sports intel, Bookmaker Odds, Top Holders PnL, Trader Tracker with whale tiers, LP Rewards, Bonds Scanner, macro, polls, weather, AI Arena, etc.) (H, https://polyhelper.gitbook.io/polyhelper-docs/getting-started/what-is-polyhelper.md and analytics-tools pages).
- Market model: whatever Polymarket offers (binary and multi-outcome CLOB with ERC-1155 conditional tokens; covered by the Polymarket workflow). PolyHelper adds no market type, no AMM, no tokenisation of its own (H by construction, M for Polymarket's internals).
- Product claims are **internally inconsistent** (L for any single one):
  - GitBook docs and FAQ say the extension is "purely informational", "read-only", "cannot place, modify, or cancel orders", and "PolyHelper is an independent product ... not an official Polymarket product" (H, getting-started/what-is-polyhelper.md, privacy-security.md, faq/faq.md).
  - The landing page shows a "Polymarket Builders Badge - Supported & approved by Polymarket" (H, polyhelper.io; this is the builder-programme verified badge, not a stated partnership).
  - The privacy policy dated 2026-09-25 says the product includes "a browser extension, a public website, an API, and a builder analytics panel", processes "trading and order status", sends "Unexpected trade execution faults" to the API and Sentry, and says "Trading requests go to Polymarket's CLOB service" (H, https://polyhelper.io/privacy-policy.txt, fixture). That describes order submission, which the docs say does not exist. The docs look stale; I could not see the current extension UI (no browser automation).
  - Polymarket's builder feed attributes real trades to PolyHelper's builder code (H), which only happens if the code is set in the signed order's `builder` field (H, Polymarket docs, see Trade path). So some order flow is attributed even though the docs deny trading.

## Chains and collateral

- Chain: **Polygon** only (H: DefiLlama `chains: ["Polygon"]`; Polymarket's CLOB settles on Polygon).
- Collateral: Polymarket's (USDC.e historically, pUSD / "Polymarket USD" under Polymarket V2 per other notes in this repo and the PolyCop note; I did not re-verify this session, so M). PolyHelper holds no funds and takes no deposits (H: docs/privacy "No wallet access"; M for the newer trading feature, whose custody/signing model is not documented).
- Builder code (public attribution identifier, not a secret): `0xb05677aa676cd5aeab7e8d85ef83836ee1bf4e3de5519d5bbb6594484b51a805`, builder name `PolyHelper.io`, verified (H, Polymarket builders leaderboard and builder-trades rows).
- Rewards programme is wallet-address based: "Points are tied to your Polymarket wallet address"; sign-in is via the extension "Reward" button (H, rewards-program/program.md). No on-chain token exists; the docs speak of a hoped-for share of a Polymarket token drop and add "All drop mentions are just assumptions" (H, polyhelper.io, rewards page). Not a PolyHelper token.

## Read API

- `exists`: **none** (no documented public API of PolyHelper's own).
- NOT FOUND (searched: polyhelper.io landing page HTML and all five JS bundles it loads (only `analytics.polyhelper.io/script.js` and social/store links appear; no API host), `/api`, `/docs`, `/terms`, `/privacy` (all return the SPA shell), robots.txt, sitemap.xml, full GitBook index `llms.txt` (30 pages: no API, SDK, developer or OpenAPI page), FAQ, privacy-security, how-it-works, GitHub (`polymarkethelper` is a user account created 2026-06-07 with one public repo, `gitbook`, docs assets only; no code repo, no org), DefiLlama record (`github: null`)). The privacy policy confirms an undocumented API exists (extension sends a per-install instance ID; analytics go to `analytics.polyhelper.io`). I did not guess or probe hostnames. Do not depend on it.
- Docs: https://polyhelper.gitbook.io/polyhelper-docs (H, product docs only).
- Usable indirect reads, all on Polymarket's or DefiLlama's hosts (not PolyHelper's):
  - `GET https://clob.polymarket.com/builder/trades?builder_code=0xb05677aa...a805[&before=<unix>][&next_cursor=<cursor>]` : **public read, no auth headers** (H, Polymarket docs https://docs.polymarket.com/trading/orders/attribution: "Builder trades are a public read and do not require authentication headers"; confirmed with unauthenticated GETs, HTTP 200, 300 rows and about 270 KB per page, five pages paged via `next_cursor` with 1 s sleeps, no throttling seen). Envelope `{data, next_cursor, limit:300, count}`. Row fields (H, fixture): `id, tradeType (TAKER|MAKER), takerOrderHash, builder (empty string), market (condition id), assetId (token id), side, size (shares), sizeUsdc, price, status, outcome, outcomeIndex, owner, maker (wallet), transactionHash, matchTime (unix s), bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`.
  - `GET https://data-api.polymarket.com/v2/builders/leaderboard?time_period=day|week|month|all&limit<=50` : public, keyless (H). Row `{rank, builder_name, builder_code, profile_image, verified, volume, active_users}` inside `{data, pagination}`. Fixture: `polymarket_data_api_v2_builders_leaderboard_polyhelper_rows_2026-10-19.json`.
  - `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90` : public, keyless; all builders for the last 90 daily buckets (5.9 MB, 18,698 rows when fetched), row `{date, rank, builder_name, builder_code, profile_image, verified, volume, active_users}` (H). Fixture holds only the PolyHelper rows (35 KB).
  - **Deprecation warning:** Data API v1 builder endpoints are retired on **2026-10-24**; v2 is snake_case with a `data` envelope (M: stated in the DefiLlama helper source comment citing https://docs.polymarket.com/migrate/data-api-v1-to-v2 and in the sibling PolyCop note; I did not re-read the migration page this session). The v2 endpoints above responded normally.
  - DefiLlama: `GET https://api.llama.fi/summary/dexs/polyhelper-predictions` (H, fixture). Note `.../polyhelper-io` (the module name) returns HTTP 400; the working slug is `polyhelper-predictions`.
- Auth, rate limits, WebSocket for PolyHelper: NOT FOUND. Polymarket's rate limits for these endpoints: not stated on the attribution or fees pages I read (searched: those two pages).

## Trade path

- **None for an agent against PolyHelper.** No order API, SDK, bot or webhook is published. The extension acts inside the user's own browser session on polymarket.com.
- The canonical write path for any order PolyHelper could place is **Polymarket's own CLOB API** (EIP-712 signed orders; the builder code goes in the order struct's `builder` field "before signing, in place of its 32-byte zero default", not a header) (H, https://docs.polymarket.com/trading/orders/attribution). The aggregator should talk to Polymarket directly; the Polymarket adapter owns that.
- If the project wants builder revenue it can register its own builder code (settings page on polymarket.com; default 0 bps; max 100 bps taker / 50 bps maker; one rate change per 7 days, effective after 3 days) (H, https://docs.polymarket.com/builders/fees).

## PayBox reachability

- `no` for PolyHelper itself. There is no endpoint to send signed orders to and no transaction-proposal flow; the extension holds no funds. A PayBox EVM wallet on Polygon could only trade via Polymarket's own CLOB (signed orders) or Polymarket's contracts, which is the Polymarket adapter's job, and PolyHelper adds nothing to that path. Do not route through PolyHelper.

## Fees

- **PolyHelper builder fee: 0 bps observed.** Across 1,500 builder-attributed trades (2026-10-18T10:30Z to 2026-10-19T03:54Z, TAKER and MAKER rows) `builderFee` is "0" on every row (H, fixture; derived by me from the paged public feed). No fee schedule is published by PolyHelper (docs say the extension is free; FAQ "Is PolyHelper free? Yes"). The site and docs describe points, not fees. A site testimonial about "fees refunded after a CLOB v2 update" is an unverified user claim (L).
- Polymarket's own **platform taker fee** applies and is the real cost: `platform_fee = C x feeRate x p x (1 - p)`, taker-only, `feeRate` per market; builder fees are "always additive" and paid by the user (H, https://docs.polymarket.com/builders/fees; that page is undated). Checked against the sample (H, derived): of 334 taker rows with a non-zero `feeUsdc`, implied `feeRate` is 0.05 (112 rows), 0.04 (58), 0.03 (10) plus a few rounding outliers; MAKER rows always paid 0 `feeUsdc`; 2 taker rows paid 0 (prices 0.99 and 0.18).
- Net for arbitrage cost models: using PolyHelper-attributed flow costs the same as direct Polymarket today; the builder fee could be raised later.

## Resolution mechanism and dispute risk

- Inherited entirely from Polymarket (UMA optimistic oracle with dispute path; covered by the Polymarket workflow, M here since I did not re-read it). PolyHelper resolves nothing.
- Extra risk beyond Polymarket's: a closed-source extension that, per its own privacy policy, handles wallet/proxy addresses, sessions (IP and user agent), tracked-wallet activity (45-day retention) and apparently order submission; the docs and policy contradict each other on whether trading exists. No security incident found in the pages read (absence is not proof).

## Geo, ToS and automation

- PolyHelper terms of service: **NOT FOUND** (searched: polyhelper.io footer/links, `/terms` (SPA shell), docs index, FAQ, Chrome Web Store page). Only a short privacy policy exists (contact is a public gmail address). No restricted-region text on any PolyHelper page.
- Polymarket's rules bind the underlying trading: 39 countries (page table lists 40) including the US are fully blocked; Singapore, Poland, Thailand and Taiwan are described as close-only (the page also lists them in the blocked table, so it is internally inconsistent); VPN circumvention violates ToS section 2.1.4; API or bot trading from restricted regions is not addressed (H, https://help.polymarket.com/en/articles/13364163-geographic-restrictions, dated 2026-08-14).
- Automation: PolyHelper publishes no automation rules and no API. Rewards "Only volume traded with PolyHelper enabled counts toward your points" (H), so points farming is intended to run through the extension.

## Liquidity

All figures are Polymarket volume attributed to PolyHelper's builder code, not PolyHelper-owned liquidity. OI / TVL: NOT FOUND and not applicable (DefiLlama TVL arrays empty; the product holds no pools).

Units: Polymarket's builder `volume` feeds are in **shares**, not USD (M: DefiLlama's adapter helper comment says "in shares"; my own check agrees, since the builder-trades sample for 2026-10-18 from 10:30Z onward sums to 371,121 shares versus 464,836 for the full UTC day in the volume feed, while its USD notional is only $20,007).

- Polymarket builder leaderboard, fetched 2026-10-19 (partial UTC day) (H):
  - ALL: 288,059,697 shares, rank 7, 558 active users.
  - MONTH: 8,128,255 shares, rank 13, 55 users. This equals the sum of daily rows for 2026-10-01 to 10-18, so "month" is the calendar month to date (M, inferred from the match).
  - WEEK: 487,410 shares, rank 17, 15 users. This equals Oct 18 plus Oct 19 so far, so the week window starts Sunday UTC (M, inferred).
  - DAY: 22,573 shares, rank 18, 6 users (partial day).
- Daily series (H, fixture): 2026-10-18 = 464,836 shares, rank 15, 15 active users, which is **1.46%** of the 31.7M shares attributed to the day's 201 builders. 89 full days from 2026-07-22 to 10-18 sum to 48.4M shares (average 544k/day); last 30 days 14.1M versus 21.9M for the prior 30 (-36%); last 7 days 2.87M versus 3.05M for the prior 7.
- Monthly shares: Jul 22-31 5.4M; Aug 14.3M; Sep 20.7M; Oct 1-18 8.1M (Polymarket v2 feed, H). The DefiLlama series (H, fixture) shows Feb 0.64M, Mar 1.95M, Apr 5.6M, May 39.2M, and 83.1M in Jun 1-10 alone, with a single-day peak of 13.9M on 2026-06-03. DefiLlama and Polymarket overlap nowhere, so the Jun 11 to Jul 21 gap cannot be reconstructed from what I fetched. If units match, volume fell by well over 90% from June to October (M).
- **USD sample (H, derived from the paged public feed):** 1,500 trades, 2026-10-18T10:30Z to 2026-10-19T03:54Z: **$22,050 notional**; median trade **$0.40**; median price **0.006**; 93.4% SELL; 77.6% MAKER rows; 197 distinct markets; 11 distinct wallets, one of which (prefix `0x4A0E`) accounts for 75% of the rows. That pattern is dust-sized, long-shot sells across many markets. It is consistent with points farming (the rewards programme pays 1 point per 1,000 shares traded and a daily 0.5 points for "any trade"), but I cannot prove intent (L).
- **DefiLlama is unreliable here (H/M):** `totalAllTime`/`total1y` = 130,495,742 for a record whose adapter has no `builderCode` and therefore only emits Polymarket's share-denominated notional (H, adapter source `factory/polymarket.ts`: "PolyHelper.io is absent from the dump, so it has no builderCode and keeps its previous notional-only behavior"; `helpers/polymarket.ts`). So the number is shares presented as USD (M), the chart stops 2026-06-10, and `doublecounted: true`. Do not use DefiLlama for PolyHelper volume. (The adapter comment is stale: PolyHelper.io is now in the v2 feed with a builder code.)

## Event coverage and arbitrage overlap

- Everything on Polymarket is reachable: sports, politics, crypto price, macro, weather, entertainment. I did not classify the sample's 197 markets by category.
- Overlap with other venues is exactly Polymarket's overlap. **Not independent** of Polymarket (same CLOB, oracle and collateral). The aggregator should dedupe PolyHelper-attributed flow against the Polymarket adapter, never add a leg for it.
- Signal use: weak. The attributed flow is tiny, concentrated in one wallet and shaped by a points programme, so it is not a "smart money" feed. The extension's own Trader Tracker works from Polymarket's public wallet activity, so nothing PolyHelper-specific is needed.
- Design note: the Bookmaker Odds panel (Polymarket implied probability vs vig-adjusted sportsbook consensus vs edge, h2h 3-way for soccer, NBA/NFL/MLB/NHL/UFC) is the same idea as this project's cross-venue edge view. Docs say "up to 19 books" in one place and "up to 9 major books" in another and list 18 names (Pinnacle, Betfair, DraftKings, FanDuel and others); the odds data provider is not disclosed (H, analytics-tools/bookmaker-odds.md). Docs warn edges under 1% may sit inside the margin of error.

## Shared liquidity

- **Polymarket.** PolyHelper uses Polymarket's matching engine, order books, platform fees and oracle; it has no liquidity of its own.

## Open questions

- Exactly how PolyHelper attaches its builder code (the docs deny any trading feature; the privacy policy and builder feed imply order submission). Needs a look at the current extension UI or release notes, which I did not do (no browser automation, no code execution, search budget exhausted).
- Whether `builderFee` stays at 0 bps (rates can be changed with 3 days' notice).
- Who the dominant attributed wallet is and whether it is operator-controlled (not investigated; no value for the adapter).
- Why DefiLlama's PolyHelper series stopped on 2026-06-10.
- Whether the Polymarket token ("$POLY") airdrop that the points programme targets has been announced (not checked; unconfirmed speculation per the site's own disclaimer).

## Sources

- https://polyhelper.io (WebFetch and curl 2026-10-19): product, links, Builders Badge, points text; JS bundles read for API hosts (H).
- https://polyhelper.io/privacy-policy.txt (curl, dated 2026-09-25; fixture) (H).
- https://polyhelper.gitbook.io/polyhelper-docs/ : `llms.txt`, `welcome/readme.md`, `getting-started/what-is-polyhelper.md`, `how-it-works.md`, `privacy-security.md`, `analytics-tools/bookmaker-odds.md`, `trader-tracker.md`, `rewards-program/program.md`, `faq/faq.md`, `community-and-team/team.md`, `social-links.md` (curl `.md` mirrors) (H, but docs appear stale on trading).
- https://chromewebstore.google.com/detail/polyhelper/mebiclnfcnknilfaoanimpaeimjlafmg (WebFetch 2026-10-19) (H; summarised by the fetch tool).
- https://api.llama.fi/protocol/polyhelper-predictions , https://api.llama.fi/summary/dexs/polyhelper-predictions , https://api.llama.fi/overview/dexs (H, fetched 2026-10-19). defillama.com web pages not used.
- DefiLlama adapter source via `gh api`: `factory/polymarket.ts` and `helpers/polymarket.ts` in DefiLlama/dimension-adapters (H): `polyhelper-io` config (builder "PolyHelper.io", start 2026-01-01, no builderCode), share-denominated notional, v1 retirement 2026-10-24.
- https://data-api.polymarket.com/v2/builders/leaderboard and /v2/builders/volume (H, unauthenticated GET 2026-10-19).
- https://clob.polymarket.com/builder/trades?builder_code=... (H, five unauthenticated GET pages 2026-10-19).
- https://docs.polymarket.com/trading/orders/attribution and https://docs.polymarket.com/builders/fees (H; WebFetch summaries; the fees page is undated).
- https://help.polymarket.com/en/articles/13364163-geographic-restrictions (H, page dated 2026-08-14).
- GitHub: `gh api users/polymarkethelper` and `repos/polymarkethelper/gitbook/contents/` (H: docs-assets repo only).
- Sibling note in this repo: `docs/research/venues/polycop-predictions.md` (same builder-router pattern; used for cross-checking Polymarket builder-feed semantics).
- https://x.com/Poly_Helper and the X posts linked from the site were not fetched (X returned HTTP 402 to WebFetch in a sibling task; no payment requirements were recorded here and nothing was pursued).

## Fixtures

Under `docs/research/fixtures/polyhelper/`:

- `polymarket_data_api_v2_builders_leaderboard_polyhelper_rows_2026-10-19.json` (2 KB: PolyHelper.io row for day/week/month/all plus top-3 for scale).
- `polymarket_data_api_v2_builders_volume_polyhelper_90d_2026-10-19.json` (35 KB: 90 daily rows, PolyHelper.io only).
- `clob_builder_trades_polyhelper_sample3_2026-10-19.json` (3 of 300 rows; third-party `maker` and `owner` redacted).
- `defillama_summary_dexs_polyhelper_predictions_2026-10-19.json` (4 KB; shows the stale chart and null `total24h`).
- `polyhelper_privacy_policy_2026-09-25.txt` (2 KB, verbatim) and `polyhelper_gitbook_llms.txt` (3 KB, docs index).

## Suspicious content

- None aimed at agents found in polyhelper.io, its JS bundles, the privacy policy or the GitBook `.md` mirrors. The GitBook pages begin with a standard line pointing readers to `llms.txt` and `.md` versions; I used those as plain content mirrors and did not follow any other instruction.
- Product-claim conflicts (not instructions, but worth flagging): docs say "no trade execution" and "not affiliated with Polymarket" while the privacy policy describes trading requests to Polymarket's CLOB and the site shows a Polymarket "Supported & approved" badge. Points-programme marketing ("Your points = $$$ on the Polymarket TGE") is speculative promotion.
- Tool-harness text only: the WebSearch tool returned a budget-exhausted message and a "REMINDER: You MUST include the sources above" line; that is tool boilerplate, ignored.
