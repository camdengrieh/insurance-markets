# SafePal (Predictions tab, Polymarket front end) - adapter spec

Researched 2026-10-19. READ-ONLY: WebFetch/WebSearch, unauthenticated GETs to `data-api.polymarket.com` (User-Agent `insurance-markets-research/0.1`). No account, wallet, key, signature, POST/PUT/DELETE, PayBox call or browser automation. Third-party text treated as untrusted data; nothing in it was followed.

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary, fetch-tool page summary, or my inference; **L** = weak or stale.

Fixtures: `docs/research/fixtures/safepal/` (section 11).

---

## 0. Verdict

**adapter_priority: skip** as a venue or arbitrage leg. Keep a registry record only.

1. **Live, but a front end, not a venue.** SafePal (self-custody mobile + hardware wallet) added a "Predictions" tab under Trade on 2026-03-15..17 that trades **Polymarket** markets (H, SafePal blog and help centre). SafePal runs no markets, book, oracle or public API.
2. **Not an independent leg.** It shares 100% of liquidity with Polymarket International. Polymarket's own data attributes SafePal flow to a registered builder code (H).
3. **Small.** $7.48M all-time builder-attributed volume, 837 active users, rank 74; Oct 1-19 2026 only $0.44M (H, section 8). Declining from a one-off $3.9M July.
4. The homepage `https://www.safepal.com/` does not mention prediction markets (H); the feature is documented only in the blog and help centre.

---

## 1. Is it still live? (2026)

| Evidence | Tag |
|---|---|
| SafePal blog "SafePal x Polymarket Integration", dated Mar 17, 2026: https://www.safepal.com/en/blog/safepal-polymarket-integration | H (fetch summary) |
| SafePal help centre "How to trade on Polymarket using SafePal wallet", dated Mar 15, 2026, marked "Updated" with no date: https://safepalsupport.zendesk.com/hc/en-us/articles/47831963943323-How-to-trade-on-Polymarket-using-SafePal-wallet | H (fetch summary) |
| Polymarket `/v1/builders/leaderboard` has a SafePal row in DAY, WEEK, MONTH and ALL windows on 2026-10-19 (DAY: $4,396 volume, 8 users, rank 44) - flow is happening today | H |
| Press (Bitget, Phemex, CryptoRank, MEXC) repeats the March launch; not opened individually | L/M |

**still_live = true**, but low activity.

---

## 2. Kind and market model

- **Kind:** broker / wallet front end. Blog: users "explore prediction markets directly inside the SafePal mobile app and hardware wallet" via "the updated Trade tab"; whether this is a native build or webview is not stated (M, not documented; NOT FOUND).
- **Market model:** Polymarket's: binary Yes/No shares (help centre example buys "No" on a Bitcoin price market, H), CLOB, multi-outcome events as Polymarket neg-risk groups (per Polymarket spec, not re-read here). Winners pay $1/share. Tokenisation = Polymarket conditional tokens on Polygon (see Polymarket spec).
- Whether SafePal shows a curated subset of Polymarket markets: NOT FOUND (searched: blog, help centre).

## 3. Chains and collateral

- Trading chain **Polygon only**; collateral **USDC.e** per help centre (H, fetch summary). Blog says "USDC on Polygon" and that EVM assets can be swapped/bridged in-app (M). Note sibling notes show Polymarket has since moved to pUSD (see `docs/research/venues/metamask-polymarket-integration.md`); the help centre text may be stale on this (L).
- User needs a small amount of MATIC (POL) for gas (H, help centre).
- Withdraw: from the Polymarket portfolio page via "Withdraw", confirmed with the SafePal App password (H, help centre) - so the user ends up with a Polymarket account/balance, not a SafePal-held balance.
- Non-EVM assets: web search summary says SafePal "intends to gradually support non-EVM assets" (M, not verified in primary text).

## 4. Read API

**Official public read API for SafePal Predictions: none.** NOT FOUND (searched: blog page link list, which lists no developer APIs; help centre; web search "SafePal Predictions API"; `https://www.safepal.com/` homepage). No docs URL, rate limit or websocket.

Use Polymarket's own Gamma / CLOB / Data APIs for all market data (see Polymarket spec). The only SafePal-specific data that exists is builder-attributed volume on Polymarket's undocumented Data API:

- `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY|WEEK|MONTH|ALL&limit=50&offset=N` -> `[{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}]` (H, confirmed 2026-10-19; SafePal is at offset 50 for ALL/MONTH/WEEK, offset 0 for DAY).
- `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH|ALL` -> bucketed rows `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}` (H; MONTH response is large, filter client-side).
- SafePal **builder code**: `0x26ba6b3052e912e3b6e91413268825dcb1c09fab29849ac6a44259029fafe832` (H, same value in every row).
- Caveat from sibling research: these `/v1/` paths are undocumented in Polymarket's docs index and Data API v1 is reported retired on 2026-10-24 (M, `docs/research/08-venues-polymarket-kalshi.md`; not re-verified). Poll defensively.

## 5. Trade path

- **No programmatic path via SafePal.** It is a wallet UI; no API, SDK or relayer documented (NOT FOUND, same searches).
- Orders are Polymarket orders (EIP-712 signed by the user's key, builder code attached) - mechanics belong to the Polymarket spec (M here; I did not read SafePal's client).
- **PayBox:** not reachable via SafePal. The same exposure is available only through Polymarket's CLOB on Polygon directly; whether PayBox signs Polygon EIP-712 typed data is untested (no PayBox tool called). Do not use SafePal's builder code from a bot (misattributes volume/fees).

## 6. Fees

- SafePal blog and help centre state **no fee** for the integration (neither a charge nor a waiver; "does not list any fees") (H, fetch summaries). A search summary says SafePal "does not charge additional fees" (M, unverified secondary).
- Polymarket platform/taker fees and any builder fee attached to SafePal's builder code apply; the builder fee is capped by Polymarket at taker <= 100 bps, maker <= 50 bps (per `metamask-polymarket-integration.md`, citing https://docs.polymarket.com/programs/builders/fees.md; M here). SafePal's actual builder-fee setting: NOT FOUND (searched: blog, help centre).
- Gas: user pays POL on Polygon (H, help centre).

## 7. Resolution and dispute risk

Identical to Polymarket (UMA optimistic oracle, dispute escalation); SafePal has no role. Risk is perfectly correlated with the Polymarket leg. SafePal disclaimer: "SafePal will not be responsible for any investment losses" and third-party appearance "does not constitute an endorsement" (H, blog).

## 8. Liquidity

All figures: Polymarket Data API builder endpoints, fetched 2026-10-19 (H); fixtures in section 11.

| Window | Volume | Active users | Rank |
|---|---|---|---|
| All-time | $7,478,247 | 837 | 74 |
| Last 30 days (MONTH) | $439,476 | 127 | 64 |
| Last 7 days | $14,483 | 29 | 71 |
| Last day | $4,396 | 8 | 44 |

Monthly (`/v1/builders/volume?timePeriod=MONTH`): Feb $19,951 (5 users); Mar $59,582; Apr $629,282; May $23,953; Jun $763,011; Jul **$3,910,464**; Aug $646,220; Sep $986,307; Oct 1-19 $444,751 (128 users). Yearly bucket 2026: $7,483,522. Volume is concentrated in July; the baseline is roughly $0.5-1.0M/month. Compare Polymarket International 30d about $2.25B (sibling note, DefiLlama, M): SafePal is about 0.02% of it.

Caveat: Polymarket says volume is credited per matched trade where the builder code is attached (H, per sibling note citing the Builder Program overview); whether both sides count is unstated. No TVL/OI (not a protocol). The hint "$7.47M all-time and 836 users" is confirmed (H; now 837).

## 9. Event coverage and overlap / shared liquidity

- Everything Polymarket lists that SafePal shows (help centre mentions trending markets and categories, e.g. Crypto): sports, politics, crypto price, macro, culture. All overlap Kalshi, Polymarket US, Limitless, Predict.fun, Opinion, XO etc. exactly as Polymarket does. **No category exists only on SafePal.** (M)
- **Shares 100% of liquidity with Polymarket International.** Not an independent arbitrage leg. (H)

## 10. Geo / ToS / automation

- Blog states "No KYC required", "no new accounts"; no geographic restrictions stated; SafePal "serves 30 million users globally across 200+ regions" (H, blog summary). This does not mean Polymarket's geoblock is lifted; Polymarket's restriction list governs trading (Polymarket help: https://help.polymarket.com/en/articles/13364163-geographic-restrictions, appeared in search results, not opened; L/M). The US international platform is restricted (M, search summary).
- SafePal Terms of Service https://www.safepal.com/en/about/terms define "Excluded Person" by jurisdictional law and put compliance on the user; no prediction-market or automation clause found (M, search-engine summary; ToS not read in full; page possibly old). NOT FOUND (searched: ToS via web search, "prediction", "Polymarket", "bot", "API").
- No automation licence for the Predictions UI.

## 11. Fixtures

In `docs/research/fixtures/safepal/` (unauthenticated GETs, 2026-10-19):

- `polymarket_data-api_builders_leaderboard_safepal_rows_2026-10-19.json` - SafePal rows for ALL/MONTH/WEEK/DAY from `/v1/builders/leaderboard` (response shape confirmed).
- `polymarket_data-api_builders_volume_safepal_rows_2026-10-19.json` - SafePal rows filtered from `/v1/builders/volume?timePeriod=MONTH` (9 monthly buckets) and `ALL`.

Polymarket Gamma/CLOB market and book fixtures live under `docs/research/fixtures/metamask-polymarket-integration/` and the Polymarket spec; not duplicated.

## 12. Adapter recommendation

- **skip** for trading and for a market-data adapter (duplicate liquidity, no API, tiny volume).
- **Registry record only:** `kind: broker`, `routes_to: polymarket-international`, `pool: polymarket-international`, `independent_liquidity: false`, `builder_code: 0x26ba6b30...afe832`, `chains: [polygon]`, `platform: mobile + hardware wallet`, `state: live (low activity)`, `fee_stack: Polymarket fees + unknown builder fee`.
- Optional weak signal (M): SafePal builder volume/users as a proxy for retail wallet flow; negligible. Depends on an undocumented endpoint that may vanish.

## 13. NOT FOUND

- Any SafePal API, SDK, docs, rate limit or websocket for Predictions (searched: blog, help centre, homepage, web search).
- SafePal's builder-fee rate and curated-market list.
- Native vs webview implementation.
- Prediction-market or automation clauses in SafePal ToS (full text not read).
- Date of the help-centre "Updated" edit.
- Primary-source confirmation of non-EVM support plans.

## 14. Open questions

1. Is the help centre's "USDC.e" still accurate now that Polymarket collateral is pUSD?
2. Will `/v1/builders/*` survive the Data API v1 retirement (2026-10-24)?
3. What caused July's $3.9M spike (one whale vs campaign)? Not determinable from the aggregate data.

## 15. Suspicious content

None observed. No text aimed at AI agents in any fetched page or API response.

## 16. Sources

- SafePal blog (2026-03-17): https://www.safepal.com/en/blog/safepal-polymarket-integration (H, fetch summary)
- SafePal help centre (2026-03-15): https://safepalsupport.zendesk.com/hc/en-us/articles/47831963943323-How-to-trade-on-Polymarket-using-SafePal-wallet (H, fetch summary)
- SafePal homepage, no mention: https://www.safepal.com/ (H)
- SafePal ToS: https://www.safepal.com/en/about/terms (M, search summary only)
- Polymarket builder data: https://data-api.polymarket.com/v1/builders/leaderboard , https://data-api.polymarket.com/v1/builders/volume (H, undocumented paths)
- Search results (not opened): https://www.bitget.com/news/detail/12560605271190 , https://phemex.com/news/article/safepal-integrates-polymarket-for-seamless-prediction-market-trading-66955 , https://help.polymarket.com/en/articles/13364163-geographic-restrictions (L/M)
- Sibling notes: `docs/research/venues/metamask-polymarket-integration.md` (fee cap, Polymarket scale, Data API retirement), `docs/research/08-venues-polymarket-kalshi.md` (M for anything not re-checked)
