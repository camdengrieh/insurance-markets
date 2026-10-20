# PolySouq (polysouq.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.
WebSearch was unavailable this session (shared budget exhausted), so no third-party corroboration was gathered. Everything below comes from the venue's own site files plus Wikidata.

## Verdict

- Slug: polysouq. Kind: custodial, Arabic-first parimutuel pool "prediction market" (not on-chain, not an order book, not an AMM).
- Live: yes, as of 2026-10-19 (site serves 200, llms.txt says "Last updated: 2026-09-20", sitemap ~927KB). [H]
- adapter_priority: skip. No documented API, custodial account-only trading, no early exit, no sell, payout is a moving estimate rather than an executable price, and no volume or TVL is published. At most a manual signal source for Gulf-specific markets (TASI, DFM, Saudi Pro League) that no other venue lists.

## Market model [H unless noted]

- Parimutuel pool. Each market is YES/NO (binary); the comparison article says "multi-answer events (three or more outcomes) are the norm", realised as groups of binary markets per event (e.g. football 1X2 per fixture). [H, llms-full.txt sec 2; comparison article]
- Outcomes are NOT tokenised. There are no shares, no order book, no limit orders, no market maker, no leverage, no selling, no early exit. Only exception: a football stake can be cancelled before kickoff for a full refund. [H, https://www.polysouq.com/llms-full.txt sec 2-3]
- Displayed "price" = each side's share of money staked; it moves with every new stake. Displayed payout is an estimate, not locked at entry. [H]
- Payout = stake x (1 + S_lose / S_win x 0.90). Winners keep their stake. If no one is on the losing side, or no one backed the realised outcome, all stakes are refunded with zero commission. Void/cancel = full refund. [H]
- Discrepancy: the site JS bundle references `/trade/sell`, `/trade/cancel` and `/markets/{id}/orderbook`, while the docs say no sell and no order book. Likely vestigial or football-cancel related; unverified. [M]

## Chains and collateral

- USDC on Polygon only for deposit and withdrawal; balance displays in USD. Minimum deposit $10, minimum withdrawal $5, withdrawal requires verified email, larger withdrawals may be manually reviewed (so not instant). No cards, bank, fiat or wallet-connect. [H, llms-full.txt sec 6]
- Funds are held in the operator's custody: each user gets a personal Polygon deposit address from the Portfolio page; trades are internal ledger entries. No contract addresses published. Searched: llms.txt, llms-full.txt, comparison article. NOT FOUND (smart contract, on-chain verification). [H for deposit model; NOT FOUND for contracts]
- Bundle references wallet nonce/verify auth endpoints (`/auth/wallet/nonce`, `/auth/wallet/verify`) though docs say wallet-connect is unsupported. [M, bundle strings only]

## Read API

- exists: none documented. The site is a React SPA that talks to a first-party backend under `/api` (bundle strings: `/events`, `/events/by-slug/{slug}`, `/markets`, `/markets/{id}`, `/market/{id}/pool`, `/events/resolved`, `/football/*`, `/crypto/*-updown/*`, `/leaderboard`, `/trade/buy`, `/trade/positions`, `/trade/history`, `/payments/crypto/*`, `/admin/*`). [M, read from https://www.polysouq.com/assets/api-rVdwZnoS.js; this is the front-end's private API, not a published one]
- robots.txt contains `Disallow: /api/` and a Crawl-delay; no developer docs, no API-key page, no OpenAPI found. I did NOT probe `/api/*` (undocumented, disallowed by robots). [H, https://www.polysouq.com/robots.txt]
- Auth: Bearer token from email/Google login (stored as `ps_token`); WebSocket at wss://www.polysouq.com/ws with `{action:"auth",token}` and `{action:"subscribe",channel}` messages. [M, from https://www.polysouq.com/assets/useWebSocket-BsL3zL4R.js]
- Rate limits: NOT FOUND (searched: llms.txt, llms-full.txt, robots.txt).
- Fixtures: none saved (no public documented API to sample).

## Trade path

- None programmatic. Trading requires an account (email or Google), a Polygon USDC deposit and use of the website. No documented API keys, signed orders or contract calls. Automating the private front-end API would be unauthorised scraping and Cloudflare challenges pages. NOT FOUND (searched: llms.txt, llms-full.txt, sitemap non-research pages). Terms page /terms is JS-rendered and was not read. [H for absence of docs]

## PayBox reachability

- paybox_reachable: partial. A PayBox EVM wallet on Polygon could send USDC to a user's personal deposit address (funding) and receive withdrawals, via an ordinary transfer. It cannot place or cancel stakes via transaction proposals or signed orders because there is no on-chain market or order protocol. Creating the account and deposit address needs a manual signup, which is out of scope here. [M]

## Fees [H]

- 10% commission on the losing pool only, taken at settlement; no entry fee, subscription, spread or deposit fee. Network fees on Polygon withdrawals not stated (NOT FOUND).
- Arbitrage implication: stake price is not locked and the payout depends on final pool sizes, so the effective price you obtain is uncertain until settlement; a late arbitrage stake also moves the pool against itself.

## Resolution and dispute risk

- Each market names a resolution source before opening (football: official final score; financial: named exchange close; political: named primary source; crypto up/down: a named price source). If the source is unavailable or the market cannot be resolved it is voided and refunded. [H, llms-full.txt sec 5; https://www.polysouq.com/en/research/safety/how-polysouq-settles-markets-transparently]
- Operator decides settlement. The bundle shows admin routes for "ai-settlements" (accept/reject), auto-settle health and manual pool settle, i.e. AI-assisted proposals with admin approval. No public dispute process or bond. [M, bundle strings]
- Dispute risk: high relative to on-chain venues (centralised operator discretion, custody risk, operator can void). Rules for other venues' same-event markets can differ in wording, so basis risk is real.

## Geo / ToS / automation

- Targeted at GCC and wider Arab world; the site describes legality as varying by country and says users should check local rules. No explicit blocked-country list found in the material read. NOT FOUND (searched: llms.txt, llms-full.txt, legal and safety article). [H]
- Terms of service not read (JS-only page at https://www.polysouq.com/terms). Automation rules unknown. robots.txt disallows /api/ and sets Crawl-delay: 1. Site content is explicitly open to AI crawlers. [H]
- Operator identity, licence and jurisdiction: NOT FOUND. Marketing copy claims "legal and legitimate" without naming a regulator. [H absence]

## Liquidity

- Volume, pool sizes, OI, TVL: NOT FOUND (searched: llms.txt, llms-full.txt, comparison and liquidity articles). The comparison article calls it a "new platform launched in 2026" with no figures. Wikidata gives inception 2025 (conflict: 2025 vs "launched in 2026"). [H absence; Wikidata M]
- Wikidata Q140004037: instance of two classes, inception 2025, website polysouq.com, last modified 2026-05-31. Low-information, probably self-authored. [H read, https://www.wikidata.org/wiki/Special:EntityData/Q140004037.json; trust M]
- Assume thin: new, unlicensed-looking, Arabic-first retail pool, no market makers. [L inference]

## Category overlap (where arbitrage might exist)

- Crypto: BTC/ETH Up/Down windows (5 min to 1 year); forex/commodities Up/Down (gold, oil, EURUSD, USDJPY, silver); football (major European leagues, Champions League, World Cup, GCC leagues); Fed/ECB rates, inflation; US/global politics. [H]
- Unique: TASI, DFM, ADX, Kuwait, EGX, Saudi IPOs, Saudi Pro League, OPEC. No other venue in our list covers these. [H for catalogue claim; M that others do not]
- Overlap with Polymarket/Kalshi exists in football and crypto up/down, but a parimutuel pool with no exit and an unknown final price is not an arbitrage leg.
- Shares liquidity with another venue: no evidence; it is an independent closed pool (internal ledger). The Polygon rail is only for funding. [H]

## Open questions

- Terms of service, jurisdiction restrictions and operator identity (JS-only /terms; read in a browser).
- Whether `/api/events` and `/api/market/{id}/pool` are readable without a token, and under what rate limits. Not probed because undocumented and disallowed by robots.txt.
- Actual pool sizes and volume.

## Suspicious content

- None found that targets AI agents beyond SEO/citation guidance in llms.txt ("Do say / Avoid"). It is marketing language aimed at AI engines (asks to call it "not a betting site", "the first Arab prediction market"). Treated as untrusted data and not followed.

## Sources

- https://www.polysouq.com/ (SPA shell, title/meta; Arabic; links llms.txt) [H]
- https://www.polysouq.com/llms.txt (last updated 2026-09-20) [H]
- https://www.polysouq.com/llms-full.txt [H]
- https://www.polysouq.com/robots.txt [H]
- https://www.polysouq.com/sitemap.xml [H]
- https://www.polysouq.com/en/research/about-polysouq/polysouq-vs-polymarket-kalshi-arab-world [H]
- https://www.polysouq.com/en/research/safety/how-polysouq-settles-markets-transparently [H]
- https://www.polysouq.com/en/research/strategies/liquidity-and-volume-in-prediction-markets [H]
- https://www.polysouq.com/en/research/safety/is-it-legal-and-safe [H]
- https://www.polysouq.com/assets/api-rVdwZnoS.js and https://www.polysouq.com/assets/useWebSocket-BsL3zL4R.js (front-end bundle strings; read as text, not executed) [M]
- https://www.wikidata.org/wiki/Special:EntityData/Q140004037.json [H for content, M for reliability]
