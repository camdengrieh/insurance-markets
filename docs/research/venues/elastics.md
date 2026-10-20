# Elastics (elastics.ai) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: official docs (docs.elastics.ai, every page of the 18-page index, read as `.md`), marketing site, Terms of Service (effective 2026-08-01) and Privacy Policy read first-hand. Scripted GETs used the generic User-Agent `insurance-markets-research/0.1`. No account, no sign-up, no wallet, no API key, no signing, no POST/PUT/DELETE, no browser automation, no money-moving PayBox tool (only read-only `discover_plugins` / `discover_services`). Third-party text was treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Limitation: the shared WebSearch budget was already exhausted when I started, so I ran no web searches. Everything below comes from the vendor's own pages plus one press article, GitHub and npm lookups. There is no independent third-party corroboration of volume, user counts or the funding round beyond the company's own pages and the fintech.global piece (which repeats the company announcement).

---

## 0. Bottom line

1. **Elastics is a trading terminal / AI front-end, not a venue.** It routes orders to **Polymarket and Kalshi** (Hyperliquid is "coming soon"). It has no order book, no collateral, no settlement and no liquidity of its own. Every price it shows is a copy of a price on a venue we can read directly. It cannot be an independent arbitrage leg. (H)
2. **Live, in private/closed beta.** Docs say "Private Beta"; ToS says "closed beta program"; marketing site and docs were updated within the last day or two. $2M pre-seed announced 2026-05-05. (H)
3. **No public API, SDK or MCP.** The docs name an internal "marketdata API" and "OMS HTTP API" only as modules inside the Agents builder; neither is documented for outside callers. The app is behind a sign-in wall. NOT FOUND (searched: all 18 docs pages, `llms.txt`, sitemap, 10 guessed docs paths such as /api, /developers, /mcp, /sdk, /openapi.json (all 404), GitHub, npm). So there are no fixtures of API responses; I saved docs snapshots instead. (H)
4. **ToS is hostile to third-party automation of the platform itself:** bans scraping, crawling, bypassing rate limits, and bots that exceed API-key scope; "abusive arbitrage" is listed as prohibited use; EU/EEA/UK/Switzerland are Platform Restricted Jurisdictions. (H)
5. **Value to us is as a competitor benchmark, not an adapter.** Its Aggregator tab (Compare + Arbitrage, with match confidence, edge at best asks vs edge across full depth, capacity, strategy preview with fees) is almost exactly the product shape of our aggregation layer. Section 11 lists what to borrow.
6. **adapter_priority = skip** (aggregator/front-end, 100% duplicate liquidity, no public API, closed beta, ToS bars automation).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://www.elastics.ai` (HTTP 200); `elastics.ai` 301 to `www` | Webflow marketing site, `last-modified: Sun, 18 Oct 2026`; footer "Elastics Inc., 169 Madison Ave, Ste 15617, New York, NY 10016" | H |
| `https://docs.elastics.ai` | GitBook; `llms.txt` and sitemap return 200; 18 pages | H |
| `https://app.elastics.ai/` | 307 redirect to `/sign-in` (Clerk auth, `x-clerk-auth-status: signed-out`); the app is live but gated | H |
| Docs "What is Elastics?" | "Elastics is available through a web app, currently in Private Beta. Register at app.elastics.ai." | H |
| ToS (effective 2026-08-01) | Platform "presently in a beta version"; "closed beta program" | H |
| Blog | Posts dated 2026-05-05 (funding), 2026-08-01, 2026-08-04 (both written by the Chief of Staff and General Counsel) | H (dates on index page) |
| Funding | "$2M oversubscribed pre-seed, led by Frst (Paris)"; angels include ElevenLabs co-founders, XBTO partners, an a16z scout, a RedStone co-founder (fintech.global 2026-05-06; docs "Elastics Team" page says "$2M+") | H that both say it; M that it is true (company announcement) |
| Founders | CEO Szymon Pawica (ex Goldman Sachs, ff Venture Capital), CTO/co-founder Mateusz Brodowicz (docs: "research for one of the first prediction market hedge funds"). Founded 2025 (docs). | H (company's own statement) |
| Location | fintech.global says "Warsaw-based"; the company site lists a New York address. Both can be true (Poland engineering, US Inc.). | M |
| GitHub | `elastics-ai` org exists (created 2024-10-07; forks of nautilus_trader and Riskfolio-Lib, plus `axon`, `copilot-mcp`). No prediction-market repo; cannot confirm it belongs to this company. | L, treat as unrelated |

**still_live = true** (beta). Note the site says "free" and "private beta" simultaneously: access is by registration at the web app, and I could not tell whether registration is open or waitlisted (NOT FOUND, I did not sign up).

Inconsistencies inside the vendor's own material (all H as observations):
- Docs "What is Elastics?" says "AI trading assistant for **Hyperliquid and prediction markets**", but the Hyperliquid page says only "integration is coming soon", the homepage FAQ and fees page list Polymarket and Kalshi only, and the ToS names "Kalshi, Polymarket, and HyperLiquid where supported".
- Wallet model is described three different ways (section 3).
- Homepage testimonial attributes a quote to the CEO's name under another title ("Investor, Pavitza Capital"). Marketing copy; ignore it as evidence of adoption (L).

---

## 2. Kind and market model

- **kind: aggregator-or-data + execution front-end** ("AI Trading Assistant", "Elastics OS": account layer, execution, aggregated market data, position tracking, agents). (H, docs `what-is-elastics`, homepage)
- **Market model: none of its own.** It republishes Polymarket (on-chain CLOB, binary and multi-outcome) and Kalshi (CFTC-regulated exchange, binary event contracts). The UI order form is "Buy or sell Yes or No with market or limit orders", with a live order book per side. (H, docs `trade`, `what-are-prediction-markets`)
- **Tokenisation:** not applicable; Elastics holds no tokens of its own. Positions are the venue's own (Polymarket conditional tokens in a Polymarket wallet; Kalshi contracts in the user's Kalshi account). (H for the structure, docs `venues/polymarket`; Polymarket token details belong to the Polymarket spec.)
- **Market schema exposed in the Agents Market Scanner** (the closest thing to a published data model, H, docs `features/agents`): `status` open|paused|resolved|cancelled; `venue` polymarket|kalshi; `category` politics, elections, geopolitics, sports, esports, crypto, economy, finance, commodities, tech, culture, climate, mentions, health, other; numeric fields `last_yes_price`, `last_no_price` (0-100 scale), `volume`, `volume_24h`, `liquidity`, `spread`, `open_time`, `close_time`; `basket_id`. Prices are on a 0-100 cent scale.

---

## 3. Chains and collateral

Elastics itself has no chain or collateral. What it supports is **funding routes into the underlying venues** (H, docs `venues/polymarket`, retrieved 2026-10-19; the doc itself says the list "changes over time"):

| Item | Value |
|---|---|
| Polymarket collateral | Deposits "bridged to Polymarket are automatically converted to **pUSD on Polygon**, the collateral used for trading there" (the docs' wording; verify against the Polymarket spec) |
| Deposit chains | Ethereum ($5 min), Optimism, Polygon, Monad, Arbitrum, Robinhood Chain, BNB Smart Chain, Ink, Base, HyperEVM (each $2 min), Solana ($2), Tron ($9, USDT only), Bitcoin ($9) |
| Kalshi collateral | USD in the user's Kalshi account; not on-chain. Funded on Kalshi, not through Elastics. (M: the Kalshi docs page mentions no deposit flow; `system` page says Deposit/Withdraw work "per venue".) |
| Deposit addresses | "may change over time, so always use the latest address shown in the app". Per user and per chain, shown only after login. |

**Wallet model (three inconsistent descriptions):**
1. Docs `venues/polymarket`: on sign-up "Elastics creates a self-custodial wallet for you with Privy"; this "Account Wallet" controls a dedicated "Polymarket Wallet"; the private key can be exported from Wallet Settings. (H)
2. ToS 5.2: the Polymarket-dedicated wallet "is associated with the non-custodial wallet that you connect to the Platform"; the Privy-created embedded wallet is described under **"Mobile App and Embedded Wallet"**, with an option to connect your own wallet via WalletConnect-style protocols. (H)
3. Homepage FAQ: "You connect directly to Polymarket via DeFi wallets and to Kalshi using CeFi API keys." (H)

Reading these together (M): the web app creates a Privy embedded wallet and a Polymarket-dedicated wallet; "non-custodial" rests on Privy key custody and key export, not on the user holding a key locally. The app's CSP (response header) allows `clob.polymarket.com`, `relayer-v2.polymarket.com`, `gamma-api.polymarket.com` and many chain RPCs including Hyperliquid, Robinhood chain and Monad, consistent with direct Polymarket CLOB trading through the Polymarket relayer (M, inference from CSP).

**Kalshi side is custodial in the trust sense:** the user pastes a Kalshi Key ID plus an RSA private key (PEM) into Elastics; the Privacy Policy says API credentials are stored "encrypted in transit and at rest" and kept until deletion on request or 60-day post-termination window. (H, docs `venues/kalshi`, Privacy Policy 1.2 and retention section) So "non-custodial" holds for funds but Elastics holds a trading credential for Kalshi.

---

## 4. Read API

**exists = none (no public API).**

| Item | Value | Tag |
|---|---|---|
| Docs | https://docs.elastics.ai (GitBook; `llms.txt`; `.md` per page). Product documentation only: no API reference, SDK, MCP, webhook or rate-limit page. | H |
| Public API/SDK/MCP | NOT FOUND (searched: 18 docs pages; sitemap; guessed paths `/api`, `/api-reference`, `/developers`, `/developer`, `/mcp`, `/sdk`, `/usage-and-pricing/api`, `/usage-and-pricing/rate-limits`, `/features/api`, `/openapi.json` all 404; npm search; GitHub org and code search) | H |
| Internal APIs named | "marketdata API" (Market Scanner "searches Elastics markets via the marketdata API"; Market Tracker "fetches ... from a marketdata basket") and "OMS HTTP API" (OMS Executor "places orders ... via the OMS HTTP API"). Hosts and schemas unpublished. `api.elastics.ai`, `marketdata.elastics.ai`, `oms.elastics.ai` do not resolve in DNS. | H |
| Authenticated app surface | `app.elastics.ai` redirects to `/sign-in` (Clerk). One guessed path, `app.elastics.ai/api/health`, returned 401, i.e. the web app's API is behind login; `/.well-known/openapi.json` redirected to sign-in; `dev.elastics.ai/` (listed in the app's CSP) also redirects to `/sign-in`. I made one root GET to that dev host and did not probe further. | H |
| WebSocket | The app CSP allows `wss://app.elastics.ai` and `wss://*.dev.elastics.ai`, so the front-end uses WebSockets, but nothing is documented for outside use. | M |
| Rate limits | NOT FOUND | - |
| Data freshness claims | Marketing: "low-latency" news, "live and historical market data" (no numbers). Docs `trade`: "Live asks and bids with size and cumulative depth". | H (claims), no measurement |

**Implication:** we cannot consume Elastics data. We would not want to: it is a derivative of Polymarket and Kalshi, which we read directly (see the other venue specs). A cross-venue data product from the same vendor class that does have a public API is the Adjacent spec (`docs/research/venues/adjacent.md`).

### Docs snapshots saved (not API responses)

No API exists, so there are no response fixtures. Saved under `docs/research/fixtures/elastics/` (all small, public docs text, retrieved 2026-10-19 with the generic User-Agent, scanned for personal identifiers: none):
- `docs_llms.txt` (the 18-page index)
- `docs_features_aggregator.md` (Compare / Arbitrage columns and the worked example)
- `docs_features_agents.md` (module list and Market Scanner parameter table)
- `docs_venues_polymarket.md` (wallet model, deposit chains/minimums)
- `docs_usage_fees.md` (fee schedule)

---

## 5. Trade path

- **For an outside program: none.** There is no documented order-placement API, SDK or webhook. Orders are placed by a signed-in human in the web app (or mobile app), via the Elastics AI chat ("every trade requires your confirmation", docs `elastics-ai`), or via a user-configured **Agent**. (H)
- **Agents** are "deterministic trading automations": a pipeline of Schedule (custom seconds, 15m, 1h, 6h, 1d), Market Scanner/Tracker, Numeric/Time/String Filter, Budget Allocator (side: buy only; outcome yes/no), Risk Gate (`max_open_positions`, `max_total_exposure`) and OMS Executor (`allowed_venues`: polymarket / kalshi). "There is no AI discretion at runtime." ToS 6.3 allows pre-authorised automated orders without per-order confirmation. (H) Note the Budget Allocator is buy-only and single-leg: **the documented Agent modules do not place the two legs of an arbitrage atomically**; the Arbitrage tab's "act on" flow is a UI feature whose execution semantics (sequencing, partial fills, leg failure handling) are NOT FOUND in the docs.
- **Underlying signing schemes** (not Elastics-specific): Polymarket CLOB EIP-712 signed orders from the user's venue wallet; Kalshi RSA-signed REST requests from the user's API key. Elastics holds the Kalshi key (section 3) and uses Privy to sign for the Polymarket wallet. Details are in the Polymarket and Kalshi specs.

---

## 6. PayBox reachability

**paybox_reachable = no** (as a trade path).

- No programmatic interface exists, so there is nothing a PayBox EVM wallet could sign against. Orders require an Elastics login (Clerk) and Elastics-held or Privy-held keys. A PayBox wallet cannot place Elastics orders through transaction proposals or signed orders.
- **Funding-only nuance (M):** Elastics deposit addresses accept EVM chains (Base, Ethereum, Arbitrum, Polygon, BNB, ...) and Solana, so PayBox `request_transfer` could in principle send USDC to a user's Elastics deposit address, which Elastics converts to pUSD on Polygon. That is a manual, login-gated flow to a changing address; not suitable for an automated adapter, and it would route our capital through Elastics' bridge instead of straight into Polymarket. Not recommended.
- PayBox discovery on 2026-10-19: `discover_plugins("elastics")` returned no plugin; `discover_services("elastics prediction market")` first page returned unrelated third-party x402 data sellers (Polymarket and Hyperliquid odds feeds), none from Elastics (later pages not read). (H)
- The right way to reach the same liquidity is directly via Polymarket and Kalshi adapters.

---

## 7. Fees

| Item | Value | Tag |
|---|---|---|
| Elastics fee | "Elastics does not charge fees on your trading." Fee schedule table: Polymarket Free, Kalshi Free, Hyperliquid "coming soon". Homepage FAQ: "Elastics is free." | H (docs `usage-and-pricing/fees`, homepage) |
| Venue fees | Paid by the trader to the venue; set per market (Polymarket) / per contract (Kalshi fee schedule). Elastics' Strategy Preview deducts them. Formulas are in the venue specs, not Elastics. | H |
| Network costs | Gas on deposits/withdrawals depends on chain; not charged by Elastics. | H |
| Possible hidden revenue | NOT FOUND (searched: ToS, Privacy Policy, docs fees page for "builder", "rebate", "spread", "markup", "referral"). Whether Elastics collects a Polymarket builder fee or Kalshi rebate is undisclosed. ToS says the platform is provided "in its beta version without charge", so pricing may change after beta (M). | H for absence in docs |
| AI tokens | AI usage is metered in "AI tokens", not purchasable: lifetime tokens earned = sqrt(lifetime trading volume in USD) ($100 volume gives $10, $10,000 gives $100, $100,000 gives ~$316). | H (docs `ai-tokens`) |

Business-model read (M): "free" plus AI credits earned from trade volume implies the commercial model is volume-driven; for us the practical point is that Elastics' own fee is zero, so the only costs in its arbitrage maths are venue fees.

---

## 8. Resolution mechanism and dispute risk

Elastics resolves nothing. Resolution, settlement, cancellation and disputes are done by the underlying venue; the ToS says so repeatedly ("Elastics does not ... resolve, settle, clear ..."; disputes "must be addressed directly with the relevant Underlying Service") (H, ToS sections 2, 8, and dispute clause).

Relevance to arbitrage (M): the Aggregator offers a **"Match (Confidence)"** column and a "match validity" filter, which implies it scores whether a Polymarket market and a Kalshi market are the same event. Nothing in the docs says how matches are produced, whether resolution-rule text is compared, or how rule mismatches (different resolution sources, different cut-off times, voiding rules) are surfaced. NOT FOUND (searched: `features/aggregator`, FAQ, ToS, blog index). The August blog post "The $200M Resolution Problem: Prediction Markets Need Lawyers" signals the company knows resolution risk matters, but I did not read it and it is not a spec of their matcher (L).

The worked example in the Aggregator doc ("One side always resolves to $1.00, so buying both sides below $1.00 combined locks in the edge regardless of the outcome, minus fees") assumes identical resolution on both venues. That assumption is exactly where real cross-venue arbitrage fails (see `docs/research/17-empirical-constraint-study.md` and `docs/plan.md` for our own treatment).

---

## 9. Geo, ToS and automation rules

All H, Terms of Service effective 2026-08-01 (https://www.elastics.ai/terms-of-service):

- **Platform Restricted Jurisdictions:** "any member state of the European Union, any member state of the European Economic Area ..., the United Kingdom, and Switzerland", comprehensively sanctioned places, and anything else Elastics designates "with or without prior notice". The US is not listed as restricted by Elastics, but the underlying venues' own geo rules apply (Polymarket global/US split, Kalshi eligibility).
- **Circumvention:** VPN/proxy/location masking/"wallet obfuscation" barred; Elastics may use IP geolocation, VPN detection, wallet screening.
- **Automation / scraping (the part that matters for us):** acceptable-use clause bars "bypassing rate limits, scraping, crawling, or otherwise using the Platform in an abusive or unauthorized technical manner", and use of "any ... Agent, automation, script, bot or similar tool in a manner that ... exceeds the scope of any API key, credential, ... rate limit, market integrity rule, trading rule". It also bars reverse engineering and lists "abusive arbitrage" among prohibited purposes (undefined). Elastics' own Agents are explicitly allowed (ToS 6.3).
- **Not investment advice;** no suitability assessment; user responsible for legality in their jurisdiction.
- **Credential rule:** "Elastics will not request, and you should not provide, API keys ... that enable withdrawals, transfers or unrestricted control over funds."
- **docs.elastics.ai robots.txt:** `Content-Signal: ai-train=yes, search=yes, ai-input=yes`, `Allow: /` (H). So reading the public docs with a bot is explicitly fine. The app and ToS rules above apply to the Platform, not the public docs.
- **Backend LLM vendor:** Privacy Policy says AI features use "Anthropic, accessed through Amazon Web Services (AWS) Bedrock" (H).

Net for us: there is no sanctioned machine interface to Elastics, and the ToS prohibits automated use beyond Elastics' own Agents. Do not build against the app.

---

## 10. Liquidity

- **Elastics has none of its own.** Liquidity, volume and OI are those of Polymarket and Kalshi. (H)
- Elastics usage figures (users, volume, AUM): NOT FOUND (searched: homepage, docs, fintech.global article, company funding blog; none state user or volume numbers). The funding article explicitly omits them. (H for absence)
- Marketing mentions a hedge-fund / securities customer testimonials (e.g. "Everhaven Securities") with no figures (L).

So `liquidity` = no independent liquidity; depth shown in Elastics is Polymarket/Kalshi book depth as of the moment of viewing.

---

## 11. Event categories, overlap, and what to borrow

**Categories** (H, docs `agents` Market Scanner and `news`): politics, elections, geopolitics, sports, esports, crypto, economy, finance, commodities, tech, culture, climate, mentions, health, other. This is the union of Polymarket and Kalshi categories; the Aggregator Compare tab covers only **Polymarket vs Kalshi**.

Overlap with other venues: all of it, because it is those two venues. Sports, politics, crypto price, macro all appear on both underlying venues (see `docs/research/08-venues-polymarket-kalshi.md`).

**Product-design lessons from the Aggregator doc (H as description, M as to how well it works; we cannot test it):**
1. Show **two edge numbers**: "Edge (Best Asks)" and "Edge (Full Depth)", plus **Capacity** (contracts the opportunity can absorb) and a "full books only" filter. Last-trade spreads are not executable (compare the Adjacent finding in `venues/adjacent.md` section 4.5).
2. Carry a **match confidence score** per cross-venue pair and let the user filter on "match validity".
3. **Strategy Preview** before acting: cost, fees, payout, profit per contract, total minimum profit at capacity. Their illustrative example: Buy YES on Polymarket 0.46 + Buy NO on Kalshi 0.51 = 0.97 cost, edge 3.1% (0.03), fees -0.01, profit 0.02 per contract, $10 at 500 contracts. Fees are modelled, but the doc is silent on resolution-rule mismatch, leg risk and fill timing.
4. Single-leg Agents (buy-only Budget Allocator) show that even the leading consumer tool does not automate two-leg execution in its published modules; two-leg atomicity is our differentiator or our risk.

---

## 12. Shared liquidity

**Shares 100% with Polymarket and Kalshi.** Orders go to their books; Elastics adds no depth. Not an independent arbitrage leg and double-counting it would be an error. (H)

---

## 13. Adapter priority

**skip.**

- Not a venue; duplicate liquidity (Polymarket + Kalshi).
- No public API, SDK or MCP; app is login-gated; still in closed/private beta.
- ToS bars scraping, crawling and bots beyond Elastics' own Agents; EU/EEA/UK/CH excluded.
- No usage or volume data to treat it even as a "popularity" signal.

Keep as: (a) a competitor/feature reference (section 11); (b) a monitoring item. Revisit only if Elastics publishes an API/MCP or ships Hyperliquid (HIP-4) prediction markets, which would still be a Hyperliquid adapter, not an Elastics adapter. Quotient-as-signal-source is unaffected by Elastics.

---

## 14. Open questions / not found

- NOT FOUND: any public or partner API, SDK, MCP server, OpenAPI file, rate limits, or webhook (see section 4 for what was searched).
- NOT FOUND: how Aggregator pair matching works, whether rule text is compared, and what "Match (Confidence)" means numerically.
- NOT FOUND: execution semantics for "act on" an arbitrage (leg order, partial fills, rollback).
- NOT FOUND: user count, volume, AUM; Polymarket builder-code or Kalshi rebate revenue share.
- NOT FOUND: whether registration is open or waitlist-gated, and Elastics' own supported-country list beyond the exclusion list.
- Unresolved: whether the Polymarket wallet created on the web app is a Gnosis Safe/proxy wallet and who the on-chain owner/signer is (Privy account wallet per docs). Relevant only if we ever need to interoperate with positions held there.
- Unresolved: docs say the web app creates a Privy wallet; ToS ties the embedded wallet to the mobile app. Contradictory.
- Not read: the three blog posts other than the funding announcement; Discord (https://discord.com/invite/elastics) and X (https://x.com/ElasticsAI, which returned HTTP 402 Payment Required to WebFetch; I recorded it and stopped, no payment requirements were visible and none was attempted); LinkedIn.
- No web search was possible (shared budget exhausted), so third-party reviews, user complaints or competitor comparisons were not checked.

---

## 15. Sources

Primary (vendor):
- https://www.elastics.ai (homepage: FAQ "Is Elastics non-custodial?", "What are the costs?", "How does Elastics work?") - H
- https://www.elastics.ai/terms-of-service (effective 2026-08-01) - H
- https://www.elastics.ai/privacy-policy - H
- https://www.elastics.ai/blog-posts/elastics-raises-2m-pre-seed-for-ai-agents-for-prediction-markets (2026-05-05) - H
- https://www.elastics.ai/sitemap.xml and https://elastics.ai/robots.txt (redirect to www) - H
- https://docs.elastics.ai/llms.txt and sitemap (18 pages) - H
- https://docs.elastics.ai/about-elastics/what-is-elastics.md , `/about-elastics/elastics-team.md` , `/about-elastics/what-are-prediction-markets.md` - H
- https://docs.elastics.ai/features/aggregator.md , `/features/agents.md` , `/features/trade.md` , `/features/discover.md` , `/features/elastics-ai.md` , `/features/news.md` , `/features/portfolio.md` , `/features/system.md` , `/features/dashboard.md` , `/features/baskets.md` - H
- https://docs.elastics.ai/venues/polymarket.md , `/venues/kalshi.md` , `/venues/hyperliquid.md` - H
- https://docs.elastics.ai/usage-and-pricing/fees.md , `/usage-and-pricing/ai-tokens.md` - H
- https://docs.elastics.ai/robots.txt - H
- https://app.elastics.ai/ (response headers only: 307 to /sign-in; CSP; no body) - H

Secondary:
- https://fintech.global/2026/05/06/elastics-raises-2m-pre-seed-for-ai-prediction-market-agents/ (2026-05-06; private beta, funding, founders) - H that it says this, M as to truth
- GitHub org `elastics-ai` via `gh api` (unrelated-looking forks) - L
- npm registry search "elastics prediction market" (no relevant package) - H for absence

Project context:
- PayBox `discover_plugins` and `discover_services` read-only queries (2026-10-19) - H

Docs snapshots in `docs/research/fixtures/elastics/`.

---

## 16. Suspicious content / safety notes

- Every docs page begins with a standard GitBook boilerplate line: "For the complete documentation index, see llms.txt. Markdown versions of documentation pages are available by appending `.md` to page URLs." This is a pointer for documentation tools, not an instruction to take any action. I used it only to read the same site's public docs with plain GETs. Benign.
- No other instructions aimed at AI agents were found on the homepage, ToS, Privacy Policy, blog or docs.
- Third-party x402 service descriptions returned by PayBox discovery were treated as untrusted product text; none was acted on.
- Privacy: all scripted requests used the User-Agent `insurance-markets-research/0.1`. No email, name, username or home-directory path was sent in any request, header or URL. The homepage footer contains an obfuscated vendor contact address which I did not use or copy. The saved fixtures were grepped for `@` and for the user's identifiers: no hits.
