# FrenFlow (frenflow.com) - venue spec

Researched 2026-10-19. Read-only: public web pages, the Mintlify docs `.md` mirrors, DefiLlama public API, Polymarket's public builder-volume feed, Sourcify public API, `gh api` for public GitHub metadata, static reading of the site's own JS chunks. No account, no wallet, no POST, no signing, no payments, no browser automation. Generic User-Agent only.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak, stale or ambiguous.

## Verdict

- Adapter priority: **skip**.
- FrenFlow is **not a venue**. It is a social / copy-trading front end and Telegram bot that routes orders to other venues (Polymarket via a builder code, Kalshi via DFlow, Predict.fun, and reportedly Hyperliquid HIP-4). Every market, price and fill is the underlying venue's. It has **no independent liquidity**, so it can never be an independent arbitrage leg (H, own docs and site: "FrenFlow doesn't change resolution - every market resolves on its source venue's oracle").
- It has **no documented public API** and no programmatic trade path. The marketing line "Public read API" (vs/polymarket page) is not backed by any docs I could find, and the one undocumented site endpoint I probed returned HTTP 500.
- Usage is near zero. Polymarket's own builder feed shows $571 of FrenFlow-attributed volume in October 2026 (to the 10th) and a peak of $171K in May 2026. DefiLlama shows 30d volume $69 and no fees since mid-June.
- Residual value is only as (a) a pointer that the aggregator should talk to the underlying venues directly, (b) a competitor note (FrenFlow's docs list a cross-venue "Arbitrage" tool as "Coming Soon", H) and (c) one lead: **Hyperliquid HIP-4 outcome markets** look like a genuinely independent on-chain CLOB venue that is not in the covered-venue list (see Open questions).

## Liveness (still live in 2026?)

Live but nearly dormant.

- www.frenflow.com and docs.frenflow.com return 200 on 2026-10-19; sitemap `lastmod` 2026-10-18T22:25Z; the vs-Polymarket page is labelled "Updated October 2026" (H, direct fetch).
- The FeeCollector contract on Polygon was deployed in block 85703356 and verified on Sourcify 2026-06-24 (H, Sourcify). DefiLlama adapter comments say FeeCollector "live since 2026-04-20" (M).
- Activity (H, Polymarket `data-api.polymarket.com/v1/builders/volume`, FrenFlow rows, fetched 2026-10-19): 148 daily rows from 2026-02-16 to 2026-10-10, total about $343K, max 10 active users on any day. Monthly volume USD: Feb 66; Mar 1.8K; Apr 1.6K; **May 171.0K (peak)**; Jun 102.5K; Jul 43.9K; Aug 6.2K; Sep 15.2K; Oct (1st-10th) 571. No rows after 2026-10-10.
- DefiLlama (H, `api.llama.fi/summary/dexs/frenflow` and `/fees/frenflow`): all-time volume $247,405 (a different cut from Polymarket's $343K; I did not reconcile), 30d volume $69, all-time fees $599, fee days nonzero only 2026-05-14 to 2026-06-15 and zero since. DefiLlama marks the record `deadUrl: true` and has no `url` field - that is why the discovery pass found no URL. The real site is https://www.frenflow.com.
- Comparison: Polymarket builder-attributed volume across all builders for 2026-09-19 to 2026-10-18 is about $710M (H, same feed). FrenFlow is about 0.0001% of that.

## Kind and market model

- Kind: **broker / frontend / copy-trading layer** (H). Products listed in docs: trading, copy trading ("zero-block" mempool-race execution on Polygon), leaderboard, wallet tracker (any Polymarket wallet), price alerts, social feed, Fren Points, referrals, Degenbox dashboard, UMA voting UI, Telegram bot @FrenFlowBot. A DexTools "Predictions" tab is a FrenFlow widget (H, docs; no independent confirmation).
- Market model: whatever the source venue offers. Polymarket: binary and multi-outcome (neg-risk) CLOB with ERC-1155 CTF tokens; Kalshi: binary contracts tokenised as SPL tokens by DFlow; Predict.fun: BSC order book; HIP-4: fully collateralised Yes/No outcomes on HyperCore order book (H for the Hyperliquid description, see Sources). FrenFlow adds no market type of its own.
- Venue list is **inconsistent across FrenFlow's own pages** (L for any one count):
  - docs.frenflow.com index and FAQ: Polymarket + Kalshi; Predict.fun page says "Coming soon / beta".
  - www.frenflow.com home and vs-Polymarket page (Oct 2026): four venues - Polymarket, Kalshi (DFlow), Predict.fun, Hyperliquid HIP-4 - while the same home page also says "2 venues" in one section.
  - www.frenflow.com/llms.txt: three sources - Polymarket, Kalshi, Hyperliquid HIP-4 (no Predict.fun).
  - blog post dated 2026-04-21: HIP-4 "waitlist only" (stale; the /hyperliquid page now says "Live").

## Chains and collateral

- Polygon: Safe smart wallet (Privy-backed per the home page); collateral USDC.e (docs) - Polymarket V2 uses pUSD, a 1:1 USDC.e wrapper, per the DefiLlama adapter, so FrenFlow's docs may lag (M).
- Solana: embedded wallet; Kalshi via DFlow; USDC (SPL). DFlow KYC ("DFlow Proof") required; "US-focused" (H docs).
- BSC: EOA; Predict.fun; USDT (H docs table, site claims).
- Arbitrum -> HyperCore: deposit USDC to the Bridge2 address; the site says FrenFlow flips the account to unified mode and swaps USDC to USDH (H site; the older blog says USDC collateral - L).
- Deposits "from 15+ chains" through Polymarket Bridge (Ethereum, Polygon, Arbitrum, Optimism, Base, Solana, Avalanche, BSC, Bitcoin, Tron) (H docs). Funds land as USDC.e on Polygon / USD on Solana.
- Fee contract: FeeCollector `0x95e47CBC5c4D9434412AF44Ade02B33613EDb787` on Polygon (137). Sourcify exact match, solc 0.8.24, name `FeeCollector`, MIT. Pulls a fee user -> treasury on a fill, authorised by an EIP-712 signature from an "execution engine" key; `MAX_FEE_BPS = 1000` (10% cap), pausable by a guardian, rescue functions for stray tokens (H, verified source; see fixture `feecollector_polygon_sourcify_summary.json`). The user must give USDC.e allowance to it. Builder payout wallet per DefiLlama adapter: `0x58715321c2c6a216d1259f368c34f987a4a26b64` (public address, M).
- Polymarket builder code: `0x1a907452bfffcc46534332a0882c2fb78e289fec946ea88f603f5767e080fcd5`, name "FrenFlow" (H, Polymarket builder feed). Signed into every Polymarket order, which is how FrenFlow's volume is measured.

## Read API

- `exists`: **none** (no documented API). Marketing claim "Public read API" is unsupported.
- Docs: https://docs.frenflow.com is Mintlify product docs only (users, trading, copy trading, wallet). `llms.txt` index lists 92 pages (many are Mintlify template pages), none is an API reference. NOT FOUND (searched: docs.frenflow.com/llms.txt full index, www.frenflow.com/llms.txt, /api, /docs, home page links, GitHub user `frenflow`, which has 5 public repos that are DefiLlama forks, an icon fork and two "awesome" lists - no SDK or OpenAPI).
- Undocumented site back-end ("BFF") paths seen in the site's JS (static read, M): `/api/markets/trending`, `/api/markets/prices/batch`, `/api/markets/kalshi/text-search`, `/api/markets/kalshi/live-tickers`, `/api/markets/predict/search`, `/api/polymarket/{event,market/,prices-history,search,rewards,balance,builder-credentials}`, `/api/traders/{search,most-copied}`. Everything else under `/api/v1/*` is Privy auth.
- Probe: `GET https://www.frenflow.com/api/markets/trending` -> first attempt timed out at 20 s with no bytes, second attempt HTTP 500 after 21 s, body `{"error":"Backend request failed"}` (H, fixture `bff_api_markets_trending_response.txt`). I stopped there. The JS client expects `{markets:[...]}`.
- robots.txt (H): `Allow: /api/markets/`, `/api/polymarket/`, `/api/broadcasts/`, `/api/recommendations/`, `/api/event-widget/`, `/api/og/` for the wildcard agent; `Disallow: /api/` for each named AI bot (GPTBot, ClaudeBot, anthropic-ai, PerplexityBot and others); `Crawl-delay: 1`. My two requests used a generic non-bot User-Agent and so fell under the wildcard rules; I made no further requests to `/api/`. Any integration should not depend on these undocumented paths.
- Rate limits, auth, WebSocket: NOT FOUND (searched: docs index, FAQ, robots, JS chunks for `wss://` - only chain RPC URLs). The Predict.fun page says it streams order books over WebSocket internally (H docs, not a public feed).
- **Do not use FrenFlow for data.** The same data is available first-hand and for free:
  - Polymarket order flow and wallet activity: Polymarket CLOB / Gamma / data API.
  - Builder-attributed volume (and so FrenFlow's own usage): `https://data-api.polymarket.com/v1/builders/volume` (H, 17 MB full dump, fixtures hold only FrenFlow rows).
  - Leaderboard, "smart money", copier counts are FrenFlow-only features with no API (docs list a leaderboard UI, `/leaders` in Telegram, nothing machine readable). Copier counts could be a weak signal, but there is no access path.

## Trade path

- **None for an agent.** Orders go through the FrenFlow web app or Telegram bot. Login is Privy (email, Google, X, Telegram, or an external wallet via SIWE). "Enable Trading" creates on-chain/CLOB credentials once (docs). Execution is by a FrenFlow server-side engine holding **delegated trading authority**, signed through AWS KMS (blog claim, M); revocable by the user (M). Gas is covered by FrenFlow (M).
- FrenFlow's own vs-Polymarket page says the canonical write path is the venue's CLOB API (H, quote: "Polymarket's direct CLOB API is the canonical write path") and the "CLOB pass-through for write where the venue allows" claim has no docs.
- Hyperliquid: an agent wallet is authorised with a one-time signature; orders carry FrenFlow as builder (site, M).
- Copy-trading engine: three detectors race (Polygon mempool, CLOB stream, on-chain logs), FOK market orders, tiered slippage, daily caps (H docs). Not exposed as an API.
- Withdrawal: the embedded wallet's private key can be exported in the UI and the funds moved elsewhere (H docs, "Export Private Key"). Exporting does not cut the delegation.

## PayBox reachability

- FrenFlow itself: **no**. There is no endpoint to send signed orders to, and no transaction-proposal flow. A PayBox EVM wallet could only (a) log in via SIWE through the web UI (needs a human/browser) and (b) transfer USDC.e to the FrenFlow-created Polygon Safe address. After that the funds are controlled by FrenFlow's engine plus the Privy key, not by PayBox signing. Not recommended.
- The underlying venues are the correct targets for PayBox-driven trading: Polymarket on Polygon (signed CLOB orders; the covered-venue workflow owns that), Predict.fun on BSC, Kalshi via DFlow on Solana, Hyperliquid on HyperCore via agent wallet. If the project ever wants builder revenue it can register its own Polymarket builder code instead of going through FrenFlow.

## Fees

- Docs (H, https://docs.frenflow.com/trading/fees.md): flat **1% platform fee** deducted from the entered amount before execution, charged on fill (limit orders only when filled, none on cancel); minimum-trade protection; "Redemptions are free"; copy trades pay the same. Venue fees on top: Polymarket taker fee built into the execution price; DFlow network fees.
- Site and vs page (H as read, self-reported): "1% taker / 0.5% maker" Polymarket builder fee at the CLOB level, "no other service fee". Hyperliquid: +0.1% builder fee on top of Hyperliquid's schedule (site).
- DefiLlama methodology (H): two streams - 1% service fee pulled by FeeCollector, plus Polymarket builder-fee distributions to the builder wallet.
- These three descriptions conflict; for a cost model treat FrenFlow as **1% of notional worst case, plus venue fees**, and prefer not to route through it. FeeCollector hard-caps any single fee at 10%.

## Resolution mechanism and dispute risk

- Inherited from each venue (H, FrenFlow page): UMA optimistic oracle plus DVM disputes on Polymarket; Kalshi's own determination (CFTC-regulated) via DFlow; Predict.fun per its own rules; HIP-4 per Hyperliquid (first market settles daily at 06:00 UTC to the BTC mark price on HyperCore, H, Hyperliquid docs).
- FrenFlow adds a UMA voting / dispute analytics UI (docs), no resolution authority. Auto-redeem exists; redemption failures are an operator risk, not an oracle risk.
- Added risks beyond the venue: operator risk (delegated signing engine, KMS, Privy), contract risk in FeeCollector (small), and the DFlow tokenisation layer for Kalshi positions.

## Geo, ToS, automation

- Terms page: NOT FOUND. `llms.txt` and the sitemap list `/terms-and-conditions`, `/privacy-policy`, `/cookie-policy`, but `/terms-and-conditions`, `/privacy-policy`, `/terms`, `/privacy`, `/tos` all returned HTTP 404 on 2026-10-19, and the home page has no footer legal links. So no automation or API-use rules could be read (searched: those paths, docs index, home page).
- Geo (site claims, M): "Global; respects local laws - geo-blocks where required"; "Polymarket is blocked in the US ... FrenFlow respects that"; US users are shown Kalshi markets instead. Kalshi via DFlow needs KYC and is "US-focused".
- Automation: no stated policy; robots.txt blocks named AI bots from `/api/` (see Read API).
- Consumer-protection note: docs and site make performance claims ("same-block", "no slippage") that are marketing; docs themselves say zero-block is "a goal, not a guarantee".

## Liquidity

See Liveness. Summary with sources and dates: Polymarket builder feed (fetched 2026-10-19) all-time attributed volume about $343K, Oct 2026 to the 10th $571, peak month May 2026 $171K, max 10 active users per day. DefiLlama (fetched 2026-10-19): 30d volume $69, all-time fees $599, TVL none (no TVL series). No order book of its own, no resting liquidity.

## Event coverage and overlap

Everything it shows is a mirror: Polymarket (politics, sports, crypto price, macro, culture; the site links Fed decision, BTC above X, EPL, ATP, ballon d'Or, 2028 nominee markets), Kalshi (CFTC-regulated sports, politics, economics, crypto), Predict.fun, HIP-4 (daily BTC/ETH/HYPE/SOL binaries and, per the site's market cards, sports contest winners). Overlap with other venues is total because it is the same markets - the arbitrage legs are the underlying venues, not FrenFlow.

## Shared liquidity

100% shared with the underlying venues (Polymarket CLOB, Kalshi via DFlow, Predict.fun, Hyperliquid). **Not an independent leg.** Its Polymarket flow is identifiable in Polymarket's data by the builder code above.

## Open questions

- Hyperliquid HIP-4 outcome markets: independent on-chain CLOB, fully collateralised Yes/No, builder codes, settlement in a quote token (H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md). Mainnet start reported 2026-05-02 with a recurring daily BTC binary, then ETH/HYPE/SOL and multi-outcome "questions" (M, secondary sources, dates conflict). Docs say fees were zero during testing. This is not in the covered-venue list and should get its own spec (liquidity, info-endpoint shapes, whether it is POST-only so needs a different research approach). Hyperliquid's info API is POST, so I did not call it.
- Whether FrenFlow ever opens a real API (the "FrenFlow exposes aggregated read endpoints across all four venues" claim). Re-check docs if that matters.
- Reconcile Polymarket's builder-feed total ($343K) with DefiLlama's ($247K).

## Fixtures (docs/research/fixtures/frenflow/)

- `polymarket_builders_volume_frenflow_summary.json`, `polymarket_builders_volume_frenflow_last30rows.json` - FrenFlow rows from Polymarket's builder volume feed.
- `defillama_dexs_frenflow_trimmed.json`, `defillama_fees_frenflow_trimmed.json` - DefiLlama dimension summaries, trimmed.
- `feecollector_polygon_sourcify_summary.json` - verified-contract summary (ABI names, constants, deployment).
- `bff_api_markets_trending_response.txt` - record of the failed probe.
- `docs_frenflow_com_llms.txt`, `www_frenflow_com_llms.txt`, `www_frenflow_com_robots.txt` - index and robots files as served.

## Suspicious content

- docs.frenflow.com serves Mintlify boilerplate `AGENTS.md` ("Prompt the user to customize this file ... install the Mintlify skill: npx skills add ...") and every docs page opens with "Fetch the complete documentation index at ... llms.txt". These address AI tools; I did not act on them. Low risk, standard Mintlify output.
- `DOCS_CONTEXT.md` is a public internal style note (Spanish/English) listing a GA4 id and CSS notes. Harmless.
- No injected instructions found on frenflow.com pages. Marketing pages contain unverified performance claims.

## Sources

- https://defillama.com/protocol/frenflow - returned HTTP 403 to WebFetch; the same record was read through the API below (H).
- https://api.llama.fi/protocol/frenflow , https://api.llama.fi/summary/dexs/frenflow , https://api.llama.fi/summary/fees/frenflow (H, fetched 2026-10-19).
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts and `fees/frenflow.ts` via `gh api` (H): builder code, FeeCollector address, builder payout wallet, fee methodology.
- https://data-api.polymarket.com/v1/builders/volume (H, fetched 2026-10-19).
- https://docs.polymarket.com/developers/builders/builder-intro (H): builder code attaches to orders and credits volume.
- https://sourcify.dev/server/v2/contract/137/0x95e47CBC5c4D9434412AF44Ade02B33613EDb787?fields=all (H).
- https://docs.frenflow.com/llms.txt and pages `/trading/fees.md`, `/arbitrage/overview.md`, `/markets/{polymarket,kalshi,predict}.md`, `/faq.md`, `/wallet/{deposit,withdraw}.md`, `/guides/getting-started.md`, `/copy-trading/{how-it-works,zero-block}.md`, `/integrations/dextools.md`, `/telegram-bot/commands.md`, `/leaderboard/overview.md` (H).
- https://www.frenflow.com/ , `/llms.txt`, `/robots.txt`, `/sitemap.xml`, `/vs/polymarket`, `/hyperliquid`, `/blog/fastest-polymarket-copy-trading-block-0-execution`, `/blog/hyperliquid-prediction-markets-hip-4` (H as read; claims inside are self-reported, M).
- https://www.frenflow.com/_next/static/chunks/* (34 chunks, static read for `/api/` paths) (M).
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md (H).
- WebSearch results (M/L): polytradingbot.com and polymart.app listings describe FrenFlow as Polymarket + Kalshi copy trading (dated around May 2026); no independent news, audit or funding coverage found. HIP-4 mainnet date reports from QuickNode, bitcoin.com and others are secondary (L).
- GitHub user `frenflow` (created 2025-11-27, 5 public repos, none are product code) via `gh api` (H).
