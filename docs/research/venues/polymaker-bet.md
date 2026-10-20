# PolyMaker (polymaker.bet) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: the official site and its public static JS bundles were read (static GETs only, never executed), Polymarket docs read, about 15 unauthenticated GETs to Polymarket public hosts (generic User-Agent `insurance-markets-research/0.1`). No account, no wallet, no key, no signing, no POST/PUT/DELETE, no PayBox tool, no browser automation. Third-party text was treated as untrusted data. The shared WebSearch budget was already exhausted when I started, so **no web search was possible**; everything below rests on direct page, API and bundle reads.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak, stale or single-source.

---

## 0. Bottom line

1. **PolyMaker is not a venue. It is a web front end / market-making terminal for Polymarket**, registered as a Polymarket "builder". The site describes itself as "Professional grade market-making and analytics suite for Polymarket." It has no order book, market creation, collateral or resolution of its own. (H: `<meta og:description>` on https://www.polymaker.bet/ ; client code posts to `/clob-api`, `/gamma-api`, `/data-api`, and Polymarket's `wss://ws-subscriptions-clob.polymarket.com/ws/market`)
2. **Liquidity is 100% Polymarket's, so it is NOT an independent arbitrage leg.** Every order is a Polymarket CLOB order carrying PolyMaker's builder code in the signed `builder` bytes32 field. (H)
3. **Site is up, but the product is nearly dormant.** Site last deployed 2026-10-17 (Last-Modified header). Builder-attributed volume peaked at $11.4M in April 2026 and fell to $50.6K in August, $359 in September and $1.7K in October to date; the latest builder-attributed trade on Polymarket's public feed is 2026-10-03, nothing since at least 2026-10-13. A 300-trade page spanning 2026-07-18 to 2026-10-03 contains exactly 2 distinct wallets. (H, section 9)
4. **No PolyMaker API, docs, ToS or GitHub repo.** The only machine-readable PolyMaker surface is Polymarket's own public builder-attribution data, which is a Polymarket-adapter feature, not a venue adapter. (H / NOT FOUND, section 4)
5. **adapter_priority = skip.** Duplicate liquidity, no API of its own, tiny and shrinking user base. Useful only as a data point (a market-maker's reward-farming flow on Polymarket), and even that is better read from Polymarket directly.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://polymaker.bet/` | HTTP 307 to `https://www.polymaker.bet/`, then 200, Vercel, `Last-Modified: Sat, 17 Oct 2026 20:46:12 GMT`, SPA shell `<title>PolyMaker</title>` (fixture `polymaker_bet_home_2026-10-19.html`, headers file) | H |
| `GET /manifest.webmanifest` | name "PolyMaker", start_url `/trade` | H |
| `GET /robots.txt`, `/sitemap.xml`, `/llms.txt`, `/terms`, `/docs`, `/trade`, `/setup` | all return the same 2,634-byte SPA shell with HTTP 200 (catch-all rewrite), so no static ToS/docs exist to read | H |
| Polymarket builder leaderboard (`timePeriod=ALL`) | "PolyMaker.bet", verified=true, rank 38, volume $24,849,151, activeUsers 24 | H |
| Latest builder-attributed trade (`clob.polymarket.com/builder/trades`) | newest row `createdAt` 2026-10-03T19:14:52Z; query with `after=1792000000` (2026-10-13) returns `count: 0` | H |
| Builder code state (`clob.polymarket.com/fees/builder-fees/<code>`) | `enabled: true`, maker 0 bps, taker 0 bps | H |

**still_live = true** in the narrow sense that the site is deployed (updated 2 days ago) and the builder code is enabled. Practically dormant: see section 9.

Identity link: the Polymarket builder profile is named "PolyMaker.bet" (logo hosted on Polymarket's S3), the site's own links are `x.com/polymakerbet` and `t.me/polymakerbet`, and the builder code `0xe029fcec...7531b` is hard-coded in the site bundle, so the site and the builder profile are the same operator (H). Whether other products reuse the name was not checked (no web search available). GitHub: `search/repositories q=polymaker.bet` returned 0 results and user `polymakerbet` does not exist (H).

---

## 2. Kind and market model

- **kind: broker-or-frontend** (web trading + market-making terminal over Polymarket). (H)
- Features seen in the site bundle (UI strings, H): "Liquidity mode: place reward-focused maker orders", Polymarket liquidity-reward eligibility/audit and APR estimates ("Score-normalized estimate from the current public orderbook; actual APR depends on paired liquidity and live reward share"), "Double-sided liquidity is REQUIRED to earn rewards at extreme prices" (price <10c or >90c), a `Bond` page ("Markets in the resolution process. Potentially low-risk bond plays"), a `Stats` user lookup ("Look up any user - name, handle, or wallet address"), an `Airdrop` readiness page ("Fetches live data from Polymarket leaderboards"), a `WtiTerminal` page ("Settles from Pyth WTI 1m close at 5:00 PM ET"), a `Portfolio` page, and a `Builder` page ("No trades attributed to this builder yet.").
- **Market model: inherited from Polymarket.** Binary and neg-risk multi-outcome markets on the Polymarket CLOB; outcomes are CTF ERC-1155 position tokens (`assetId` in the builder-trades feed is a 77-digit token id; `outcome` "Yes"/"No"/names; `outcomeIndex`); prices 0-1 in collateral. The bundle links https://docs.polymarket.com/concepts/positions-tokens and handles neg-risk contracts ("Approving neg-risk trading contracts with Privy..."). (H)
- Market ids to use in our matcher are Polymarket `conditionId` (`market` field, `0xd0e58a...`) and token ids. PolyMaker adds none.

## 3. Chains and collateral

- Chain: **Polygon** (client constant `wb=137`; links to polygonscan.com/tx). Collateral: **pUSD** on Polymarket V2 (per Polymarket builder-fee docs: "1,000 pUSD taker buy"; the bundle's approvals text: "Approves pUSD and conditional tokens for normal and neg-risk trading"). (H)
- Wallet model (from bundle strings, interpretation M): the app signs EIP-712 `Order(... uint8 signatureType, uint256 timestamp, bytes32 metadata, bytes32 builder)` for domain "Polymarket CTF Exchange" v1, supports EOA (browser wallet), Safe and `POLY_1271` (deposit-wallet) signature types, and offers "Privy server signing with the Polymarket deposit wallet" which "Allows the server signer to place and cancel orders without wallet popups." That means a PolyMaker backend route (`POST /api/privy/sign-typed-data`, takes address, walletId, typedData) can sign orders for a user's Privy wallet. This is delegated trading authority held by the PolyMaker operator's backend. Custody and key-delegation terms: NOT FOUND (searched: site routes, bundle strings, GitHub). Treat as a custody-adjacent risk, not an integration path.
- Gasless on-chain operations (wallet deploy, approvals) go through `POST /api/relayer/submit`, which forwards to Polymarket's relayer `https://relayer-v2.polymarket.com` under builder credentials (M; the Polymarket Unverified builder tier allows 100 relayer txns/day, Verified 10,000/day, per https://docs.polymarket.com/programs/builders/tiers.md, H). Whether PolyMaker is Verified: the leaderboard row says `verified: true` (H).

## 4. Read API

| Item | Value | Tag |
|---|---|---|
| Official PolyMaker API | **None.** No docs site, no OpenAPI, no `/api/*` public read routes. Known server routes are write/auth helpers only: `POST /api/privy/sign-typed-data`, `POST /api/relayer/submit`. Not probed (POST). | H (site + bundle) |
| Same-origin proxies | `/clob-api`, `/gamma-api`, `/data-api` appear to be rewrites to Polymarket hosts (bundle constants; `fetch("/clob-api/time")`). I did not test them; use the Polymarket hosts directly. | M |
| Market data (use Polymarket) | Gamma `https://gamma-api.polymarket.com`, CLOB `https://clob.polymarket.com` (`/book`, `/price`, `/midpoint`, `/time`), Data API `https://data-api.polymarket.com`, WS `wss://ws-subscriptions-clob.polymarket.com/ws/market`. Docs https://docs.polymarket.com (llms.txt). See the Polymarket spec for details. | H |
| PolyMaker-attributed trades (public) | `GET https://clob.polymarket.com/builder/trades?builder_code=<bytes32>` returns `{data[], next_cursor, limit:300, count}`; params `id, market, asset_id, before, after, next_cursor`. Unauthenticated GET worked (HTTP 200, 270 KB for 300 rows). Row fields: `id, tradeType (MAKER|TAKER), takerOrderHash, builder, market, assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime, bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`. Fixture: `clob_builder_trades_polymaker_page1_sample_2026-10-19.json` (4 rows, wallet and owner truncated by me). | H |
| Builder fee config | `GET https://clob.polymarket.com/fees/builder-fees/<code>` returns `{code, builder_maker_fee_rate_bps:0, builder_taker_fee_rate_bps:0, enabled:true}`. Fixture `clob_fees_builder-fees_polymaker_2026-10-19.json`. | H |
| Builder leaderboard / volume | `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY|WEEK|MONTH|ALL&limit=50&offset=0` (rank is a string; builder code in `builderCode`) and `GET /v1/builders/volume?timePeriod=...` (time series, one row per builder per bucket with `dt, volume, activeUsers, rank`). `timePeriod=ALL` returns yearly buckets (2025-01-01, 2026-01-01); MONTH returns 13 monthly buckets (~930 KB); WEEK 55 weekly; DAY 375 daily (17 MB, avoid). Fixtures: `polymarket_data-api_builders_leaderboard_ALL_top2_plus_polymaker_2026-10-19.json`, `polymarket_data-api_builders_volume_{ALL,MONTH,WEEK}_polymaker_2026-10-19.json`. | H |
| PolyMaker builder code | `0xe029fcec50c61bdbbc1fb097d882033d8d1616d4d3d102b623fad622d5f7531b` (public in the leaderboard response and in the site bundle) | H |
| WebSocket | None from PolyMaker; Polymarket's own market channel is used by the front end. | H |
| Rate limits | Polymarket's (Cloudflare, per IP; see the Polymarket spec). `/builder/trades` has no separately documented limit. Builder API tiers say only "Standard"/"Highest" (https://docs.polymarket.com/programs/builders/tiers.md). | H |

## 5. Trade path and PayBox reachability

- **PolyMaker:** browser UI only. No programmatic order API, signing scheme or webhook is published. The front end builds Polymarket V2 orders client-side (EOA/Safe) or via the operator's Privy server signer (section 3). (H for UI/bundle; NOT FOUND for any public API)
- **PayBox EVM wallet via PolyMaker:** no meaningful path. Using it would mean connecting a wallet to a third-party SPA or delegating signing to a Privy server signer, which hands trading authority to the operator for zero liquidity benefit. **paybox_reachable = no** for PolyMaker as a venue.
- **The same liquidity is reachable directly through Polymarket:** a PayBox EVM wallet on Polygon can sign Polymarket CLOB orders itself (EIP-712 `Order` with `builder` bytes32, `signatureType`, `timestamp`, pUSD collateral). See the Polymarket spec. Attaching our own builder code is optional (default 0 bps; builder profile is created on polymarket.com, an account action not done here). (H: https://docs.polymarket.com/programs/builders/fees.md)

## 6. Fees

- **PolyMaker's own fee: 0 bps maker and 0 bps taker** (builder fee rates from `clob.polymarket.com/fees/builder-fees/<code>`, 2026-10-19). Builder fees are paid by the user, additive to platform fees, max 100 bps taker / 50 bps maker, one rate change per 7 days, effective 3 days after scheduling: `builder_fee = notional * builder_fee_rate_bps / 10000`. The sampled trades all show `builderFee: "0"`. (H: https://docs.polymarket.com/programs/builders/fees.md and live endpoint)
- **Polymarket platform fee (taker only, per-market feeRate):** `fee = C * feeRate * p * (1 - p)`; makers pay nothing. Rates on the docs page today: Crypto 0.07, Sports 0.05, Finance 0.04, Politics 0.04, Economics 0.05, Culture 0.05, Weather 0.05, Other 0.05, Mentions 0.04, Tech 0.04, Geopolitics 0; maker rebates 15-25% by category. The site UI repeats "Taker fees apply when an order fills immediately. Maker orders have no fee." (H: https://docs.polymarket.com/trading/fees.md)
- Sampled `feeUsdc` in the 300-row builder page: total $130 on $108.6K matched notional (rows are a mix of MAKER and TAKER). (H, my arithmetic)
- Revenue is therefore effectively nil for PolyMaker, which explains why it looks like an own-account/market-maker tool rather than a commercial front end (M, inference).

## 7. Resolution mechanism and dispute risk

Inherited entirely from Polymarket. Per https://docs.polymarket.com/concepts/resolution.md (H): UMA Optimistic Oracle; proposer bond typically $750 pUSD; 2-hour challenge window; a first dispute re-opens a proposal round, a second dispute goes to a 24-48 hour debate then a ~48 hour UMA DVM vote; undisputed ~2 hours, disputed 4-6 days; unknown/50-50 pays $0.50 per token. Chainlink-TWAP "up/down" markets resolve without a dispute process. PolyMaker's `Bond` page surfaces markets in the dispute window and warns "This market resolves 50/50 - both sides pay out ~50c." Operator-level risk (PolyMaker deactivation, Polymarket disabling the builder code: "Orders with a disabled code are rejected by the CLOB") does not affect position tokens, which live in the user's own Polymarket wallet. (H docs; M interpretation)

## 8. Geo / ToS / automation

- PolyMaker ToS, privacy policy, geo policy, API terms: **NOT FOUND** (searched: `/terms`, `/privacy`, `/docs`, `/robots.txt`, `/sitemap.xml`, `/llms.txt` all return the SPA shell; bundle chunks Airdrop, Bond, Builder, Stats, Signless, WtiTerminal and the main index contain no terms text; no GitHub). (H)
- Polymarket rules bind the flow because every order goes to its CLOB: `GET https://polymarket.com/api/geoblock` returns `blocked, ip, country, region`; fully blocked: Iran, Syria, Cuba, North Korea, Crimea/Donetsk/Luhansk; close-only (frontend and API) includes the US, UK, France, Germany, Italy, Singapore, Russia, Australia, Belgium, Brazil and several Canadian provinces. "Before placing orders, builders should verify the location," and "Orders submitted from blocked regions will be rejected." Polymarket can revoke builder fee rights for activity it deems "fraudulent, automated, or self-referred". (H: https://docs.polymarket.com/api-reference/geoblock.md, https://docs.polymarket.com/programs/builders/fees.md)
- Automation: the product is itself an automated market-making tool; no PolyMaker rule against API scraping exists because it has no API. Polymarket's public builder feed is open to unauthenticated GETs.

## 9. Liquidity

PolyMaker has no liquidity of its own. The only measurable quantity is Polymarket volume attributed to its builder code (unit: matched notional USD; whether MAKER and TAKER rows are both counted is not documented, M). Source: `data-api.polymarket.com/v1/builders/volume`, fetched 2026-10-19 (fixtures).

| Month (2026) | Attributed volume | Active users | Builder rank |
|---|---|---|---|
| Jan | $20,000 | 1 | 75 |
| Feb | $1,025,438 | 8 | 28 |
| Mar | $4,656,599 | 14 | 14 |
| Apr | $11,365,683 | 8 | 13 |
| May | $5,792,896 | 6 | 21 |
| Jun | $464,754 | 3 | 86 |
| Jul | $1,471,075 | 3 | 60 |
| Aug | $50,637 | 2 | 144 |
| Sep | $359 | 1 | 264 |
| Oct (to 18th) | $1,710 | 1 | 205 |
| **2026 total** | **$24.85M** (matches leaderboard ALL) | 24 distinct | 38 (ALL) |

Peak week was the week starting 2026-04-05 ($4.41M, 4 users). July includes a single day, 2026-07-25, at $1.10M (1 user). About 92% of lifetime volume came in Feb-May 2026. Last attributed trade: 2026-10-03. Context for scale: the sum of the top 50 builders' ALL volume is $7.6B (H, my sum), so PolyMaker is about 0.3% of that. No TVL/OI concept applies.

## 10. Event categories that overlap other venues

All of Polymarket's categories (sports, politics, crypto up/down and price, macro/finance, culture, weather, tech). The attributed flow samples 75 distinct markets in the last 300 trades (H). For arbitrage purposes there is nothing PolyMaker-specific: read Polymarket directly. The one category the site visibly targets is WTI crude price (Pyth 1m close, 5 PM ET), which is a Polymarket market type that could overlap with other venues' commodity contracts. (M)

## 11. Shared liquidity

**Shares 100% of liquidity with Polymarket** (global CLOB; the geoblock list shows the US is close-only on the global venue, with a separate Polymarket US product covered elsewhere). Any quote PolyMaker users place is visible in the Polymarket book, and any fill happens on Polymarket's exchange contracts. **Not an independent arbitrage leg.** (H)

## 12. Adapter recommendation

- **skip.** Build the Polymarket adapter only.
- Optional, tiny: if the aggregator wants to label flow by front end, `GET /builder/trades?builder_code=...` and `/v1/builders/leaderboard` are cheap to poll and could attribute fills to builder codes (including PolyMaker's), but PolyMaker's own flow is now 1-2 wallets, so the signal value is ~0.
- Re-check only if `v1/builders/volume?timePeriod=MONTH` shows PolyMaker above, say, $5M/month with more than 10 active users.

## 13. NOT FOUND (searched)

- Public PolyMaker API, OpenAPI, docs site (searched: site routes, bundle, GitHub search `polymaker.bet`, user `polymakerbet`).
- PolyMaker ToS / privacy / geo / custody terms (searched: SPA routes, all lazy bundle chunks).
- Web press, reviews, exploit reports for PolyMaker (**not searched: WebSearch budget exhausted**; treat absence as unknown).
- Operator identity and team (the X and Telegram links exist; `t.me/polymakerbet` is a general chat, "General chat for PolyMaker"; member count not shown).
- A rate limit for `/builder/trades`.

## 14. Open questions

1. Whether builder "volume" double-counts MAKER and TAKER legs of the same trade (docs say only "matched trade volume attributed to your builder code").
2. Whether the Privy server signer is operator-held (custodial) or a user-owned key quorum. The bundle suggests an operator route signs typed data on request.
3. Whether the `/clob-api`, `/gamma-api`, `/data-api` same-origin routes are plain rewrites (cache/ToS implications) - not tested, no value in testing.
4. Why builder fees are set to 0 bps (own-account tool vs. growth mode).

---

## Sources

- https://www.polymaker.bet/ (HTTP 200 on 2026-10-19; Last-Modified 2026-10-17), `/manifest.webmanifest`, and static bundles `/assets/index-BXaKK0s0.js`, `/assets/{Airdrop-Cp8jINja,Bond-CzyQuCUC,Builder-DvPf2_Jn,Stats-CChNOxds,WtiTerminal-Bfigno1U,Signless-CAOGYmFp}.js` - read as text only, not executed. H for facts quoted; interpretation tagged M.
- https://data-api.polymarket.com/v1/builders/leaderboard and /v1/builders/volume (GET 2026-10-19). H.
- https://clob.polymarket.com/builder/trades, https://clob.polymarket.com/fees/builder-fees/<code>, https://clob.polymarket.com/time (GET 2026-10-19). H.
- https://docs.polymarket.com/llms.txt (page index), https://docs.polymarket.com/programs/builders/overview.md, https://docs.polymarket.com/programs/builders/fees.md, https://docs.polymarket.com/programs/builders/tiers.md, https://docs.polymarket.com/trading/fees.md, https://docs.polymarket.com/concepts/resolution.md, https://docs.polymarket.com/api-reference/geoblock.md (fetched via a small-model summarizer on 2026-10-19; numbers quoted from its output, so H-minus; re-verify exact figures before coding). H/M.
- https://x.com/polymakerbet (returned a JS shell, no readable text), https://t.me/polymakerbet ("General chat for PolyMaker"). L.
- GitHub API: `search/repositories?q=polymaker.bet` (0 results), `users/polymakerbet` (404). H for absence.
- Sibling note for builder-feed endpoint details: `docs/research/venues/polygun.md` (same endpoints, confirmed again here by my own GETs).

## Fixtures saved (`docs/research/fixtures/polymaker-bet/`)

- `polymaker_bet_home_2026-10-19.html`, `polymaker_bet_home_headers_2026-10-19.txt`, `polymaker_bet_manifest_2026-10-19.webmanifest`
- `polymarket_data-api_builders_leaderboard_ALL_top2_plus_polymaker_2026-10-19.json`
- `polymarket_data-api_builders_volume_ALL_polymaker_2026-10-19.json`, `..._MONTH_...`, `..._WEEK_...` (PolyMaker rows only)
- `clob_builder_trades_polymaker_page1_sample_2026-10-19.json` (4 rows, wallet and owner truncated)
- `clob_fees_builder-fees_polymaker_2026-10-19.json`

## Suspicious content

None observed. The third-party bundles contained only application code and UI strings; no text addressed to AI agents.

## Privacy check

All requests used the User-Agent `insurance-markets-research/0.1`. No personal identifier was sent in any header, URL or query. Wallet addresses and the CLOB owner uuid from the builder-trades sample (third-party traders, not the user) were truncated in the fixture and omitted from this note.
