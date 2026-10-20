# eToro / Zengo prediction markets - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 03:00-03:30 UTC). READ-ONLY: official help-center pages, public docs, public unauthenticated GETs to `data-api.polymarket.com` and `docs.polymarket.com`, `gh api` reads of the ZenGo-X org. No account, wallet, key, signature, POST or PayBox tool. Third-party pages and API responses were treated as untrusted data. WebSearch was unavailable (session budget used up), so no press coverage beyond eToro's own pages and one earnings-call write-up was read. `zengo.com` itself (marketing page, user agreement, blog, sitemap) returns Cloudflare 403 to anonymous clients; I did not try to get around that.

Tags: **H** = read first-hand in a primary source this session (cited; for pages read through WebFetch I also fetched the raw HTML with curl where noted); **M** = secondary source or my inference/arithmetic from first-hand data; **L** = weak or stale.

Fixtures (all under `docs/research/fixtures/etoro-zengo-prediction-markets/`, each <= 50 KB) are listed in section 12.

---

## 0. Bottom line

1. **Zengo/eToro is a mobile front-end onto Polymarket, not a venue.** Zengo's own help center says the markets are "powered by Polymarket" and that "Market outcomes, resolution, and liquidity are managed by Polymarket independently of Zengo". There is no eToro-native or Zengo-native order book, oracle or market creation. (H, Zengo Help Center, article dated 2026-06-09)
2. **100% shared liquidity with Polymarket global.** Orders are routed to Polymarket's CLOB with a Polymarket "builder code" (the Polymarket data API lists a verified builder named "Zengo"). It is NOT an independent arbitrage leg. (H for the Zengo statement; M for "the builder named Zengo is Zengo's", see section 8)
3. **No API of any kind** for Zengo prediction markets: the help center does not mention one, the app is mobile-only ("Zengo Web support is planned"), the wallet is a two-party MPC wallet, and the ZenGo-X GitHub org has no prediction-market repo. (H/M, section 4)
4. **Tiny and fading flow.** Through Polymarket's own builder leaderboard, Zengo-attributed volume is 359,459 shares all-time (an upper bound of about $359k notional), peaked at 216k shares in July 2026, and is 3,129 shares so far in October from 21 distinct wallets. That is about 0.0007% of all builder-routed volume this month. (H data, section 9)
5. **Not available in the US, UK, Australia, France, Germany, Belgium, Netherlands, Switzerland, Singapore, Poland, Romania, Thailand, Taiwan, Ukraine, Ontario or US-sanctioned countries.** eToro's "US launch" is tied to the TradeZero deal (expected close H1 2027) and nothing in primary sources says it will be a prediction product. (H)
6. **adapter_priority = skip.** Build the Polymarket adapter (covered by the parallel workflow) and treat Zengo/eToro as a distribution channel for the same books. The only reusable finding is the Polymarket builder-code / builder-leaderboard mechanics in section 6 and section 9.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Zengo Help Center "Prediction Markets" collection, 3 articles, all "June 9, 2026" | Feature documented as launched; collection description "Use Zengo to securely connect, fund, and interact with Polymarket directly from your wallet" (http://help.zengo.com/en/collections/19637646-prediction-markets) | H |
| eToro Q2 2026 earnings call (write-up on Yahoo Finance, results release dated 2026-08-11) | Prediction markets "launched during Q2 as a first product on the Zengo noncustodial wallet"; "Eligible global customers can trade them on Zengo"; US launch is tied to TradeZero (WebFetch summary of https://finance.yahoo.com/markets/stocks/articles/etoro-etor-q2-2026-earnings-144333144.html) | M (small-model summary of a transcript write-up) |
| eToro Q2 2026 results press release (https://www.etoro.com/news-and-analysis/press-releases/etoro-reports-second-quarter-2026-results/) | Confirms eToro completed the Zengo and Bit2C acquisitions in Q2 2026 and signed TradeZero on 2026-08-11 (close expected H1 2027). Does NOT mention prediction markets, Polymarket or Kalshi. | H (WebFetch summary of the release) |
| Zengo iOS app (bundle `kzencorp.mobile.ios`, App Store lookup, public) | Version 10.2.2 released 2026-10-14; release notes only mention Arc and Robinhood Chain support and bug fixes, nothing about predictions | H |
| Polymarket data API builder boards | A verified builder "Zengo" has non-zero volume in the week bucket starting 2026-10-18 (361 shares, 4 wallets) | H data; M that it is Zengo's code |

Verdict: **still_live = true**, but nearly dormant in volume terms (section 9). The hint's claim that eToro "was also talking to Kalshi" is **NOT FOUND**: the Yahoo write-up does not mention Kalshi or Polymarket at all, and no eToro/Zengo page I could read mentions Kalshi (searched: the Yahoo article, eToro Q2 release, eToro press-release index, Zengo help center).

There is no eToro-native prediction product: `https://www.etoro.com/prediction-markets/` returns 404, the eToro press-release index (2026-08-05 to 2026-10-08) has no prediction-market item, and the eToro app's current store description/release notes do not mention it. The only eToro touch point is that Zengo's "Add Funds" flow lists "Fund directly from your eToro account (eToro customers only)". (H)

---

## 2. Kind and market model

- **Kind (H):** broker/wallet front-end ("broker-or-frontend") for Polymarket. Zengo: "Zengo has built a native Prediction Markets experience directly into the app. You don't need to leave Zengo, use WalletConnect, or manage a separate account on Polymarket's website." Same wording for "Do I need a separate Polymarket account? No."
- **Market model (H, inherited from Polymarket):** binary Yes/No or Team A/Team B markets and multi-outcome events ("Who will win the NBA Finals?"), shares priced $0.00-$1.00, each Yes/No pair "fully backed by $1.00 in USDC". Central limit order book: market orders (dollar amount) and limit orders (price, shares, expiration). Peer-to-peer trades; sell before resolution is supported. No scalar markets mentioned.
- **Tokenisation:** not described by Zengo. It is Polymarket's CTF outcome tokens (ERC-1155 on Polygon) - see the Polymarket spec; I did not verify this independently here. (M)
- **Market coverage:** Categories in the app: Trending, Breaking, New, Politics, Sports, Crypto, Finance, Geopolitics, "Ends today", plus keyword search ("Find any market by keyword, event name, or outcome"). Whether Zengo exposes every Polymarket market or a filtered subset is **NOT FOUND** (searched: the three help articles).
- Sports: "Outstanding limit orders are automatically cancelled when a game starts" (Polymarket behaviour surfaced in the UI). (H)

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Polygon (PoS). "Prediction activity is tied to your Zengo wallet address on Polygon." | H |
| Collateral per Zengo | "USDC on Polygon (Polymarket's stablecoin, bridged USDC on Polygon)". Withdrawals "returned as USDC.e on the Polygon network". Gas in POL. | H |
| Collateral per Polymarket docs | Polymarket's current docs say "pUSD - the collateral token used for all trading on Polymarket" (CLOB V2 / Protocol V2). The Zengo articles never mention pUSD. Presumably Zengo/Polymarket wrap USDC to pUSD behind the scenes, but no source I read says so. | H for each statement; the reconciliation is unknown |
| Funding routes | (1) tokens already in the Zengo wallet (auto-swap to USDC if needed), (2) transfer from an external wallet to the Zengo wallet, (3) eToro account (eToro customers only), (4) buy via supported on-ramp providers | H |
| Separate "prediction balance" | Funds must be moved into a prediction balance ("Polymarket requires funds to be deposited into its trading infrastructure"); the two balances are shown separately | H |
| Proxy wallet / Safe / deposit wallet | NOT FOUND (searched: all three help articles; they say only that activity is tied to the user's Zengo wallet address) | - |

---

## 4. Read API

- **Exists: none for Zengo.** `read_api.exists = none` for the Zengo/eToro surface. (H/M)
  - Zengo's articles do not mention any API, automation or programmatic access (H; the how-to article was checked specifically for that).
  - Mobile app only: "Is Prediction Markets available on Zengo Web? Not yet - it launches on the mobile app first." (H)
  - `gh api orgs/ZenGo-X/repos`: 20+ repos, all MPC/crypto libraries (`two-party-ecdsa`, `gotham-city`, `gotham-engine`, `curv`...); a code search for "polymarket"/"predict" in the org returns 0 hits; `ZenGo-X/public-docs` has only white-paper PDFs. (H)
  - `help.zengo.com` pages are the only readable official docs; `zengo.com/prediction-markets/` (the discovery URL) returned HTTP 403 to curl (UA `insurance-markets-research/0.1`) and to WebFetch, so its marketing copy is unread. (H for the 403)
- **What an aggregator should use instead:** Polymarket's public APIs (Gamma, CLOB, Data API v2, websockets). Those are covered by the parallel workflow. Zengo's markets, prices, books and trades are Polymarket's.
- **One Zengo-specific read that does exist, via Polymarket (H, confirmed live with unauthenticated GETs):**
  - `GET https://data-api.polymarket.com/v2/builders/leaderboard?time_period=day|week|month|all&limit=<=1000` - one row per builder: `rank, builder_name, builder_code, profile_image, verified, volume (SHARES, not USDC), active_users (distinct makers)`. Envelope `{data, pagination:{limit, offset, has_more, next_cursor}}`.
  - `GET https://data-api.polymarket.com/v2/builders/volume?interval=day|week|month|all&limit=<=90` - same row shape plus `date`, newest bucket first, bucketed per builder.
  - OpenAPI: `https://data-api.polymarket.com/v2/openapi.json`; docs index `https://docs.polymarket.com/llms.txt`. No auth was needed for these two GETs; rate limits for the data API were not checked.
  - Zengo's builder code (M, name match): `0x12ac80f578ae47d070dfe15d09aac8f2556425e12902cfd3641c55aca8274b24`.
- Websocket: none for Zengo. Polymarket's websockets are in the Polymarket spec.

---

## 5. Trade path and PayBox reachability

- **Zengo itself: none.** There is no external order-placement interface. Orders are created inside the Zengo mobile app; signing is done by the Zengo two-party MPC wallet ("Zengo's MPC security protects your wallet and account access"; the App Store description says "the responsibility of signing blockchain transactions is divided between us and our customers"). Neither the app nor the wallet is something a PayBox wallet can drive. (H)
- **Underlying route:** orders are Polymarket CLOB orders carrying the Zengo builder code (the signed order struct has a `bytes32 builder` field; `OrderFilled` events emit it; H, Polymarket builder-fees doc). So an EVM wallet reachable through PayBox on Polygon could trade the *same liquidity* by signing Polymarket orders directly, with no Zengo involvement, via the Polymarket adapter. That path is Polymarket's, not Zengo's.
- `paybox_reachable = no` for the Zengo/eToro surface (the liquidity is reachable only through the Polymarket adapter).
- Positions are tied to the user's Zengo wallet address; there is no way to read a given user's Zengo positions other than via Polymarket's public per-address Data API (if that address is known), which is irrelevant to an arbitrage scanner.

---

## 6. Fees

| Fee | What the sources say | Tag |
|---|---|---|
| Zengo taker fee | "Zengo may charge a small taker fee on most market categories, applied at trade execution. Makers (users whose orders sit in the order book) are never charged fees." **No amount published.** The confirmation screen shows a "Zengo fee" and a "provider fee" under "Total with Fees". | H (rate NOT FOUND) |
| Shape of the fee | Zengo text: "Fees peak when a market is closest to 50/50 odds and decrease toward extremes". That is the shape of Polymarket's *platform* fee `platform_fee = C x feeRate x p x (1 - p)` (taker-only, per-market `feeRate`). Polymarket's *builder* fee is a flat % of notional, `notional x bps / 10000`, capped at 100 bps taker / 50 bps maker, additive to platform fees, 3-day notice and a 7-day cooldown on rate changes. So Zengo's description of its own fee does not match a flat builder fee; most likely the "provider fee" is Polymarket's platform fee and Zengo adds a flat builder fee on top. That is M (my inference). | H (formulas, Polymarket docs https://docs.polymarket.com/programs/builders/fees.md); M (mapping) |
| Polymarket deposit/withdraw | none charged by Polymarket | H |
| Gas | small POL fee on Polygon for funding, withdrawing, claiming (amount not stated) | H |
| Swap | applies when funding with a non-USDC token; shown before confirmation | H |
| Zengo builder rate | NOT FOUND: Polymarket's CLOB OpenAPI has no public lookup of a builder's fee rate (only authenticated `/builder/trades` and builder-key endpoints); the Zengo pages give no number. | - |

Arbitrage impact: a Zengo user pays at least the Polymarket platform fee plus an unknown extra builder fee of up to 1% on takers. Zengo can therefore only be a *worse-priced* way to reach the same book.

---

## 7. Resolution and dispute risk

- All resolution is Polymarket's UMA Optimistic Oracle: "an outcome is proposed, anyone can challenge, if disputed UMA token holders vote". Undisputed about 2 hours after proposal; disputed about 4-6 days. Zengo "has no influence over how a market resolves", "cannot reverse trades or recover funds from resolved markets", and "is not responsible for market results or resolution decisions". (H, help center)
- Unclaimed winnings have no expiry and stay in Polymarket's contracts until claimed. (H)
- Dispute/ambiguity risk is therefore exactly Polymarket's; Zengo adds no independent source of truth. Per-market resolution source and edge cases are shown in the app's About tab (not readable by us).

---

## 8. Geo, ToS and automation

- **Excluded regions (H, article dated 2026-06-09; "reflects Polymarket's geographic restrictions and may change"):** United States, United Kingdom, Australia, France, Germany, Belgium, Netherlands, Switzerland, Singapore, Poland, Romania, Thailand, Taiwan, Ukraine, Ontario (Canada), and countries on the US sanctions list. In a restricted region the Predictions tab is hidden or trades are blocked at checkout. How location is determined is NOT FOUND.
- KYC: not mentioned (NOT FOUND). Continuing a trade means "accepting Polymarket's terms".
- Automation/bot/API rules: NOT FOUND in the three help articles. The Zengo User Agreement (https://www.kzencorp.com/user-agreement, which redirects to `zengo.com/user-agreement`) returned 403, so it is unread. Because there is no programmatic interface, this is moot; Polymarket's terms govern the underlying orders.
- Why the builder identification is only M: the builder profile on Polymarket is simply named "Zengo" and flagged `verified: true`; its volume first appears in the week starting 2026-05-31 (289 shares) and ramps in the week of 2026-06-07, matching the help-article date of 2026-06-09 and the "launched in Q2" statement. No Zengo page states its builder code.
- eToro-side US plan: "to launch prediction markets in the U.S." is tied to the TradeZero integration, which is expected to close H1 2027 (M, earnings-call write-up). Not live; no venue named. Do not treat it as a US route. (Polymarket US is covered separately.)

---

## 9. Liquidity

All figures are Polymarket data API v2, retrieved 2026-10-19 about 03:2x UTC. **Units are SHARES** (per the OpenAPI description: "`volume` is in SHARES, not USDC"). With prices between $0 and $1, notional USD is <= shares. (H data; the attribution to Zengo is M)

| Month bucket | Zengo shares | Zengo wallets (`active_users`) | Zengo rank | All-builder shares | Zengo share |
|---|---|---|---|---|---|
| 2026-06 | 116,147 | 72 | 121 | 1.500 bn | 0.0077% |
| 2026-07 | 216,016 | 61 | 107 | 1.403 bn | 0.0154% |
| 2026-08 | 12,297 | 37 | 189 | 0.689 bn | 0.0018% |
| 2026-09 | 11,871 | 29 | 189 | 0.684 bn | 0.0017% |
| 2026-10 (19 days) | 3,129 | 21 | 187 | 0.456 bn | 0.0007% |
| All-time board | 359,459 (upper bound about $359k notional) | 161 | 204 of 592 | n/a | n/a |

Weekly series (week buckets appear to be dated by their first day, a Sunday; M, inferred because the 2026-10-18 bucket holds only about one day of data): 80,551 shares in the week of 2026-07-05 (peak), 34,774 (07-12), 61,227 (07-19), then 1,987 (07-26), 5,261, 3,162, 2,622, 515, 1,552, 4,425, 3,645, 2,626, 161 (09-27), 1,129, 1,561 and 361 (10-18, partial). So the drop happened abruptly after the week of 2026-07-19. (H data; fixture below)

- Zengo has not published volume, users or TVL. eToro said the revenue from the Zengo and Bit2C acquisitions is "not a material number at this stage" (M, earnings-call write-up).
- The `active_users` field counts distinct *makers* in the window, i.e. distinct trading addresses, not Zengo app users.
- Markets: depth and spreads are Polymarket's. Zengo's own warning: "The price you see when browsing may not be the price at which your order fills, especially in low-liquidity markets." (H)
- Caveat: only orders that carry Zengo's builder code are counted, so this is a floor for Zengo flow, but it is the best available proxy. It cannot reveal Zengo's share of any single market.

---

## 10. Category overlap and shared liquidity

- **Overlap:** by construction, 100% of Zengo's markets are Polymarket markets (politics, sports, crypto price thresholds, finance/macro, geopolitics, "and more"). Every overlap with Kalshi, Limitless, Predict.fun, Opinion, etc. is an overlap of *Polymarket's* book with those venues; it needs to be modelled once, in the Polymarket adapter.
- **Shared liquidity with another venue: yes, fully, with Polymarket global (H).** The aggregator must not count "Zengo" as a separate leg or add its depth to Polymarket's.
- Related, not independent: Zengo is a distribution channel; a flow-attribution signal ("how much volume carries the Zengo builder code") would be available from the `builder` field on `OrderFilled` events and from the leaderboard endpoint above, but at 3k shares per month it contains no signal.

---

## 11. Adapter priority

**skip.**

- Duplicate liquidity (100% Polymarket), no API, mobile-only, MPC wallet no external system can drive, geo-restricted, a worse fee than going direct, and Zengo-attributed volume is about 0.001% of builder-routed volume and falling.
- The only follow-up worth doing is a note in the Polymarket adapter: builder codes, `bytes32 builder` in the signed order, builder fees additive to platform fees, and `/v2/builders/leaderboard` / `/v2/builders/volume` as the free volume-by-frontend endpoints (useful if a future build wants to weight Polymarket volume by frontend, or to see which builders concentrate flow).
- Revisit if eToro announces a native prediction product or a direct venue (for example after the TradeZero closing), or if a Zengo web/API surface appears.

---

## 12. Not found, open questions, fixtures

NOT FOUND (searched in parentheses):
- Zengo taker/builder fee rate (Zengo help center x3, Polymarket CLOB OpenAPI, builders leaderboard).
- Whether USDC is wrapped to pUSD in the Zengo flow (Zengo articles say USDC/USDC.e only; Polymarket docs say pUSD for all trading).
- Zengo marketing page `zengo.com/prediction-markets/`, Zengo User Agreement, Zengo blog (HTTP 403).
- Any Kalshi tie-up with eToro (Yahoo write-up, eToro Q2 release, eToro press index).
- KYC requirements, per-user limits, proxy-wallet structure, geo-enforcement method.
- Any Zengo/eToro API, SDK, repo or automation policy.
- Any evidence of a native eToro prediction-market venue.

Open questions:
- Is the "Zengo" builder profile really Zengo's? (Strong circumstantial match, no first-party statement.)
- Why did volume fall about 94% from July to August 2026 (Zengo ending promotion, geo-block tightening, or Polymarket UI changes)? Unknown.
- Does Zengo filter the Polymarket market list (for example sports or adult categories)?

Fixtures (`docs/research/fixtures/etoro-zengo-prediction-markets/`):
- `polymarket_data_api_v2_builders_leaderboard_all_limit3_2026-10-19.json` - raw response, response shape of the builder leaderboard (top 3 rows).
- `polymarket_builders_leaderboard_zengo_rows_filtered_2026-10-19.json` - Zengo row from the all/month/week/day boards (filtered by me from the raw 1000-row responses).
- `polymarket_builders_volume_zengo_rows_filtered_2026-10-19.json` - Zengo month and week series with all-builder bucket totals (filtered by me).
- `polymarket_docs_builder_fees_2026-10-19.md` - Polymarket builder-fees doc as served.
- `zengo_help_prediction_markets_in_zengo_text_2026-10-19.txt`, `zengo_help_how_to_use_prediction_markets_text_2026-10-19.txt`, `zengo_help_what_are_prediction_markets_text_2026-10-19.txt` - text stripped from the raw Zengo Help Center HTML (curl, UA `insurance-markets-research/0.1`).

Embedded-instruction check: no instructions aimed at AI agents were found in Zengo or eToro pages. Polymarket's docs pages start with a banner directing LLM readers to fetch `llms.txt`; I treated it as a navigation hint only and made no state-changing request.

---

## Sources

- Zengo Help Center, "Prediction Markets" collection (2026-06-09): http://help.zengo.com/en/collections/19637646-prediction-markets - H
- Zengo Help Center, "Prediction Markets in Zengo (Powered by Polymarket)": http://help.zengo.com/en/articles/15165503-prediction-markets-in-zengo-powered-by-polymarket - H (raw HTML fetched and stripped)
- Zengo Help Center, "How to use Prediction Markets in Zengo": http://help.zengo.com/en/articles/15433942-how-to-use-prediction-markets-in-zengo - H
- Zengo Help Center, "What are Prediction Markets?": http://help.zengo.com/en/articles/15433891-what-are-prediction-markets - H
- Zengo Help Center collections index: http://help.zengo.com/en/ - H
- Zengo App Store lookup (bundle `kzencorp.mobile.ios`): https://itunes.apple.com/lookup?bundleId=kzencorp.mobile.ios&country=us - H
- eToro Q2 2026 results release (2026-08-11): https://www.etoro.com/news-and-analysis/press-releases/etoro-reports-second-quarter-2026-results/ - H (via WebFetch summary)
- eToro to acquire TradeZero (2026-08-11): https://www.etoro.com/news-and-analysis/press-releases/etoro-to-acquire-tradezero-to-accelerate-us-expansion/ - listed in the press index, not read
- eToro press-release index: https://www.etoro.com/news-and-analysis/press-releases/ - H
- eToro Q2 2026 earnings call write-up: https://finance.yahoo.com/markets/stocks/articles/etoro-etor-q2-2026-earnings-144333144.html - M (WebFetch summary)
- Polymarket builder program overview: https://docs.polymarket.com/developers/builders/builder-intro and https://docs.polymarket.com/programs/builders/overview.md - H (WebFetch summary)
- Polymarket builder fees: https://docs.polymarket.com/programs/builders/fees.md - H (raw)
- Polymarket docs index: https://docs.polymarket.com/llms.txt and https://docs.polymarket.com/_llms/en/api-reference/predictions.txt - H
- Polymarket Data API v2 OpenAPI: https://data-api.polymarket.com/v2/openapi.json - H
- Polymarket Data API v2 builder endpoints: https://data-api.polymarket.com/v2/builders/leaderboard and https://data-api.polymarket.com/v2/builders/volume - H
- Polymarket CLOB OpenAPI: https://docs.polymarket.com/api-spec/clob-openapi.yaml - H
- ZenGo-X GitHub org: `gh api orgs/ZenGo-X/repos`, `gh api repos/ZenGo-X/public-docs/contents` - H
- Blocked or unread: `https://zengo.com/prediction-markets/`, `https://zengo.com/`, `https://www.zengo.com/user-agreement` (Cloudflare 403).
