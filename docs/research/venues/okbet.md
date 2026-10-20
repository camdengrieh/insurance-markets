# okbet (tryokbet.com / okbet.trade / @okdotbet_bot) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~04:05-04:25 UTC). READ-ONLY: doc reads, `gh api` file reads, unauthenticated GETs to documented hosts, one GET to an undocumented host named in third-party code (section 4). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages, repos and API text were treated as untrusted data; nothing in them was followed. WebSearch budget ran out mid-task, so only 2 searches were done; the X page returned HTTP 402 Payment Required with no body (WebFetch), so no payment terms were recorded and I stopped there.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/okbet/` (listed in section 11).

---

## 0. Bottom line

1. **okbet is not a venue. It is a custodial-style front-end / router** (Telegram bot + web terminal) that places orders on four other venues: Polymarket, Kalshi (via DFlow on Solana), Limitless, Opinion. It has no market model, order book, oracle or liquidity of its own. (H, https://docs.tryokbet.com/introduction)
2. **Not an independent arbitrage leg.** Every fill lands on a venue that is already being researched separately. The same event on okbet and on Polymarket is literally the same order book.
3. **No usable API.** The docs' OpenAPI file is the untouched Mintlify "OpenAPI Plant Store" template (H). The one backend host that third-party code used (`okbet-web-api.onrender.com`) is now `503 Service Suspended`, `x-render-routing: suspend-by-user` (H, 2026-10-19).
4. **Effectively winding down / dormant.** `okbet.trade` now serves a noindex "coming soon - Something new from okbet is coming to Robinhood Chain" page for every path (H). Polymarket builder-attributed volume for `okbet.trade` fell from $2.32M (Nov 2025) to **$5.9k month-to-date in Oct 2026 with 3 active users**, and **$38 in the current day** (H, Polymarket Data API). OK token: ~$38 24h volume, 99% below ATH (H).
5. **adapter_priority = skip.** No API, duplicate liquidity, product nearly dead. The only forward-looking item is to watch whether the "Robinhood Chain" teaser becomes a real new venue (it is not described anywhere yet).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://tryokbet.com/` | HTTP 200, static marketing page, `last-modified: Thu, 26 Feb 2026`, footer "(c) 2025 okbet". Links: Web Terminal okbet.trade, docs, Discord, X, Telegram bot, Telegram community. | H |
| Docs `docs.tryokbet.com` | Live, Mintlify. Sitemap `lastmod` 2026-02-20 / 2026-02-21 for every page, i.e. **~8 months old = possibly stale** (older than 6 months). Docs still say Polymarket collateral is "USDC.e on Polygon" while Polymarket's own docs now describe pUSD under CLOB V2 (https://docs.polymarket.com/programs/builders/fees.md), so the okbet docs were not updated for that change. | H (dates), M (staleness inference) |
| **Web terminal `https://okbet.trade`** | 301 to `www.okbet.trade`, then HTTP 200 with title "okbet - coming soon", meta description "Something new from okbet is coming to Robinhood Chain.", `robots: noindex, nofollow`, body only "Coming soon / Have early access? / (c) 2026 okbet". Response header `x-middleware-rewrite: /coming-soon`; `/terms`, `/robots.txt`, `/api` all return the same page. The advertised terminal is therefore **not reachable** as of 2026-10-19 04:06 UTC. | H |
| Backend host seen in third-party code (`okbet-web-api.onrender.com`) | HTTP 503, header `x-render-routing: suspend-by-user`, body "This service has been suspended by its owner." Host was learned from a third-party repo (`nobita1998/okbet-arena-tracker`, last push 2026-01-09), not from okbet docs; association with okbet is by name and because `okbet.trade` is also served from Render (`x-render-origin-server: Render`). | H (response), M (ownership) |
| Telegram bot `t.me/okdotbet_bot` | Public profile page exists, title "ok.bet", "Start Bot". Cannot prove it still answers without messaging it (not done). | H (exists), unknown (responsive) |
| Polymarket builder attribution | `okbet.trade` builder code still receiving a trickle: DAY $38.02 / 1 user, WEEK $349 / 1 user, MONTH-to-date $5,894 / 3 users, ALL $13.11M / 418 users (section 8). Since the web terminal is gone, the trickle presumably comes from the Telegram bot (M). | H (numbers), M (attribution to bot) |
| Discord | Public invite metadata: server "okbet", ~224 members, ~6 online (https://discord.com/api/v9/invites/... with_counts, read-only GET). | H |
| GitHub | Org `tryokbet` exists, 0 public repos. | H |
| X `@tryokbet` | HTTP 402 to WebFetch; recent posts NOT READ. | - |

Verdict: **still_live = true only in the weakest sense** (bot profile and a handful of Polymarket orders per day). Treat as dormant or pivoting.

---

## 2. Kind and market model

- **Kind (H):** broker / front-end aggregator. "Trade on Polymarket, Kalshi, Limitless and Opinion from a single account." Features: Discover feed, Intel (whale and unusual-bet alerts, news, tweet monitoring), Copy Trading, Agent Mode ("hey ok" natural-language trading), "Arena" (AI agents compete), quests/points, $OK token fee discounts. (https://docs.tryokbet.com/terminal, /agent, /copy-trading)
- **Market model:** inherited from the underlying venue. okbet states "Your okbet wallet trades directly on Polymarket's order book" and that on Polymarket, Kalshi and Limitless "all orders are technically limit orders" (H, https://docs.tryokbet.com/polymarket, /faq). So: central limit order books, binary Yes/No share tokens as defined by each venue. Nothing is tokenised by okbet itself.
- **Kalshi path (H):** "okbet connects to Kalshi on Solana through DFlow" and requires Kalshi KYC from Settings (https://docs.tryokbet.com/kalshi). That means the Kalshi leg is DFlow's tokenised Kalshi markets, not Kalshi's own API.
- **Own markets:** none. NOT FOUND (searched: docs llms.txt + all 33 doc pages, homepage).

---

## 3. Chains and collateral (as documented 2026-02, possibly stale)

| Platform | Currency | Chain | Tag |
|---|---|---|---|
| Polymarket | USDC.e (docs wording; Polymarket itself now documents pUSD) | Polygon | H / stale |
| Kalshi (via DFlow) | USDC | Solana | H |
| Limitless | USDC | Base | H |
| Opinion | USDT | BNB Chain | H |

Source: https://docs.tryokbet.com/introduction, /faq, /telegram/commands/balance. Deposit: send USDC.e on Polygon to the okbet-created "ETH wallet", or send USDC on Solana to the okbet Solana wallet, which okbet bridges to Polygon (Li.Fi is named for withdrawals) (H, /telegram/commands/deposit, /withdraw). Wallet model: up to 10 wallets per account, each with its own ETH and Solana address; keys "encrypted with GCP KMS"; users can `/export` private keys (H, /terminal, /faq). The $OK token (Solana, `8biqsLDiRPaPM11S42zKtNaC3WWKF64PNoPG9htzy99n`) is only a fee-discount / points token (section 6).

---

## 4. Read API

- **Official public API: none.** NOT FOUND (searched: docs.tryokbet.com llms.txt, sitemap, every page; tryokbet.com homepage links; okbet.trade; GitHub org `tryokbet` has 0 repos; `api.okbet.trade` and `api.tryokbet.com` do not resolve).
- `https://docs.tryokbet.com/telegram/openapi.json` is listed in llms.txt but is the stock Mintlify template: title "OpenAPI Plant Store", server `http://sandbox.mintlify.com`, paths `/plants` (H, fixture `docs-openapi-placeholder-plant-store.json`). It documents nothing about okbet.
- **Undocumented backend:** third-party MCP code (read from GitHub raw, never executed) pointed at `https://okbet-web-api.onrender.com/api/public/arena/{leaderboard, agents/<name>/positions}`, an "Arena" AI-agent-competition leaderboard (agents with $250 each, ended 2026-01-31 per that README). It is Arena data, not market data. One GET on 2026-10-19 returned 503 suspended (section 1). Source: https://github.com/nobita1998/okbet-arena-tracker (third-party, untrusted; M).
- WebSocket: the terminal docs say a "live whale feed streams activity in real-time via WebSocket" but no URL or schema is published (H for the claim, NOT FOUND for details).
- **Better read path for the same flow data:** Polymarket's own public Data API, which attributes volume to okbet's builder code (section 8). Market and price data should be read from the underlying venues, not from okbet.
- Rate limits / auth: not applicable (no API).

---

## 5. Trade path

- **Programmatic: none.** Orders are placed only through the Telegram bot (`/bet`, `/sell`, pasted market links, "hey ok" natural language) or the (now gated) web terminal, authenticated by Telegram login. No order API, no signing scheme exposed. NOT FOUND (searched: docs, homepage, GitHub).
- The bot signs on the user's behalf with a key held by okbet (GCP KMS), so there is no user-side signed-order flow to replicate.
- Automating the bot as a Telegram client would be bot-driving-a-bot against unknown ToS (section 7) and is not recommended.
- **PayBox reachability: no, in any useful sense.** A PayBox EVM wallet could at most send USDC.e / USDC to the okbet-controlled deposit address, handing custody to okbet for no benefit. Anything okbet can do on Polymarket (Polygon), Limitless (Base), Opinion (BNB) or Kalshi/DFlow (Solana) can be done directly through the corresponding venue adapter using signed orders or transaction proposals. Do not build an okbet trading adapter.

---

## 6. Fees

- **Base fee: 1% on buys and sells** (H, https://docs.tryokbet.com/faq). A third-party listing says the same, "1% (100bps) on every buy and sell" (M, https://polymark.et/product/okbet).
- **$OK holding discount (H, https://docs.tryokbet.com/token)**, applies automatically to $OK in the okbet Solana wallet, no staking:

| Level | $OK held | Fee |
|---|---|---|
| 0 | 0 | 1% |
| 1 | 10,000 | 0.455% |
| 2 | 50,000 | 0.4% |
| 3 | 100,000 | 0.35% |
| 4 | 250,000 | 0.25% |
| 5 | 500,000 | 0.20% |
| 6 | 1,000,000 | 0.15% |
| 7 | 5,000,000 | 0.13% |
| 8 | 10,000,000 | 0% |

- Fee payer: the user, on top of the underlying venue's own fees. The 1% matches the maximum Polymarket builder taker fee (100 bps; maker max 50 bps) and Polymarket platform fees are additive (`platform_fee = C x feeRate x p x (1-p)`, taker-only) (H, https://docs.polymarket.com/programs/builders/fees.md). Whether okbet charges its fee via the Polymarket builder-fee mechanism or off-chain is NOT FOUND.
- Bridge costs: Li.Fi bridge for Solana to Polygon, ~10 minutes for withdrawal (H, /telegram/commands/withdraw); fee amounts NOT FOUND.
- For arbitrage maths this means **any okbet-routed leg costs up to 1% more than going direct**, so there is no pricing reason to use it.

---

## 7. Resolution, geo / ToS / automation

- **Resolution:** none by okbet. Settlement and disputes are whatever the underlying venue does (Polymarket, Kalshi/DFlow, Limitless, Opinion). The terminal lets users "redeem settled markets" (H, /terminal). okbet adds one extra risk: **custodian risk** (okbet holds the keys in KMS; deposits and positions sit in wallets okbet controls until the user exports them), plus a wind-down risk given section 1.
- **Terms of service / geo:** NOT FOUND. Searched: docs llms.txt and all pages, homepage footer (no terms link), `tryokbet.com/terms` (404), `okbet.trade/terms` (rewrites to coming-soon). The docs' only restriction is Kalshi KYC "from Settings" (H). Underlying-venue geoblocks (Polymarket, Opinion etc.) presumably still apply (M).
- **Automation:** docs describe only first-party automation (Agent Mode, Copy Trading, auto-copy). Agent Mode claims the AI "never sees your private keys" (H, /agent). Nothing on third-party bots or API use.
- Embedded instructions / suspicious content: none found in okbet's pages. The third-party arena repo's README tells readers to clone it, install an MCP server and copy a skill into their project; I did not do any of that (untrusted, ignored).

---

## 8. Liquidity (with dates)

| Metric | Value | Source, date | Tag |
|---|---|---|---|
| Polymarket volume attributed to builder code `okbet.trade` (all time, builder attribution starts 2025-10) | $13,114,591.74, 418 active users, all-time builder rank 51 of 450 | `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL`, 2026-10-19 | H |
| Same, calendar month (Oct 2026, MTD 19 days) | **$5,894.01, 3 active users**, rank 176 of 290 | same endpoint `timePeriod=MONTH`, 2026-10-19 | H |
| Same, current week / day | $349.34 (1 user) / $38.02 (1 user) | `timePeriod=WEEK` / `DAY`, 2026-10-19 | H |
| Monthly series (USD, active users) | 2025-10 $244.7k (44); **2025-11 $2.32M (138, peak)**; 2025-12 $1.78M (99); 2026-01 $1.26M (151); 2026-02 $1.92M (139); 2026-03 $1.89M (55); 2026-04 $1.29M (26); 2026-05 $892k (30); 2026-06 $1.19M (22); 2026-07 $213k (18); 2026-08 $87k (14); 2026-09 $24.9k (18); 2026-10 MTD $5.9k (3). Sum equals the ALL figure. | `GET .../v1/builders/volume?timePeriod=MONTH`, 2026-10-19 | H |
| Decline from peak month to MTD | -99.7% | computed | H |
| Kalshi / Limitless / Opinion volume routed via okbet | NOT FOUND | no public attribution found | - |
| $OK token | price $0.0000446, market cap ~$44.6k, pool liquidity $43.8k (Meteora OK/SOL), 24h volume $38.12 (1 buy, 1 sell), pair created 2025-05-16 | DexScreener API `/latest/dex/pairs/solana/hxyiu43...`, 2026-10-19 | H |
| $OK all-time high | $0.005273 (CoinGecko lists 99.1% below ATH; ATH date 2025-10-08 comes from a search-engine summary) | https://www.coingecko.com/en/coins/okbet, read 2026-10-19 | H (ATH value), M (date) |
| Community | Discord ~224 members | Discord invite metadata, 2026-10-19 | H |

Caveats: the leaderboard `MONTH` bucket equals the calendar-month series bucket, so it is month-to-date, not trailing 30 days (M, inferred from matching numbers). Builder attribution only exists from 2025-10, so okbet's May-Sep 2025 volume is not in these figures. These numbers count only Polymarket flow; a 1-3 user trickle there says the whole product is nearly idle.

---

## 9. Event coverage and overlap

- By design it lists everything its four venues list: sports (docs name NBA, NFL, NHL, MLB, EPL, Champions League, La Liga, UFC, boxing, F1), politics, crypto, economics (H, /agent, /kalshi).
- **Overlap with other venues: 100%, because it is those venues.** No okbet-only markets exist.

## 10. Shared liquidity (important)

- **Liquidity is fully shared with Polymarket (Polygon CLOB), Kalshi (via DFlow on Solana), Limitless (Base) and Opinion (BNB).** The Polymarket CLOB stamps okbet's builder code into the signed order (H, https://docs.polymarket.com/programs/builders/overview.md), which is how the volume above can be seen at all. okbet is NOT an independent arbitrage leg. Price quotes on okbet are those venues' quotes; the only thing okbet adds is up to 1% of fee.
- Signal value: none via API. Its whale/unusual-bet/copy-trading intel is a UI feature with no endpoint; the same underlying data (Polymarket trades by wallet) is available directly from Polymarket's Data API.

---

## 11. Fixtures saved (`docs/research/fixtures/okbet/`)

| File | What it is |
|---|---|
| `polymarket-builders-leaderboard-okbet.json` | okbet.trade rows (DAY/WEEK/MONTH/ALL) copied from Polymarket Data API `/v1/builders/leaderboard`, other builders trimmed |
| `polymarket-builders-volume-month-okbet.json` | okbet.trade monthly rows from `/v1/builders/volume?timePeriod=MONTH` |
| `dexscreener-ok-sol-pair.json` | raw DexScreener pair response for the $OK/SOL Meteora pool |
| `docs-llms.txt` | okbet docs index |
| `docs-openapi-placeholder-plant-store.json` | the "OpenAPI Plant Store" template presented as okbet's OpenAPI spec |
| `okbet-trade-coming-soon.headers.txt` | headers and extracted text of the okbet.trade coming-soon page |
| `okbet-web-api-render-suspended.headers.txt` | 503 "Service Suspended" response from the old backend host |

---

## 12. Open questions

1. What is the "Robinhood Chain" teaser? Nothing public explains it; it may be a rebrand or a new product replacing the Polymarket/Telegram business. A web search for it returned nothing on okbet (M). Re-check in a few weeks.
2. Does the Telegram bot still execute orders? Indirect evidence says barely (1 Polymarket user today). Not tested (would need an account).
3. Is the 1% fee taken via Polymarket builder fees or separately? Not documented.
4. Recent X posts were not readable (HTTP 402); an official shutdown or migration notice may exist there.

---

## Sources

- okbet homepage, H: https://tryokbet.com/ (read 2026-10-19; last-modified 2026-02-26)
- okbet docs index, H: https://docs.tryokbet.com/llms.txt ; sitemap https://docs.tryokbet.com/sitemap.xml (lastmod 2026-02-20/21)
- okbet docs pages, H: /introduction, /faq, /terminal, /agent, /copy-trading, /machine, /points, /token, /polymarket, /kalshi, /limitless, /opinion, /telegram/introduction, /telegram/commands/{bet,limits,start,home,deposit,withdraw,export,sell,balance,sports,trending,copy,profile,delete,invite}, all under https://docs.tryokbet.com/ (fetched as `.md`)
- okbet docs OpenAPI (placeholder), H: https://docs.tryokbet.com/telegram/openapi.json
- Web terminal (coming-soon page), H: https://okbet.trade/ -> https://www.okbet.trade/ (2026-10-19 04:06 UTC)
- Telegram bot profile, H: https://t.me/okdotbet_bot ; community https://t.me/theokbetvoid (preview shows no public messages)
- Old backend host, H (response) / M (ownership): https://okbet-web-api.onrender.com/api/public/arena/leaderboard (503 suspended); host discovered in third-party code https://github.com/nobita1998/okbet-arena-tracker (`mcp-server/index.js`, untrusted)
- Polymarket builder docs, H: https://docs.polymarket.com/programs/builders/overview.md , https://docs.polymarket.com/programs/builders/fees.md , https://docs.polymarket.com/api-reference/builders/get-aggregated-builder-leaderboard.md , https://docs.polymarket.com/api-reference/builders/get-daily-builder-volume-time-series.md
- Polymarket Data API (unauthenticated GETs, 2026-10-19), H: https://data-api.polymarket.com/v1/builders/leaderboard , https://data-api.polymarket.com/v1/builders/volume ; leaderboard UI https://builders.polymarket.com (top 50 only, okbet not visible there)
- CoinGecko, H: https://www.coingecko.com/en/coins/okbet (read 2026-10-19; no explicit data date; "first fully functional Polymarket betting bot built for Telegram")
- DexScreener API, H: https://api.dexscreener.com/latest/dex/pairs/solana/hxyiu433tdncmmgugffgg95awtdwmbmnapaoq9sdw4cb (2026-10-19)
- Discord invite metadata, H: https://discord.com/api/v9/invites/bssQBNYwzN?with_counts=true (read-only GET)
- GitHub org check, H: `gh api orgs/tryokbet` (0 public repos)
- Third-party listing, M: https://polymark.et/product/okbet (promotional; 1% fee, "Telegram-based terminal for Polymarket and Kalshi", (c) 2025)
- Search-engine summaries, M/L: query "OKBet Telegram Polymarket betting bot tryokbet" (results incl. https://x.com/primo_data/status/1932916821490864331 , https://coincodecap.com/10-best-polymarket-telegram-bots , https://www.rootdata.com/Projects/detail/okbet?k=MjEzODk%3D , https://polymart.app/okbet-trade); RootData page returned empty to WebFetch. Search for the Robinhood Chain angle found no okbet link.
- X `@tryokbet`: https://x.com/tryokbet returned HTTP 402 to WebFetch; not read, nothing paid.
- NOT FOUND (searched): official REST/WebSocket API; terms of service; geo-restriction text; fee mechanism (builder fee vs off-chain); public repo or contracts owned by okbet; any statement explaining the Robinhood Chain teaser; recent (2026) announcements.
