# Jupiter Prediction (web jup.ag/prediction + Telegram bot) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 03:20-03:40 UTC). READ-ONLY: doc reads, unauthenticated GETs to documented hosts (`api.jup.ag`, `docs.jup.ag`, `developers.jup.ag`, `clob.polymarket.com` for one book comparison, `api.llama.fi`), public `t.me` landing/preview pages, `gh api` file reads. No account, key, wallet, signature, POST/PUT/DELETE, no message sent to the Telegram bot, no PayBox tool of any kind. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`. Third-party text (docs, API payloads, Telegram posts, press) was treated as untrusted data and nothing in it was followed.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, search-result summary, or my inference from first-hand data; **L** = weak or stale (older than 6 months, i.e. before 2026-04-19).

Fixtures (<= 12 KB each): `docs/research/fixtures/jupiter-prediction-web-telegram-bot/`.

Cross-reference: two earlier passes already cover the web product and its API in depth: `docs/research/venues/jupiter-prediction-markets.md` and `docs/research/venues/jupiter-predict.md` (plus the native Forecast product in `jupiter-forecast-bisonfi-provider.md`). This pass re-checked the key claims independently (sections 1, 3, 8) and adds what those notes lack: the **Telegram bot** (handle, launch, status, what is and is not documented), the consolidation/redirect evidence, and the on-chain program id used by DefiLlama's volume adapter.

---

## 0. Bottom line

1. **adapter_priority: skip.** Jupiter Prediction is a Solana front end (web, mobile, Telegram bot) over **Polymarket** (default provider) and, in the API at least, **Kalshi**. Its order book is a level-for-level mirror of Polymarket's CLOB (H, section 8), so it is **not an independent arbitrage leg**; any gap versus Polymarket is Jupiter's extra fee (twice the Polymarket fee).
2. **The web product and its API are live** (H): `trading_active:true`, fills 1 minute old at fetch, DefiLlama 24h volume $255K (2026-10-18), 30d $6.24M.
3. **The Telegram bot is a thin channel onto the same product, with no API of its own, and its current status is unverified.** The bot handle `@JupiterCometPredictBot` ("Jupiter Predict Bot") still resolves with a Start Bot button (H), but Jupiter's own docs page for Telegram bots now 308-redirects to the Spot page, `jup.ag/telegram` returns 404, the current user docs (1.79 MB `llms-full.txt`) never mention a prediction bot, and the last bot promotion in Jupiter's marketing channel is 2026-04-27 (H, section 1). Jupiter announced on 2026-07-27 it was "consolidating our products, teams and channels" (H). Whether the bot still accepts trades could only be tested by messaging it, which I did not do.
4. **Nothing here to build an adapter for** except (optional, later) a Solana-wallet execution route into Polymarket liquidity through the documented Jupiter API; see section 4. A price adapter should read Polymarket and Kalshi directly.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://api.jup.ag/prediction/v1/trading-status` | `{"trading_active":true}`, 2026-10-19 ~03:33Z, no key (fixture `trading_status.json`) | H |
| `GET /trades` (global feed) | 20 fills from 03:22:59Z to 03:33:52Z, 12 buys / 8 sells, all `POLY-*` markets, total about $617 (fixture `trades_feed_redacted.json`). No field marks the channel (web vs mobile vs Telegram). | H |
| DefiLlama `jupiter-prediction` (category Interface, parent Jupiter, Solana) | 24h (day 2026-10-18) $255,078; 7d $1.59M; 30d $6.24M; all-time $58.03M; TVL $145.8K at 2026-10-19 01:40Z (fixture `defillama_summary_trimmed.json`) | H |
| Web page `https://jup.ag/prediction` | Title "Trade Prediction Markets on Solana \| Jupiter"; tabs Browse, Degen, Arcade, Activity, Clans, Profile, Leaderboard; names no venue. (WebFetch of client-rendered page, nav only) | H |
| User docs `https://docs.jup.ag/user-docs/trade/predict` | "Jupiter Predict (`jup.ag/prediction`) is a prediction market on Solana ... Markets come from external prediction market providers, mainly Polymarket, and from Jupiter-supported market integrations." | H |
| Developer docs | "The Prediction Market API is currently in beta and subject to breaking changes." | H |
| Telegram bot handle | `https://t.me/JupiterCometPredictBot` returns 200 with title "Jupiter Predict Bot", description "Trade prediction markets on real-world events with Jupiter.", button "Start Bot" (fixture `telegram_bot_landing_page_meta.json`). Existence of the handle only; not proof it answers. | H |
| Bot launch | Jupiter marketing channel post 2026-04-22 16:55Z: "Now Live: Jupiter Telegram Predictions. Introducing Jupiter Prediction Bot ... Head to @JupiterCometPredictBot, Join the waitlist, Look out for the official launch announcement" (https://t.me/s/jup_marketing, channel "Jup Marketing Command Center", 5.05K subscribers; I could not confirm from a Jupiter page that this channel is official, but its posts link to @JupiterExchange on X). CryptoTimes 2026-04-23 confirms the launch, waitlist phase, "Clans". | H (post text) / M (channel is official) |
| Bot promotion trail | 2026-04-23 post: "Jupiter x Polymarket stickers ... Zero platform fees for 1 month, Rev share from referrals, Trade with your clan. Jupiter's swap infra + Polymarket's prediction markets, now inside Telegram." 2026-04-27: sticker campaign ended. **No later post about the bot** in the channel preview pages I read (April-September 2026; post 109 and some earlier pages not read). | H |
| Docs removal signal | `https://docs.jup.ag/user-docs/trade/telegram-bots` returns **308 to `/user-docs/trade/spot`** while an arbitrary unknown path in the same folder returns 404, so the redirect is deliberate. A search-engine result listed a "Jupiter Telegram Bots Overview" page at that URL earlier, so the page existed and was removed or merged. `/user-docs/trade/prediction-bot` also 308s to `/user-docs/trade/predict`. `https://jup.ag/telegram` returns 404. The current `llms.txt` / `llms-full.txt` have no Telegram-bot page. | H (redirects, 404s, absence) / M (the earlier existence: search snippet only) |
| Consolidation | 2026-07-27 post: "we're consolidating our products, teams and channels together into 3 pillars: Trade, Earn, Manage." | H |
| Clans moved to web | 2026-09-08 post: "CLANS ARE LIVE IN JUPITER PREDICTION MARKETS ... Open the Clans tab: https://jup.ag/prediction/clans", no Telegram mention. User docs describe web Clans (50 members, weekly PnL race, wallet-signed clan chat, cash and Gacha rewards). | H |

Verdict: **still_live = true for the web product; Telegram bot = handle exists, active service unverified and probably de-emphasised** (M, inference from the docs redirect, 404 and silence since April). Press items are April 2026, at the edge of the 6-month staleness window (L for anything about bot behaviour).

---

## 2. Kind and market model

- **Kind (H):** broker / front end (DefiLlama category `Interface`). Not a venue. Channels: web (`jup.ag/prediction`), Jupiter Mobile, Telegram bot. Non-custodial on web (user signs Solana transactions). Custody model of the Telegram bot: **NOT FOUND** (searched: current user docs, developer docs, `llms-full.txt`, the t.me landing page, jup-ag GitHub org search for "telegram" and "predict" returned no repositories). Do not assume.
- **Market model (H, dev docs + OpenAPI):** binary YES/NO. An *event* holds one or more binary *markets* (one market per candidate/team; multi-outcome = several independent binary markets). Contracts pay $1 if correct. API prices are micro-USD (1,000,000 = $1.00). Short Up/Down rounds (Degen 5/15 min), Arcade (1-minute pool bets), sports "ticket" markets and Forecast (native prop-AMM, provider `bisonfi`) exist but are not arbitrage-relevant (see sibling notes).
- **Order book vs AMM:** Jupiter has no book of its own for Polymarket/Kalshi markets. `GET /orderbook/{marketId}` returns the upstream book as `yes`/`no` bid arrays and a **keeper network** fills orders on the upstream venue (H, section 8). Transfers: no tradable outcome token on the keeper path; exposure is a program position account. Forecast outcomes are Token-2022 mints (sibling notes).
- **Chain / collateral:** Solana only. Settlement mint in `vault-info` is USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) (H, fixture `vault_info.json`); docs also mention JupUSD, and Quick Buy accepts USDC, SOL or JupUSD (H, user docs How Predict works). Needs a little SOL for fees and rent (H, fees page).
- **On-chain program (new vs earlier notes):** DefiLlama's volume adapter counts successful instructions of Solana program `3ZZuTbwC6aJbvteyVxXUS7gtFYdf7AuXeitx6VyvjvUp` with first data byte `b3` (buy) or `fb` (sell) (H, adapter source `dexs/jupiter-prediction/index.ts` read via `gh api`). That this account is "the Jupiter Predict keeper-path program" is M (inferred from the adapter's name; no RPC/explorer check was made). It also means DefiLlama volume cannot be split by channel, so **Telegram-bot-only volume is NOT FOUND**.

---

## 3. Read API (official, public in practice)

| Item | Detail | Tag |
|---|---|---|
| Status | **official-public** (keyless GETs work), docs say a key is required for production | H |
| Docs | https://developers.jup.ag/docs/prediction (+ `.md` variants), OpenAPI https://developers.jup.ag/docs/openapi-spec/prediction/prediction.yaml (OpenAPI 3.0.3, 83 KB, v1.0.0), index https://developers.jup.ag/docs/llms.txt | H |
| Base URL | `https://api.jup.ag/prediction/v1` (OpenAPI `servers`) | H |
| Auth / limits | `x-api-key` for keyed tiers. Generic Jupiter table: Keyless 0.5 RPS (30 per min), Free 1 RPS, Developer 10, Pro 150. Observed keyless headers: `x-ratelimit-remaining: 4` after the first call (about 5 requests per 10 s burst). Prediction-specific limits NOT FOUND (searched prediction docs, OpenAPI, rate-limits page). | H |
| Websocket | NOT FOUND (searched prediction docs, OpenAPI paths, llms.txt). Poll only. | H (absence) |
| Telegram bot API | **none documented** (searched developer docs, OpenAPI, llms.txt). The bot is a UI; there is no bot-specific endpoint, webhook or channel field in the OpenAPI or in `/trades`. | H (absence) |

**Key endpoints (OpenAPI paths):** `GET /events` (params `category`, `subcategory`, `tags`, `filter` new|live|trending|upcoming, `provider` polymarket|kalshi|bisonfi, `sortBy`, `includeMarkets`, `start`, `end`), `/events/search`, `/events/{eventId}`, `/events/{eventId}/markets`, `/events/scores`, `/markets/{marketId}`, `/orderbook/{marketId}`, `/trades`, `/history`, `/leaderboards`, `/profiles/{pubkey}`, `/forecast`, `/trading-status`, `/vault-info`; trade side `/orders`, `/execute`, `/orders/status/{orderPubkey}`, `/positions`, `/positions/{pubkey}/claim`.

**Confirmed response shapes (unauthenticated GET, 2026-10-19 ~03:33Z; fixtures saved):**
- `GET /events?category=crypto&filter=trending&includeMarkets=true&start=0&end=1` -> `{data:[{eventId:"POLY-1112205", category:"crypto", subcategory:"btc", metadata:{title:"What price will Bitcoin hit in October?", series:"polymarket", closeTime:"2026-11-01T04:00:00Z"}, volumeUsd:"8458902000000", markets:[{provider:"polymarket", marketId:"POLY-5407561", status:"open", pricing:{buyYesPriceUsd:660000, sellYesPriceUsd:650000, sellNoPriceUsd:340000, buyNoPriceUsd:350000, volume:181541}, clobTokenIds:[yes,no], ...}]}], pagination:{start,end,hasNext}}`. No `total` in pagination. Full response was 55 KB for 2 events (rules text inline), so keep `end` small. `volumeUsd` is the upstream venue's event volume in micro-USD, not volume done through Jupiter.
- `GET /markets/POLY-5407561` -> fields `provider, marketId, status, result, title, openTime, closeTime, rulesPrimary, rulesSecondary, resolveAt, pricing{...}, clobTokenIds, ...`.
- `GET /orderbook/POLY-5407561` -> `{yes:[[cents,size]...], no:[...], yes_dollars:[["0.6200",1052]...], no_dollars:[...]}`, arrays are bids per side, ascending.
- `GET /events?provider=kalshi&...` -> Kalshi tickers (`eventId:"WRECSS-26"`, `marketId:"WRECSS-26-UK"`, `series:"KXWRECSS"`); prices buyYes 0.157 / sellYes 0.131 at fetch. Kalshi markets are **still served by the API** (H); whether they are still tradable through Jupiter is unverified (user docs mention only Polymarket as the Browse source).
- `GET /vault-info` returned exactly the same `currentContracts` (184,489 contracts) and `vaultBalance` (248.46) as the sibling note's read about three hours earlier, so treat it as a config/state snapshot, not a live open-interest or TVL measure (M).

---

## 4. Trade path and PayBox reachability

- **Programmatic trading: yes via the web API, none via Telegram.** `POST /orders` builds an unsigned Solana transaction; the owner signs (ed25519) and submits, a keeper fills on the upstream venue, `GET /orders/status/{orderPubkey}` tracks it; sells via `DELETE /positions/{pubkey}`, claims via `POST /positions/{pubkey}/claim`; limit buys only on Polymarket-sourced markets, limit sells disabled; minimum $5 per order (H, OpenAPI + user docs + dev docs; sibling notes cover the flow; I did not call any POST). No EVM/EIP-712 signed-order scheme exists; authority is the Solana transaction signature.
- **Telegram bot trade path:** interactive only (Start Bot, bot commands such as `/copytrade` reported by KuCoin, M). No documented programmatic interface; automating a Telegram bot would mean scripting a user session or holding the bot's wallet, which I do not recommend and which Jupiter's terms were not checked for (NOT FOUND: no bot-specific terms located).
- **PayBox reachability: partial.** EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon) cannot trade it: the venue is Solana-only. A PayBox **Solana** credential could in principle sign a Jupiter-built transaction (`request_wallet_sign` op `solanaTransaction`, or a `solana` transaction proposal limited to <= 1,232 bytes, one signer who is the fee payer, no durable nonce; H from `docs/research/06-paybox-platform.md`). Unverified blockers (needs a POST): `requiredSigners` of the order build, transaction size, and whether the keeper flow needs a second signature. Telegram bot: no PayBox route. PayBox's official `jupiter` plugin covers swaps/assets, not Predict (H, project notes).

---

## 5. Fees

- **Polymarket-sourced markets (H, https://docs.jup.ag/user-docs/trade/predict/fees):** "where Polymarket charges a fee on a market, Jupiter charges an additional fee equal to the Polymarket fee. The total trading fee you pay is twice the Polymarket fee." Charged to the trader, in the buy token, only on executed fills, rounded up to the cent, no fee on claims or refunds. All 18 cells of the published table (1 and 100 contracts at $0.01-$0.40) equal `ceil_to_cent(0.07 * contracts * p * (1-p))` (I recomputed them: 18 of 18). That implies a 0.035 coefficient for the Polymarket half; the true Polymarket schedule varies by category and was not re-verified (M).
- Other types: sports tickets and Forecast "currently no trading fees"; Arcade 1% of payout; Degen non-Forecast "set by the market's route"; plus Solana network fees and temporary rent.
- **Telegram bot:** zero platform fees for one month for early users / sticker-pack claimants and "Rev share from referrals" (H, Jupiter marketing channel 2026-04-23); CryptoTimes: "Telegram-related platform fees are waived for early users during the first month" (M). A search-result summary of the removed docs page said waitlist members pay 0 fees for one month and only referral fees apply (M, page not fetched). **Post-promo bot fee schedule: NOT FOUND.** Any promo has expired by now (one month from late April 2026).
- DefiLlama's methodology says "Jupiter doesnt keep any fees as of now, all the fees goes to kalshi" (H that it says so); it contradicts Jupiter's current docs and is stale (Kalshi-only beta era). Do not use DefiLlama's fee split.

---

## 6. Resolution mechanism and dispute risk

Jupiter resolves nothing. Outcomes come from the upstream source and Jupiter "follows the final result from that source" (user docs, settlement page; sibling notes). For Polymarket-sourced markets the rules are Polymarket's, e.g. the sampled `POLY-5407561` rule resolves on any Binance BTC/USDT 1-minute candle High at or above the title price through the last day of the month (H, fixture `market_POLY-5407561.json`). Disputes are inherited from Polymarket (its oracle process was not researched here, excluded as covered elsewhere) plus Jupiter-specific layers: keeper/fill failure, settlement lag ("not instant"), claim step, vault/program risk, stablecoin depeg risk (H, user docs risk list). Cancelled/voided markets refund (`status: cancelled`). For the Telegram bot, settlement/claim UX is **NOT FOUND**.

---

## 7. Geo / ToS / automation

- **API geo block (H):** "We have restricted United States and South Korea IPs from accessing the Prediction Market API." Terms of Use "Prohibited Localities": Jupiter "does not interact with digital wallets located in, established in, or a resident of the United States, the Republic of China, Singapore, Myanmar (Burma), Cote D'Ivoire ..." (list continues; read from https://docs.jup.ag/user-docs/legal/terms-of-use.md). User docs: "the Jupiter Mobile app restricts more regions than the web". Telegram-specific geo rules: **NOT FOUND**; CryptoTimes names none.
- **Automation (H):** Terms of Use mention no bot rule. The Jupiter SDK/API License Agreement (https://developers.jup.ag/docs/legal/sdk-api-license-agreement) prohibits using the API "for competitive analysis or disseminate performance information", combining API content "with content obtained through scraping or any other means outside the API", and sharing API content with third parties; it also says usage may not exceed "reasonable request volume". An aggregator that republishes Jupiter prices would be on the wrong side of that, a further reason to read Polymarket and Kalshi directly. Whether the keyless tier is bound by the agreement is unclear (M).
- Jupiter "does not confirm whether trading is permitted where you are" (user docs FAQ, H).

---

## 8. Liquidity and shared-liquidity verdict

**Own volume (all channels via the Predict program):** $255K/day (2026-10-18), $1.59M 7d, $6.24M 30d, $58.0M all time (DefiLlama, fetched 2026-10-19; H for the numbers, M for comparability); down sharply from a June 2026 monthly peak of about $13.8M per the sibling notes. Telegram-bot-only share: NOT FOUND. TVL $146K (DefiLlama, 2026-10-19 01:40Z). Scale: roughly 0.04% of Kalshi's 30d volume per `docs/research/14-platform-of-platforms.md`.

**Shares liquidity with Polymarket (primary) and Kalshi (API) - NOT an independent arbitrage leg. Fresh proof (H, fixtures `orderbook_POLY-5407561.json`, `polymarket_clob_book_yes_top6_for_comparison.json`, `market_POLY-5407561.json`), Jupiter fetched 03:34:35Z, Polymarket CLOB fetched about 2 s later for the YES token id in `clobTokenIds`:**

| Level | Jupiter `/orderbook` | Polymarket CLOB |
|---|---|---|
| YES bids | 0.62 x 1052, 0.63 x 12226, 0.64 x 27 | 0.62 x 1052, 0.63 x 12226, 0.64 x 27 |
| NO bids (= 1 - YES asks) | 0.32 x 14974, 0.33 x 6270, 0.34 x 1966.57 | YES asks 0.68 x 14974, 0.67 x 6270, 0.66 x 1966.57 |
| `/markets` pricing | buyYes 0.66, sellYes 0.64 | best ask 0.66, best bid 0.64 |

Sizes match to the contract. Other evidence: ids are `POLY-<polymarket id>` and carry Polymarket token ids; Jupiter's marketing says "Jupiter's swap infra + Polymarket's prediction markets, now inside Telegram" (H); the Kalshi sample's prices equal Kalshi's own (sibling note, H). So the **Telegram bot, web and mobile are three channels onto one Polymarket-fed book**; none adds a venue. The only genuinely Jupiter-specific liquidity is Forecast (`bisonfi`) and sports tickets, covered in sibling notes (thin, not arbitrage legs).

---

## 9. Event categories and overlap

Categories (H, OpenAPI enum + user docs): crypto, sports, politics, esports, culture, economics, tech. Samples seen: BTC price-hit ladders (October/November 2026), ATP match markets, Kalshi recession-by-country. Overlap with other venues is **100% on the Polymarket/Kalshi side by construction**, so Jupiter adds no new arbitrage pair. Join key: `POLY-<n>` = Polymarket event/market id; Kalshi ids are native tickers; `clobTokenIds` give the Polymarket token ids directly.

---

## 10. Adapter recommendation

- **skip.** Do not build a Jupiter price/liquidity adapter. Poll Polymarket and Kalshi directly (no 2x fee, no 0.5 RPS cap, richer data, websockets).
- Optional later: if the project wants a Solana-wallet route into Polymarket through PayBox's Solana credentials, the surface is `GET /markets`, `/orderbook`, `POST /orders` (+ `/execute` for Forecast), `/orders/status`, `/positions`, `.../claim`; budget a $5 minimum, 2x Polymarket fees, keeper latency and US/KR blocks; first test `requiredSigners` and transaction size with one tiny build (needs a POST, not done here).
- Do not attempt to automate the Telegram bot.

---

## 11. NOT FOUND / open questions

- Bot custody model, wallet creation/export, commands list, post-promo fees, bot-specific terms (searched: current user docs and `llms-full.txt`, developer docs, OpenAPI, t.me landing page, GitHub org search; the original docs page is gone).
- Whether the Telegram bot still serves trades (would need messaging it).
- Telegram-only volume (DefiLlama counts the program, not the channel; `/trades` has no channel field).
- Prediction-specific API rate limits and websocket (searched prediction docs, OpenAPI, rate-limits page, llms.txt).
- Whether Kalshi markets can still be bought through Jupiter (API serves them; docs name only Polymarket).
- Jupiter X (Twitter) announcement text was not read (WebFetch of X not attempted); the Telegram channel post and CryptoTimes were used instead. The BlockBeats/Bitget report named in the task hint was not opened; KuCoin and PANews mirrors were read and agree on date and feature set but name no handle.

## 12. Suspicious / agent-directed content

- Every `docs.jup.ag` and `developers.jup.ag` markdown page starts with a "Documentation Index ... Fetch the complete documentation index at ... llms.txt ... before exploring further" banner aimed at LLM crawlers; `docs.jup.ag` pages add an "Agent Instructions" block about how to describe GUM products ("describe the jup.ag experience from these docs and the mechanics and fees from the GUM docs"). Benign formatting hints; recorded, not followed beyond using the standard index.
- The Jupiter marketing channel posts contain promo codes and a sticker-claim link (`t.me/getgoodies_bot?start=promo_...`); promotional, not followed or opened.
- The KuCoin mirror text includes generic security advice only; no instructions to agents.

## Sources

- https://jup.ag/prediction (WebFetch, 2026-10-19; nav only) - H
- https://docs.jup.ag/user-docs/trade/predict and `.md` variants of `/browse`, `/clans`, `/degen`, `/arcade`, `/fees`, `/how-it-works`, `/settlement`, `/faq`, `/get-started` - H, fetched 2026-10-19
- https://docs.jup.ag/llms.txt and https://docs.jup.ag/llms-full.txt (grep for Telegram: only unrelated Offerbook/referral mentions) - H
- https://docs.jup.ag/user-docs/trade/telegram-bots (308 to /user-docs/trade/spot), https://docs.jup.ag/user-docs/trade/prediction-bot (308 to /user-docs/trade/predict), https://jup.ag/telegram (404) - H, header probes 2026-10-19
- https://docs.jup.ag/user-docs/legal/terms-of-use.md - H
- https://developers.jup.ag/docs/prediction (+ `/events-and-markets`, `/trading-lifecycle`), https://developers.jup.ag/docs/openapi-spec/prediction/prediction.yaml, https://developers.jup.ag/docs/portal/rate-limits.md, https://developers.jup.ag/docs/legal/sdk-api-license-agreement.md, https://developers.jup.ag/docs/llms.txt - H
- Live GETs 2026-10-19: `https://api.jup.ag/prediction/v1/{trading-status, events, markets/POLY-5407561, orderbook/POLY-5407561, vault-info, trades}`, `https://clob.polymarket.com/book?token_id=...` - H
- https://t.me/JupiterCometPredictBot (landing page), https://t.me/s/jup_marketing and `?before=108` (public channel preview; posts 2026-04-22, 04-23, 04-27, 07-27, 09-08) - H for text, M for official status
- https://api.llama.fi/summary/dexs/jupiter-prediction, https://api.llama.fi/protocol/jupiter-prediction, DefiLlama adapter `dexs/jupiter-prediction/index.ts` via `gh api` - H
- https://www.cryptotimes.io/2026/04/23/jupiter-launches-prediction-markets-bot-on-telegram-with-clans-feature/ (waitlist, Polymarket, Clans, fee waiver) - H for what it says, M as a source (secondary)
- https://www.kucoin.com/blog/pt-jupiter-launches-prediction-market-bot-defi-and-prediction-market-integration-enters-a-new-phase (mentions `/copytrade`, Polymarket and Kalshi liquidity) - M; https://panews.io/articles/019db82f-48f3-7209-82b2-da36f86d22fb (cites SolanaFloor, 04-23) - M
- Search-result titles/snippets only (pages not fetched): Bitget, WEEX, MEXC mirrors, "Jupiter Telegram Bots Overview" - L
- Project notes: `docs/research/06-paybox-platform.md`, `docs/research/14-platform-of-platforms.md`, `docs/research/venues/jupiter-prediction-markets.md`, `docs/research/venues/jupiter-predict.md`
