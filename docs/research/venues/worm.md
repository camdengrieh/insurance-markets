# Worm (worm.wtf) - venue spec

Researched 2026-10-19. Read-only: official docs (`llms.txt`, `llms-full.txt`), public unauthenticated GETs to `api.worm.wtf`, GitHub raw reads of `wormwtf/worm-sdk` and `wormwtf/worm-mcp`, DefiLlama public API, one Polymarket public CLOB/Gamma GET for comparison, static reading of the site's public JS chunks (not executed, no WebSocket opened). No account, no wallet, no POST, no signing, no PayBox money or signing tools (only `discover_plugins` and `discover_services`, both read-only). Scripted requests used the generic User-Agent `insurance-markets-research/0.1`.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- Adapter priority: **skip** (as an arbitrage leg or independent price source).
- Worm is real, live, and has a proper public REST API, SDK and MCP server. But its leveraged markets are a **leverage wrapper over Polymarket (and a few Hyperliquid outcome markets)**, not a venue with its own liquidity. The displayed order book of a Worm "polymarket"-kind market is a live copy of the Polymarket CLOB (top-of-book identical to the size, checked on one market, H). Worm's own traded volume is tiny and falling (DefiLlama: 24h 166 USD, 30d 38,963 USD, month-to-date October 7,256 USD as of 2026-10-18).
- Therefore it fails the "independent liquidity" test: any Worm-vs-Polymarket price gap is not an arbitrage, and pricing Worm adds no signal beyond Polymarket itself. The scanner should read Polymarket directly.
- Only residual uses: (a) a Solana-native, leveraged execution route into Polymarket exposure for a PayBox Solana wallet (costly: 1 percent opening fee on collateral, 5 percent closing fee on profit); (b) a bridge to the Hyperliquid outcome-market (HIP-4 style) markets, which may deserve their own venue spec; (c) the thin self-made "prop_amm" and user-created spot markets, which are small and wider than Polymarket.

## Liveness (still live in 2026?)

- **Live, H.** `GET https://api.worm.wtf/markets/` on 2026-10-19 returns markets created minutes earlier (`created` 1792369578 = 2026-10-19 ~00:26 UTC; "BNB Up or Down - October 19, 8:15PM-8:30PM ET"). https://www.worm.wtf/ renders a feed with 2026-10-19/20 sports and politics events. DefiLlama daily volume has a point for 2026-10-18 (https://api.llama.fi/summary/dexs/worm).
- Launch: Oct 16, 2025 (secondary: search summaries of panewslab/MEXC items, M). Funding: DefiLlama raises record, 4.5 M USD dated 2025-12-16, investors 6th Man Ventures, Solana Ventures, AllianceDAO, Borderless Capital, Advancit Capital, Anatoly Yakovenko, 0xMert (H as to the DefiLlama record, which is third-party).
- Code: `wormwtf/worm-sdk` v0.11.0 released 2026-07-25, `wormwtf/worm-mcp` last push 2026-07-25 (H, `gh api`). Docs sitemap `lastmod` newest 2026-06-10 (H). So docs and SDK are 3-4 months old, under the 6-month stale line but not fresh; the live API already differs from the docs (see Read API).
- Trend: declining activity (monthly volume 198.9k May, 102.8k June, 342.2k July, 191.1k Aug, 67.4k Sept, 7.3k Oct 1-18; peak day 126,993 USD on 2026-07-25; all from DefiLlama, H as to the feed).
- No shutdown or incident notice found in two WebSearch passes (L, absence only). Could not read the official X accounts (@wormdotwtf per DefiLlama, @wormwtf and @wormpredict per docs footer); not attempted beyond search.
- The hint's "Keyrock report contributor" claim was not checked (not relevant to the adapter).

## Kind and market model

Kind: Solana-based prediction-market front end with a Solana program (draft-and-sign "program call" flow) plus off-chain matching/hedging backends. H (docs, API).

The API exposes three market backends, distinguished by `config.kind` in `GET /markets/{condition_id}/` (H, live responses; docs list only the first three):

| `config.kind` | What it is | Evidence |
|---|---|---|
| `polymarket` | Margin-enabled mirror of a Polymarket market. Book = Polymarket CLOB. Leverage 1x-3x (per side cap computed by Worm). | 30 of 32 sampled details; Iran-regime market book equals Polymarket CLOB (`fixtures/worm/compare_worm_vs_polymarket_clob_iran_regime.json`). |
| `hyperliquid` | Mirror of a Hyperliquid price-binary outcome market ("HyperLiquid resolves outcome 13881 YES for HYPE above $78.427"). Max leverage 1.00 in the sample. | `market_detail_kind_hyperliquid_hype_daily.json`. Only "Hyperliquid Up or Down Daily" events seen (1 in the 16,000-row inventory page). |
| `prop_amm` | Worm's own Solana AMM-style pool (`yes_pool_pda`, `no_pool_pda`) for some sports markets, quoted off a Polymarket reference (`polymarket_condition_id` field exposed). `margin_enabled=false`. | 2 of 32 samples; undocumented kind. Book sizes 1-1.6 shares; quotes 0.585/0.625 vs Polymarket 0.60/0.61. |
| `orderbook` | Worm-native spot CLOB for user-created markets (limit and market orders). | Documented (https://docs.worm.wtf/api-reference/markets/market-detail.md). **None seen in 16,000 open markets**; all open rows have creator `worm`. |

- Outcomes: binary Yes/No (`outcomes[].is_yes`), and "categorical" markets are modelled as one binary market per option grouped under an `event` (docs: "Each outcome has its own Yes/No price and is traded independently"). No scalar. H (docs, API).
- Market lifecycle states: `draft, waiting_to_open, open, answer_proposed, waiting_to_resolve, resolved, canceled, interrupted` (H, market-detail doc).
- Tokenisation: spot outcome shares are SPL tokens (`/account/assets/` returns `token.address` = on-chain SPL mint; symbol `{condition_id}-LPT` or `-SPT`) (H, docs). Margin positions are program accounts identified by a `pubkey`, not freely transferable tokens (M, inference from API). `condition_id` is a base58 Solana-style pubkey, **not** the Polymarket `0x` condition id. For `polymarket`-kind markets the detail payload carries no Polymarket id; mapping to Polymarket needs title/event/outcome text matching (NOT FOUND: any id field; the 30 sampled configs have only leverage, fee and decimals keys). For `prop_amm` the `polymarket_condition_id` is given.
- Inventory snapshot (H): paging `GET /markets/?limit=100&state=open` (keyset, no `sort`) returned 16,000 rows over 160 pages and `next_cursor` was still non-null, so open markets exceed 16,000. In those rows: sports 13,166, weather 1,486, crypto 1,155, finance 158, politics 31, tech 4; 15,997 `margin_enabled=true`; 2,050 distinct events; created 2026-10-14 to 2026-10-19; creator `worm` on all rows. 3,276 of 13,166 sports rows sit at exactly 0.50 (unpriced). Categories `weather` is present in the API but absent from the docs list (politics, sports, crypto, wtf, tech, finance). Fixture: `inventory_summary_open_markets_first16000.json`.

## Chains and collateral

- Chain: Solana (H, docs quickstart: "Worm runs on Solana and settles in USDC"). Wallets: Phantom, Solflare, Backpack and similar (H, docs FAQ).
- Collateral: USDC on Solana, mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (H, front-end chunk `NEXT_PUBLIC_USDC_MINT_ADDRESS` default; the standard Circle USDC mint).
- Underlying hedge legs live elsewhere: Polymarket (Polygon) for `polymarket` kind, Hyperliquid for `hyperliquid` kind. The user never touches those chains (Worm holds the underlying position; docs: "A $200 position is opened on your behalf"). That makes the user's claim a claim on Worm's program and hedging, not on Polymarket directly (M, inference).
- Program address(es): NOT FOUND (searched: docs llms-full.txt, SDK source, MCP README, front-end chunks for `programId` only found generic Solana SPL usage). DefiLlama lists `audits: 0` and no TVL adapter (TVL array empty; module `dummy.js`). No audit report found (searched: docs, DefiLlama).
- No token: "Worm has no token, no presale, and no airdrop" (H, docs FAQ).

## Read API

Official, public, documented, with an authenticated tier. H.

- Docs: https://docs.worm.wtf/api-reference/introduction (machine-readable index https://docs.worm.wtf/llms.txt, full text https://docs.worm.wtf/llms-full.txt, 302 KB; per-page `.md` mirrors).
- Base URL: `https://api.worm.wtf`. Response envelope `{ "data", "meta", "error" }`; error object `{code, slug, message, details}`; cursor pagination via `meta.next_cursor` (`limit` default 20/50, max 100; accounts/assets max 200).
- Public (no auth) endpoints, all confirmed with live GETs on 2026-10-19 unless noted:
  - `GET /markets/` filters `state` (open, closed, resolved, newest, ending_soon, ended_recently), `category`, `sort` (market_cap, last_trade, total_volume, live_stream, trending, leverage, ending_soon), `sport`, `league`. **Performance warning (H, observed):** `sort=total_volume` timed out at both 20 s and 40 s; `sort=trending` took 25.8 s once and `sort=leverage&category=politics` 0.65 s. Unsorted keyset paging was 0.5-1.1 s per 100-row page. Use unsorted keyset pagination for scans.
  - `GET /markets/{condition_id}/` (rules, `resolution_date`, `maker_fee`, `taker_fee`, `config`).
  - `GET /markets/{id}/book/?limit=&is_yes=` (single-outcome depth; NO book is the mirror; `bid[]`, `ask[]` with `price`, `total_amount`). Fixture `market_book_kind_polymarket_iran_regime.json`.
  - `GET /markets/{id}/price/` (mid, `price_kind: "mid"`), `/stats/` (`total_volume`, `total_volume_24h`, `market_cap`, `trade_count`), `/trades/` (spot trades only; empty for margin-only markets), `/margin-activity/` (public feed of opened/closed margin positions with pseudonymous handles; redacted in our fixture), `/candles/?start_time&end_time&interval` (`5m` or `30m` only, range at most 30 days; **`start_time`, `end_time`, `interval` are required**, `1d` is rejected with `invalid_request_params`).
  - `GET /events/`, `GET /events/{id}/`, `GET /search/`, `GET /sports/` (catalog), `GET /margin/positions/estimate/?market_condition_id=&funds=&leverage=&is_yes=` (returns average price, shares, fee, `liquidation_price`). Param names for the estimate come from the SDK, the docs page omits them.
- Auth: none for the above. Authenticated (HMAC) for orders, trades, account, margin positions, redeems, key management; unauthenticated call to `GET /account/` returns 401 `{"code":-13,"slug":"not_authenticated"}` (H, fixture).
- Rate limits (H, docs + live headers): public 120/min (`X-RateLimit-Limit: 120` observed, `X-RateLimit-Remaining`, `X-RateLimit-Reset`), authenticated 300/min, key bootstrap 10/min; 429 returns slug `throttled` with `Retry-After`.
- WebSocket: not documented. Front-end chunks reference `wss://ws.worm.wtf/ws/margin/orderbook/{condition_id}/?n_sig_figs=` and a user socket on `api.worm.wtf`; the site also opens `wss://ws-live-data.polymarket.com` directly for price charts (M, static read; not connected). The same chunks reference undocumented `/market/amm/*` REST routes (price, trade, trade/transaction, trade/finalize) that presumably serve the `prop_amm` markets (M).
- Official clients: Python `worm-sdk` (MIT, https://github.com/wormwtf/worm-sdk, PyPI), MCP server `worm-mcp` (38 tools, https://github.com/wormwtf/worm-mcp). No TypeScript SDK found.
- Docs vs live drift (H): docs list `config.kind` values hyperliquid, polymarket, orderbook; live data also has `prop_amm`. Docs list six categories; live data also has `weather`. Docs say leveraged markets are market-order only; the API accepts `type: limit` margin requests with `price`+`shares`.
- Fixtures saved under `docs/research/fixtures/worm/` (27 files, 156 KB total, each under 15 KB).

## Trade path

Programmatic, documented, **draft then sign then submit**, Solana ed25519 only. H (docs + SDK source).

1. **Bootstrap an API key** (once): `POST /auth/keys/challenge/ {wallet_address}` returns `{nonce, message, expires_in_seconds}`; sign the UTF-8 `message` with the Solana key, send the signature as hex to `POST /auth/keys/create/ {wallet_address, message, signature, nonce}`; response `{api_key, secret}` (secret shown once). Revocable via `DELETE /auth/keys/{key_id}/`.
2. **HMAC every authenticated call:** headers `WORM-API-KEY`, `WORM-TIMESTAMP` (unix seconds), `WORM-SIGNATURE` = lowercase hex `HMAC-SHA256(secret, f"{timestamp}{METHOD}{path_with_query}{raw_body}")`. Clock skew gives `Timestamp out of range`.
3. **Leveraged (margin) position:** `POST /margin/positions/requests/ {type: "market"|"limit", market_condition_id, is_yes, leverage, funds | (price, shares), take_profit_price?, stop_loss_price?}` returns `{pubkey, message, state}`. The SDK signs `message` as a **hex-encoded Solana VersionedTransaction** (`sign_transaction`: decode hex, sign the versioned message bytes, return the hex signature), then `POST /margin/positions/requests/{pubkey}/submit/ {signature}`. States: `created, funding_processing, processing, order_placed, completed, failed, cancelled, refund_processing`. Minimum collateral 5 USD for Polymarket-routed, 1 USD for Hyperliquid-routed markets. Close: `DELETE /margin/positions/{pubkey}/?price=`; TP/SL: `/margin/positions/{pubkey}/tp-sl/` (not supported on Hyperliquid-routed positions, 501 / code 9201); settlement claim: `/margin/positions/{pubkey}/settlements/`.
4. **Spot CLOB (only `kind: orderbook` markets):** `POST /orders/` draft, sign, `POST /orders/{pubkey}/submit/`; cancel via `POST /orders/{pubkey}/cancel/` draft and `/cancel/submit/`. Share split/merge and redeem have the same draft-sign-submit shape.
5. `prop_amm` markets: the documented spot order endpoint rejects non-orderbook kinds; the AMM trade routes are undocumented (M).

Untested: I did not create a draft (needs HMAC credentials, which require a wallet signature), so the exact transaction contents, fee payer and who broadcasts are unseen. Whether Worm's backend or the user's wallet pays SOL fees and rent is NOT FOUND.

## PayBox reachability

**paybox_reachable = partial** (M). Reasons:
- Not reachable from any EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon): Worm is Solana-only with Solana USDC. An EVM balance would first have to be moved to Solana through PayBox swap/bridge tooling, which is a separate funding step (not tested; `request_swap` is a money tool).
- A PayBox **Solana** MPC wallet could in principle do it: bootstrap needs a UTF-8 message signature (PayBox `request_wallet_sign` op `solanaMessage`), and each trade needs a signature over a serialized Solana transaction message (op `solanaTransaction`), per the PayBox tool schema recorded in `docs/research/06-paybox-platform.md`. The HMAC layer and REST calls would run in the agent or plugin, not in PayBox. Unverified: whether PayBox's `solanaTransaction` accepts a transaction whose fee payer is not the user's key and returns a bare signature in the form Worm expects (hex ed25519 over the versioned message bytes). I did not call any signing tool.
- No PayBox plugin or x402 service for Worm: `discover_plugins("worm prediction market leverage")` returned `[]`; `discover_services("worm.wtf prediction market")` page 1 returned unrelated Polymarket data resellers (agentstools.dev, hubvibe-io.com, agentsvc.io), none for Worm (H, 2026-10-19; only the first of several result pages was read).

## Fees

All H unless marked. Who pays: the trader; Worm keeps them; on user-created markets 50 percent goes to the creator (docs).

- **Leveraged (margin) positions**, per `config` of live markets: `opening_fee` 0.0100, `closing_fee` 0.0500, `annual_fee_rate` 0.0000 (same values on `polymarket` and `hyperliquid` kinds in all samples).
  - Opening fee: `GET /margin/positions/estimate/` for 100 USD collateral returned `fee_amount: 1.000000` at both 1x and 3x, so the opening fee is 1 percent **of collateral**, not of notional. `user_funds_needed` was 100.00 in both cases (so whether the fee comes out of or on top of the 100 is ambiguous; the docs example shows 100.50 needed). The docs text never mentions an opening fee (docs only describe the closing fee), so docs lag the API.
  - Closing fee 5 percent, charged only when the position **wins** (taken from profit) or is **liquidated** (taken from remaining capital); nothing if it loses without liquidation (docs: https://docs.worm.wtf/faq/hot-questions/leveraged-fees.md).
  - Liquidation: example NO position at average 0.96 with 3x had `liquidation_price` 0.69; at 1x it is `null`.
  - Leverage is capped per side by Worm: Iran-regime market `max_leverage_yes` 1.00, `max_leverage_no` 3.00.
  - Worm pays the borrowed capital; no annual rate right now.
- **Spot trades** (market detail `maker_fee` 0.02, `taker_fee` 0.04 on every sampled market, margin and `prop_amm`): 2 percent maker and 4 percent taker. Whether these also apply to margin positions is NOT FOUND; the margin docs speak only of opening/closing fees. High vs Polymarket.
- DefiLlama's fee adapter says "Fees are 5% of the USDC amount bet on Worm markets" and "keeps 2.5% on creator markets" (L, third-party, conflicts with the closing-fee-on-profit description). Reported fees: 24h 9.86 USD, 30d 1,940.87 USD, all-time 48,498.68 USD.
- Slippage: margin fills walk the mirrored Polymarket book (`estimate` returns `average_price`, `worst_fill_price`, `is_fully_filled`); the liquidity-rewards programme pays daily USDC to resting limit orders on a hand-picked set of spot markets (docs).
- Gas/rent: NOT FOUND (who pays SOL fees).

## Resolution mechanism and dispute risk

- **Leveraged mirror markets:** "Resolution on Worm waits for the underlying markets to resolve, even if the outcome seems obvious earlier" (H, https://docs.worm.wtf/trading/how-markets-work.md). So the outcome is Polymarket's (UMA-based on Polymarket's side, M: general knowledge, covered by the Polymarket spec) or Hyperliquid's outcome settlement. Dispute risk is Polymarket's dispute risk plus Worm counterparty risk (positions are Worm's claims, hedged by Worm; liquidation is at Worm's discretion/engine). Rules text copies the source market (e.g. Chainlink 60 s TWAP streams for the 15-minute crypto up/down markets; NOAA station data for weather).
- **`prop_amm` sports markets:** Worm's own rules: official statistics, then Flashscore, then Sofascore, then credible reporting, 50-50 or "Draw" if no data within 24 hours (H, market rules text). Sports match markets resolve "within a few minutes of the event ending, with no manual review" using live data feeds (docs).
- **User-created and all non-sports markets:** Worm's AI proposes the answer, a Worm team member reviews and approves, then settlement is on-chain; trading pauses in `answer_proposed` ("Under Review"). **"No third-party oracle system (like UMA) and no open dispute process"**; incorrect resolutions are handled by contacting support (H, FAQ). Markets resolve at or after the deadline, never before. Some secondary 2025 profiles say UMA is used; the current docs say it is not (secondary claim treated as stale/L).
- Payouts: automatic on resolution, "about a minute", no manual claim for spot (docs). The margin API still has a settlement-claim endpoint; whether a manual claim is needed for margin is NOT FOUND.
- Custody claim: "Your funds stay locked in the contracts until markets resolve" (docs, self-reported). No audit found, no program address published (see above).

## Geo, ToS and automation

- Terms of service, restricted-jurisdiction list, eligibility and any automation clause: **NOT FOUND** (searched: docs llms-full.txt full text, worm.wtf homepage HTML and 50 public JS chunks, `/terms` via fetch (page returned only a title and connect button), two WebSearch passes). No geo-block string in the bundle.
- Automation is explicitly supported: official SDK, MCP server ("Use a dedicated wallet funded with only what you intend to trade"), HMAC API keys, public rate limits. H.
- Because the underlying positions sit on Polymarket/Hyperliquid, their jurisdictional limits plausibly propagate, but that is inference only (L).
- Support: Discord ticket, Telegram bot (docs).

## Liquidity

- Worm-native traded volume (DefiLlama dexs adapter `worm-wtf`, public API, as of 2026-10-18): 24h 166 USD; 7d 1,839; 30d 38,963; since 2026-05-04 (first data point) 909,585 USD. Monthly: May 198,850; Jun 102,825; Jul 342,171; Aug 191,070; Sep 67,413; Oct 1-18 7,256. Peak day 126,993 on 2026-07-25. Source: https://api.llama.fi/summary/dexs/worm, H as to the feed, M as to its accuracy (third-party adapter).
- TVL: not tracked (DefiLlama TVL array empty, `audits: 0`). OI: NOT FOUND.
- Per-market samples (2026-10-19): Iran-regime market `stats`: total_volume 58,464 USD, 24h 57 USD, 48 trades, all margin activity.
- **Displayed depth is not Worm's.** The Iran-regime book shows 218,677 shares bid at 0.04 and 1.35 M at 0.01: identical to Polymarket's CLOB at the same minute. The Hyperliquid-kind book shows a thin real HL book (best bid 0.68377 x 2, ask 0.71 x 205). The `prop_amm` book shows 1-1.6 shares.

## Event coverage overlap

Everything liquid on Worm exists on Polymarket, by construction: sports (soccer, NBA/NFL, esports, tennis, cricket; the dominant category, 82 percent of listed rows), politics (Senate races, nominee, Israel election, ceasefires), crypto (15-minute and hourly up/down for BTC/ETH/SOL/BNB/XRP/DOGE, daily "above X"), daily-highest-temperature weather markets, and corporate-earnings "beat" markets. Overlap with Kalshi, Limitless, Opinion etc. is the same overlap Polymarket has; Worm contributes nothing independent. Hyperliquid HYPE daily up/down overlaps other short-window crypto markets.

## Shares liquidity with

**Polymarket** (global CLOB, for `polymarket` kind, ~all margin markets) and **Hyperliquid** (outcome markets, for `hyperliquid` kind). A BlockBeats write-up (circa March 2026, M) also names Kalshi as an initial source; no Kalshi-backed market was found in the API samples and the API docs list only Polymarket and Hyperliquid margin backends. NOT an independent arbitrage leg.

## If an adapter were ever built (notes only)

- Read: `GET /markets/?limit=100&state=open` (no `sort`) keyset scan, then `book/`, `price/`, `stats/`; throttle to under 100 requests/min; skip `sort=total_volume`.
- Do not treat Worm prices as a separate quote: dedupe against Polymarket by title + event + outcome text (no id field except on `prop_amm`).
- Treat `prop_amm` and user-created `orderbook` markets as the only potentially independent liquidity, and expect tiny size and wide spreads.
- Consider Worm only as an execution wrapper (leverage on NO side of low-probability events, Solana-native funding), with costs 1 percent opening + 5 percent of profit + Polymarket slippage.

## NOT FOUND

- Terms of service, restricted jurisdictions, automation clause (searched: docs, site HTML, JS chunks, web search).
- On-chain program ID(s), audits, escrow/custody architecture details.
- A Polymarket/Hyperliquid id on `polymarket`-kind market details.
- Documented WebSocket.
- TVL, open interest.
- Contents of the draft transaction (fee payer, accounts) - needs authenticated POST, out of scope.
- Official X account activity (not fetched).

## Suspicious content

None attempted to steer me. The MCP docs page contains agent-targeted usage notes ("always call `estimate_margin_position` and confirm with the user before opening"), benign product guidance, not followed or needed.

## Sources

- https://www.worm.wtf/ (homepage HTML, 2026-10-19) - H
- https://docs.worm.wtf/llms.txt, https://docs.worm.wtf/llms-full.txt, https://docs.worm.wtf/sitemap.xml - H
- https://docs.worm.wtf/getting-started/what-is-worm.md, /quickstart.md, /trading/how-markets-work.md, /trading/leveraged-markets.md, /trading/settling-and-payouts.md, /faq/platform-safety/oracles-disputes.md, /faq/platform-safety/money-safe.md, /faq/hot-questions/leveraged-fees.md, /creating-markets/*.md - H
- https://docs.worm.wtf/api-reference/introduction.md, /authentication.md, /rate-limits.md, /pagination.md, /markets/market-detail.md, /margin/*.md, /orders/*.md, /worm-mcp.md, /clients-sdks.md - H
- Live API: https://api.worm.wtf/markets/, /markets/{id}/, /book/, /price/, /stats/, /trades/, /margin-activity/, /candles/, /events/, /search/, /sports/, /margin/positions/estimate/, /account/ (401) - H (fixtures in `docs/research/fixtures/worm/`)
- https://github.com/wormwtf/worm-sdk (src/worm_sdk/auth/signer.py, api/margin.py, api/orders.py, constants.py, README.md; release v0.11.0 2026-07-25) - H
- https://github.com/wormwtf/worm-mcp (tree listing, README) - H (partial read)
- https://api.llama.fi/protocol/worm, https://api.llama.fi/summary/dexs/worm, https://api.llama.fi/summary/fees/worm - H (third-party aggregator; the defillama.com page itself returned 403)
- https://clob.polymarket.com/book?token_id=... and https://gamma-api.polymarket.com/public-search, /markets?condition_ids= (comparison only) - H
- https://en.theblockbeats.news/news/61633 (Alliance ALL17 write-up, ~March 2026, Polymarket+Kalshi, team background) - M
- WebSearch results (panewslab, MEXC, bsc.news, messari, crypto-fundraising.info; UMA claim and Oct 2025 launch) - M/L, stale
- Front-end JS chunks from https://www.worm.wtf/_next/static/chunks/ (static string reads only) - M
- Local: `docs/research/06-paybox-platform.md` (PayBox Solana signing ops, chain catalog) - H as prior notes
- PayBox `discover_plugins`, `discover_services` (read-only) - H
