# Pariflow (pariflow.com): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public web pages, public static JS bundles, public docs, and one public unauthenticated GET to Polymarket's Gamma API for a liquidity-source check. No account, no key, no wallet, no POST, no browser automation, nothing signed or paid. Scripted requests used the User-Agent `insurance-markets-research/0.1`. `/api/*` on pariflow.com was NOT requested (its robots.txt disallows it for all agents, including named AI crawlers).

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "(summarised)" means the page was read through the WebFetch summariser; everything else was read as raw HTML/JS by curl.

## Verdict

**adapter_priority: skip.** Pariflow is live, but it is not an independent liquidity leg and has no public read API.

1. **It mirrors Polymarket.** Every event in the pariflow.com SSR payload (42 of 42 on the homepage, 32/32 on /crypto and /elections, 60/60 on /esports) carries `"source":"POLYMARKET"` and a `polymarketId`; every outcome carries a `polymarketOutcomeId` (a Polymarket CLOB token id). The site's own JS opens `wss://ws-subscriptions-clob.polymarket.com/ws/market` from the browser and names its price sources `polymarket-clob-ws` / `polymarket-clob-book`. Pariflow outcome probabilities are identical to Polymarket's `outcomePrices` to 4 decimals. [H, home HTML + static chunks + Gamma API, fixtures `price-parity-vs-polymarket-event-30829.json`, `home-ssr-initialEvents-sample.json`]
2. **The $51.8M headline is not Pariflow volume.** For the 5 events checked, Pariflow's displayed `volume` is 3.98% to 4.01% of Polymarket's `volume` for the same `polymarketId` (e.g. 51.81M vs 1,295.09M). It is a scaled copy, not independent turnover. [H, computed, fixture `volume-ratio-vs-polymarket.json`] The hint's suspicion (mirrored from another venue) is confirmed.
3. **No public API.** Docs say API access "is not an open self-serve surface", gated by use case, jurisdiction and compliance review; the Authentication and Market Data pages contain no endpoints. The only documented programmatic path is a per-user agent key (MCP/CLI) that needs a logged-in, ToS-accepted account. [H, docs.pariflow.com/developers/*]
4. **Custodial internal ledger, KYC-gated, withdrawals admin-approved.** No user-signed on-chain orders. [H, JS i18n strings + Terms]

**Revisit trigger:** a published OpenAPI/endpoint list on docs.pariflow.com (Market Data page currently has none), or evidence of non-Polymarket-sourced markets. Everything seen so far is `source: POLYMARKET`.

## 1. Is it still live?

- pariflow.com returns HTTP 200 on 2026-10-19 with fresh content (`last-modified` same day); footer says "All systems operational"; docs.pariflow.com 200; sitemap lastmod 2026-06-08. [H]
- Terms/Market Rules/Execution policy all "Last updated Feb 23, 2026"; Responsible Trading Jun 8, 2026; blog posts dated up to Sep 5, 2026. [H]
- Launch date: not stated by Pariflow. Every Polymarket-mirrored event in the SSR payload has `createdAt` 2026-02-25 (bulk import), Wikidata Q141052079 gives inception "2026", legal docs date from Feb 2026. So launch is most likely around Feb 2026. The hint's "launched late 2025" (Bonus.com, page returned 403 to me) is NOT confirmed. [M]
- Entity: Wikidata description "Prediction market and event trading platform". Team undisclosed; the PolyMart listing (Aug 16, 2026) flags undisclosed team, no CFTC registration, few mixed Trustpilot reviews (directory sells placements, treat as L). [L, https://polymart.app/pariflow, summarised]

## 2. Kind and market model

- Kind: custodial web broker / front-end over Polymarket's catalog and CLOB prices, plus a separate leveraged perps product. [H/M]
- Event record shape (SSR, camel-case): `id, title, description, rules (null), category, categories[], resolutionDate, createdAt, imageUrl, volume, betCount, commentCount, liquidity, yesOdds, noOdds, type, source, polymarketId, slug, outcomes[{id, name, probability, polymarketOutcomeId, imageUrl}]`. `type` is one of `BINARY`, `MULTIPLE` (one market, many outcomes), `GROUPED_BINARY` (event of binary sub-markets). `liquidity` is 0 on 41 of 42 homepage events (not a real depth number). [H, fixture]
- Outcomes: shares priced 1c to 99c, winners settle at $1.00, losers $0. Docs: "A 68c price is a probability-style quote". Multi-outcome prices "may not add up cleanly to 100%". [H, https://docs.pariflow.com/markets/how-markets-work, /reference/faq]
- Order types per Pariflow's own blog: market and limit orders, early exit when liquidity allows. [M, https://pariflow.com/blog/how-to-create-your-first-prediction-market-trade]
- Tokenisation: Pariflow's outcome ids are internal cuid strings (`cmm2k...`); user positions are ledger entries, not user-held ERC-1155. The Polymarket token id is the join key to the real book. [H for ids, M for ledger inference]
- Categories on nav: Trending, New, Perps, Sports, Esports, Business, Crypto, Culture, Economy, Elections, Finance, Politics, Science, Tech, World. Crypto "Up/Down" hub covers BTC, ETH, SOL, XRP, DOGE, BNB, HYPE over 5m/15m/1h/4h/1d windows (Polymarket-titled markets filtered client-side). [H, bundle]
- Perps (own product): long/short crypto and stocks with leverage, isolated margin, hourly funding, oracle price from "external exchanges", fee on position size at open and close plus funding, bonus funds cannot be used. Venue behind the perps (own engine vs routed) NOT FOUND. [H, i18n strings in bundle]

## 3. Chains and collateral

- Collateral: USDC (shown as USDC.e on the Polygon wallet-send path). Client strings: "You have funds in USDC (native), not USDC.e"; "You need POL to cover gas". [H, static chunk `1c5e4bt3ufe56.js`]
- Deposit: "Connect Wallet (MetaMask / WalletConnect)": "Wallet-send deposits are currently available on Polygon only"; "Your custodial deposit address is applied automatically". Other listed methods: Transfer crypto, Card ($50,000), SEPA, Connect Exchange, PayPal ($10,000), some marked "Coming Soon". [H, bundle]
- The About page and a Sep 5, 2026 blog claim a "Multi-Chain Deposit Gateway" with native USDC on Polygon, Base, Arbitrum, BSC and Ethereum, and "Non-Custodial Account Options" (Web3 wallet, passkey). [H that the claim is made; L as a fact: it conflicts with the bundle strings above, which say custodial deposit address and Polygon-only wallet-send]
- Withdrawal: "Send USDC to a Polygon wallet", min $1.00, daily limit, passkey or TOTP required, "Withdrawals require admin approval after submission", KYC documents with a timer before unlock. [H, bundle]
- Tron / USDT: NOT FOUND (searched: pariflow.com pages and static bundle for TRC20/Tron/USDT; web search "Pariflow Tron USDT"). The QuickNode "Polygon PoS and Tron" claim from the discovery hint is unconfirmed; Polygon is confirmed.
- Settlement of positions: internal ledger credit. The docs never mention a smart contract, escrow address or token. Third-party text claiming "audited smart contracts" and "Layer-2" is generic (valuethemarkets, Mar 12, 2026) and unsourced. [L]

## 4. Read API

**exists: official-authenticated (gated).** [H]

- Docs: https://docs.pariflow.com/developers/overview , /developers/authentication , /developers/market-data , /developers/agent-mcp-cli (sitemap lastmod 2026-06-08).
- Overview: "API access is not an open self-serve surface. Access may depend on use case, account status, rate limits, jurisdiction, and compliance review." Four permission areas: market data, user-authorised data, webhook verification, trading. [H, summarised]
- Market Data page: lists concepts only (market ID, outcome ID, displayed price, order book context, market state, updated time). No base URL, paths, parameters, fields, websocket channels or rate-limit numbers anywhere in the docs. NOT FOUND (searched: all 12 docs pages as raw text, docs sitemap, /llms.txt and /openapi.json on docs host return 404).
- Key (human-created) at Settings > Agent access; env vars `PARIFLOW_BASE_URL=https://pariflow.com`, `PARIFLOW_API_KEY`; config in `~/.pariflow/agent.json`. Read keys cannot trade. Rate limits exist ("Rate limit exceeded" error) with no numbers. [H, agent-mcp-cli page]
- MCP: local stdio only (`pariflow-agent mcp`), no remote MCP URL. Tools: `get_account_summary`, `get_top_trades` ("largest mapped trades for a date window"), `search_markets`, `preview_trade`, `list_orders`, `get_strategy_status`, `list_strategies` (read); `prepare_trade_target`, `place_trade`, `create_strategy`, `start_strategy`, `pause_strategy` (trade). Also a `get_started` tool. [H]
- Websocket: none documented. The About page promises "Real-Time WebSocket Streaming", but the shipped bundle's only socket seen is the browser connecting straight to Polymarket's CLOB WS. A `/api/realtime/auth` route exists in the bundle (purpose unknown). [H/M]
- Undocumented internal routes seen in the bundle (NOT probed, `/api/` is robots-disallowed, not an integration surface): `/api/events`, `/api/events/search`, `/api/events/{id}`, `/api/events/{id}/odds-history`, `/api/live/events`, `/api/home/discover`, `/api/up-down/hub`, `/api/esports/*`, `/api/odds/demand` (POST), `/api/odds/client-ack` (POST), `/api/auth`, `/api/user/*`. [H that they are referenced]
- Fixtures: no API response shape could be confirmed without credentials. Saved the public SSR payload shape instead (see Fixtures).
- Better read path for the scanner: skip Pariflow and read the same data from Polymarket (Gamma `GET https://gamma-api.polymarket.com/events/{polymarketId}` returned 200 during this check). Covered by the parallel Polymarket workflow.

## 5. Trade path

- Only documented programmatic trading: agent key with "trade" permission, via MCP tools or `pariflow-agent` CLI. Flow: `search_markets` > `prepare_trade_target` > `preview_trade` (LIVE preview returns short-lived `quoteId` + `quoteExpiresAt`) > `place_trade` with `confirm: true`. `--account-mode DEMO|LIVE`. Scheduled strategies are DEMO-only (`DEMO_ONLY_AUTOMATION`). Balance, order-size, daily-volume, exposure and rate limits enforced server-side. [H]
- The raw REST contract behind the CLI is not published. The CLI is fetched by `curl -fsSL https://pariflow.com/api/agent/install | sh`; I did not fetch or run it (pipe-to-shell; `/api/` robots-disallowed). Reading that script would reveal the REST paths; do that only if the project ever decides to integrate. [H that it is documented]
- No user-signed order scheme (no EIP-712, no L2 API key derivation) is documented. Auth is a bearer-style API key tied to a KYC'd account. [H for absence in docs, M for scheme]

**PayBox reachability: partial.** A PayBox EVM wallet on Polygon could in principle fund an account by sending USDC/USDC.e to the per-user custodial deposit address (transfer, not an order). Trading itself cannot be proposed or signed from the wallet: orders are API calls under an account key that a human must create after signing up, accepting Terms and passing KYC. Withdrawals are admin-approved. No transaction-proposal or signed-order path exists. Not worth building.

## 6. Fees

- Trading fee: not published. Docs/FAQ: "Fees, if applicable, should be shown before confirmation"; order preview shows "spread or other displayed trading cost". Reviews: GamingToday (summarised via search) says no fee schedule found; PredictGeek (Jul 15, 2026) says "verify in-app"; "1% to 2% of profits" claims are third-party and unsourced. NOT FOUND for an authoritative formula. [H for absence, L for numbers]
- Deposit: a fee "applied upon deposit crediting"; the percentage is a runtime parameter (`{fee}`), value NOT FOUND. Gas paid by the user (POL on Polygon). [H]
- Withdrawal fee: NOT FOUND. Minimum $1, limits exist. [H]
- Perps: fee on position size at open and close (shown as "Est. fees"), plus hourly funding. Rates NOT FOUND. [H]
- Promo: 100% first-deposit match up to $50, 2x playthrough, withdrawals locked while playthrough is active, bonus principal not withdrawable. This also inflates turnover. [H, https://pariflow.com/blog/prediction-market-deposit-bonus]
- Because Pariflow's price is the Polymarket price, any Pariflow-only fee or spread makes it strictly worse than trading the same token on Polymarket.

## 7. Resolution and dispute risk

- Pariflow decides, not an on-chain oracle. Market Rules (Feb 23, 2026): source hierarchy is "designated primary source, designated backup source, reputable official publication, then discretionary adjudication by Pariflow". It may delay settlement, "reopen adjudication, adjust outcomes, and rebalance settlements" after settlement, apply provisional then final states, and cancel markets with "refund or zero-net payout logic". The `rules` field is `null` in the SSR payload, so per-market rule text is not exposed in the list data. [H, https://pariflow.com/legal/market-rules]
- Execution & Error Trade Policy: Pariflow may "bust, amend, reverse, offset, rebook, or reprice trades" for manifest error, "stale source execution", "latency exploitation", with no entitlement to compensation. Settlement postings can be corrected after posting. [H, https://pariflow.com/legal/execution-error-trade-policy]
- Docs add: "winning outcome usually settles at 100c"; settlement credited only after accounting runs; markets can be "canceled or voided". [H]
- Whether a mirrored market follows Polymarket's (UMA) resolution is NOT FOUND. Treat divergence as possible: a Pariflow position and a Polymarket position on the "same" outcome are not guaranteed to settle the same way, which breaks the risk-free premise of cross-venue arbitrage.
- Forum: laws of England and Wales, LCIA arbitration in London, 45-day pre-dispute process, class waiver, 1-year claim limit, liability cap lesser of 12 months' fees or USD 100. [H, Terms s.25-31, /legal/regulatory-disclosures]

## 8. Geo, ToS and automation

- Eligibility: 18+, KYC/AML/source-of-funds on request, sanctions screening using "IP intelligence, device telemetry, geolocation"; VPN, proxy, remote desktop and spoofed geolocation "strictly prohibited". Restricted-jurisdiction list is not published ("dynamic, may be updated at any time"). [H, https://pariflow.com/legal/jurisdiction-eligibility]
- Regulatory posture: "Pariflow may operate globally through separate legal entities where available"; not a CFTC DCM (Pariflow's own comparison table: "Not a U.S. designated contract market"). A Mar 2026 third-party review says US/UK geo-blocked (L). [H/L]
- Automation: Terms s.15 prohibits "scraping abuse", "reverse engineering", "abusive automation", "latency exploitation" (Execution policy). Official automation is explicitly allowed through scoped agent keys (MCP/CLI); direct LIVE orders allowed, scheduled strategies DEMO-only. Terms s.6: everything done with your API key is deemed authorised. [H]
- robots.txt (pariflow.com): all named AI crawlers and `*` get `Allow: /` but `Disallow: /api/`, `/admin/`, `/auth/`, and an unexplained hidden path. Honoured. Docs host robots: `Allow: /`. [H]

## 9. Liquidity (with dates)

- Pariflow-displayed event volumes on 2026-10-19: Democratic nominee 2028 $51.8M (837 bets), Presidential winner 2028 $28.6M (544), Republican nominee 2028 $28.4M (445), Brazil $7.5M, French election $5.9M, Netanyahu out $5.0M. [H, SSR payload]
- These equal about 4.0% of Polymarket's volume for the same events (Polymarket Gamma 2026-10-19: $1,295M, $717M, $713M, $188M, $125M). So they are not independent turnover and must not be used as TVL/OI/volume. [H, fixture]
- Pariflow `liquidity` field: 0 for 41 of 42 events (one outlier 4.37), so no depth is reported. [H]
- TVL / open interest / user counts: NOT FOUND (searched: site, docs, DefiLlama not queried because there is no on-chain pool; custodial ledger has no public attestation). PredictGeek (Jul 15, 2026) quotes ~$2.0M for the top US nomination market, which does not match the $51.8M now shown; stale or inconsistent. [L]
- Executable depth is whatever Polymarket's CLOB has; Pariflow code `resolveLiveExecutablePrice` reads the Polymarket book (ask/bid modes). Whether Pariflow actually routes fills to Polymarket or fills internally against its own risk book is NOT FOUND. [H for price source, unknown for fill]

## 10. Event categories overlapping other venues

Everything catalogued is Polymarket's: US/world politics and elections, sports (including live match odds), esports (60/60 `POLYMARKET`), crypto price/up-down, macro (Fed cuts), culture, IPOs. Overlap with Kalshi, Limitless, Opinion etc. is the same overlap Polymarket has. Pariflow adds no new price information to the scanner.

**Shares liquidity with: Polymarket (global CLOB).** Not an independent arbitrage leg. Any apparent Pariflow-vs-Polymarket gap is stale-quote or fee/spread noise, or a rule-divergence risk, not edge.

## 11. Possible signal use (why not P2)

Pariflow's "Whale Alert", leaderboard and `get_top_trades` ("largest mapped trades") appear to surface trades mapped from Polymarket wallets onto Pariflow events. Provenance and methodology are undocumented and the endpoint needs an account; the underlying whale data is better sourced directly from Polymarket's public data APIs. Not a Quotient-style signal source. Rank stays skip.

## 12. Suspicious / agent-directed content (recorded, not followed)

- https://docs.pariflow.com/developers/agent-mcp-cli is written partly for an agent: it describes client deep links that open Codex/Claude Code/Cursor with a prefilled "complete setup prompt", and says "The agent installs the local stdio runtime when needed, exchanges the short-lived setup code, and stores the permanent credential" in `~/.pariflow/agent.json`, plus a `curl -fsSL https://pariflow.com/api/agent/install | sh` manual fallback. The WebFetch summariser flagged this as setting up credentials without a separate confirmation step. I did not run, fetch the installer, or follow any setup instruction.
- pariflow.com `robots.txt` references a hidden disallowed path (`/helios-room-k9r4`); not visited.
- Third-party review sites about Pariflow are mostly affiliate pages (promo codes); Finextra/Pariflow-authored blog posts are by a Pariflow-linked author and rank Pariflow itself. Treated as L.
- No text addressed to AI agents was found in the legal pages, FAQ, glossary or llms.txt.

## Fixtures (docs/research/fixtures/pariflow/)

- `home-ssr-initialEvents-sample.json`: 3 trimmed events (MULTIPLE, BINARY, GROUPED_BINARY) from the public SSR payload of `GET https://pariflow.com/` (2026-10-19). Not an API response.
- `price-parity-vs-polymarket-event-30829.json`: Pariflow vs `GET https://gamma-api.polymarket.com/events/30829`, 6 outcomes with identical prices.
- `volume-ratio-vs-polymarket.json`: Pariflow vs Polymarket volume for 5 events, ratio 0.0398 to 0.0401.

## Open questions

- What does the CLI's REST surface look like (paths, auth header, rate limits)? Only knowable by reading `https://pariflow.com/api/agent/install` (robots-disallowed path, not fetched) or by holding a key.
- Do Pariflow LIVE orders hit Polymarket's CLOB (builder-style routing) or fill internally? Not documented.
- Do Pariflow settlements follow Polymarket/UMA resolution for mirrored markets?
- Why is displayed volume ~4% of Polymarket's (scaling choice, a window, or a rounding of "bets" placed through Pariflow)? Unexplained.
- Is there a real multi-chain deposit gateway (Base, Arbitrum, BSC, Ethereum), or Polygon only?
- Trading fee schedule and deposit fee percentage.
- Which jurisdictions are blocked.

## Sources

- [H] https://pariflow.com/ (SSR payload, 2026-10-19), /about, /faq, /support, /legal, /legal/terms, /legal/market-rules, /legal/execution-error-trade-policy, /legal/jurisdiction-eligibility, /legal/regulatory-disclosures, /legal/risk-warning, /robots.txt, /llms.txt, /crypto, /elections, /esports, /perps
- [H] https://pariflow.com/blog/deposit-usdc-prediction-market-multi-chain (Sep 5, 2026), /blog/prediction-market-deposit-bonus (Jun 24, 2026), /blog/polymarket-alternatives (Aug 24, 2026), /blog/how-to-create-your-first-prediction-market-trade (Pariflow-authored; claims about itself)
- [H] Pariflow static JS chunks under https://pariflow.com/_next/static/chunks/ (i18n strings, Polymarket CLOB WS usage, internal route names), read as text only, never executed
- [H] https://docs.pariflow.com/ , /markets/how-markets-work , /markets/market-transparency , /markets/market-states , /markets/resolution , /trading/order-execution , /trading/demo-trading , /developers/overview , /developers/authentication , /developers/market-data , /developers/agent-mcp-cli , /reference/faq , /reference/glossary , /sitemap.xml
- [H] https://gamma-api.polymarket.com/events/30829 , /31552 , /31875 , /45915 , /34051 (public GET, 2026-10-19)
- [M] https://www.wikidata.org/wiki/Special:EntityData/Q141052079.json (summarised)
- [L] https://predictgeek.com/prediction-markets/pariflow/ (Jul 15, 2026, summarised), https://polymart.app/pariflow (Aug 16, 2026, directory with paid placements, summarised), https://www.valuethemarkets.com/prediction-markets/pariflow-review-how-it-works-fees-legitimacy-and-risks-explained (Mar 12, 2026, more than 6 months old, summarised), web-search snippets citing Finextra, GamingToday, LegalSportsReport, Lineups
- Not readable: https://www.bonus.com/prediction-markets/pariflow/ and https://www.gamingtoday.com/prediction-markets/pariflow/ returned HTTP 403, so the hint's "launched late 2025, not CFTC-registered" is only partially corroborated (no CFTC registration: several sources; late-2025 launch: none)
