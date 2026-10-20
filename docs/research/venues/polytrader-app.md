# Polytrader.app (polytrader.app) - adapter spec

Researched 2026-10-19. READ-ONLY: WebFetch of the operator site and Polymarket docs, unauthenticated GETs to documented public hosts (UA `insurance-markets-research/0.1`), `gh api` raw read of DefiLlama adapter source. No account, wallet, key, POST/PUT/DELETE, signing or payment; no PayBox tools. WebSearch was NOT available (session budget exhausted), so there is no news/social corroboration and no reading of the linked X post.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale/undated.
Third-party text is untrusted data; no AI-directed instructions found on polytrader.app, polytrader.ai or the Polymarket docs pages read.
Fixtures: `docs/research/fixtures/polytrader-app/` (4 files, all < 12 KB; third-party wallet addresses and order hashes redacted).

## 0. Verdict

**adapter_priority: skip** as a venue adapter (confidence: high). Optional P2-style use as a Polymarket flow-attribution label (section 9).

1. **Not a venue.** It is a browser front-end / trading terminal for Polymarket (H: page says its wallet panel "Logs you into Polymarket for deposits & withdrawals"; orders carry Polymarket builder code `0x6f5dfb79...bc64`, "Polytrader.app", verified, all-time rank 17).
2. **Liquidity is 100% Polymarket's CLOB.** Not an independent arbitrage leg.
3. **Live** (H): site serves (302 to a Fed-decision market page), "Public Beta" label, and Polymarket's CLOB attributed a fill at 2026-10-19 03:45Z, hours before this research.
4. **No API, docs or ToS** on the site (H: all of `/docs /terms /privacy /api /robots.txt /sitemap.xml` return 302 to the app root).
5. **Not reachable via PayBox as its own leg**; the Polymarket route is covered by the Polymarket spec.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `https://polytrader.app/` | HTTP 302 to `/?slug=fed-decision-in-october-...&orderBookSetting=...`; renders market explorer, "Public Beta", Basic/Advanced views | H |
| `GET clob.polymarket.com/builder/trades?builder_code=0x6f5d...bc64` | 300 rows, matchTime 2026-10-18T13:52Z .. 2026-10-19T03:45Z, all `TRADE_STATUS_CONFIRMED` | H (fixture) |
| Data API v2 builders volume | non-zero volume 89 of the last 90 days (2026-07-22 .. 2026-10-19) | H (fixture) |
| DefiLlama module `polytrader-app` (start 2025-12-31 in volume config) | attributes this builder code to DefiLlama protocol id 7887 "Polytrader" | H |

## 2. What it is, and the polytrader.ai question

- **Kind**: broker-or-frontend over Polymarket. Features listed on the page (H): Market Explorer with search and categories (Politics, Sports, Crypto, Finance, others), order books, open orders, activity, holders, trade history; display settings (price/share formats, order-book coloring, last-trade price toggle, sell tolerance); deposit/withdraw USDC.e and pUSD, send pUSD, redeem/sell positions; "Export Private Key" option. Login: MetaMask extension or MagicLink email. Links: X post "How to use Polytrader.App", Discord, YouTube, Telegram.
- **Key custody**: the "Export Private Key" and MagicLink login suggest Magic-managed (Polymarket email) wallets; NOT FOUND how keys/API creds are handled (searched: homepage only). No source repo or audit found.
- **Distinct from polytrader.ai?** The hint says distinct. Evidence is mixed: polytrader.ai (H) is an "AI-powered companion for Polymarket" (social-sentiment analysis, $POLY token gating, GitBook docs `polytrader.gitbook.io/polytrader`, no mention of polytrader.app). But DefiLlama protocol 7887 "Polytrader" has `url` polytrader.ai, twitter `polytraderAI`, and its volume adapter module `polytrader-app` uses THIS builder code (H: api.llama.fi/protocol/polytrader; factory/polymarket.ts). So either the same operator runs both, or DefiLlama conflated them. NOT resolved (M that they are related). Not needed for the verdict.

## 3. Market model, chains, collateral

Identical to Polymarket (binary YES/NO ERC-1155 conditional tokens on a CLOB plus negative-risk multi-outcome events; UI shows multi-outcome "open_markets" in the URL). CLOB rows carry `assetId`, `outcome`, `market` (condition id) (H fixture). Chain: Polygon (H: DefiLlama chains = ["Polygon"]). Collateral: the page names USDC.e and pUSD; Polymarket fee docs speak of pUSD (H). Authoritative detail belongs to the Polymarket spec. Chain list for "any supported chain" deposits: NOT FOUND (page does not name them).

## 4. Read API

Polytrader.app itself: **none** (no docs link; the only doc is an X post). Only Polymarket-side attribution data exists:

| Source | Endpoint | Auth | Verified shape |
|---|---|---|---|
| Polymarket CLOB (documented) | `GET https://clob.polymarket.com/builder/trades?builder_code=<code>[&next_cursor=..]` | none | `{"data":[...],"next_cursor":"MzAw","limit":300,"count":300}`; row keys: `id, tradeType, takerOrderHash, builder, market, assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime, bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`. Numbers are strings. H (fixture) |
| Polymarket Data API v2 | `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90` | none | `{"data":[{"date","rank","builder_name","builder_code","profile_image","verified","volume","active_users"}]}` all builders, ~5.9 MB. H (fixture) |
| Polymarket Data API v2 | `GET .../v2/builders/leaderboard?limit=50` | none | `{"data":[{"rank","builder_name","builder_code","volume","active_users","verified",...}]}`. H (fixture) |
| Polymarket Data API v1 | `/v1/builders/leaderboard?timePeriod=ALL`, `/v1/builders/volume` | none | camelCase; all-time rank 17, volume 65,907,311, activeUsers 82 (H, fetched 2026-10-19). **v1 is slated for retirement 2026-10-24** per sibling note `polytraderpro.md` (M here; not re-read). |
| DefiLlama | `GET https://api.llama.fi/summary/dexs/polytrader` | none | `total24h 201117, total7d 626770, total30d 2792484` (USD). H (fixture) |

Rate limits: NOT FOUND (Polymarket builder docs say limits depend on builder tier; numbers not stated on the page read). Websocket: none for Polytrader.app; Polymarket's own WS covers live data (Polymarket spec).

## 5. Trade path

None programmatic for Polytrader.app (GUI; no API/CLI). Underlying route: Polymarket EIP-712 signed orders with the `builder` bytes32 field submitted to the Polymarket CLOB; relayer covers gas (H: docs.polymarket.com/developers/builders/builder-intro). A PayBox-reachable wallet should integrate Polymarket directly, not through this front-end (see Polymarket spec).

## 6. Fees

- **Builder fee charged by Polytrader.app (H, computed from the 300-row fixture)**: taker rows 82/82 have `builderFee` = 10.0 bps of `sizeUsdc` (min 9.92); maker rows 213/218 = 5.0 bps (5 rows 0). I.e. roughly 10 bps taker / 5 bps maker, below the program caps of 100 bps taker / 50 bps maker. `feeUsdc` appears to include the builder fee plus any platform fee (maker rows: feeUsdc == builderFee; M).
- Who pays: the user, additive to Polymarket platform fees (H: docs.polymarket.com/programs/builders/fees.md; builder_fee = notional x bps / 10000; platform fee = C x feeRate x p x (1-p), taker-only).
- Polymarket may disable a builder code or revoke fee ability at any time; orders with a disabled code are rejected (H, same page). Page itself states no fees (H: "Fees: not stated").
- For an aggregator: going through this front-end would only add ~10 bps cost vs calling Polymarket directly.

## 7. Resolution and dispute risk

Entirely Polymarket's (not re-verified here). Polytrader.app adds no oracle or settlement layer. Extra risk: unaudited third-party front-end handling logins and "export private key", and builder-code revocation by Polymarket.

## 8. Geo / ToS / automation

NOT FOUND: Terms of Service, privacy policy, geo restrictions, automation policy (searched: homepage, `/terms /privacy /docs /api` all redirect to the app). Polymarket's own geo-blocking and ToS apply to any routed order. No API, so automation of this front-end would be unsupported scraping; unnecessary.

## 9. Liquidity and signal value

| Metric | Value | Source / date |
|---|---|---|
| All-time builder-attributed volume | 65.9 M (share-notional per sibling note's reading of the Data API; unit M) | Data API v1 leaderboard, 2026-10-19, H |
| Last 30 days | 4.87 M (Data API v2 daily sum 2026-09-20..10-19) vs 2.79 M USD (DefiLlama total30d) | H, computed / H |
| Last 7 days | 0.88 M (Data API v2) vs 0.63 M USD (DefiLlama) | H |
| Monthly (Data API v2) | 2026-07 (from 22nd) 0.47 M; 08: 5.75 M; 09: 6.68 M; 10 (to 19th): 2.45 M | H, computed |
| Active users | 2-5 per day recently; 82 all-time per v1 | H |
| TVL | none (not a protocol with custody on-chain that DefiLlama tracks) | M |

Signal angle: `builder/trades` exposes every attributed fill (wallet, market, side, size, price) unauthenticated and near real time. In the 300-row sample: 218 maker / 82 taker fills, 2 distinct owners, 15 markets, USD size about 170 K, so the flow looks like one or two market-making wallets (H, computed). It would be a thin attribution label on Polymarket fills (`builderCode` dimension), not a liquidity source.

## 10. Event-category overlap

All Polymarket categories (sports, politics, crypto, finance, macro) because it is Polymarket. Per-category split of this builder's flow: NOT FOUND.

## 11. Shared liquidity

**Shares liquidity entirely with Polymarket (global).** Same CLOB, same order books; builder code is just a tag. Not an independent arbitrage leg.

## 12. NOT FOUND / open questions

- ToS, privacy, geo rules, key custody model, operator identity, relation to polytrader.ai, rate limits, "supported chains" for deposits, content of the X how-to post (searched: homepage, polytrader.ai homepage, Polymarket builder docs, DefiLlama; WebSearch unavailable).
- Whether the volume unit in Data API is share-notional vs USD (DefiLlama USD figure is ~57-72% of Data API figure over 7d/30d here).

## Sources

- https://polytrader.app/ (H, 2026-10-19; subpaths 302)
- https://www.polytrader.ai/ (H, 2026-10-19); https://polytrader.ai/ (308 to www)
- https://docs.polymarket.com/developers/builders/builder-intro ; https://docs.polymarket.com/programs/builders/fees.md (H)
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL ; /v2/builders/volume ; /v2/builders/leaderboard (H, GET 2026-10-19)
- https://clob.polymarket.com/builder/trades (H, GET 2026-10-19)
- https://api.llama.fi/summary/dexs/polytrader , https://api.llama.fi/protocol/polytrader (H)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts (H, gh api raw)
- Local: docs/research/venues/polytraderpro.md (sibling note, M for v1 retirement date and unit semantics)
