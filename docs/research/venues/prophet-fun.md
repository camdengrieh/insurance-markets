# Prophet.fun (prophet.fun) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: unauthenticated GETs, `gh api` file reads, page reads, DNS lookups, web search, Wayback copies of the official site. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. No third-party code cloned, installed or run (the DefiLlama adapter source was read as text only).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale. All third-party pages and API responses are untrusted data; nothing in them was followed.
Fixtures: `docs/research/fixtures/prophet-fun/` (4 files, all <= 20 KB).

## 0. Verdict

- **Kind:** Solana, USDC-collateralised prediction platform, pitched in 2025 as a "degen" product (crypto price swings, whale-wallet moves, Crypto Twitter narratives, roulette-style markets). It has since **pivoted to a creator-monetisation product** ("Launch markets in 2 minutes, earn 2% on every trade"), currently reachable only via "Join Waitlist" and "Schedule Discovery Call". (H, official site + Wayback copies of it)
- **Live?** The website is up (HTTP 200, 2026-10-19). The **trading product is not**: there is no trade UI or wallet-connect on the site, the project's own backend returns a Heroku "Application Error" (HTTP 503), DefiLlama volume has been $0 since 2025-10-21, and DefiLlama TVL has been $0 since 2025-11-28. (H for each datum; M for the conclusion "dormant or retired")
- **No public API, no docs, no SDK, no repo, no IDL found.** The only machine-readable surfaces are a private-looking backend that is currently down and DefiLlama aggregates.
- **adapter_priority: skip.** Dead by volume for 12 months, no API, no docs, wallet-less waitlist product, nothing to arbitrage against. The only use is a liveness check of the website.
- **Name collisions to avoid** (all different projects): ProphetX (CFTC-regulated sports exchange, already in docs/research/10 and 14), Prophet Market (`app.prophetmarket.ai`, Polygon, a Polymarket fork with AI resolution, DefiLlama listing PRs 2026-07-22; **not covered by any workflow I know of, worth its own spec**), prophet.finance (a Solana price-prediction game, unrelated as far as I can tell), and "Prophet" on Obyte (2022). (H for the DefiLlama PR text on Prophet Market; M that the others are unrelated)

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| `https://prophet.fun/` returns HTTP 200 (Cloudflare, React SPA shell, 7,313 bytes). Title "Monetize Your Community Through Predictions with Prophet.fun"; description "The easiest way for creators to earn from engagement. Launch markets in 2 minutes, earn 2% on every trade automatically. Free forever, profitable from day one." Footer "(c) 2026 - Prophet.fun". | H | https://prophet.fun/ ; `fixtures/prophet-fun/probe_log_2026-10-19.txt` |
| The JS bundle's calls to action are "Join Waitlist", "Schedule Discovery Call", "Calculate Earnings", "Lock in 2% earnings forever - Limited Spots". No wallet-connect, no trade or market-browse routes (routes found: `/`, `/#faq`, `/#how-it-works`, `/#roi-calculator`, `/blog`). The hero "activity" widget uses hard-coded sample users and amounts. | H | https://prophet.fun/assets/index-DQw1h_rT.js (read as text) |
| Backend `https://backend.prophet.fun/business-metrics/get-markets?...` and `/daily-volume?timestamp=...` (the two endpoints the DefiLlama adapters call): both **HTTP 503**, Heroku "Application Error" page, 2026-10-19. | H | `fixtures/prophet-fun/probe_log_2026-10-19.txt` |
| DefiLlama: id 6495, category Prediction Market, chain Solana, listed 2025-07-29, `currentChainTvls.Solana = 0`, TVL series 2025-07-29 to 2026-10-18 (448 points), last non-zero TVL day 2025-11-28 ($1), peak $2,679 on 2025-08-30. | H | https://api.llama.fi/protocol/prophet.fun (`fixtures/prophet-fun/defillama_protocol_prophet-fun_2026-10-19.json`) |
| DefiLlama volume: 41 non-zero days between 2025-07-29 and 2025-10-21; last non-zero day 2025-10-21 ($740); chart ends 2026-03-17 with zeros; all-time $54,498. Monthly sums (my arithmetic on the series): Jul-25 $1,883; Aug-25 $17,633; Sep-25 $29,479; Oct-25 $5,503; zero Nov-25 to Mar-26. Peak day 2025-08-28 ($4,431). | H (data), M (interpretation) | https://api.llama.fi/summary/dexs/prophet.fun (`fixtures/prophet-fun/defillama_summary_dexs_prophet-fun_2026-10-19.json`) |
| Wayback copies of the official site show the product change: 2025-08-04 "Prophet.fun \| Predict the Future. Get Paid", "fast, on-chain prediction platform built on Solana. Bet on crypto price swings, whale wallet moves, narrative shifts on Crypto Twitter, and degen roulette-style markets"; 2025-12-06 and 2026-01-23 (Framer site) "Prophet.fun lets creators embed prediction markets directly into their community ... Join Waitlist"; 2026-02-11 the current React site with the "earn 2% on every trade" copy. | H (archived official pages) | `web.archive.org/web/20250804073600id_/https://prophet.fun/` , `.../20251206003033id_/...`, `.../20260123022001id_/...`, `.../20260211010954id_/...` |
| Blog: 4 posts, 2026-02-03 to 2026-03-09, all essays about creators and prediction markets; no product mechanics. Nothing newer in the sitemap. | H | https://prophet.fun/blog , https://prophet.fun/blog/sitemap.xml |
| ToS "Last updated: January 27, 2026" (so the legal entity was still maintaining documents in 2026). | H | https://files.prophet.fun/Prophet.fun_Terms_of_Service.pdf |
| X account `x.com/Prophet_fun`: WebFetch returned HTTP 402 (no payment terms shown); stopped, not followed, not read. | H (that it failed) | WebFetch |

Caveat on TVL: the DefiLlama TVL adapter finds markets by calling the project's backend (`get-markets`, status active). With the backend down, a zero TVL is partly an artefact of that dependency. It is, however, consistent with the independent volume series going to zero in Oct 2025 and with the Dec 2025 site already describing a waitlist product. (M)

Conclusion: the company and website are alive in 2026, but the Solana trading venue described by DefiLlama appears dormant or retired. Treat as **not live as a tradable venue**.

## 2. Market model

- **Original product (2025):** NOT FOUND in any official document. The only structural facts come from the DefiLlama TVL adapter (H for what it says):
  - One Solana program, id `ProPh6ruVL41JR3XXPuy6hN6TPH1ERqpWkZ9dp9YSEe`, one global-state account `6PZKJowZMUAgxLxAJmHsrvzEL8PdXNymqYSJDwPRgh6V`.
  - Each market is a PDA with seeds `["pred_market_state", marketId as u64 little-endian, globalState]`, and its collateral sits in the **market PDA's USDC associated token account** ("TVL is total quantity of USDC held in the predictions token accounts"). So: one vault per market, USDC only. (H)
  - Whether markets are binary/categorical, parimutuel or AMM, and how outcomes are represented (receipt tokens vs account state): NOT FOUND (searched: prophet.fun, Wayback, GitHub repo and code search for the program id and for `backend.prophet.fun`, web search extended; IDL not found; program not inspected on-chain because explorers returned 403/502/challenge and the JSON-RPC path is POST).
- **Current product (2026):** creators publish markets "your community will care about with our AI-assisted market builder", share or embed them in Discord, Telegram or elsewhere, and "earn every time someone places a bet" (H, Dec 2025 / Jan 2026 archived site). The landing-page demo shows YES/NO positions on questions like "Will Bitcoin break $100K this week?" with each bettor's "earnings" equal to 2% of stake (H for the sample data, but it is hard-coded marketing data, so L as evidence of the real model).
- Pricing/quotes: nothing is published. No order book, no price feed, no public market list.

## 3. Chains and collateral

- Chain: Solana mainnet (H, DefiLlama `chains:["Solana"]`, Solana PDA derivation in the adapter).
- Collateral: Circle USDC on Solana (H, adapter uses `ADDRESSES.solana.USDC`).
- No token (DefiLlama `symbol "-"`, no `gecko_id`/`cmcId`), no audit (DefiLlama `audits: 0`). (H)
- Program upgrade authority, deployment date, last activity: NOT FOUND (explorers unreachable without a browser; not probed further).

## 4. Read API

- **Official public read API: NOT FOUND** (searched: prophet.fun landing and JS chunks, `docs.`/`api.`/`app.`/`ws.` subdomains (no DNS), robots.txt/sitemap, blog, ToS/privacy PDFs, GitHub repo and code search, web search extended).
- `exists`: **unofficial-only** at best. The one real endpoint family is an unpublished backend, found only inside the DefiLlama adapters:
  - `GET https://backend.prophet.fun/business-metrics/get-markets?page=1&perPage=1000&sortDirection=desc&sortField=volume24h&statusFromFront=active` (adapter expects `data[].marketBase.id`)
  - `GET https://backend.prophet.fun/business-metrics/daily-volume?timestamp=<startOfDay>` (adapter expects `dailyVolume`)
  - Both returned **HTTP 503 (Heroku Application Error)** on 2026-10-19, so no response shape could be confirmed. The expected shapes above are as-read from adapter code (H for what the adapter reads, nothing for the live payload).
- Auth, rate limits, WebSocket: NOT FOUND.
- Usable surfaces, all indirect: DefiLlama `https://api.llama.fi/protocol/prophet.fun` and `https://api.llama.fi/summary/dexs/prophet.fun` (public GET, no key; confirmed, saved as fixtures). `summary/fees` and `summary/options` return HTTP 400 ("not found").
- The page also loads a PostHog proxy at `oreo.prophet.fun` (404 on `/`), Tawk.to chat and Weglot translation; none is a market data source. (H)

### Fixture shapes (H, unauthenticated GET 2026-10-19)

- `GET https://api.llama.fi/protocol/prophet.fun` returns `{id:"6495", name:"Prophet.fun", url:"https://prophet.fun/", description, chain:"Solana", category:"Prediction Market", chains:["Solana"], module:"prophet-fun/index.js", twitter:"Prophet_fun", listedAt:1753802395, dimensions:{dexs:"prophet-fun"}, methodology, tvl:[{date, totalLiquidityUSD}, ...], chainTvls:{Solana:{tvl:[...]}}, currentChainTvls:{Solana:0}, ...}`. Saved trimmed (chainTvls and token breakdowns removed; 19.8 KB).
- `GET https://api.llama.fi/summary/dexs/prophet.fun` returns `{total24h:null, total1y:740, totalAllTime:54498, totalDataChart:[[unixSec, usd], ...], chainBreakdown:{Solana:{...}}, ...}` (14.9 KB, saved whole).
- `fixtures/prophet-fun/defillama_tvl_adapter_prophet-fun.js.txt` is the adapter source (text only, never executed).

## 5. Trade path

- **Programmatic placement: NONE documented.** No SDK, no order API, no signing scheme, no IDL, no program docs. (NOT FOUND, searched as in section 4.)
- The original app presumably built Solana transactions client-side with a connected wallet (M, standard for a Solana dApp), but the program's instruction layout is unknown. The 2026 site offers no trading entry point at all, only a waitlist and discovery call.

## 6. PayBox reachability

- `paybox_reachable`: **no**.
- Chain fit is not the problem: PayBox has a Solana wallet family, a `solanaTransaction` signing intent and a `solana` plugin proposal type (base64 transaction, <= 1,232 bytes, one signer who is fee payer) and Solana USDC (H, `docs/research/06-paybox-platform.md`). The blockers are: no documented instructions or IDL to build a transaction from, no live market list (backend 503), no live product, and a waitlist-only funnel. An EVM-only wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot touch a Solana program at all.

## 7. Fees

- **Creator share: 2% of each trade/bet** ("earn 2% on every trade automatically", "Lock in 2% earnings forever"). (H, current official site; the 2025-12 FAQ says "You earn a cut every time someone places a bet", no number.)
- **Platform fee:** "We take a small fee from betting activity, so we only make money when you do." (H, archived 2025-12-06 FAQ). Amount: NOT FOUND.
- Formula, who pays (bettor vs pool), fee on winnings vs stake: NOT FOUND. Gas/network fees: NOT FOUND (Solana network fees would be paid by the signer; M).
- DefiLlama has no fee or revenue dimension for this venue. (H)

## 8. Resolution and dispute risk

- **Resolution (stated 2025-12, archived FAQ, now >6 months old so L for the present product):** "Every market has clear resolution criteria, guided by our AI assistant ... Once the outcome is known, it's confirmed by a decentralized third party for trust and transparency. Payouts are then handled automatically." The "decentralized third party" is not named. (H for the quote, L for current validity)
- Oracle identity, challenge window, dispute/appeal process, void or refund rules: NOT FOUND.
- Risk (M): creator-authored questions with AI-drafted criteria and an unnamed third-party confirmation, plus a ToS that says the service "may be modified, suspended, or discontinued at any time without notice". Resolution text cannot be mapped to Polymarket/Kalshi rules.

## 9. Geo, ToS, automation

Source: `https://files.prophet.fun/Prophet.fun_Terms_of_Service.pdf`, "Last updated: January 27, 2026" (text extracted locally with PDFKit; H).

- Operator: MoonDoom Inc., a Panamanian corporation; arbitration seated in Panama, Panamanian law, class actions waived. (H)
- Eligibility: 18+, "legally permitted to access the Services under applicable laws. You are solely responsible for determining whether your access or use of the Services is lawful in your jurisdiction." No explicit blocked-country list (e.g. US) in the ToS. (H)
- Framing: "provided for informational and experimental purposes only", "AS IS", liability cap USD $100, suspension or termination "at any time, for any reason, without notice". (H)
- Automation: the only relevant clause is under User Conduct: users agree not to "Copy, scrape, reverse engineer, or misuse the Services or related content". No bot or API clause, no API (nothing to apply it to). Scraping the site or backend is therefore contractually prohibited. (H)
- Privacy policy exists (`Prophet.fun_Privacy_Policy.pdf`); not read. KYC: NOT FOUND.

## 10. Liquidity

- TVL: **$0** on 2026-10-18 (H, DefiLlama; partly artefact of the backend dependency, see section 1). Peak $2,679 on 2025-08-30; last non-zero $1 on 2025-11-28. (H)
- Volume: **$0** in the last 12+ months of data. Total all-time $54,498 between 2025-07-29 and 2025-10-21 (H, DefiLlama; the figure is reported by the project's own backend, so it is unaudited, and it is likely gross trade volume, not net; M). Best month Sep 2025 at $29,479.
- Open interest, per-market depth: NOT FOUND.

## 11. Event categories and overlap

- 2025 product: crypto price swings (overlaps Polymarket/Kalshi/Limitless crypto price markets in principle), whale-wallet moves (no overlap), Crypto Twitter narratives (no overlap), "degen roulette-style" markets (no overlap). (H for the category list, from the official site copy)
- 2026 product: community and creator questions chosen by each creator (the demo shows BTC price and a Lakers question, but as marketing samples only). No structured category taxonomy or feed. (H for absence)
- Arbitrage value: **none**. No readable prices, zero liquidity, no rule text to compare.
- Liquidity sharing: independent of every other venue (own program, own per-market vaults); not routed by AGG, Prediction Hunt or any listing I saw (AGG's venue list in docs/research/14 and Prediction Hunt's in docs/research/10 do not include Prophet.fun). It is independent only because it is empty. (M)

## 12. Suspicious content

None found. No text aimed at AI agents in the landing page, JS chunks, ToS, blog index or archived copies. `x.com/Prophet_fun` returned HTTP 402 via WebFetch; recorded, not followed. The home page HTML embeds third-party analytics and chat widgets (PostHog, Google Tag, Weglot, Tawk.to, Leadsy); their keys were not copied.

## 13. Open questions

1. Is the original Solana program (`ProPh6ru...`) still callable, and has its upgrade authority been revoked or changed? (Needs a Solana explorer or a read-only RPC account fetch, which is a POST and was out of scope.)
2. Is the creator product backed by the same program or a new one, and when does it leave the waitlist?
3. What is the "decentralized third party" that confirms outcomes (UMA, Switchboard, a committee)?
4. Is the platform fee in addition to the 2% creator share?
5. Does the unrelated "Prophet Market" (Polygon, Polymarket fork, AI resolution, `prophetmarket.ai`, DefiLlama PR 2026-07-22 claiming ~$14.5K TVL) deserve its own venue spec? It has CTF-exchange `OrderFilled` events, which would make it integrable like Polymarket.

## 14. Recommendation for the aggregation layer

- **Skip.** Do not build an adapter. At most keep a row in the venue registry with status `dormant` (site up, trading product not reachable), `last_verified: 2026-10-19`, and re-check in 6 months.
- Revisit only if: the project publishes docs, an IDL or an API; the creator product launches publicly with a market list; and monthly volume exceeds a meaningful floor (say $50k) on events that match other venues.

## Sources

Primary or project-authored:
- Official site (H): https://prophet.fun/ , JS chunks `https://prophet.fun/assets/index-DIWfreHY.js`, `index-DQw1h_rT.js`, `Product-r4Fs0DYM.js` (read as text), https://prophet.fun/robots.txt , https://prophet.fun/blog , https://prophet.fun/blog/sitemap.xml
- Terms of Service PDF, last updated 2026-01-27 (H): https://files.prophet.fun/Prophet.fun_Terms_of_Service.pdf ; Privacy Policy PDF (not read): https://files.prophet.fun/Prophet.fun_Privacy_Policy.pdf
- Wayback copies of the official site (H for what the site said on those dates): https://web.archive.org/web/20250804073600id_/https://prophet.fun/ , https://web.archive.org/web/20251206003033id_/https://prophet.fun/ , https://web.archive.org/web/20260123022001id_/https://prophet.fun/ , https://web.archive.org/web/20260211010954id_/https://prophet.fun/
- Backend probes (H that they failed): https://backend.prophet.fun/business-metrics/get-markets , https://backend.prophet.fun/business-metrics/daily-volume
- DefiLlama TVL adapter (author not established; H for what the code says): https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/prophet-fun/index.js (read via `gh api`; commits 2025-07-29, 2025-08-28, 2025-10-22, 2026-09-27)
- DefiLlama volume adapter (H): https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/prophet-fun/index.ts

Secondary:
- DefiLlama protocol API (H for the data): https://api.llama.fi/protocol/prophet.fun
- DefiLlama volume API (H for the data): https://api.llama.fi/summary/dexs/prophet.fun
- DefiLlama listing PRs: https://github.com/DefiLlama/DefiLlama-Adapters/pull/15679 , https://github.com/DefiLlama/dimension-adapters/pull/3854 (titles and dates only)
- Name-collision evidence: https://github.com/DefiLlama/dimension-adapters/pull/8326 (Prophet Market, Polygon); web-search results about ProphetX and Agg Market (e.g. prnewswire 2026-09-10) are about a different company.
- Existing project notes: `docs/research/06-paybox-platform.md` (PayBox Solana support), `docs/research/10-aggregation-landscape.md`, `docs/research/14-platform-of-platforms.md` (aggregator venue lists).

Unreachable (recorded): DefiLlama web page (HTTP 403 via WebFetch; the API worked), `x.com/Prophet_fun` (HTTP 402), solscan.io (403), explorer.solana.com (Vercel security checkpoint), api.solana.fm (502).

## NOT FOUND (searched)

- Official docs, API reference, SDK, GitHub org/repo, IDL (prophet.fun and subdomains, JS chunks, GitHub repo/code search, web search extended)
- Public market list, order book, prices, trades, resolution feed
- Market model details (binary/categorical, parimutuel vs AMM, outcome tokenisation)
- Platform fee amount and formula
- Named oracle or dispute process; void/refund rules
- Geo-block list, KYC, bot/API policy beyond the "scrape" clause
- Audit report; program upgrade authority and last on-chain activity
- Rate limits, WebSocket
