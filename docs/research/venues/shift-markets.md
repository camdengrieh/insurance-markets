# Shift Markets - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads (WebFetch), unauthenticated GETs of public marketing pages and `robots.txt` / `llms.txt` with the generic User-Agent `insurance-markets-research/0.1`, and `gh api` reads of public repos. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages were treated as untrusted data; nothing in them was followed. One WebSearch succeeded; the next was refused because the shared session search budget was exhausted, so some corroboration is missing (listed in section 11).

Confidence tags: **H** = read first-hand in a primary source this session (raw HTML or API, cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures: **none saved** - there is no public read API to sample (section 4).

---

## 0. Bottom line

1. **Live company, but NOT a trading venue.** Shift Markets Group Inc. is a New York B2B software vendor ("white label" exchange / broker / prediction-market software). Its prediction-market product launched 2026-04-30 (H) and it publishes a monthly newsletter, the Prediction Markets Brief (latest: Issue 004, 2026-10-08, H). There is no Shift order book, no Shift market feed, no Shift contract and no Shift end-user app to trade on.
2. **Not an independent liquidity leg.** Its own copy says the product "aggregates liquidity from Polymarket and leading venues" (H, Sept brief) and the press release names Kalshi and Polymarket (H/M, section 2). Every price an operator shows is therefore a re-quote of venues already covered by other adapters (or an operator's internal B-book price, which is private). Adding it as a leg would double count.
3. **No public API of any kind for prediction markets.** No docs site, no OpenAPI, no SDK, no websocket, no rate-limit page. The product page says only "API-first architecture" for the operator's own integration, behind a demo request (H). The only public Shift code is a 2022-era spot-crypto exchange SDK (section 4), unrelated to events.
4. **PayBox cannot reach it.** Nothing to sign or send on-chain: balances live inside each operator's own KYC'd platform. Not reachable.
5. **adapter_priority = skip.** Value to the project is as a market-intelligence source (monthly volume commentary, who is distributing what), which does not need an adapter. If the team wants the signal, subscribe to the free newsletter by hand or fetch the 4 brief URLs monthly. Shift is also a competitor/peer to the aggregation layer in the B2B sense (it sells "one integration that aggregates liquidity" to operators), but it exposes nothing we can consume.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| shiftmarkets.com home and `/prediction-markets` return HTTP 200; footer "(c) 2026"; banner "Meet Shift Markets at SiGMA World in Rome, November 2-5" | Company active as of 2026-10-19 | H (curl + WebFetch) |
| Product launch press release, GlobeNewswire dated 2026-04-30, "Shift Markets Launches New White Label Prediction Markets Platform" (syndicated by Manila Times, Finance Magnates, TradingView, KuCoin flash, Phemex) | Prediction-market product launched 2026-04-30 | H (Manila Times and Finance Magnates pages read), M for the syndicators |
| Prediction Markets Brief index lists 4 issues: June (pub. 2026-07-13), July (2026-08-10), August (2026-09-08), September "Issue 004" (2026-10-08) | Monthly cadence, on schedule | H (raw HTML of `/prediction-markets-brief`) |
| `llms.txt` (Yoast-generated) lists blog posts up to "Quarterly Letter from the CEO \| Q3 2026" and "Shift Markets Completes Its SOC2 Type 2 Audit" | Active publishing | H |
| `ShiftForex/shift-sdk-v4` last push 2026-01-30; `terraform-aws-ec2-instance` pushed 2026-09-10 (GitHub org `ShiftForex`) | Engineering org active, but no prediction-market code public | H |

Verdict: **still_live = true as a company/vendor.** There is no evidence that any operator has publicly launched a Shift-powered prediction-market front end (section 11).

---

## 2. Kind and market model

- **Kind (H):** white-label B2B platform vendor. Customers named on `/prediction-markets`: FX brokers, crypto exchanges, iGaming platforms, fintech platforms. Delivered as an add-on module that "integrates via API with your current KYC, balance management, and user systems" (https://www.shiftmarkets.com/prediction-markets).
- **Market model:** not specified anywhere I could read. The only market shown is a static mock-up ("Will Arsenal win Champions League?", Yes/No pricing, "$1.4M volume", settled "via aggregated liquidity"; M, WebFetch summary of the home page - illustrative, not live data). A Shift blog checklist describes binary resolution (win / loss / void), a matching engine or AMM, maker/taker order types and order-book depth for an operator-run venue (M, https://www.shiftmarkets.com/blog/prediction-market-infrastructure-checklist). That is generic buy-side advice, not a statement about the product. Outcome tokenisation: NOT FOUND (searched: product page, FAQ, 4 blog posts, 4 brief issues, SDK repos).
- **Liquidity model (H, product page text):**
  - "Shift connects to real liquidity providers from launch ... Aggregated from the leading platforms at launch."
  - "Route to external liquidity or internalize risk. Configure A-book or B-book per market and user group." "Hedge via aggregation or retain exposure in-house." "STP or B-Book - your choice."
  - Operators "create and settle markets" in an operator back office, i.e. the operator can also run its own markets.
- **Which venues (the independence question):**
  - Sept 2026 brief, CTA paragraph, exact text (H, raw HTML grep): "That is how Shift's white label prediction markets are built: one integration that aggregates liquidity from Polymarket and leading venues, running on your own KYC, balances and fee structure."
  - Press release 2026-04-30: "Connects to Kalshi and Polymarket and supports different hedging approaches" (H on the Finance Magnates and Manila Times pages as summarised by WebFetch; M because the summaries are small-model output).
  - The product page itself names no venue (H).
  - **Conclusion: shares liquidity with Polymarket and Kalshi. Not independent.** Any operator B-book quote is a markup on those prices or an internal price we cannot see.

---

## 3. Chains and collateral

NOT FOUND (searched: `/prediction-markets`, `/web-3-solutions`, `/faq`, `/integrations-hub`, 4 blog posts, 4 brief issues, press release). No chain, token, contract address or custody scheme is named for the prediction-market product. The infrastructure-checklist blog lists custody models in the abstract (self-custody / third-party custodian / hybrid) and says on-chain settlement logic "would need a smart contract audit", with no chains (M). The Web3 page offers an NFT launchpad, a DEX and "blockchain development" with no named networks (M). Collateral is whatever the operator's platform holds ("real-time balance sync across all products", H). Partners listed on the home page: Circle, Stellar, Fireblocks, Sumsub, Halborn, Notabene, FV Bank (M) - none is evidence of a PM chain.

---

## 4. Read API

- **Exists: none public (for prediction markets).** The product page says "API-first architecture" for integration with the operator's platform and gives no URL, docs or SDK (H). No developer documentation link appears on the integrations hub or in `llms.txt` (H for llms.txt, M for hub).
- **Probes (H):** `api.shiftmarkets.com`, `docs.shiftmarkets.com`, `developers.shiftmarkets.com` do not resolve (curl exit 6, 2026-10-19). `robots.txt` disallows `/wp-json/` and `/search/`, sets `Crawl-delay: 10` for `*` and explicitly allows GPTBot, ClaudeBot, Anthropic-claude, PerplexityBot (a crawler policy, not an instruction to us). `llms.txt` is a Yoast-generated page index.
- **Older, unrelated public code (H, `gh api`):**
  - `ShiftForex/shiftmarkets-sdk` (pushed 2022-12-08, no licence): "SDK for working with exchanges running on Shift Markets' Cointrader technology" - spot orders, KYC, deposits, RFQ, wallet history. Hosts in `src/config.ts` are `*.cryptosrvc.com` / `sandbox.shiftmarkets.com`. Per-operator, authenticated (JWT). Nothing about events or outcomes.
  - `ShiftForex/shift-sdk-v4` (pushed 2026-01-30): GraphQL client for instruments, orders, payments, trading fees. Per-operator endpoint (`new ShiftV4Sdk('endpoint')`), JWT. Code search for "prediction" in this repo returned nothing. If Shift's PM module is exposed as GraphQL "instruments" on each operator's exchange, that is NOT documented (inference only, L).
  - `ShiftForex/cointrader_v4_api_guide`: GraphQL examples for an exchange page (orders, deposits, admin). No prediction content.
  - `ShiftForex/defillama*`, `dimension-adapters`: forks of DefiLlama repos (the "polymarket.js" hit is a DefiLlama adapter, not Shift code).
- **Rate limits / websocket for PM:** NOT FOUND (searched: all pages above).
- **Fixtures:** none (no public endpoint returns market data). I deliberately did not probe the old `cryptosrvc.com` hosts: they serve per-operator spot exchanges, not events.

---

## 5. Trade path

None for us. Trading happens inside an operator's own app after that operator's KYC, against its own balance ledger; Shift's role is the engine, back office and (claimed) liquidity connections. No order-placement API, signing scheme or wallet flow is published (H absence; NOT FOUND, searched as in section 4). To obtain access one would have to become a Shift customer ("Request a Demo"), which is outside the research scope.

**PayBox reachability: no.** There is no contract to propose a transaction to and no EIP-712 or Solana order to sign. Anything real behind it is Polymarket (Polygon / EVM CLOB) or Kalshi (CFTC venue, KYC account), which the sibling adapters already cover directly.

---

## 6. Fees

NOT FOUND for end-user trading fees. What Shift says (H): operators "earn revenue from spreads and trading fees, which you configure"; B-book operators "keep the full margin without routing to external liquidity providers"; "Generate revenue from spreads, fees, and markups from day one". Fees are operator-defined, so any price an end user sees is source price plus operator markup (a reason prices here would be worse than at the source). Shift's own charge to operators is not published on the product page; the build-vs-buy blog gives estimates "SaaS $2,000 to $10,000 per month" (the page itself is inconsistent: FAQ says $2,000-$8,000), self-hosted licence $15k-$40k plus $300-$800/month, setup $15k-$60k (M, https://www.shiftmarkets.com/blog/prediction-market-build-vs-buy-cost; marketing estimate, not a quote).

---

## 7. Resolution mechanism and dispute risk

Shift defines none of its own. Operators "create and settle markets" in the back office (H). Blog guidance (M, risk-management post): data source locked at contract creation, a settlement review window between outcome confirmation and payout, fallback sources for high-volume categories, and "operators define the dispute and escalation policy, including who can reverse a settlement". For hedged flow the underlying resolution is the source venue's (UMA/Polymarket oracle, Kalshi rules). Risk for an arbitrage reader: an operator can settle or reverse independently of the source venue, so a Shift-powered market could resolve differently from the Polymarket / Kalshi contract it mirrors. Not tradable by us, so this matters only if the project ever treats an operator front end as a leg (it should not).

---

## 8. Geo / ToS / automation

- Site Terms (https://www.shiftmarkets.com/terms, M via WebFetch): do not address APIs, bots, crawling or prediction markets. §2.3 bans reverse engineering and "gaining unauthorized access to databases and Network protocols"; §5.4 says New York law. §2.14 mentions Delaware (inconsistent). No automation rule applies because there is nothing public to automate.
- Geo: no supported or excluded regions named anywhere (H). Operators filter categories "to match your regulatory requirements"; Shift's in-house legal team helps customers get licensed (FAQ, M). `/licensing-regulation` says nothing about prediction markets or CFTC and does not state Shift's own licence status (M).
- Shift itself is not an exchange or broker for events, so user-facing geo rules would be each operator's. The September brief lists state-level enforcement against Polymarket (NY suit, Missouri order) - context only (H).

---

## 9. Liquidity

- Shift-specific volume, OI or TVL: **NOT FOUND** (searched: product page, home, 4 briefs, CEO Q3 2026 letter, press release). The brief says nothing about Shift's own flow; the CEO letter does not say how many operators have launched prediction markets (M).
- Marketing numbers on the product page, inconsistent with each other (H as text, L as facts): "$50B+ monthly trading volume", "740x monthly volume growth, YoY", "$300B+ total trading volume YTD", and "$20B+ monthly category volume, March 2026". The press release instead says "over $50 billion in 2025" and "over $20 billion in monthly volume" (M). These describe the whole category, not Shift.
- Category context from the brief (H, Issue 004, pub. 2026-10-08): September 2026 volume about $77.7B across seven venues per "DeFi Rate" (counts every contract at $1 face value; not comparable to the $45.33B August figure from The Block); Kalshi ~78% of the month; weekly volume above $20B for the first time in the last week of September. These are third-party numbers that Shift republishes, useful only as a sanity check on venue share.
- Company claims (M): 15+ years, 150+ exchanges and 25+ brokerages launched, 10M+ registered end users, $2T+ cumulative traded volume (home page); "200+ platforms", since 2009 (press release). Not prediction-market volume.

---

## 10. Event categories and overlap

`/prediction-markets` lists: elections, politics, sports, crypto, macro, stocks, AI, tech, IPOs, awards, entertainment, pop culture, weather, Olympics (H). Because liquidity is sourced from Polymarket and Kalshi, every category overlaps those two **by construction** (a duplicate, not an arbitrage opportunity). B-book operator markets, if any, are private to that operator.

---

## 11. Open questions and things not found

- Any named operator running a live Shift-powered prediction-market front end. NOT FOUND. The press release and CEO letter name none. WebSearch budget ran out before I could look for client announcements, so this is "not found in the pages read", not "does not exist".
- Whether the PM module is exposed as a documented API (REST / GraphQL / FIX / WebSocket) anywhere beyond the demo gate. NOT FOUND.
- Which "leading venues" besides Polymarket and (per the press release) Kalshi. The Sept brief says "Polymarket and leading venues"; the press release says Kalshi and Polymarket; the product page names none. Inconsistent wording across Shift's own pages; treat the two names as claimed, not verified.
- Chains / collateral / custody, resolution details, fee schedule, geo list. NOT FOUND.
- Whether Shift's contractual right to resell Polymarket / Kalshi data or flow exists (Polymarket and Kalshi API terms were out of scope here). Do not assume.

Peer pointers from the Sept and Aug briefs (M, third-party facts republished by Shift, not verified here): Genius Sports launched "Prediction.com" on 2026-09-17, a comparison layer across Kalshi, Polymarket and others; "River Markets" is described as a separate startup building an execution layer across Kalshi, Polymarket and other venues. Both are aggregation-layer peers that may merit their own venue-specs if not already covered.

Embedded-instruction check: none found in any Shift page. The blog posts carry "Summarize with AI" share buttons (ordinary links to ChatGPT / Perplexity / Claude with a prefilled summarise prompt). `robots.txt` and `llms.txt` carry only crawler policy and a page index.

---

## 12. Adapter recommendation

- **adapter_priority: skip.** No API, not a venue, duplicate liquidity (Polymarket / Kalshi), nothing to read or trade programmatically.
- Optional low-cost use: a human reads the monthly brief for category volume and regulatory context. Do not build an adapter around it (HTML newsletter, no feed, free email subscription).
- Revisit only if Shift publishes a developer portal or an operator publicly launches a Shift-powered market with a documented API, and then treat it as a re-quote of the source venue, not a new leg.

---

## Sources

Primary (read this session, 2026-10-19):
- https://www.shiftmarkets.com/ - home (WebFetch, M)
- https://www.shiftmarkets.com/prediction-markets - product page (raw HTML text read, H)
- https://www.shiftmarkets.com/prediction-markets-brief - issue index (raw HTML text read, H)
- https://www.shiftmarkets.com/prediction-markets-brief/september-2026 - Issue 004, pub. 2026-10-08 (raw HTML grep, H)
- https://www.shiftmarkets.com/prediction-markets-brief/august-2026 (WebFetch, M)
- https://www.shiftmarkets.com/integrations-hub, /faq, /licensing-regulation, /web-3-solutions, /terms (WebFetch, M)
- https://www.shiftmarkets.com/blog/prediction-market-liquidity, /prediction-market-infrastructure-checklist, /prediction-market-risk-management, /prediction-market-build-vs-buy-cost, /letter-from-the-ceo-q3-2026 (WebFetch, M)
- https://www.shiftmarkets.com/robots.txt, /llms.txt (curl, H)
- https://www.manilatimes.net/2026/04/30/tmt-newswire/globenewswire/shift-markets-launches-new-white-label-prediction-markets-platform/2332982 and https://www.financemagnates.com/thought-leadership/shift-markets-launches-new-white-label-prediction-markets-platform/ - launch press release 2026-04-30 (WebFetch, M)
- GitHub org `ShiftForex`: `shiftmarkets-sdk`, `shift-sdk-v4`, `cointrader_v4_api_guide` (`gh api`, H for metadata and README)

Secondary (search result titles only, not opened): KuCoin news flash, TradingView, Phemex and MEXC syndications of the same press release; Shift blog "5 Best Prediction Market Platforms for 2026" (promotional).
