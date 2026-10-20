# BigONE Global (bigone.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch, WebSearch, unauthenticated GETs to `bigone.com`, `open.bigone.com`, `api.big.one`, `bigone.zendesk.com` (public Help Center JSON API) and `data-api.polymarket.com` with User-Agent `insurance-markets-research/0.1`. No account, key, wallet, signature, POST/PUT/DELETE, PayBox money tool or browser automation. Third-party text treated as untrusted data; nothing in it tried to instruct an agent.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, summarised by a fetch tool, or my inference from first-hand data; **L** = weak or stale.

Fixtures (all < 16 KB) in `docs/research/fixtures/bigone-global/`:
`bigone-helpcenter-prediction-articles.json`, `polymarket-builder-leaderboard-row.json`, `polymarket-builder-weekly-volume.json`, `bigone-spot-ticker-sample.json` (spot API shape only, NOT a prediction endpoint).

---

## 0. Verdict

**adapter_priority: skip.** Keep a registry record only.

1. **Live, and it does have a prediction market** (the hint's "no prediction market" came from the homepage and is out of date). BigONE launched an in-app prediction market on 2026-06-22 (World Cup first), added a BTC 5-minute up/down product, and expanded on 2026-09-17 to Sports, Politics, Economy, Finance, Tech, Culture (H, section 1). The marketing site's static content still lists no prediction product (H negative).
2. **It is a custodial front end, not a venue.** BigONE's own rules say "event markets, matching, and settlement come from third-party international prediction markets" and BigONE "places orders on your behalf in the international prediction market" (H). The upstream is not named in the user-facing text, but Polymarket's builder-attribution feed lists "BigONE Global" with a builder code (H), so the upstream is Polymarket (M-H inference, section 5). **Liquidity is 100% shared with Polymarket International; never an independent arbitrage leg.**
3. **No programmatic access.** The official Open API (`open.bigone.com/docs`) covers Wallet, Spot, Convert and Contract only; no prediction endpoint is documented (NOT FOUND). Trading is APP-only per every help-center article.
4. **Costs more than Polymarket direct** (flat 1% each way on top of upstream costs), has a 2 USDT minimum, all-or-nothing fills, and is US-restricted.
5. **Tiny.** Builder-attributed volume is about 107K shares all-time (about $25K, M), with one attributed "active user" per week, and decaying (section 9).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://www.bigone.com/ (WebFetch) | Nav: Spot, Futures, Leveraged ETFs, Tokenized Equities, Smart Strategies. No prediction mention | H (negative) |
| https://www.bigone.com/prediction | HTTP 200 but it is the generic SPA shell (any path returns the same shell, title "BigONE \| Crypto Exchange, Bitcoin Price & Tokenized Stocks"); content not renderable without JS. I did not execute the JS | H |
| Help Center article "BigONE Launches Prediction Market! Join the World Cup Predictions Now!" https://bigone.zendesk.com/hc/en-us/articles/59242931263001 | created 2026-06-22, updated 2026-09-15 | H |
| "BigONE Prediction Market Expands! Politics, Economy, Finance, Tech and More Now Live!" https://bigone.zendesk.com/hc/en-us/articles/62350503166745 | dated 2026-09-17: adds Sports (F1), Politics (elections, policy), Economy (Fed, inflation, jobs), Finance (stocks, commodities), Tech, Culture; "BTC 5-minute price rise/fall market and other crypto markets remain open" | H |
| "Crypto Prediction Newbie Season" https://bigone.zendesk.com/hc/en-us/articles/60627766869529 | 2026-07-31 to 2026-08-15 promo, first-order 1 USDT reward (first 100 users, KYC) | H |
| Other 2026 activity: Oura IPO subscription (09-28, postponed 09-30), QTC listing (10-05) | exchange operating | M (search summary) |
| Security: July 2025 hot-wallet breach (~$27M, exchange pledged to compensate) | counterparty/custody risk, over 12 months old | M (search summary; Yahoo, BleepingComputer, The Block links in sources) |

**still_live = true** (exchange and its prediction product). The product is APP-only and I could not view the in-app market list.

---

## 2. Kind and market model

- **Kind:** centralised exchange (CEX) with a prediction-market tab, relaying to an upstream venue. (H)
- **Binary only, as presented:** Yes/No shares; "each share pays out 1 USDT (=100c) if the event is confirmed to occur"; prices 0-1 USDT; multi-outcome events (match 1X2, champion, Golden Boot) are shown as separate Yes/No options (H, Tutorial and User Guide).
- **Order book, upstream:** "Prices are determined by real-time supply and demand", "market depth", "Sell price = the best current bid price from the counterparty" (H). BigONE displays "real-time synchronized pricing and depth with major international prediction markets" (H).
- **Tokenisation:** none visible to the user. Positions are internal ledger entries inside the BigONE spot account; no on-chain operations or wallet (H, User Guide: "without any on-chain operations"). Upstream positions would be CTF-style tokens on Polymarket's chain, held by BigONE (M inference).
- **Order types exposed:** buy/sell by USDT amount, min 2 USDT, "all or nothing" (full refund if not fully filled). The rules text also mentions "limit orders do not guarantee execution", but the app flow described is market-style (H).

## 3. Chains and collateral

- User-facing collateral: USDT in the BigONE spot account (H). Upstream (inferred Polymarket): USDC on Polygon (M, from Polymarket docs elsewhere in this repo). BigONE does the conversion: "0.5% currency conversion fee" (H).
- No chain is exposed to the user. There is nothing for an EVM or Solana wallet to hold.

## 4. Read API

**exists: none (for prediction data).** NOT FOUND (searched: open.bigone.com/docs index, /docs/spot/introduction, /docs/contract/introduction, /docs/general-info, /docs/authentication for "predict"; WebSearch; GitHub repo search "bigone prediction").

What the Open API does cover (H, https://open.bigone.com/docs/ , Docusaurus, copyright 2026):

| Service | Base URL |
|---|---|
| Spot / Wallet | `https://api.big.one/api/v3` |
| Convert | `https://api.big.one/sapi/v1/convert` |
| Contract | `https://api.big.one/api/contract/v2` |

- Public spot ticker works unauthenticated: `GET https://api.big.one/api/v3/asset_pairs/BTC-USDT/ticker` returned 200 `{"code":0,"data":{"asset_pair_name":..., "bid":{...},"ask":{...},...}}` (H, fixture). Useful only as a CEX crypto price reference, not as prediction data.
- Auth for private endpoints: JWT bearer (`Authorization: Bearer <JWT>`; nonce in nanoseconds) (H, /docs/general-info). Rate limit: 500 requests per 10 s per IP; 5 WebSocket connections per user; 429 on excess (H). Docs recommend Hong Kong or Tokyo hosting (H).
- Whether the in-app prediction screens call a private/undocumented endpoint: not investigated (would require reverse-engineering the app or SPA bundle; out of scope, and undocumented endpoints would be unsupported).
- **Better data source for the same liquidity:** Polymarket's own CLOB/Gamma/Data APIs (covered by the parallel workflow).

## 5. Relationship to Polymarket (shared liquidity)

- Polymarket `GET /v1/builders/leaderboard?timePeriod=ALL` lists builder **"BigONE Global"**, verified, rank 283 (offset 250 page), volume 107,291, activeUsers 1, builderCode `0x468ce71d...b854` (H, fixture; the builder code is a public Polymarket attribution id, not a user wallet).
- Weekly series (`/v1/builders/volume?timePeriod=WEEK`) starts the week of 2026-06-14 and 06-21, i.e. the week of BigONE's 2026-06-22 launch (H, fixture). Together this ties the BigONE product to Polymarket order flow (M-H inference; BigONE never names Polymarket in the articles I read, and I did not find an announcement naming it).
- BigONE text confirms the structure: "Users are not betting against the platform but trading shares with other users in the same international prediction market. BigONE only provides the order interface and account system" (H).
- **Consequence:** not an independent leg. Price at BigONE = Polymarket price plus a ~1% fee each way plus conversion spread. If an aggregator ever sees a BigONE-vs-Polymarket gap it is a data or fee artefact, not edge.

## 6. Trade path

- **None programmatic.** Orders are placed only in the BigONE APP ("APP -> Prediction Market") using the spot USDT balance (H). No documented API, no signing scheme, no on-chain route.
- **PayBox reachability: no.** There is no deposit-to-contract or signed-order path; the only on-chain touchpoint is a custodial USDT deposit address on BigONE (needs an account + KYC, which this research must not create). A PayBox wallet could fund the exchange by transfer but could not place or cancel orders. paybox_reachable = no.

## 7. Fees (H, User Guide + Rules Supplement)

- 0.5% trading fee + 0.5% "currency conversion fee" = **1% of transaction amount, on both buys and sells**, paid by the user in USDT; shown in the order popup; no fee on failed orders. Upstream fees/builder fees are not itemised ("subject to the rules, fees ... of the third-party market"). Remaining conversion differences "borne by the platform".
- Round trip cost about 2% plus slippage. Compare Polymarket direct (fee schedule covered elsewhere).

## 8. Resolution and dispute risk

- "Final result is automatically determined by an on-chain oracle, and the platform cannot intervene" (H). Upstream rules apply: "settlement/dispute resolution processes of the third-party international prediction market" (H). If upstream is Polymarket that is UMA optimistic oracle (M, covered by the Polymarket workflow).
- User-facing disputes: submit a ticket; BigONE "will assist in verifying on-chain data but cannot change the settlement outcome". "Disputed events may cause settlement delays."
- Extra layers of risk vs direct: finality of fills ("cannot revoke, roll back, or refund"), upstream halt/invalidation ("refunds are limited to upstream actual returns"), exchange custody (2025 hack), and no guarantee BigONE's displayed resolution timing matches upstream.

## 9. Liquidity (with dates)

- Builder-attributed volume, all-time: **107,291 "volume"**, 1 active user (H, `/v1/builders/leaderboard`, 2026-10-19). Per the sibling note `docs/research/venues/redotpay-polymarket-builder.md` (H there, M here), this Polymarket field is in **shares, not USD**; at the ~0.22 USDC/share ratio measured there that is roughly $25K all-time (M, derived).
- Weekly shares (week-start date): 06-14 1,099; 06-21 11,645; 06-28 13,065; 07-05 12,909; 07-12 14,904; 07-19 7,876; 07-26 2,911; 08-02 17,133; 08-09 1,056; 08-16 971; 08-23 602; 08-30 10,593; 09-06 7,404; 09-13 522; 09-20 218; 09-27 4,182; 10-04 56; 10-11 3; 10-18 (partial) 141 (H, fixture). Declining after the launch spike despite the 09-17 category expansion.
- BigONE-side TVL/volume: NOT FOUND (no public stats for the prediction product).
- Caveat: the leaderboard counts only fills carrying BigONE's builder code; any order not attributed would be missed (M).

## 10. Event coverage and overlap

Categories (H, 2026-06-22 and 2026-09-17 articles): football/World Cup 1X2, champion, group, Golden Boot; BTC 5-minute up/down and other crypto; F1 and sports; politics (elections, policy); Fed/inflation/jobs; stocks/commodities; AI/tech events; culture/awards. All of these exist on Polymarket (and many on Kalshi), but since BigONE mirrors Polymarket depth, the overlap is not additive. Inconsistency: the 2026-06-22 rules say political elections "will not be listed", while the 2026-09-17 notice says elections now live (H, both); regional availability varies ("Some markets may be unavailable due to laws ... in your country").

## 11. Geo / ToS / automation

- "Not available to users in the United States and other restricted countries/regions announced by BigONE from time to time" (H). KYC referenced in the promo ("KYC verification to qualify", M from search snippet). Markets excluded: minors, religion, personal privacy, death/natural disasters (H).
- Automation: the Open API ToS for prediction trading does not exist; the prediction market is APP-only. No bot rules found (NOT FOUND in the articles read; BigONE User Agreement https://bigone.zendesk.com/hc/en-us/articles/115001990533 not read).

## 12. Adapter recommendation

- **skip** as an adapter. Reasons: duplicate liquidity (Polymarket), no API, no programmatic trade path, higher fees, tiny volume.
- Registry entry: `kind=cex-front-end`, `upstream=polymarket (inferred)`, `independent_liquidity=false`, `trade=none`.
- If the aggregator wants to know "who is routing flow to Polymarket", use the builder code above only for attribution analytics.

## 13. Open questions

- Is the upstream definitely Polymarket (not also Kalshi/Opinion)? BigONE text says "international prediction markets" (plural) in one place and "the international prediction market" in another. The builder-code link supports Polymarket for at least part of the flow.
- Does the BTC 5-minute market route to Polymarket's own 5-minute crypto markets? Not verified.
- Any undocumented REST/WebSocket endpoints behind the APP: not investigated.

## Sources

- https://www.bigone.com/ (WebFetch, 2026-10-19) - homepage products (H)
- https://www.bigone.com/prediction (curl, SPA shell only) (H)
- https://open.bigone.com/docs/ , /docs/general-info , /docs/authentication , /docs/spot/introduction , /docs/contract/introduction - API scope, base URLs, rate limits (H)
- https://api.big.one/api/v3/asset_pairs/BTC-USDT/ticker - sample public spot response (H)
- https://bigone.zendesk.com/hc/en-us/articles/59242931263001 (launch, 2026-06-22), /59243055100185 (rules supplement), /59243266325145 (user guide), /59243175240601 (tutorial), /62350503166745 (expansion, 2026-09-17), /60627766869529 (newbie season) - fetched as JSON via https://bigone.zendesk.com/api/v2/help_center/articles/search.json?query=prediction&locale=en-us (H)
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=250 and /v1/builders/volume?timePeriod=WEEK (H)
- docs/research/venues/redotpay-polymarket-builder.md - share-vs-USD unit of Polymarket builder volume (H there)
- Search summaries on BigONE 2025 hack: https://finance.yahoo.com/news/crypto-exchange-bigone-confirms-27m-080147918.html , https://www.bleepingcomputer.com/news/security/hacker-steals-27-million-in-bigone-exchange-crypto-breach/ , https://www.theblock.co/post/362814/bigone-hack (M, not opened)
