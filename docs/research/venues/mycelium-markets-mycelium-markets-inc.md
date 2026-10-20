# Mycelium Markets (Mycelium Markets, Inc.) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch/WebSearch, a handful of public unauthenticated GETs of mycelium.markets HTML pages, PDFs, robots.txt and sitemap.xml. No account, login, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. The `/api/` path is disallowed by robots.txt and undocumented, so it was NOT probed (a single GET of `/api/markets`, made before noting the robots.txt rule, returned HTTP 405 with an empty body; nothing further was requested under `/api/`). Third-party pages were treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session; **M** = secondary or inferred; **L** = weak or stale.

---

## 0. Bottom line

- **Live: yes (H).** Site returns HTTP 200; a market page shows context items dated "4d ago" referencing BTC at about $81,920 on 18 Oct 2026; sitemap lists about 43 market/topic URLs. Legal docs effective 23 Apr 2026. Status: beta.
- **It is almost certainly a play-money / synthetic-currency venue (M, strong).** Mycelium's own Labs papers (May 2026) describe the market as "LMSR-mediated", with agents "trading synthetic currency". The privacy policy says the only personal data needed is an email address; there is no mention of payments, wallets, KYC or chains anywhere on the site, terms or beta agreement. Volumes display with a "$" sign but no deposit/withdraw/settlement-asset information exists. Explicitly: money type is not stated on the product pages (H: NOT FOUND there); the synthetic-currency statement comes from the company's research papers (H that the papers say it; M that the live product matches).
- **Not integrable for trading, no public data API, ToS forbids automated access.** Priority: **skip**.

---

## 1. Kind and market model

| Item | Finding | Tag |
|---|---|---|
| Kind | Web app, centralised database ledger, LLM-agent-driven prediction market ("agent-led"). Humans create markets, comment, spectate or deploy their own agent. | H (homepage, privacy policy) |
| Outcome structure | Binary YES/NO shown on market pages; papers say "binary or categorical" contracts are the design. Topic pages (`/topics/...`) group several related questions. | H (market pages, sitemap), M (categorical) |
| Pricing/matching | Hybrid. Homepage: "Orders match price-time FIFO", "full order books, trade history ... visible". Labs paper: unified order book per market, YES/NO linked by complementary mint/burn (buy YES at 65 fills against sell YES at 65 or buy NO at 35, 100-cent pair escrow); residual flow fills against an LMSR (LS-LMSR style) curve with per-market `quote` and `uncertainty` (=b, in cents). Limit orders only; prices integer cents 1-99; cash integer cents. | H (homepage), M (paper describes a "typical" market and "reference" design; the Labs index page says it documents Mycelium's own live LMSR market, so likely accurate but not verified against live behaviour) |
| Tokenisation | No on-chain tokens found. Positions are ledger entries in a server-side database ("settling all trades against the synthetic-currency ledger"). | M |
| House quote | Each market page shows a "House estimate" (LLM pricer writes `quote` + analysis; liquidity b set deterministically, volume-driven and monotonic-up). | H (market page), M (paper) |
| Market creation | Users describe an event; an agent drafts rules, icon, resolution criteria. Long-dated, niche questions dominate (e.g. "by 2036", "by 2046"). | H |

## 2. Chains and collateral

NOT FOUND (searched: homepage, /markets, a market page, /contracts, /labs, Terms, Beta Agreement, Privacy Policy PDFs, two Labs papers, WebSearch extended, GitHub repo/code search). No chain, token, contract address or stablecoin is mentioned. The only on-chain "Mycelium" hits are unrelated (Mycelium Finance on Solana with a $MYC token, per a dev.to post created by an AI agent for a bounty; that post never references mycelium.markets) (M: different entity). Do not conflate.

## 3. Read API

- **Official public REST/WS API: none documented (NOT FOUND).** Searched: site nav/footer (links are only /contracts, /labs, /login, /signup, legal PDFs, support mailbox), sitemap, robots.txt, /api and /mcp paths (404 for /api and /mcp on GET; `/api/markets` GET returned 405 and robots.txt disallows `/api/`), WebSearch, GitHub.
- **Agent trading surface = MCP server over Streamable HTTP, authenticated (M).** Labs paper (May 2026, PDF) Table 1 lists 11 tools: `login(agent uuid, key)->token`, `logout`, `portfolio`, `markets(query,sort,limit,offset,topic)`, `market(id,include context)` returning `id,title,description,resolution criteria,resolution date,quote,uncertainty,bid,ask,last,...`, `market context`, `buy/sell(token,id,side,quantity,price)`, `cancel`, `clear`, `events(since,limit)` with types fill/partial/resolution/cancelled. Endpoint URL, docs URL, rate limits: NOT FOUND. Reading requires an account-issued agent uuid/key, i.e. signing up, which this research is forbidden to do.
- **Research endpoints**: paper says five public unauthenticated JSON tools exist (web, news, fetch, encyclopedia search, cross-venue "prediction market search" across peer venues) (M). URLs NOT FOUND.
- **Scrapable HTML only.** `/markets` and `/markets/<slug>` are server-rendered pages (title, YES %, volume, trade count, resolve date, context items, resolution rules text). Fixtures saved are text extracts of these pages, not API responses. Websocket: NOT FOUND.
- Fixtures: `docs/research/fixtures/mycelium-markets-mycelium-markets-inc/` (robots.txt, sitemap.xml, two text extracts of public HTML). No JSON API shape could be confirmed.

## 4. Trade path

Only via account login (email sign-up) and either the web UI or an agent registered on the platform using the MCP surface (`login` with agent uuid+key, then `buy`/`sell`). No signed orders, no wallet signatures, no on-chain transactions. Auth = platform-issued credentials (M, from paper). Creating accounts/keys is out of scope for this research, so not verified.

## 5. PayBox reachability

**No.** There is no chain, wallet, contract or signed-order scheme to target. A PayBox EVM/Solana wallet cannot propose transactions or sign orders on this venue. (An MCP/agent-key credential could be stored as a PayBox secret, but there is no money to move.)

## 6. Fees

NOT FOUND (searched: Terms, Beta Agreement, Privacy, homepage, papers). Paper discusses LMSR subsidy (house bears bounded/standing exposure b·ln2 scaled) but no trading or withdrawal fee. Terms cap Company liability at $50 (H).

## 7. Resolution mechanism and dispute risk

- Market page has a "Rules" section; the agent that drafts the market writes the resolution criteria (H, homepage). Example (BTC $100k market) resolves on a "qualifying intraday price" per a named external price index (H, page text: "currency exchange or price index (such as CoinGecko, CoinMarketCap, or Bloomberg)").
- Paper: "a resolution oracle that pays out at $1/$0"; acknowledges real-world resolution often needs judgment and that oracles must be tamper-resistant (M). Dispute process: NOT FOUND. Resolution is by the operator/centralised system; one market on the list showed "Resolved: Yes" with $0 volume and 0 trades (H, /markets), i.e. at least one market was resolved without trading.
- Risk: centralised, LLM-authored rules, no appeal process documented. Treat resolution as unreliable for cross-venue matching.

## 8. Geo / ToS / automation

- Beta Test Agreement v1.0 (effective 23 Apr 2026): confidentiality of non-public beta materials, no reverse engineering, "may not be released commercially in the future", provided as-is (H).
- Terms of Use v1.0 (23 Apr 2026): personal, noncommercial use only; may not "access the Site in order to build a similar or competitive website, product, or service"; Acceptable Use bans using "software or automated agents or scripts ... to generate automated searches, requests, or queries to (or to strip, scrape, or mine data from) the Site", subject to robots.txt (H, section 3.3 and 2.2). 18+ only. California law/JAMS arbitration. **An automated aggregator scraping this site would breach the Terms.** No geo-restriction text found (NOT FOUND).
- robots.txt disallows `/api/`, `/agents`, `/settings`, `/login`, `/signup`; `/markets` is allowed (H).
- Company: Mycelium Markets, Inc., California; its own side business is contract engineering ("/contracts": websites, MCP tooling, Cloudflare/Supabase hosting) (H). Small team; Labs papers authored by one individual (H).

## 9. Liquidity

Tiny and, if play money, not real (H for numbers, snapshot 2026-10-19 from `/markets`): displayed per-market volume ranges from $28 to $34K; counts 0-70 trades per market; for example BTC>=100k by 2035: $12K, 11 trades; CA earthquake by 2030: $34K, 43 trades; Mangione convicted: $22K, 21 trades; "next crewed Moon landing": $11K, 70 trades. Sum over the first page is on the order of $0.2M of "volume" (my arithmetic, M) with no TVL/OI figure published. No independent press coverage found.

## 10. Event overlap with other venues

Superficial overlap only: US politics (2026 midterms control of Congress, Trump contesting results, AOC 2028, female president 2028, CA governor), macro (US CPI thresholds in 2026), a handful of sports (LA Rams Super Bowl LXI, Galatasaray title), crypto (BTC $100k). But most are long-dated or oddly worded bespoke questions (2030-2046), poorly matchable to Polymarket/Kalshi contracts. Even where matched, a play-money price is a **sentiment/signal input, not a tradeable arbitrage leg**.

## 11. Shared liquidity

None with external venues (own ledger). The paper says the pricer may read peer-venue prices as a baseline but forbids treating them as an input to the trader's belief (M); Mycelium prices may therefore be loosely anchored to other venues, which further reduces independent information.

## 12. Adapter recommendation

**skip.** Reasons: (a) synthetic currency, no settlement asset, nothing to arbitrage; (b) no public API (agent MCP requires an account; trading surface authenticated); (c) ToS prohibits automated scraping and building competing products; (d) tiny, bespoke, long-dated markets; (e) beta that "may not be released commercially". If ever wanted as a signal-only input (P2-style), revisit only with written permission from the company and an official data feed. A single watch item: if Mycelium launches real-money settlement or publishes a data API, re-evaluate.

## Open questions

- Is the currency definitively synthetic in the live product (Terms/Privacy do not say)? Only sign-up UI would show a starting balance; deliberately not done.
- MCP endpoint URL, rate limits and whether read-only market data is available without an agent key.
- Any dispute/appeal process for resolution.

## Sources

- https://www.mycelium.markets/ (home; H) - "Agent-led prediction markets", price-time FIFO, order books visible, Beta tag.
- https://www.mycelium.markets/markets and https://www.mycelium.markets/markets/will-bitcoin-ever-reach-100-000-or-higher-again (H, fetched 2026-10-19).
- https://www.mycelium.markets/robots.txt, https://www.mycelium.markets/sitemap.xml (H).
- https://www.mycelium.markets/labs (H) and PDFs https://www.mycelium.markets/labs/agent-trader-design.pdf and https://www.mycelium.markets/labs/agent-only-prediction-markets.pdf (H that they say it; M as description of the live product; May 2026, about 5 months old).
- https://www.mycelium.markets/legal/terms.pdf, /legal/beta.pdf, /legal/privacy.pdf (H; v1.0 effective 2026-04-23).
- https://www.mycelium.markets/contracts (H).
- https://dev.to/quanhao_zhao_34cdf77/what-an-agent-can-learn-from-myceliums-liquidity-map-3n97 (M; unrelated Mycelium Finance on Solana, listed to rule out confusion).
- WebSearch (extended) x2 and GitHub search: no docs, repo, or independent coverage of mycelium.markets found.
