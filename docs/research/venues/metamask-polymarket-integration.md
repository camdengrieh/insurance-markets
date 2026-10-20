# MetaMask / Polymarket integration (MetaMask Predictions) - adapter spec

Researched 2026-10-19 (about 01:50 UTC). READ-ONLY: page reads (WebFetch, WebSearch), public `gh api` file reads of `MetaMask/metamask-mobile`, unauthenticated GETs to `api.llama.fi`, `docs.polymarket.com`, `data-api.polymarket.com`, `gamma-api.polymarket.com`, `clob.polymarket.com` (User-Agent `insurance-markets-research/0.1`). No account, wallet, key, signature, POST/PUT/DELETE, PayBox call or browser automation. Third-party text was treated as untrusted data; nothing in it was followed and none of it contained instructions aimed at agents.

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary, small-model page summary, or my inference from first-hand data; **L** = weak or stale (older than 6 months).

Fixtures (9 files, each <= 15 KB): `docs/research/fixtures/metamask-polymarket-integration/` (section 12).

A sibling note exists: `docs/research/venues/metamask-predictions.md` (same product, different slug). This note re-verified its main claims independently and corrects one (volume, section 9). Where I did not re-check something I say "per sibling note (M)".

---

## 0. Verdict

**adapter_priority: skip** (as a venue or arbitrage leg). Keep a registry record only (section 13).

1. **Live, but it is a front end, not a venue.** MetaMask Predictions is a feature of MetaMask **Mobile** whose only provider is Polymarket: the app's `providers/` directory contains `polymarket` and `types.ts` and nothing else (H, GitHub contents API). Same CLOB, same conditional tokens, same UMA resolution. It adds no book, no oracle and no public API.
2. **Not an independent arbitrage leg.** It shares 100% of liquidity with Polymarket International. DefiLlama marks it `doublecounted: true`, category `Interface`, tag `Polymarket Builder` (H).
3. **Worse execution than Polymarket direct**: a flat "4% transaction fee to MetaMask and Polymarket" on top of Polymarket's taker fee (H), mobile only, a longer geo-block list.
4. **Not small, but shrinking.** Polymarket's own builder data (not DefiLlama) shows $329.6M all-time builder-attributed volume, rank 5 of all builders, but only $9.1M for 2026-10-01..10-19 (rank 12) against $28.9M in September (H, section 9).
5. The Jan 2026 stepdata hint (~$856K "via MetaMask integration") is stale and does not match Polymarket's own numbers (Dec 2025 alone: $20.0M). Treat as wrong (section 9).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Product page https://metamask.io/en/prediction-markets (fetched 2026-10-19) | "Powered by Polymarket", "Open MetaMask Mobile" call to action, no extension mention, no launch date | H (page summary by fetch tool) |
| Support https://support.metamask.io/trade/predict/how-to-trade-predictions/ | Current how-to (funding, fees, claim, geo), footer (c) 2026, no "last updated" date | H |
| `MetaMask/metamask-mobile` | not archived; `pushed_at` 2026-10-19T00:42Z; latest release v8.15.0 published 2026-10-15; `app/components/UI/Predict/` present with `providers/polymarket` | H |
| Polymarket Data API `/v1/builders/leaderboard` | MetaMask row present in DAY, WEEK, MONTH and ALL windows on 2026-10-19 | H |
| DefiLlama `metamask-predictions` (id 8001) | volume series to 2026-10-18, fees series to 2026-10-18, no dead flag | H |
| Launch | Early Dec 2025 (search results; Polymarket builder data shows a $47.7K Nov 2025 bucket and $20.0M Dec 2025). Older than 6 months: launch coverage is stale. | M/L |

**still_live = true.**

---

## 2. Kind and market model

- **Kind (H):** broker / front end inside a self-custody wallet. DefiLlama description: "MetaMask Predictions is a prediction platform powered by Polymarket". Support page: "A Polymarket account is created automatically when you fund or trade."
- **Market model:** Polymarket's. Binary Yes/No shares on a CLOB; winners pay $1 per share (H, product page). Multi-outcome events are Polymarket neg-risk groups (H, `Predict/providers/polymarket/outcomeGrouping.ts` exists; `negRisk` flag in Gamma data). No scalar markets seen.
- **Tokenisation:** Polymarket conditional tokens, 6 decimals. From MetaMask's source `providers/polymarket/constants.ts` (H): `conditionalTokens 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`, `exchange 0xE111180000d2663C0091e4f400237545B87B996B`, `negRiskExchange 0xe2222d279d744050d28e00520010520000310F59`, `collateral (pUSD) 0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`, plus a "positions protocol" `ExchangeV3 0xe3333700cA9d93003F00f0F71f8515005F6c00Aa` and `PositionManager 0x006F54F7f9A22e0000CC2AB60031000000ae9fEF`. These are quoted from MetaMask's repo, not Polymarket docs; the Polymarket adapter owns the authoritative list (sibling `docs/research/08-venues-polymarket-kalshi.md`).
- **Curated subset (M):** the app has feature flags (hidden markets, sports allow-lists), so it shows a subset of Polymarket. Production values are remote config and were not observable. NOT FOUND (searched: `constants/flags.ts` defaults).
- Name collision to handle in market matching: Polymarket also lists markets *about* MetaMask itself (token launch / FDV). These are ordinary Polymarket events, unrelated to this venue (L, search result titles only).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading chain | Polygon (`POLYGON_MAINNET_CHAIN_ID = 137`) | H (source) |
| Trading collateral | pUSD (6 dec). USDC.e `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` still referenced in source | H (source) |
| Funding | "Use any EVM token"; examples ETH, mUSD, USDC, USDT, LINEA; or a MetaMask Money Account balance. "Solana tokens are not supported yet." Pre-funding optional. | H (support page) |
| Withdraw | USDC.e on Polygon to a regular MetaMask account, or mUSD to a Money Account; MetaMask pays gas for claim and withdraw | H (support page) |
| Account | Polymarket account created automatically; an existing account that uses MetaMask as signer syncs; email-login Polymarket accounts get a new account | H (support page) |

---

## 4. Read API

**Official public read API for MetaMask Predictions: none.** NOT FOUND (searched: product page developer links - only generic MetaMask Connect, Smart Accounts Kit, Snaps navigation; `Predict/README.md` in `metamask-mobile`; web search "MetaMask Predictions" 2026). There is no OpenAPI, SDK, rate limit or developer terms for Predict. (H for README and page; M for the search negative)

What the app reads is Polymarket's public data (H, `providers/polymarket/utils.ts` `getPolymarketEndpoints`): Gamma `https://gamma-api.polymarket.com`, CLOB `https://clob.polymarket.com`, Data API `https://data-api.polymarket.com`. Those belong to the Polymarket spec. Orders go to a private relayer `https://predict.api.cx.metamask.io` (`CLOB_RELAYER`, `POST /order`, H source); it answered 403 "Missing Authentication Token" per sibling note (M, not re-fetched). Do not integrate.

**Useful public data that does exist (H, unauthenticated GET, 2026-10-19):**

- `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY|WEEK|MONTH|ALL&limit=50` returns `[{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}]`.
- `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH|ALL` returns bucketed rows `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}` (MONTH = 12 monthly buckets, ALL = yearly buckets; full MONTH response 933 KB, so filter client-side).
- MetaMask's Polymarket **builder code** is `0x11a22276beb720e66a072cba8b8e74cded60afda510af535b947b81a1b81a883` (H, same value in all rows). The sibling note listed this as NOT FOUND.
- Caveat: these two paths are **not listed** in `https://docs.polymarket.com/llms.txt` (H) and sit under `/v1/`. Sibling `docs/research/08-venues-polymarket-kalshi.md` records that Data API v1 is retired on 2026-10-24 (M, not re-verified here). Expect them to move or vanish within days; poll defensively.
- DefiLlama: `https://api.llama.fi/protocol/metamask-predictions`, `/summary/fees/metamask-predictions`, `/summary/dexs/metamask` (no key; H).

Auth/limits: none for the above; no documented rate limits (NOT FOUND, searched: Polymarket docs index). The app enforces a client-side `ORDER_RATE_LIMIT_MS = 5000` between orders per sibling note (M). WebSocket: none from MetaMask; Polymarket's own sockets apply.

---

## 5. Trade path

- **No programmatic path for MetaMask Predictions.** It is a mobile UI plus a private relayer (H, product page, source).
- How the app trades, from its source (H, `providers/polymarket/constants.ts`, `protocol/transport.ts`): the user's key signs the Polymarket `ClobAuth` EIP-712 message ("This message attests that I control the given wallet") for CLOB credentials, then an EIP-712 `Order` that carries MetaMask's builder code; the signed order is POSTed to `{CLOB_RELAYER}/order` with header `X-Clob-Version`. Details of the `Order` struct are per sibling note (M).
- **Reachable through PayBox? No, for MetaMask itself** (no API, wallet UI only, relayer authenticated and undocumented). The same exposure is reachable **only via Polymarket's own CLOB** on Polygon (EIP-712 typed-data signing, pUSD approvals). Whether PayBox signs Polygon typed data is unverified at tool level (sibling `docs/research/08-venues-polymarket-kalshi.md` section 9 and `06-paybox-platform.md` list Polygon 137 in the PayBox chain catalogue, H there; signing acceptance untested). I called no PayBox tool.
- Using MetaMask's builder code from your own bot would misattribute volume and fees; do not.

---

## 6. Fees

| Component | Formula | Payer -> receiver | Tag |
|---|---|---|---|
| Headline | "you pay a 4% transaction fee to MetaMask and Polymarket on any trade"; "No fees are taken on deposits or withdrawals" | user | H (product + support pages) |
| App defaults | `DEFAULT_FEE_COLLECTION_FLAG = {enabled: true, metamaskFee: 0.02, providerFee: 0.02, waiveList: [], permit2Enabled: false, collector: 0x100c7b833bbd604a77890783439bbb9d65e31de7 (non-dev)}`; fee = stake x rate | user -> MetaMask / "provider" | H (source `Predict/constants/flags.ts`); fixture excerpt |
| Remote override | The constant is named DEFAULT; production values are probably remote-configured, unobserved | | M |
| Polymarket taker fee | "can range from 0% up to 7%" by market type, price and size | user -> Polymarket | H (support page) |
| Example fee config today | CLOB `fd {r: 0.05, e: 1, to: true}` on the Fed-decision market; Gamma `feeSchedule {exponent 1, rate 0.03, takerOnly true, rebateRate 0.15}` on an NFL game | | H (fixtures) |
| Builder-fee cap | taker <= 100 bps, maker <= 50 bps; additive to platform fee; "Builder fees never replace platform fees" | | H (https://docs.polymarket.com/programs/builders/fees.md) |
| Gas | MetaMask covers claim/withdraw; trade gas relayed | | H (support page) |

Inference (M): the on-order builder fee is capped at 1%, so the 4% cannot all be a builder fee. DefiLlama's "builder fees received" is $189,459 over 30 days; against Polymarket-reported MetaMask volume of roughly $14M-$23M per 30 days that is about 0.8%-1.3%, consistent with a ~1% builder fee plus a separate collector transfer that DefiLlama does not capture. Not proven.

**Arbitrage consequence:** a MetaMask-routed leg costs about 4% of stake each way plus the taker fee; Polymarket direct dominates it.

---

## 7. Resolution and dispute risk

"MetaMask does not control or resolve prediction market outcomes." Polymarket uses UMA's oracle; disputes escalate to UMA token holders; MetaMask cannot override (H, support page). Dispute and ambiguity risk is identical to the Polymarket leg and perfectly correlated with it (see Polymarket spec). Extra operational risk (M, inference): the app can hide a market or block a region while the underlying market keeps trading.

---

## 8. Geo, ToS, automation

- **Product page "Not available in the following territories" (H):** Australia, Belgium, Brazil, Burundi, Canada, Ethiopia, France, Germany, Iraq, Italy, Japan, Myanmar, Poland, Singapore, Taiwan, Thailand, UK, USA, plus countries on the US sanctions list.
- **Support page (H):** adds Romania and "and more"; "Not intended for UK persons"; Polymarket's full restriction list is the reference.
- **App source (H, `Predict/constants/geoblock.ts`):** `GEO_BLOCKED_COUNTRIES = DE, RO, ES, IN`. The three lists disagree (Spain and India only in code). Treat the union as blocked.
- **MetaMask Terms of Use (last updated June 2026, via fetch-tool summary, M):** no mention of Predictions or Polymarket. Relevant generic clauses: scraping data is prohibited "except as permitted by a Plan" (s7.3(d)); MetaMask may limit API requests (s5.3); circumventing usage limits is prohibited (s7.3(c)). No bot clause by name, but s1.5/s3.3 cover "AI Agents" acting for a user. There is no automation licence for the Predictions UI.
- Trading terms are Polymarket's (`https://polymarket.com/tos`, linked in source as `POLYMARKET_TERMS_URL`, H); not read here (Polymarket workflow).

---

## 9. Liquidity

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| MetaMask builder-attributed volume, all-time | $329.6M, 39,386 active users, rank 5 | Polymarket `/v1/builders/leaderboard?timePeriod=ALL`, 2026-10-19 | H |
| Monthly (Polymarket builder data) | Dec 2025 $20.0M; Jan 2026 $34.4M; Feb $33.1M; Mar $34.0M; Apr $64.2M; May $21.1M; Jun $38.8M; Jul $33.8M; Aug $12.2M; Sep $28.9M; **Oct 1-19 $9.15M** (1,692 active users, rank 12) | `/v1/builders/volume?timePeriod=MONTH`, 2026-10-19; fixture | H |
| Oct pace | $9.15M / 19 days -> about $14.4M per 30 days, about half of September | derived | M |
| Scale | Polymarket International 30d $2.25B (DefiLlama overview 2026-10-19), so MetaMask is about 0.6% of it at the October pace | derived | M |
| DefiLlama "volume" | 24h $164,348 (2026-10-18); 7d $999,129; 30d $4,782,898 (prev 30d $10.67M, -55%); all-time $22.96M since 2026-07-05 | `api.llama.fi/summary/dexs/metamask` | H |
| DefiLlama fees | 24h $6,575; 30d $189,459; all-time $1.338M since 2026-05-16 | `api.llama.fi/summary/fees/metamask-predictions` | H |
| TVL / OI | none (`tvl: []`) | protocol endpoint | H |
| Order-book depth | the Polymarket book | | H |

**Correction to the sibling note:** DefiLlama's volume understates MetaMask volume by roughly 3-5x versus Polymarket's own builder data (DefiLlama $22.96M from 2026-07-05 vs Polymarket-reported about $84M for Jul-Oct 19). The DefiLlama volume series looks derived from fees at an assumed 4% (median fee/volume ratio 3.96% over 106 days; 50 of 106 days within 0.05 points of 4.00%; M, my computation on the fixtures). Use Polymarket's builder endpoint, not DefiLlama, for MetaMask volume.

**stepdata hint (L, stale):** https://stepdata.substack.com/p/prediction-markets-on-solana-286m (dated 2026-01-14) says MetaMask's Polymarket integration "has recorded approximately $856K in volume over a similar timeframe" (mid-December onward), linked to a Dune dashboard I did not open. Polymarket's own data shows $20.0M for Dec 2025 plus $34.4M for Jan 2026, so the $856K metric is something else (or wrong). Do not use it.

Caveat on the Polymarket figure: "Volume is credited to your builder account for every matched trade where your code is attached" (H, https://docs.polymarket.com/programs/builders/overview.md); whether both sides of a trade are counted is not stated.

---

## 10. Event coverage and overlap

Everything Polymarket lists that survives the app's curation: sports (NFL, soccer, tennis, esports, props), politics, crypto price (including short-horizon up/down series per sibling note), macro (a Fed-decision market is in today's top Polymarket markets by 24h volume, fixture), culture. Every category overlaps Kalshi, Polymarket US, Limitless, Predict.fun, Opinion, XO and others exactly as Polymarket does. **No category exists only on MetaMask.** (H for Polymarket's mix from Gamma; M for the overlap statement)

## 11. Shared liquidity

**Shares 100% of its liquidity with Polymarket International** (same CLOB, same tokens, same UMA resolution). A Polymarket mid is the MetaMask mid minus a fee wedge of about 4%. Not an independent leg. (H)

---

## 12. Fixtures

In `docs/research/fixtures/metamask-polymarket-integration/` (all fetched 2026-10-19 by unauthenticated GET, except the last, which is a `gh api` raw read):

| File | Source | Shows |
|---|---|---|
| `defillama_protocol_metamask-predictions_2026-10-19.json` | `GET https://api.llama.fi/protocol/metamask-predictions` | id 8001, Interface, Polymarket Builder tag |
| `defillama_fees_metamask-predictions_2026-10-19.json` | `GET https://api.llama.fi/summary/fees/metamask-predictions` | fee totals, `doublecounted`, 155-point daily series |
| `defillama_dexs_metamask_parent_2026-10-19.json` | `GET https://api.llama.fi/summary/dexs/metamask` | volume totals, 106-point daily series |
| `polymarket_data-api_builders_leaderboard_MONTH_2026-10-19.json` | `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH&limit=50` | leaderboard shape |
| `polymarket_data-api_builders_volume_metamask_rows_2026-10-19.json` | filtered from `/v1/builders/volume?timePeriod=MONTH` and `ALL`, plus DAY/WEEK/ALL leaderboard rows | MetaMask builder code, monthly series |
| `polymarket_gamma_market_sample_2026-10-19.json` | `GET https://gamma-api.polymarket.com/markets?limit=8&active=true&closed=false&order=volume24hr&ascending=false` (one market kept) | the market shape the app renders |
| `polymarket_clob_book_sample_2026-10-19.json` | `GET https://clob.polymarket.com/book?token_id=<yes token>` | book shape |
| `polymarket_clob_markets_sample_2026-10-19.json` | `GET https://clob.polymarket.com/clob-markets/<conditionId>` | per-market tick, min size and fee config `fd`; fields `mbf`/`tbf`/`ibce` not interpreted |
| `metamask-mobile_Predict_DEFAULT_FEE_COLLECTION_FLAG_excerpt.ts.txt` | `gh api` raw read of `app/components/UI/Predict/constants/flags.ts` lines 61-72 | default 2% + 2% fee flag |

---

## 13. Adapter recommendation

- **skip** for trading and for a market-data adapter (duplicate liquidity, no API, 4% wedge).
- **Registry record only** (matches the pool-graph rule in `docs/platform-registry-design.md`): `kind: broker`, `routes_to: polymarket-international`, `pool: polymarket-international`, `independent_liquidity: false`, `fee_stack: {front_end: 0.04 of stake (defaults 0.02 + 0.02, remote-configurable), plus Polymarket taker fee 0-7%}`, `builder_code: 0x11a22276...a883`, `geo: union of lists in section 8`, `platform: mobile`, `state: live`.
- **Optional P2-style signal (M, weak):** MetaMask's builder-attributed monthly volume and active users from the Polymarket builder endpoint as a proxy for retail wallet-user flow into Polymarket; daily series available. Not a fair-value input. The endpoint may disappear with Data API v1 (section 4).

## 14. NOT FOUND

- Any MetaMask-published API, SDK, OpenAPI, rate limit or developer terms for Predict (searched: product page, `Predict/README.md`, web search).
- Production values of the remote fee flag and hidden-market list (not in repo).
- A date on the support and product pages ("last updated").
- Polymarket documentation of `/v1/builders/*` (searched: `docs.polymarket.com/llms.txt`; only Builder Program overview, fees and tiers pages listed).
- The Dune dashboard behind the stepdata figure (not opened).
- Independent confirmation of how the 4% splits between an on-order builder fee and a separate collector transfer.

## 15. Open questions

1. Why does Polymarket's builder data show 3-5x DefiLlama's MetaMask volume (derived-from-fees volume, V2-only window, or double counting on the Polymarket side)?
2. Will `/v1/builders/*` survive the Data API v1 retirement (reported for 2026-10-24)? Is there a v2 equivalent?
3. Is the production fee still 2% + 2%, and how much of it is the on-order builder fee (<= 1%)?
4. Is the volume decline (-50% month on month) MetaMask-specific or Polymarket-wide?

## 16. Suspicious content

None observed. No text aimed at AI agents in any fetched page, source file or API response.

## 17. Sources

- MetaMask product page, fetched 2026-10-19: https://metamask.io/en/prediction-markets (H, via fetch-tool summary)
- MetaMask support, how to trade: https://support.metamask.io/trade/predict/how-to-trade-predictions/ (H, via fetch-tool summary)
- MetaMask Terms of Use (June 2026): https://metamask.io/terms-of-use (M, summary)
- MetaMask Mobile source via `gh api` raw reads: `MetaMask/metamask-mobile` paths `app/components/UI/Predict/README.md`, `.../constants/flags.ts`, `.../constants/geoblock.ts`, `.../providers/polymarket/{constants,utils}.ts`, `.../providers/polymarket/protocol/transport.ts`, and the contents listings of `.../Predict/providers`; repo metadata and release v8.15.0 (2026-10-15) (H)
- Polymarket builder program: https://docs.polymarket.com/programs/builders/overview.md , https://docs.polymarket.com/programs/builders/fees.md , docs index https://docs.polymarket.com/llms.txt (H)
- Polymarket builder data: https://data-api.polymarket.com/v1/builders/leaderboard , https://data-api.polymarket.com/v1/builders/volume (H, undocumented paths)
- Polymarket Gamma and CLOB public GETs: https://gamma-api.polymarket.com/markets , https://clob.polymarket.com/book , https://clob.polymarket.com/clob-markets/{conditionId} (H)
- DefiLlama: https://api.llama.fi/protocol/metamask-predictions , https://api.llama.fi/summary/fees/metamask-predictions , https://api.llama.fi/summary/dexs/metamask , https://api.llama.fi/overview/dexs (H)
- stepdata (2026-01-14, stale): https://stepdata.substack.com/p/prediction-markets-on-solana-286m (L)
- Launch coverage, search results only, not opened, older than 6 months: https://thedefiant.io/news/nfts-and-web3/metamask-launches-prediction-markets-with-polymarket , https://www.theblock.co/post/381592/metamask-moves-into-prediction-markets-with-polymarket-integration (L)
- Sibling notes in this repo: `docs/research/venues/metamask-predictions.md`, `docs/research/08-venues-polymarket-kalshi.md`, `docs/research/06-paybox-platform.md`, `docs/research/14-platform-of-platforms.md` (M for anything not re-checked here)
