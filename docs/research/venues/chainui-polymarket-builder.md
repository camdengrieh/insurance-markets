# chainui (Polymarket builder) - venue spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to `data-api.polymarket.com`, `clob.polymarket.com`, `gamma-api.polymarket.com`; page reads of `docs.polymarket.com` and `builders.polymarket.com` via WebFetch (small-model summaries, so strictly M for prose details unless I also saw the raw text). User-Agent `insurance-markets-research/0.1`. No account, key, signature, wallet, POST, PayBox call or browser automation. Third-party text was treated as untrusted data; none of it contained instructions aimed at agents.

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary, summarised by a fetch tool, or my inference; **L** = weak or stale.

Fixtures (5 files, all < 17 KB): `docs/research/fixtures/chainui-polymarket-builder/`. Third-party wallet addresses in the trade sample are redacted.

## 0. Verdict

**adapter_priority: skip** (as a venue or arbitrage leg). At most a footnote in the Polymarket adapter.

1. **Not a venue.** "chainui" is a verified entry in Polymarket's Builder Program leaderboard (builder code `0x932d9c0c...03c1de`). It attaches that code to orders that settle on Polymarket's own CLOB. It has no markets, books, oracle or API of its own. 100% of its liquidity is Polymarket's. [H]
2. **Not independent.** Any price it shows is a Polymarket price. It cannot be an arbitrage leg. [H]
3. **Identity unresolved.** I found no website, docs, repo or social account for "chainui". The builder page shows no link for it. `chainui.com` redirects to a GoDaddy for-sale page, `chainui.io` does not resolve, `chainui.xyz` fails TLS. A Polymarket profile search for "chainui" returned no match (only ChainUP, chainxixi, chainwizard etc., unrelated). Web search was unavailable (session budget exhausted). Identity: NOT FOUND. [H for the failures]
4. **Behaviour is a small desk or bot, not a retail front end.** 32 lifetime active users but $12.8M volume; trades are overwhelmingly esports (Dota 2, CS2) in-play game and map markets, and 70% of sampled fills are MAKER fills (section 4). [H data, M interpretation]
5. **Only value to this project:** it is a live example of a builder-attributed esports market-making flow and a tell for which Polymarket esports markets are actively quoted. Marginal.

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=50` (2026-10-19) | rank 52, `verified:true`, volume $12,833,409, 32 active users | H |
| same, `timePeriod=MONTH` | rank 16, $6,648,206, 29 users | H |
| same, `timePeriod=WEEK` | rank 44, $81,089, 8 users | H |
| same, `timePeriod=DAY` | not in top 50 | H |
| `v1/builders/volume?timePeriod=DAY` | daily rows through 2026-10-18 ($81,089; 8 users) | H |
| `clob.polymarket.com/builder/trades?builder_code=<code>` | 300 rows, latest `matchTime` 2026-10-18 22:44 UTC, status CONFIRMED | H |
| builders.polymarket.com | lists chainui at rank 16 on its 1-month view, no website link, no description | H (fetch summary) |

Still live as a builder-code user. History (v1 `builders/volume?timePeriod=MONTH`, H):

| Month | Volume | Active users | Rank |
|---|---|---|---|
| 2026-08 | $13,457 | 1 | 183 |
| 2026-09 | $6,171,745 | 13 | 23 |
| 2026-10 (to 10-18) | $6,648,206 | 29 | 16 |

First volume 2026-08-29. Ramp began 2026-09-19. Daily volume since then: roughly $0.3M-$1.0M on active days, near zero on isolated days (2026-09-28 $2.5K, 2026-10-04 $2.7K, 2026-10-12 $13K). Last 7 days are much weaker than the preceding ones (10-13..10-18: $13K-$243K/day vs $0.5M-$1.0M on 10-08..10-11). It is young (about 7 weeks), so there is no long-run evidence it persists. [H data, M interpretation]

## 2. Kind and market model

- kind: broker-or-frontend (Polymarket builder-code user). Could be a trading desk or a bot, possibly with a small user-facing app; not determinable. [M]
- Market model is Polymarket's: binary markets (two outcome tokens, each with its own order book) and neg-risk categoricals, CLOB with off-chain matching and on-chain settlement, ERC-1155 outcome tokens, `version` field selecting the CTF or V2 ledger. See `docs/research/08-venues-polymarket-kalshi.md` (not re-researched here). [H via that note]
- What chainui trades (from 300 recent builder fills, 2026-10-18 12:47-22:44 UTC): 22 distinct markets, all esports on the same day. Examples: "Dota 2: Gorgc Team vs Stariy bog Team - Game 2 Winner", "Counter-Strike: FURIA vs BetBoom Team - Map 3 Winner", plus BO3/BO5 series winners. All binary, `neg_risk:false`. Slugs like `dota2-gorgc-sbt-2026-10-18-game2`, `cs2-furia-bb3-2026-10-18`. Price range of fills 0.02-0.999. Notional of the 300 fills: $31.7K. [H]

## 3. Chains and collateral

- Polymarket: Polygon (137), collateral pUSD (6 decimals). [H via docs/research/08, not re-verified]
- chainui's own funding or custody model: NOT FOUND (no site/docs).

## 4. Read API

- exists: **none for chainui itself**. NOT FOUND (searched: chainui.com/.io/.xyz, Polymarket builder page, Polymarket profile search).
- Polymarket publishes public, unauthenticated builder statistics (H, all returned 200 without credentials on 2026-10-19):

| Endpoint | Shape | Notes |
|---|---|---|
| `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY\|WEEK\|MONTH\|ALL&limit<=50&offset<=1000` | array of `{rank (string), builder, builderCode, volume, activeUsers, verified, builderLogo}` | Documented at https://docs.polymarket.com/api-reference/builders/get-aggregated-builder-leaderboard; "no security requirements" and no rate limit stated. **v1 is slated for retirement 2026-10-24** per sibling note (docs/research/08). |
| `GET https://data-api.polymarket.com/v2/builders/leaderboard?timePeriod=...&limit=50&cursor=` | `{data:[{rank (int), builder_name, builder_code, profile_image, verified, volume, active_users}], pagination:{limit, offset, has_more, next_cursor}}` | snake_case; cursor only (`offset` param is rejected with `invalid_request`). Use this one. |
| `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=DAY\|MONTH` | array of `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}` per builder per bucket | DAY response is about 17 MB (53K rows, all builders). MONTH about 0.9 MB. |
| `GET https://clob.polymarket.com/builder/trades?builder_code=<bytes32>` | `{data:[trade], next_cursor, limit:300, count}`; trade fields: `id, tradeType (MAKER\|TAKER), takerOrderHash, builder, builderCode, market (conditionId), assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime, bucketIndex, fee, feeUsdc, builderFee, createdAt, updatedAt` | Answered 200 with no auth header and filtered to the requested code (300/300 rows carried chainui's code). Mentioned by the order-attribution docs page (fetch summary, M). I could not find its API-reference page (the guessed path 404s), so its auth requirement and stability are not documented in anything I read. It exposes per-trade `owner` and `maker` identifiers of other participants; I did not store them. |

- Market data (books, prices, trades, resolution) for the markets chainui trades comes from Polymarket's Gamma/CLOB/Data APIs and websockets, covered by the Polymarket workflow and docs/research/08. I confirmed `GET clob.polymarket.com/markets/{conditionId}` returns `question, market_slug, tokens[{token_id,outcome,price,winner}], neg_risk, accepting_orders, game_start_time, taker_base_fee, version` for these esports markets. [H]
- Rate limits: not documented for these endpoints; builder tier limits are about relayer transactions (section 5). [H]
- Websocket: none from chainui; Polymarket's `wss://ws-subscriptions-clob.polymarket.com/ws/market` applies. [H via docs/research/08]
- Docs: https://docs.polymarket.com/programs/builders/overview.md, `/fees.md`, `/tiers.md`. [H]
- Fixtures: all five files in `docs/research/fixtures/chainui-polymarket-builder/`.

## 5. Trade path

- chainui exposes no trading API. NOT FOUND.
- A PayBox agent (or any client) that wants this flow trades Polymarket directly: sign an EIP-712 order (builder field = a bytes32 builder code, zero by default) and POST to the CLOB with L2 API credentials. Builder attribution is optional and is just an order field. [H, order-attribution page summary; M for details]
- Builder-program limits (tiers page, fetch summary, M): Unverified 100 relayer txns/day; Verified 10,000/day (manual approval via email); Partner unlimited.
- Co-location is not available to builder-program participants or third-party apps trading for end users. [H, geoblock page]

## 6. PayBox reachability

- paybox_reachable: **no** for chainui as a distinct venue (nothing to reach).
- The underlying Polymarket is reachable only via EIP-712 typed-data signing (`request_wallet_sign` `typedData`) on Polygon; tracked in the Polymarket spec, not verified here. A PayBox wallet cannot "trade chainui".

## 7. Fees

- Polymarket platform fee (taker only, `C x rate x p x (1-p)`, per-market `feeSchedule`): see docs/research/08 section 2.7. The 300 sampled esports fills showed `fee:"0"` on every row. [H data; reason not determined]
- Builder fee (Polymarket docs `programs/builders/fees.md`, fetch summary, M): builder sets taker fee up to 100 bps and maker fee up to 50 bps (default 0, 1 bp steps); the **user pays**, added on top of platform fees; rate changes limited to one per 7 days and effective after 3 days; Polymarket can revoke fee rights or disable a code (the CLOB then rejects orders carrying it).
- chainui's actual rates (H, from the trade sample): taker fills carry `builderFee` = **0.20% (20 bps)** of `sizeUsdc` (91 taker fills with non-zero fee, ratio min/mean/max 0.0020/0.0020/0.0020); all 209 maker fills have `builderFee:"0"`. So chainui charges 20 bps taker, 0 maker (as of 2026-10-18). An arbitrage calculation that routes through chainui would pay 20 bps more than going direct; there is no reason to.

## 8. Resolution mechanism and dispute risk

Identical to Polymarket: UMA Optimistic Oracle (proposal, 2 h challenge, disputes escalate to UMA DVM vote, 4-6 days if disputed; 50/50 outcome possible). chainui adds no resolution layer. [H via docs/research/08]
Esports-specific caution (M, my inference): in-play game/map markets resolve from the league/stream outcome; resolution wording and source per market must be read from the market `description`, not matched by title across venues.

## 9. Geo / ToS / automation

- Polymarket geoblock (`GET https://polymarket.com/api/geoblock`, docs page, H): fully blocked IR, SY, CU, KP, Crimea/Donetsk/Luhansk; close-only (frontend and API) includes US, GB, DE, FR, IT, PL, SG, AU, BE, BR, TH, TW, RU, parts of CA and others; close-only frontend only: IE, JP, MT (sports), NL, KR. Orders from blocked regions are rejected; builders are expected to pre-check.
- chainui's own ToS, geo rules, automation policy: NOT FOUND (no site).
- Builder code can be disabled by Polymarket at its discretion (section 7), so builder-attributed flow carries counterparty-platform risk that direct flow does not.

## 10. Liquidity

- Builder-attributed volume (Polymarket Data API, 2026-10-19): $12.83M all-time (7 weeks), $6.65M Oct 2026 month-to-date (to 10-18), $6.17M Sep, $81K on 10-18. [H]
- Active users: 32 all-time, 29 in Oct, 8 on 10-18. [H]
- This is a slice of Polymarket volume, not additional liquidity. No TVL/OI concept applies.

## 11. Event coverage overlap

- Sampled flow is esports (Dota 2 game/series winners; CS2 map/series winners). Overlap with other venues is thin: Kalshi, Limitless, Predict.fun, Opinion have little or no matching esports match-winner liquidity as far as I know (not checked this session, **L**). Any cross-venue edge would have to be found against Polymarket itself or against sportsbook odds (OddsJam-style), not against another prediction venue.
- Other categories (politics, crypto price, macro): none observed. [H for the 300-fill sample; older months not sampled]

## 12. Liquidity shared with

Polymarket International (100%). Same CLOB, same conditional tokens, same UMA resolution. Not an independent arbitrage leg.

## 13. Adapter priority: skip

- No markets, no API, no independent liquidity, unknown operator, young and recently fading volume, fees add 20 bps for takers.
- If anything is kept: a registry record `{builder:"chainui", builder_code:"0x932d9c0c1340da413d37ae9a10a41a14b3fd1f28e254e76f30b89e1c6703c1de", kind:"polymarket-builder", independent_liquidity:false}` so the aggregator can map builder-attributed flow back to Polymarket and dedupe it. The builder leaderboard (v2) is the right source for such a registry.

## Sources

- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=50 [H]
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH|WEEK|DAY&limit=50&offset=0 [H]
- https://data-api.polymarket.com/v2/builders/leaderboard?timePeriod=ALL&limit=50 (+ cursor page) [H]
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH and DAY [H]
- https://clob.polymarket.com/builder/trades?builder_code=0x932d9c0c1340da413d37ae9a10a41a14b3fd1f28e254e76f30b89e1c6703c1de [H]
- https://clob.polymarket.com/markets/{conditionId} (22 conditionIds from the trade sample) [H]
- https://gamma-api.polymarket.com/public-search?q=chainui (no matching profile) [H]
- https://docs.polymarket.com/programs/builders/overview.md [H, raw text read]
- https://docs.polymarket.com/programs/builders/fees.md [M, fetch summary]
- https://docs.polymarket.com/developers/builders/builder-tiers [M, fetch summary]
- https://docs.polymarket.com/developers/builders/order-attribution [M, fetch summary]
- https://docs.polymarket.com/api-reference/builders/get-aggregated-builder-leaderboard [M, fetch summary]
- https://docs.polymarket.com/api-reference/geoblock [M, fetch summary]
- https://docs.polymarket.com/llms.txt (builder pages index) [H]
- https://builders.polymarket.com (chainui listed, no link) [M]
- chainui.com (GoDaddy for-sale redirect), chainui.io (DNS failure), chainui.xyz (TLS failure) [H, negative]
- docs/research/08-venues-polymarket-kalshi.md; sibling builder notes `venues/axiom-axiom-trade-polymarket-builder.md`, `venues/metamask-polymarket-integration.md` (internal)

## Not found / open

- Who operates chainui, its website, app, docs, ToS, social accounts. (web search unavailable; domain guesses failed)
- Whether the `builder/trades` endpoint is intentionally public and its documented auth/rate limits (API-reference page not located).
- Why Polymarket `fee` is 0 on every sampled esports fill (fee-free category, or fee reported elsewhere).
- Whether chainui volume is a single market maker with a handful of accounts (8 distinct `owner` ids in the 300-fill sample; M).
- Older months' category mix.
- No suspicious or instruction-like content was found in any fetched material.
