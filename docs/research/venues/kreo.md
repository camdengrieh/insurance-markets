# Kreo - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public pages, the Mintlify docs `.md` mirror, the web app's own public JS bundles (read as text, never executed), DefiLlama public API, public GETs to Polymarket's documented data-api and CLOB hosts, `gh api` for the DefiLlama adapter source. No account, wallet, key, signature or POST; no PayBox money or signing tools. Undocumented `api.kreo.app` endpoints were NOT called (one GET to the bare root, which returned 404). The web-search budget ran out mid-task, so a few follow-up searches (Kalshi execution route, launch date, team) were not possible.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- Adapter priority: **skip**.
- **Kreo is not a venue. It is a broker / copy-trading front end (Telegram bots + web app) that routes orders into Polymarket's CLOB (and, via a separate bot and wallet, Kalshi).** Its own ToS says so: "Kreo does not operate, control, or manage prediction markets ... Trades executed through Kreo occur on the infrastructure of Polymarket or Kalshi" (H, https://docs.kreo.app/terms-of-service.md, last updated 2026-03-15, 7 months old).
- On Polymarket its flow carries Polymarket builder code `0x9fedc0b0...cd18`, which Polymarket's public builder endpoints and DefiLlama attribute to "Kreo" (H, three sources agree). Its liquidity is therefore 100% Polymarket's and never an independent arbitrage leg. The Kalshi leg is Kalshi's liquidity by the same ToS statement (H), routed some way I could not identify (NOT FOUND).
- **No public API, no developer docs, ToS bans bots and scrapers, Telegram-login custody (Privy).** Nothing integrable.
- Still live but shrinking fast: Polymarket-attributed volume is down about 94% from the April 2026 peak (see Liquidity).
- Only salvage value: Polymarket publishes Kreo-attributed fills publicly (see "Signal value"). That belongs in the Polymarket adapter, not a Kreo adapter.

## Liveness (still live in 2026-10?)

- Yes. Evidence (all 2026-10-19 unless stated):
  - `https://kreo.app/` returns 307 to `https://enter.kreo.app` (Framer marketing site, published 2026-04-23); `https://kreo.app/feeds` returns 200 (Next.js web app); `https://docs.kreo.app/` returns 200 (H, curl).
  - Polymarket's public builder-trades feed for Kreo's code returned fills created 2026-10-19T00:55Z, i.e. seconds before my request; 300 fills in about 93 minutes (H).
  - Polymarket builder volume rows for Kreo exist for every day through 2026-10-18 (H); DefiLlama fees series ends 2026-10-18 at $628 (H).
  - Docs contain pages dated by screenshot filename to 2026-08-04 (Leverage) (M).
- Health trend is poor: see Liquidity.

## Kind and market model

- Kind: aggregator-adjacent trading interface (copy trade, auto trade, manual trade, wallet tracker, X-news feed, "smart wallets", unusual-activity feed, bonds page, limit orders, parlay, leverage). DefiLlama category "Interface", chain Polygon only (H, https://api.llama.fi/protocol/kreo).
- Venues: Polymarket and Kalshi (H, ToS and docs). Two separate Telegram bots and separate funded wallets: the web-app bundle links Polymarket to `t.me/kreoapp_bot` and Kalshi to `t.me/KreoKalshiBot`, with copy "Trade on prediction markets with crypto" vs "Trade on regulated prediction markets" (H, site JS). The docs name the bot `@KreoPolyBot` instead (H, https://docs.kreo.app/setting-up.md). The two handles disagree. A web-search summary said a Kreo-branded site warns to use only `@KreoPolyBot` and to ignore other handles (M, not traced to a primary page; docs.kreo.app/safety-on-telegram.md is only about hardening your Telegram account, H). Treat any handle as unverified.
- Market model: whatever the underlying venue uses. Polymarket = binary Yes/No ERC-1155 conditional tokens on a CLOB (neg-risk for categorical); Kreo adds no market structure of its own. Fills in Kreo's builder feed show `outcome` values like Up/Down, Yes/No, team names, Under (H, fixture). See the Polymarket and Kalshi specs.
- Kreo-only product claims whose backend is unknown (NOT FOUND, searched: docs pages, llms.txt, JS strings): **Leverage** ("up to 10x ... can lose more than your initial deposit", screenshots dated 2026-08-04), **Parlay** (stack 2+ legs, World Cup matches, "2000x and 40x = 80,000x"; "sell anytime before settlement"), **Bonds** page (markets "likely to bond" with APY). Who is the counterparty/market maker for leverage and parlay is not documented (H that docs are silent). Treat as a possible Kreo-run or third-party layer; no data access either way.

## Chains and collateral

- Polymarket leg: Polygon (137), wallets are "Gnosis Safe wallets generated through Polymarket infrastructure and secured by Privy" (H, ToS section 5). Collateral shown in docs as "USDC.e/pUSD on Polygon" (H, setting-up.md); the older deposit page says USDC.e only. pUSD is Polymarket's newer collateral (M, see Polymarket spec).
- Deposits: card via Coinbase (min $2), USDC.e on Polygon, or bridge from Polygon / Ethereum (min $7) / Base / Arbitrum / Solana (min $2) in many tokens; withdrawals can bridge out to other chains with a $2 minimum (H, https://docs.kreo.app/deposit-funds.md, withdraw-funds.md). A third-party listing also names BNB Chain (L, polymart.app).
- Kalshi leg: Solana-flavoured: tracker help says "For Kalshi: Use a SOL address or Kalshi username"; sign-up says Polymarket and Kalshi wallets must "be set up and fund[ed] both ... individually"; CSP allows a Helius Solana RPC (H, docs + response headers). Settlement token and tokenisation scheme: NOT FOUND (searched: docs, llms.txt, JS strings for dflow/jupiter/usdc). Context from a sibling note: DFlow sunset its Kalshi tokenisation product in July 2026 (M, docs/research/venues/dflow-prediction-markets.md), so Kreo's Kalshi route must be something else or is unverified; I do not guess.
- Custody: non-custodial claim; keys held in Privy enclaves; Kreo "cannot recover lost funds"; "Export Keys" page exists (H, ToS + llms.txt index). Login is Telegram only (H, ToS section 4).

## Read API

- `exists`: **none** (official). No developer docs, no OpenAPI, no SDK, no GitHub (NOT FOUND, searched: docs.kreo.app llms.txt (107 page entries), ToS, kreo.app, enter.kreo.app, DefiLlama `github: null`).
- `https://docs.kreo.app/api-reference/openapi.json` exists but is Mintlify's stock sample titled "OpenAPI Plant Store" (servers `http://sandbox.mintlify.com`, `/plants`), i.e. unedited template filler (H). Do not mistake it for a Kreo API.
- Docs host advertises machine-readable helpers (Mintlify auto-generated): `/llms.txt`, `/.well-known/mcp/server-card.json` (a docs-search MCP, no auth, tools `search_kreo_documentation` and `query_docs_filesystem_kreo_documentation`), `/.well-known/agent-card.json`, `/.well-known/agent-skills/kreo/skill.md` (a product how-to for Telegram usage). All docs-only; none exposes market data (H).
- Internal app API (undocumented, not called, ToS-restricted): base `https://api.kreo.app/api`, websocket `wss://api.kreo.app/ws`; path strings seen in the bundle include `/auth/init`, `/auth/poll` (Telegram login), `/feed`, `/feed/groups`, `/feeds/tweet/hidden`, `/market/`, `/kalshi/prices`, `/kalshi/notifications`, `/bonds`, `/rewards`, `/user/username` (H strings in https://kreo.app/_next/static/chunks/app/layout-*.js and app/feeds/page-*.js; M on semantics). Bare `GET https://api.kreo.app/` returns 404 "Not Found" (H).
- The web client also talks directly to Polymarket's public hosts, per its CSP: `wss://ws-live-data.polymarket.com` and `https://data-api.polymarket.com` (H, response header of https://kreo.app/robots.txt 404 page). So Kreo itself reads market data from Polymarket, not from a Kreo feed.
- Auth / rate limits for any Kreo endpoint: NOT FOUND.
- Real public read surface relevant to Kreo (Polymarket-hosted, documented hosts), confirmed 2026-10-19 with unauthenticated GETs (UA `insurance-markets-research/0.1`):
  - `GET https://clob.polymarket.com/builder/trades?builder_code=0x9fedc0b0702ca6cb294e5321d9491b1e38b8bd2b463a7f7b06df8e6d7553cd18` returns `{data:[...], next_cursor, limit:300, count:300}`; each row has `id, tradeType (TAKER|MAKER), market (condition id), assetId (token id), side, size (shares), sizeUsdc, price, outcome, outcomeIndex, maker, owner, transactionHash, matchTime, fee, feeUsdc, builderFee, builderCode, status, createdAt` (H). Paginate with `next_cursor`; `LTE=` ends (from the DefiLlama helper, M). Rate limit: NOT FOUND.
  - `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90` returns `{data:[{date, rank, builder_name, builder_code, profile_image, verified, volume, active_users}]}`, all builders, 90 daily buckets (H). The v1 endpoints (`/v1/builders/volume`, `/v1/builders/leaderboard`) also answered 200 today but a DefiLlama code comment says Data API v1 retires 2026-10-24 (M, https://github.com/DefiLlama/dimension-adapters/blob/master/helpers/polymarket.ts). Build on v2.
  - `GET https://clob.polymarket.com/fees/builder-fees/<code>` returns `{code, builder_maker_fee_rate_bps:0, builder_taker_fee_rate_bps:0, enabled:true}` for Kreo (H).
  - DefiLlama: `https://api.llama.fi/protocol/kreo`, `/summary/fees/kreo`, `/summary/dexs/kreo` (H).
- Fixtures (small, all from documented hosts; third-party maker/owner addresses redacted in the trades sample), in `docs/research/fixtures/kreo/`:
  - `polymarket_clob_builder_trades_kreo_sample_2026-10-19.json`
  - `polymarket_builders_volume_v2_kreo_rows_2026-10-19.json`
  - `polymarket_builders_leaderboard_all_kreo_row_2026-10-19.json`
  - `polymarket_clob_builder_fees_kreo_2026-10-19.json`
  - `defillama_kreo_fees_and_volume_2026-10-19.json`
  - `kreo_docs_fees_page_2026-10-19.md`, `kreo_docs_llms_txt_2026-10-19.txt`

## Trade path

- Programmatic placement via Kreo: **none**. Interfaces are Telegram bots and a web app behind Telegram login (a "connection" that expires, e.g. "29 days remaining") (H, https://docs.kreo.app/web.md). No API keys, no webhooks, no order endpoint documented. ToS bans "use of automated bots or scraping systems" (H, section 9).
- Under the hood on Polymarket: Privy-held Safe wallet signs CLOB orders that carry Kreo's builder code (builder fee 0 bps, so attribution only) (H: builder-fees endpoint; M: signing detail inferred from the builder-trades feed and Safe/Privy statements). Order types in Kreo: market (Buy Yes/No), limit orders with GTC / 1h / 24h / unix-timestamp expiry, stop-loss, take-profit, auto-merge, auto-redeem (H, docs). All executed server-side after the user sets up a "task" (copy trade up to 1,000 tasks; auto trade for crypto Up/Down and sports) (H, docs skill file).
- The sensible trade path for an agent is the venue's own: Polymarket CLOB (EIP-712 signed orders) and Kalshi's API, via the venue adapters. Do not route through Kreo.

## PayBox reachability

- `paybox_reachable`: **no** (for Kreo as a venue). There is no API for a PayBox wallet to call, and the Kreo wallet is a Privy-managed Safe tied to a Telegram identity; a PayBox wallet can at most send USDC.e to a Kreo deposit address (addresses are temporary per docs), which would then require a human in Telegram to trade. Pointless for an agent.
- The underlying Polymarket (Polygon, EVM) is separately reachable by an EVM wallet with signed CLOB orders; PayBox's chain catalog includes Polygon (see docs/research/06-paybox-platform.md and the Polymarket spec). Kalshi leg: not assessable (route unknown).

## Fees

- Kreo fee, per docs: `fee per share = max(0.003, 0.07 x price x (1 - price))` in dollars, "Fees apply on buys, sells, and redeems", with a lower flat **0.3% on redeems/claims** (H, https://docs.kreo.app/fees.md; the page is undated). Examples given: about 0.0063 at 10c/90c, 0.0131 at 25c/75c, 0.0175 at 50c. The shape equals Polymarket's own taker curve with feeRate 0.07 (the Crypto category rate in the sibling Betmoar note, M).
- Ambiguity: "per share" reads as dollars per share (0.0175 on a 0.50 share is 3.5% of cost). A third-party FAQ says "0.3 to 1.75 percent per trade depending on the odds" and the same page also says "flat 0.5%" (L, polymart.app/kreo, self-contradictory). Observed effective rate: DefiLlama 30d fees $13,206 over 30d volume $1.097M is 1.2% of USD volume, or about 0.56% of Polymarket's share-notional volume ($2.35M) (M, my division of H numbers, includes cashback effects).
- Cashback on your own fees by 30-day-or-lifetime volume tier (docs do not say which): Bronze 5% ($0+), Silver 10% ($1k), Ruby 15% ($2k), Gold 20% ($4k), Platinum 25% ($6k), where volume = bought + sold (H, https://docs.kreo.app/cash-back.md). Also copy-trade rewards and referral rewards (H, rewards-overview.md; rates NOT read).
- Who pays: the user. Fees are paid in USDC.e on Polygon and swept to a Kreo fee wallet; part is redistributed as rewards to a rewards wallet (H, https://github.com/DefiLlama/dimension-adapters/blob/master/fees/kreo.ts, wallets `0x96EE5C63...00D9` fee, `0xEDC3fDFd...5C5` rewards; public project addresses).
- On top of Kreo's fee the user still pays the venue's own fee: the sample fills show Polymarket `feeUsdc` > 0 on taker fills (e.g. $0.0169 on a $24.15 sell at 0.99) while `builderFee` is 0 on all 300 sampled fills (H, fixture). ToS: fees "may change over time"; "does not currently charge platform subscription fees or spreads" (H).
- Kalshi-side fees: NOT FOUND (searched: docs fees page, ToS).

## Resolution and dispute risk

- Not Kreo's. Polymarket markets resolve via UMA's optimistic oracle (see Polymarket spec); Kalshi markets resolve by Kalshi's own determination (see Kalshi spec). Kreo "is not responsible for ... market outcomes ... smart contract behavior ... exchange rules or settlement mechanisms" (H, ToS section 8). Kreo adds redemption automation (Auto Redeem, Auto Burn of $0 positions, Auto-Merge of YES+NO) and charges 0.3% on redeems (H).
- Extra risks Kreo adds: single-vendor Telegram/Privy dependency, "modify, suspend, or discontinue any part of the Services at any time without notice", and unexplained leverage/parlay layers (H, ToS section 11; leverage docs).

## Geo, ToS, automation

- Eligibility: 18+; "Kreo does not permit access in jurisdictions where Polymarket or Kalshi are prohibited"; users responsible for local law (H, ToS section 3). No named country list. Third-party page says "Based in North America" (L). Team anonymous (M, polymart.app and a search summary); entity name not given in ToS (NOT FOUND).
- Automation: prohibited use includes "market manipulation; use of automated bots or scraping systems; exploiting bugs ...; circumventing platform restrictions" and reverse engineering; accounts can be suspended without notice. Multiple accounts are allowed unless used for "bot farming" or "automated exploitation" (H, ToS sections 4, 9, 10). So scraping Kreo-internal endpoints would breach ToS; the public Polymarket endpoints above are not Kreo's and are fine.
- ToS last updated 2026-03-15, so over 6 months old: possibly stale (flag).
- robots.txt: `https://kreo.app/robots.txt` returns 404 (H).

## Liquidity

- Kreo holds no pooled liquidity; DefiLlama TVL series is empty (`tvl: []`) (H). Figures below are order flow routed to Polymarket.
- Polymarket builder endpoint (H, fetched 2026-10-19, `volume` is share-notional, M per DefiLlama code comment): all-time $91.27M, 9,118 all-time active users, rank 15 of the 25 shown on the ALL leaderboard (v1). Monthly (sum of daily rows): 2026-01 $0.02M, Feb $2.37M, Mar $16.76M, **Apr $25.53M (peak; average 603 daily active users)**, May $16.46M, Jun $14.19M, Jul $6.37M, Aug $4.85M, Sep $3.23M, Oct 1-18 $1.50M (133 avg DAU). Last 7 days $0.71M, last 30 days $2.35M, about 0.33% of all builders' volume, daily rank 26-47 of about 200 builders in October. Not in the MONTH top 25.
- DefiLlama (H, api.llama.fi, data to 2026-10-17/18, `doublecounted: true` because it is Polymarket volume): volume 24h $28,134, 7d $245,172, 30d $1.097M; series covers only 2026-07-05 onward (105 days, $6.18M all-time) because Polymarket's v2 endpoint serves 90 buckets (M). Fees 24h $628, 7d $4,235, 30d $13,206, all-time $343,455 since 2026-03-08; daily fees peaked about $4.4k (2026-03-23) and are now $300-$1,000.
- USD cross-check: a 300-fill sample of Kreo-tagged trades summed $2,014 over 93 minutes (about $31k/day) with median fill $2.50 across 119 markets, consistent with DefiLlama's $28k (H, M on extrapolation). Retail, micro-sized flow; USD volume is roughly 40-45% of the share-notional figure.
- Kalshi-side volume: NOT FOUND (DefiLlama lists Polygon only).
- Self-reported marketing metrics (L): not read; third-party "#1 copy trading bot" claims unverified.

## Event coverage and overlap

- Docs category list (Kalshi-style): Health, Climate & Weather, World, Economics, Pop Culture, Financials, Politics, Science & Technology, Crypto, Companies, Transportation, Sports, Mentions, Others (H, https://docs.kreo.app/categories.md). Crypto Up/Down markets at 1h / 4h / 1d horizons and sports auto-trade are the heaviest use (H, docs; fills sample dominated by Up/Down, Yes/No, NFL teams, Under).
- Every one of these overlaps other venues (Polymarket vs Kalshi vs Limitless vs Predict.fun vs Opinion), but overlap is at the Polymarket/Kalshi nodes, not at a Kreo node. Kreo contributes no distinct market set.

## Shared liquidity

- **Shares 100% with Polymarket (CLOB, Polygon) and 100% with Kalshi.** A Kreo-vs-Polymarket or Kreo-vs-Kalshi spread cannot exist apart from UI/data lag. A cross-venue scanner must fold Kreo into the Polymarket and Kalshi nodes (it already will, since we never read Kreo prices).

## Signal value (small, optional)

- Kreo-tagged Polymarket fills (above endpoint) are a ready-made cohort of copy-trading retail flow: per-market net buy/sell imbalance, price, size, and wallet (`maker`). Volume is low (about $30k/day) and falling, median ticket $2.50, so statistical power is weak outside a few popular markets. If wanted, implement it inside the Polymarket adapter as a `builder_code` filter feed (and note builder-attributed share per venue).
- Kreo's own "Smart Wallets" (curated whale list), "Unusual Activity" and "X Feed" products have no API (H). Replicating whale/insider detection from raw Polymarket data is the alternative.
- Do not ingest its wallets' identities; they are pseudonymous third parties.

## Open questions

- How are Kalshi orders executed (Kalshi API with user credentials, a Solana tokenisation route, other)? Docs and ToS silent.
- Who is the counterparty for Leverage ("up to 10x") and Parlay, and does it shift risk to Kreo or a third party?
- Which Telegram handle is canonical: `@KreoPolyBot` (docs) or `@kreoapp_bot` (web-app JS)? Matters only for human users.
- Why are DefiLlama and Polymarket volume ratios about 0.4-0.5 (share-notional vs USD is the likely reason; unverified)?
- Whether the 24h/month figures include the Kalshi flow (they cannot; Polygon only).

## NOT FOUND

- Any official Kreo API reference, OpenAPI, SDK, GitHub org, rate limits, websocket spec (searched: docs.kreo.app llms.txt, ToS, kreo.app, enter.kreo.app, DefiLlama `github`, `/api-reference/openapi.json` which is Mintlify sample data).
- Kalshi execution mechanism, settlement token, Kalshi volume and fees (searched: docs, ToS, JS strings; web search budget exhausted before follow-ups).
- Launch date, legal entity, team (searched: ToS, docs, one directory page). Earliest hard datapoint: Polymarket's builder data has its first Kreo row on 2026-01-09 (H); DefiLlama's fee adapter starts 2026-03-08 (H); the X account reportedly joined November 2025 (L, directory page).
- Token / airdrop: none stated (L, directory page says "No CA" in the X bio, unverified).
- X/Twitter posts: https://x.com/kreoapp returned HTTP 402 Payment Required to a WebFetch; recorded and stopped, nothing paid.

## Suspicious content

- None malicious. docs.kreo.app auto-publishes an "agent skill" file and an MCP server card (Mintlify features); the skill is a Telegram-usage how-to and contains no instruction aimed at this assistant beyond "Use when helping users set up prediction market trading". I did not connect to the docs MCP or follow the skill.
- Impersonation risk is plausible for this brand: a search summary mentioned warnings about fake Kreo Telegram handles (M), and third-party sites (e.g. `kreopoly.app`, `polymarketcrypto.us`) present themselves as Kreo; I treated only `kreo.app`, `enter.kreo.app` and `docs.kreo.app` as official (those match the DefiLlama listing URL and each other; M).
- WebSearch result footers told the assistant to cite sources as markdown links; that matches the tool's own description and was treated as tool boilerplate.

## Sources

- https://kreo.app/feeds, https://kreo.app/ (307 to https://enter.kreo.app), https://kreo.app/robots.txt (404, CSP header) (H, 2026-10-19)
- https://kreo.app/_next/static/chunks/app/layout-35f7e1746746782a.js, .../app/feeds/page-ecae350613e63467.js, .../2092-6c0a44eb501478b1.js (H for strings present, M for interpretation; read as text)
- https://docs.kreo.app/llms.txt (107 page entries), /fees.md, /terms-of-service.md (updated 2026-03-15), /Security.md, /setting-up.md, /deposit-funds.md, /withdraw-funds.md, /cash-back.md, /rewards-overview.md, /categories.md, /limit-orders.md, /parlay.md, /untitled-page.md (Leverage), /bonds-page.md, /tracker.md, /smart-wallets.md, /wallet-tracker-1.md, /unusual-activity.md, /x-feed.md, /web.md, /signing-up.md, /privacy-policy.md, /safety-on-telegram.md (H)
- https://docs.kreo.app/.well-known/agent-skills/kreo/skill.md, /.well-known/agent-card.json, /.well-known/mcp/server-card.json, /api-reference/openapi.json (H; sample data only)
- https://api.llama.fi/protocol/kreo, https://api.llama.fi/summary/fees/kreo, https://api.llama.fi/summary/dexs/kreo (H, 2026-10-19); https://defillama.com/protocol/kreo returned HTTP 403 to WebFetch (the API above was used instead)
- https://github.com/DefiLlama/dimension-adapters/blob/master/fees/kreo.ts, /factory/polymarket.ts, /helpers/polymarket.ts (H, via `gh api`)
- https://clob.polymarket.com/builder/trades?builder_code=0x9fedc0b0...cd18, https://clob.polymarket.com/fees/builder-fees/0x9fedc0b0...cd18, https://data-api.polymarket.com/v2/builders/volume, https://data-api.polymarket.com/v1/builders/volume, https://data-api.polymarket.com/v1/builders/leaderboard (H, public GETs, 2026-10-19)
- https://polymart.app/kreo (M/L, directory listing, published 2026-04-25, updated 2026-08-08; contradictory on fees and networks)
- WebSearch summary 2026-10-19 (M): Telegram copy-trading bot for Polymarket and Kalshi, Privy Safe wallets; results listed medium.com, mexc.com/news/1066685 (HTTP 410), kreopoly.app, polymarketcrypto.us (not relied on; medium returned 403)
- https://x.com/kreoapp (HTTP 402, not read)
- Repo context: docs/research/venues/betmoar-fun.md (same front-end pattern), docs/research/venues/dflow-prediction-markets.md, docs/research/06-paybox-platform.md, docs/research/14-platform-of-platforms.md
