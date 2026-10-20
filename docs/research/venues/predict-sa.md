# Predict SA (Predict South Africa, predictsouthafrica.co.za) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: unauthenticated GETs of the venue's own pages, its own public JS bundles (grep only, nothing executed) and the one documented JSON endpoint that responds. No account, wallet, key, signing, POST/PUT/DELETE, no browser automation, no PayBox money tools (one read-only `discover_plugins`). Scripted requests used the generic User-Agent `insurance-markets-research/0.1`. The shared WebSearch budget was exhausted before my first query, so there is **no independent press, regulator or third-party coverage in this note**; everything below is the venue talking about itself (self-reported). I did not use any search workaround.

Confidence tags: **H** read first-hand in a primary source this session, **M** secondary or inferred, **L** weak or stale. Pages were read as raw HTML with `curl` (not only through the WebFetch summariser), so quoted text is exact.

## 1. Verdict

- **Live (H): the site served HTTP 200 on 2026-10-19 and `/api/news` returned articles published 2026-10-16 to 2026-10-18; Terms last updated 2026-06-29; news page claims launch in June 2026 and finance markets in July 2026.** It is a custodial, rand-denominated, South-Africa-resident-only web app (Next.js on Vercel, Supabase backend). It is not on-chain.
- **Adapter priority: skip.** (1) No usable read API today: the documented `GET /api/markets` and `GET /api/markets/:id` return 404, "full documentation and API keys coming Q4 2026". (2) No trade path and the Terms ban bots without written consent. (3) Access needs a South African ID, FICA/KYC and a local bank account, and US users are excluded, so a PayBox wallet cannot reach it. (4) No evidence of real liquidity: all 21 cards on the homepage grid show "NEW" where a volume would be, 19 of 21 sit at exactly 50/50, and the one volume figure on the page ("R245K Vol") is a hard-coded mock literal in the JS bundle. (5) The legal/licence pages still contain unfilled template placeholders.
- **Re-check triggers**: `GET https://predictsouthafrica.co.za/api/markets` returns 200 JSON; keys/docs published (promised Q4 2026); any market card shows a real volume rather than "NEW"; the NGB licence number / provincial board is actually filled in on `/integrity`; written consent route for automation is clarified. Even then the realistic role is **P2 signal-only** for South-Africa-specific questions (local government elections, SARB repo rate, JSE) that no big venue lists, not an arbitrage leg.
- **Name hazards**: the Terms say the platform lives at `predictsa.co.za` (a different domain whose TLS certificate expired 2026-07-19, H) and call the company "Predict South Africa (Pty) Ltd"; the live product is on `predictsouthafrica.co.za`. Other unrelated "Predict ..." venues exist in this repo (Predict.fun, Predictstreet, etc.). Use the full domain.

## 2. Market model

- **Binary YES/NO shares, ZAR, priced R0.01-R0.99 or R1.00** (H, `/terms` s2 and s6.2; the two sections disagree on the upper bound: "between R0.01 and R1.00" vs "between R0.01 and R0.99"). Winning share redeems at R1.00, losing at R0.00 (H, `/terms` s6.4).
- **Order book claimed, not verified.** `/how-it-works` says "Your order goes into a central limit order book" and that users can mint YES+NO pairs for R1.00 each to create liquidity and sell the side they disagree with (H that it says so; whether a book exists and has depth NOT FOUND, since no market page or API is readable without a login). `/terms` s6.2 says "The price reflects the probability implied by the most recent trades" - i.e. the displayed number is probably a **last-trade price, not a bid/ask**, and it must not be used as an executable quote (M).
- **Fully collateralised custodial ledger.** FAQ: "R1.00 per share is locked in market escrow" in a "segregated wallet" (H that it says so; no proof of reserves, no audit report found). Outcomes are **not tokenised**: the front end reads Supabase tables `markets` and `positions` and a realtime channel `markets-realtime` (H, grep of the venue's own homepage bundle). The Help Center line "built on audited smart contracts and Supabase infrastructure" has no contract address, chain or audit anywhere on the site, and contradicts the ZAR-wallet design (L; treat as marketing copy).
- **Categorical markets**: the only 3-outcome card (ANC 54 / DA 28 / Other 18, "Spread", "Total", "R245K Vol") is a **hard-coded mock** in the client bundle (`probability:54 ... volume:"R245K Vol"`, H). Real cards are all rendered as a Yes/No pair, even for "Who will win Big Brother Mzansi 2026?" and "Who will be crowned Miss South Africa 2026?" (H, homepage HTML). How multi-candidate questions are modelled (one binary market per candidate vs a malformed single market) is NOT FOUND.
- Market identifiers are UUIDs (`/markets/<uuid>`); the API doc mentions filters `category`, `sub_category`, `cadence` (H, `/api-docs`), which hints at recurring/cadence markets (M).
- Counts disagree: "Showing 21 of 500 markets" (homepage), "500+" at launch (news, June), "143 finance markets" added (news, July), "170+ prediction markets" (`/how-it-works`). Note `/api/markets` is documented as "up to 500 results", so the 500 on the homepage may simply be a query cap (M).

## 3. Chains and collateral

- **No chain. Collateral is a ZAR balance in a Predict SA wallet** (H, `/terms` definitions: "your virtual account on the Platform holding your ZAR balance").
- Deposits: PayFast (card / instant EFT), Ozow, 1Voucher, BluVoucher; min R50, max R25,000 per transaction (H; the FAQ and Terms list slightly different processors). Withdrawals: min R100, to a bank account in the user's own name, 1-3 business days (H, `/terms` s5). FICA verification (SA ID plus proof of address, third-party KYC provider named in the privacy policy as Smile Identity) is required **before any deposit or withdrawal** (H).
- The site CSP allows WalletConnect, web3modal, fun.xyz and swapped.com origins (H for the CSP text), which may be unused library residue or a planned crypto route; no crypto deposit, chain or token is documented anywhere (NOT FOUND; interpretation L).
- New users get "R100 in free-to-play credits" (H, FAQ) - play money, not tradable collateral.

## 4. Read API: none usable today (planned official-authenticated, Q4 2026)

- **Docs**: https://predictsouthafrica.co.za/api-docs (H). Lists three GETs and nothing else: `GET /api/markets` (filters category, sub_category, cadence; "up to 500 results sorted by volume"), `GET /api/markets/:id` ("current prices, volume, liquidity, and resolution source"), `GET /api/news`. Then: "Full documentation and API keys coming Q4 2026" with an early-access mailbox (not contacted).
- **Live probe 2026-10-19 03:27 UTC (unauthenticated, `Accept: application/json`)**: `/api/markets` 404 (generic Next.js HTML not-found page), `/api/markets/<real uuid>` 404, `/api/markets?limit=2` 404, `/api/v1/markets` 404, `/api/markets/` 308 (then 404). **`/api/news` 200 `application/json`**: `{"articles":[{id,title,description,content,url,image,publishedAt,lang,source{id,name,url}}]}`, 4 articles, third-party headlines (eNCA, TimesLIVE, VAVEL, MarketScreener), i.e. a syndicated news feed with no market data. H.
- Other routes seen in the bundle (not probed): `/api/football/live`, `/api/football/upcoming`, `/api/kyc/status` (H that they are referenced; `/api/kyc/status` is account-bound). Not documented, no use for pricing.
- **Unofficial path, not recommended**: market detail pages are client-rendered ("Loading displayMarket...") from a Supabase project (host visible in the CSP) with realtime over wss. Reading it would need the anon key embedded in the bundle; I did not extract or use it. Doing so would sit against the Terms ("reverse-engineer", "automated ... without prior written consent") and the owner says keys come in Q4. Only the server-rendered homepage grid (title, Yes %, No %, no volume) is readable without any of that, so it is not a price feed.
- Rate limits: NOT FOUND (no doc). WebSocket: NOT FOUND (only the unofficial Supabase realtime above).
- Fixtures (`docs/research/fixtures/predict-sa/`): `api_news_trimmed_2026-10-19.json` (real shape, trimmed), `api_markets_404_2026-10-19.txt`, `api_docs_page_text_2026-10-19.txt`, `homepage_market_cards_unofficial_2026-10-19.json` (21 cards: id, title, yes/no %; volume label "NEW").

## 5. Trade path: none

No order, balance or position endpoints are documented (read-only GETs only). Trading is through the web UI with username/password, e-mail verification and FICA KYC. `/terms` s7 lists as prohibited: "Use any automated trading system, bot, script, or algorithmic trading tool without prior written consent from Predict SA" (H). So even after the Q4 API, order placement for a scanner would need written consent, a verified SA identity and a local bank account.

## 6. PayBox reachability: no

A PayBox wallet (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) cannot fund or trade this venue: there is no contract, no signed-order scheme and no transaction proposal to submit; funding is ZAR via PayFast/Ozow/vouchers and withdrawal is to a named SA bank account after SA-ID KYC; the Terms exclude users outside South Africa (US named explicitly). `discover_plugins` for "predict south africa prediction market" returned no plugin (H, 2026-10-19).

## 7. Fees

- **`/fees` and `/terms` s5.3 (H)**: resolution fee 3% of net profit on winning positions only, `fee = 0.03 * max(0, payout - cost)`; early exit fee 1% of sale value, `fee = 0.01 * shares * sale_price`; no deposit, withdrawal, account or inactivity fees. Worked example on the page: R250 buys 480 YES at R0.52 (cost R249.60); win pays R480, profit R230.40, fee R6.91 (3% of 230.40 = 6.912), receive R473.09; sell at R0.65 gives R312.00 less R3.12 fee. The venue changes fees on 14 days' notice (`/terms` s5.3).
- **Conflict (H that both texts exist)**: `/how-it-works` FAQ also says "a 0.5% taker fee when your order matches ... Makers ... pay 0%". The `/fees` page and Terms ("No other fees") do not mention a taker fee. Model the taker fee as possibly 0.5% until the API docs settle it (M).
- Effective hold-to-resolution cost for a buyer at price p per share: extra `0.03 * (1 - p)` per share on a win, so about 1.5% at p=0.50. Fees are charged by the venue to the trader; the FAQ says resting limit orders pay 0%, and there are "Rewards" volume rebate tiers (1%/2%/3%/5% at R1,000/R10,000/R50,000/R250,000 monthly volume; "launch Q3 2026", H `/rewards`, whether live NOT FOUND).

## 8. Resolution and dispute risk: high for cross-venue use

- Each market names a source before opening (IEC for elections, SARB/Stats SA/JSE/Bloomberg for finance, PSL/API-Football for sport; H `/docs`, `/integrity`). Criteria "locked in before the first trade ... cannot be changed" (H, `/integrity`).
- **The operator resolves**: "our admin team resolves the market" (`/integrity`); FAQ says "AI-assisted resolution system checks the named source ... For ambiguous cases, an admin reviews" (H, `/how-it-works`). Decisions are "final and binding" (`/terms` s6.3). Disputes: email within 48 hours of resolution, reviewed by a senior staff member not involved, answer within 5 business days (H, `/integrity`). `/learn` says "No ambiguity, no appeals" (H) which contradicts that - internal inconsistency.
- The operator may cancel a market "in its sole discretion" (event unverifiable, ambiguous, new information) with refunds at price paid, and may void "manifestly incorrect" trades (H, `/terms` s6.5, 6.6). Payouts within 24 hours of resolution.
- Counterparty risk: custodial ZAR wallet, "not a deposit ... not protected by any deposit insurance" (H, `/terms` s4); "segregated accounts" claimed, not evidenced.
- Basis risk if a question looks like a Polymarket/Kalshi one: different resolution source and a single-operator resolution, so a "matched" pair is not a hedge. Link only with human-reviewed mappings.

## 9. Geo, ToS, automation, regulatory status (H)

- Users must be 18+ **and South African residents**; sign-up asks full legal name per ID, SA ID number, residential address in South Africa; the US, China and sanctioned jurisdictions are excluded by name (`/terms` s3).
- One account per person; no market manipulation, wash or coordinated trading, insider trading; **no bots/scripts/algorithms without prior written consent**; no reverse-engineering (`/terms` s7). Breach: suspension, voiding of trades, forfeiture of funds.
- Self-description is inconsistent: the footer says "not regulated by the FSCA"; `/terms` calls it a "prediction market (gambling product)" and a "licensed betting operator" under a provincial gambling board and the National Gambling Board; `/how-it-works` says "Is this gambling? No"; Help says "not a bookmaker". **The licence fields on `/terms` s17 and `/integrity` are unfilled template placeholders** ("[NGB License Number]", "[Provincial Gambling Board]", "[Company Registration Number]", "[Physical Address]"), so no licence is evidenced (H for the placeholders; the licence status itself NOT FOUND, and I could not search regulator registers). Press page: founded 2026, Cape Town.

## 10. Liquidity and activity (as of 2026-10-19)

- **Volume / OI / TVL: NOT FOUND (not published; no leaderboard data, "Live activity feed coming soon").**
- Evidence of thinness (H, homepage HTML 2026-10-19): grid says "Showing 21 of 500 markets"; the volume slot of all 21 cards reads "NEW"; 19 of 21 are exactly Yes 50 / No 50, the other two are 23/77 (KwaZulu-Natal flood disaster) and 32/68 (Cabo Delgado intervention); the leaderboard page has no rows in the server-rendered HTML; `/accuracy` says "our first cohort is still open". The `/activity` page lists "volume crossed R50,000" for a petrol-price market and a "SARB rate decision" as the most active finance market, but this is unlabelled static copy (L).
- Several listed questions look past their dates yet still show a "Make your call" button: "Parliament adopt ... before 30 September 2026", "Largest company ... at September 30, 2026", "Will Bafana Bafana qualify for the 2026 FIFA World Cup?" (H as listing observation; inference of poor market hygiene is L).
- Min deposit R50 and an unlaunched rewards programme suggest a small retail user base (M). Anyone sizing should assume rand-scale stakes, not USD-scale.

## 11. Event coverage and shared liquidity

- Categories: Politics, Sports, Finance, Technology, Culture/Social, Climate, Elections, plus Mentions and Crypto tabs (H, tab names). Content is overwhelmingly South-Africa-local: Local Government Elections 2026 (ANC/DA/MK/EFF seat and vote-share questions, Johannesburg, Tshwane), SARB repo-rate decisions, JSE indices, Springboks, PSL, CAF Champions League (Orlando Pirates), court cases, reality TV, Miss SA.
- **Overlap with other venues is thin**: "How many Fed rate cuts in 2026?" and "Largest company in the world by market cap at September 30, 2026?" (the latter phrasing is Polymarket-style, M) look globally comparable, but both were at 50/50 "NEW", so there is no price to compare. I did not check the big venues' catalogues in this task, so whether SARB/JSE/PSL/LGE questions exist elsewhere is NOT VERIFIED (they look SA-specific, L).
- Shared liquidity: none documented; the Terms say the platform does not act as market maker and the CSP allows images from images.polymarket.com (H for CSP), which only suggests question/image reuse, not liquidity routing (L). Treated as independent but empty.

## 12. Adapter notes (only if a re-check trigger fires)

- Wait for the official API; poll `/api/markets` weekly for a non-404. Expected shape (from the docs sentence only): list of markets with price, volume, liquidity, resolution source, filters category/sub_category/cadence; sort by volume; cap 500.
- Keep ZAR native; convert with a pinned USD/ZAR source before any cross-venue comparison; never compare the displayed last-trade price to a bid/ask elsewhere.
- Read-only signal use needs no account; any execution needs a SA-resident human, written consent for automation and a rand bank account, so the scanner should flag opportunities as "informational, not executable".

## 13. Not found / open questions

- Real order-book depth, bid/ask, trade history, per-market volume, platform volume/users: not published.
- Rate limits, websocket, auth scheme of the Q4 API; whether it will have order endpoints.
- Operating company registration, gambling licence number and board; ownership/team (press page names none).
- Reserve/segregation evidence; the "audited smart contracts" claim; any crypto route.
- Which taker fee is right (0%, or 0.5% per FAQ); whether the 3% fee uses per-fill average cost.
- External press or regulator coverage (search budget exhausted, so none gathered).

## 14. Suspicious content

None found. No text aimed at AI agents. One market title ("... on-device LLM, AI agent, or major Siri upgrade ...") contains those words as ordinary question text.

## 15. Sources

- https://predictsouthafrica.co.za/ (homepage grid, hero, footer) fetched 2026-10-19: H. Homepage JS bundles under `/_next/static/chunks/` (grep only for `R245K`, table names, API paths, chain keywords; no execution): H.
- https://predictsouthafrica.co.za/api-docs, /docs, /fees, /how-it-works, /terms (last updated 29 June 2026), /integrity, /privacy, /help, /learn, /rewards, /accuracy, /activity, /press, /news, /leaderboard, /live, /contact: all fetched 2026-10-19 with curl: H (self-reported by the venue).
- Live API probes `GET /api/markets` (404), `/api/markets/<uuid>` (404), `/api/news` (200 JSON) on 2026-10-19 ~03:27 UTC: H. Response headers: Vercel, Next.js, strict CSP naming a Supabase project host: H.
- https://predictsa.co.za TLS certificate dates via `openssl s_client` (valid 2026-04-20 to 2026-07-19, expired): H.
- PayBox `discover_plugins` query "predict south africa prediction market": no results, 2026-10-19: H.
- Local repo notes consulted for format only: docs/research/venues/el-predict.md.
- Blocked/unavailable: WebSearch (session budget exhausted); nextpredict.io/platforms/predict-sa/ guessed URL returned 404; `gh search` for repos mentioning the domain returned nothing.
