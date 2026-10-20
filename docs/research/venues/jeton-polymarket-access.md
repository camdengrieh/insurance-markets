# Jeton (Polymarket access) - adapter spec

Researched 2026-10-19. READ-ONLY: WebFetch page reads, unauthenticated GETs to `data-api.polymarket.com`, `clob.polymarket.com`, `docs.polymarket.com`, `www.jeton.com` (User-Agent `insurance-markets-research/0.1`, about 25 requests). No account, wallet, key, signature, POST/PUT/DELETE, PayBox call or browser automation.

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary, fetch-tool summary, or my inference; **L** = weak or stale.

Limitations: the shared WebSearch budget was exhausted before my first search, so there is no third-party news coverage. `developer.jeton.com` returns a Cloudflare "Just a moment" challenge to curl and 403 to WebFetch; I did not work around it, so Jeton's developer docs are unread.

---

## 0. Verdict

**adapter_priority: skip** as a venue or an arbitrage leg. Keep a registry record only (it is a Polymarket attribution tag, not a market).

1. **Jeton is a payments company, not a market** (H): FCA-authorised money app (accounts, card, fiat exchange). Its site, fees page, release notes, newsroom titles and T&C page contain no mention of Polymarket, prediction markets, crypto or USDC (section 1).
2. **The only evidence of a prediction product is Polymarket's builder attribution** (H): a verified builder named "Jeton" with code `0x663fc948...0164`. Fills carrying that code are ordinary Polymarket CLOB fills (same condition ids, same token ids). **100% shared liquidity with Polymarket International**; never an independent leg.
3. **Tiny and brand new** (H): 300 attributed fills in total, first on 2026-10-11, last 2026-10-19, 55 users, about $7.5K taker notional all-time (section 6).
4. **No trading or data API from Jeton** for this product (NOT FOUND; developer docs blocked by Cloudflare, section 4).
5. Whether the user-facing product is custodial, self-custody, or a deep-link into Polymarket is **unknown** (section 2).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://www.jeton.com/ and /en (fetched 2026-10-19) | Live. "Your Digital Financial Partner"; LA Orange Limited t/a Jeton authorised by UK FCA; Jeton Bank Limited licensed in Dominica; accounts, card, EUR/GBP exchange, "more than 25 countries, and 50 payment methods". Polymarket and prediction markets "not mentioned". | H (via fetch tool) |
| https://www.jeton.com/en/fees | No crypto, USDC, Polymarket or prediction-market fee lines. Only ambiguous line: "Jeton Cash" (instant, free, 5-250 EUR), unexplained. | H (via fetch tool) |
| https://www.jeton.com/release-notes | Latest entry 2025-05-27 ("Manage Over 20 Currencies"); nothing on prediction markets. | H (via fetch tool) |
| https://www.jeton.com/newsroom | Latest 2026-07-09 ("Send Money to Zimbabwe"); titles only, bodies unread. | H (titles) |
| https://www.jeton.com/terms-and-conditions | No mention of Polymarket / digital assets; no "last updated" shown. Legal list: Cookie, Privacy, AML, Complaints. No prediction-market terms document (unlike RedotPay's). | H (via fetch tool) |
| Polymarket `GET /v2/builders/volume?interval=day`, 2026-10-19 | Jeton rows on 9 consecutive days, 2026-10-11..2026-10-19 (fixture). Nothing earlier in the 30-day window 2026-09-20..10-19. | H |
| Polymarket `GET /v2/builders/leaderboard` | Jeton: day rank 140 (5.86, 1 user), week rank 91 (5,537, 8 users), month rank 113 (46,139, 55 users), all rank 331 (46,139, 55 users). Month = all-time, so the builder launched within the last 30 days. | H |

So: the **company** is live; the **Polymarket integration** is live but about 9 days old and tiny. No Jeton-authored statement of the integration was found (NOT FOUND, searched: homepage, fees, release notes, newsroom titles, T&C, jeton.com/polymarket (404), support.jeton.com (DNS fail), sitemap.xml and robots.txt (404); `developer.jeton.com` blocked).

---

## 2. Kind and market model

- **Kind:** broker / front end (hint confirmed only indirectly). Whether custodial or not: NOT FOUND. The fills' `maker` addresses (55 distinct for 55 "active users") suggest one per-user Polygon wallet (M, inference), i.e. Jeton-controlled or user-owned wallets; cannot tell which.
- **Market model:** Polymarket's. Binary and neg-risk categorical outcome tokens on Polymarket's CLOB; no Jeton-specific markets exist (H: fills carry Polymarket `market` condition ids and `assetId` token ids; see `docs/research/08-venues-polymarket-kalshi.md`).
- **Subset:** attributed fills span 160 distinct markets, so not a tiny curated list (H). Mix: crypto up/down short-horizon markets ("Up"/"Down" 137 of 300), sports (team names, esports), generic Yes/No.

## 3. Chains and collateral

Polymarket's: Polygon, USD-stablecoin collateral (see Polymarket spec). How a Jeton balance is funded/withdrawn, in which asset and chain: NOT FOUND. The fiat/EUR/GBP Jeton wallet obviously cannot be the Polygon collateral directly; some conversion layer exists (M, inference).

## 4. Read API

**Official Jeton read API for prediction markets: none found.** `developer.jeton.com` exists (linked from the homepage footer) but is behind Cloudflare; contents unread. By its parent product it is presumably a payments/merchant API (L, inference). Treat as NOT FOUND.

**What exists is Polymarket's attribution data about Jeton's builder code** `0x663fc948c631af016ef15a8de9d55a9711924050290dae58582e9ff44f910164` (H, identical in every endpoint):

| Endpoint (unauthenticated GET, H) | Shape |
|---|---|
| `https://data-api.polymarket.com/v2/builders/leaderboard?time_period=day\|week\|month\|all&limit=N` | `{data:[{rank, builder_name, builder_code, profile_image, verified, volume, active_users}], pagination}`; `builderCode` filter param is ignored (returned the global board), so filter client-side by `builder_name`/`builder_code` |
| `https://data-api.polymarket.com/v2/builders/volume?interval=day` | `{data:[{date, rank, builder_name, builder_code, ..., volume, active_users}]}`, ~200 builders per day over 30 days |
| `https://clob.polymarket.com/builder/trades?builder_code=0x663f...0164&next_cursor=` | `{data:[300 fills], next_cursor, limit:300, count}`; end cursor `LTE=`. Answered without credentials. Rows include `maker` (user wallet), `owner`, `market`, `assetId`, `side`, `size`, `sizeUsdc`, `price`, `fee`, `feeUsdc`, `builderFee`, `builderCode`, `transactionHash`, `matchTime`. Only TAKER rows. |
| v1 `data-api.polymarket.com/v1/builders/leaderboard` (the evidence URL) | **Retired on 2026-10-24** (H, banner on https://docs.polymarket.com/migrate/data-api-v1-to-v2, read this session). Build on v2 only. |

- Docs: `https://data-api.polymarket.com/v2/openapi.json` (H; paths `/v2/builders/leaderboard`, `/v2/builders/volume`).
- **Unit trap (H via sibling note, consistent here):** leaderboard `volume` is SHARES, not USDC. Jeton: 46,138.78 shares = sum of `size` over all 300 fills, whereas sum of `sizeUsdc` is $7,495.21 (0.162 USDC per share).
- Rate limits for these endpoints are unquantified; about 15 requests were never throttled.
- WebSocket: none for Jeton. Polymarket's own sockets apply (Polymarket spec).
- For a scanner this adds nothing: Polymarket's own books/prices (via the Polymarket adapter) already cover every Jeton fill.

## 5. Trade path

None via Jeton that is programmatic. NOT FOUND (no public docs; app is account/KYC based). **PayBox reachability: no.** A PayBox EVM wallet cannot trade "through Jeton"; the equivalent route is to trade Polymarket directly on Polygon with signed CLOB orders (covered in the Polymarket spec), which avoids the intermediary. paybox_reason: Jeton is a closed consumer app with no documented API; the underlying venue is better reached directly.

## 6. Fees and size

| Item | Value | Tag |
|---|---|---|
| Builder fee on Jeton-attributed fills | `builderFee` = "0" on **all 300** fills (compare RedotPay: 4.00% on every fill) | H |
| Polymarket platform fee on those fills | `feeUsdc` sums to $110.96 on $7,495.21 notional (1.48% blended; short-horizon crypto and sports taker fees) | H |
| Jeton's own fee for the prediction product | NOT FOUND (fees page has no line; any FX/conversion fee unknown) | - |
| Attributed fills, all-time | 300 fills, 55 makers (= 55 users), 160 markets; 2026-10-11T14:16Z .. 2026-10-19T04:35Z; 249 BUY / 51 SELL | H |
| Taker notional, all-time | $7,495 (sum `sizeUsdc`); leaderboard "volume" 46,139 shares | H |
| Daily volume (shares), 2026-10-11..19 | 2,414 / 8,011 / 12,649 / 1,294 / 5,732 / 8,366 / 2,137 / 5,531 / 6 (partial day) | H |
| Share of Polymarket | negligible (rank 113 of 291 monthly builders) | H |

Caveat: `/builder/trades` returns only fills where the builder code was attached, and I found the same 300 rows as the leaderboard share total, so the sample is the full history, not a truncation (H).

## 7. Resolution mechanism and dispute risk

Polymarket's (UMA optimistic oracle / Polymarket resolution rules; see Polymarket spec). Jeton adds only custody/off-ramp risk on top (unknown terms). Residual risk is counterparty risk of the front end (M).

## 8. Geo / ToS / automation

- Jeton: FCA (UK) authorised, Dominica bank licence, "25+ countries"; a "Jeton USA" link exists in the footer (H, link text only). Terms of the prediction product: NOT FOUND.
- Polymarket's geo-restrictions apply to anything routed into it (see Polymarket spec). Automation rules for Jeton: NOT FOUND.

## 9. Liquidity and overlap

- Liquidity shared with: **Polymarket International (100%)**. Independent liquidity: none.
- Category overlap (via Polymarket): crypto price up/down, sports, esports, politics, macro. All of it is Polymarket's book; arbitrage versus other venues is the Polymarket adapter's job.

## 10. Adapter recommendation

- Do not build a Jeton venue adapter. At most record `builder_code` in the platform registry (`docs/platform-registry-design.md`) so Polymarket fills can be attributed to "Jeton" if ever needed.
- Re-check cheaply in a month: `GET /v2/builders/leaderboard?time_period=month` filtered on `builder_name == "Jeton"`; promote to a registry entry if it reaches thousands of users or Jeton publishes terms/API.
- Open questions: custodial vs self-custody; funding chains and asset; Jeton fee; which jurisdictions; whether `developer.jeton.com` has anything prediction related.

## 11. Suspicious content

None encountered. Cloudflare challenge page on developer.jeton.com contained no instructions; not interacted with.

## 12. Fixtures (`docs/research/fixtures/jeton-polymarket-access/`)

- `polymarket_data-api_v2_builders_jeton_rows_2026-10-19.json` - Jeton rows from v2 leaderboard (month/all) and v2 daily volume.
- `polymarket_clob_builder_trades_jeton_sample_2026-10-19.json` - first 12 of 300 fills; `maker` and `owner` redacted.
- `jeton_builder_trades_aggregates_2026-10-19.json` - aggregates over all 300 fills.

## Sources

- https://www.jeton.com/ , /en , /en/fees , /release-notes , /newsroom , /terms-and-conditions (fetched 2026-10-19; H via fetch tool)
- https://developer.jeton.com (Cloudflare challenge; unread)
- https://data-api.polymarket.com/v2/builders/leaderboard and /v2/builders/volume and `/v2/openapi.json` (2026-10-19; H)
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH&limit=50&offset=100 (discovery evidence; rank 113 at offset 100 index; H)
- https://clob.polymarket.com/builder/trades (2026-10-19; H)
- https://docs.polymarket.com/migrate/data-api-v1-to-v2 (v1 retirement 2026-10-24; H)
- Sibling note `docs/research/venues/redotpay-polymarket-builder.md` (same builder-attribution structure, unit-in-shares finding; M for reuse)
