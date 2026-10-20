# SpreadCore (spreadcore.xyz) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.
Scope: read-only research. No account, login, signup, payment, wallet connection or POST was made. The private `/api/*` paths were NOT probed (robots.txt disallows them).

## Verdict

- SpreadCore is a subscription SaaS terminal, not a venue. It has no order book, no markets, no tokens, no public API. (H)
- Its prediction-market leg executes on Polymarket's CLOB, using the subscriber's own wallet key. Per its Telegram channel it added Kalshi on 2026-09-29. (H for the post, details NOT FOUND)
- It therefore shares 100% of its prediction-market liquidity with Polymarket (and now Kalshi). It is NOT an independent arbitrage leg.
- Value to us is competitor and precedent intel only: a live, paid, Polymarket-vs-sportsbook arb product doing ~$20-40M/month of Polymarket volume. The only machine-readable trace is Polymarket's public builder leaderboard (a Polymarket endpoint, fixtures saved).
- adapter_priority: skip.

## 1. Identity and liveness (still live: yes)

- Site https://spreadcore.xyz returned HTTP 200 on 2026-10-19; footer says "(c) 2026 SpreadCore". (H) https://spreadcore.xyz
- Domain registered 2026-04-17, expires 2027-04-17 (RDAP). (H) https://rdap.centralnic.com/xyz/domain/spreadcore.xyz
- Telegram channel created 2026-04-29; latest public post 2026-10-06; ~1.04K subscribers. (H) https://t.me/s/spreadcore
- Polymarket on-chain-attributed volume continued through 2026-10-18 ($2.22M, 33 active users that day). (H) data-api builders/volume, see section 10.
- Operator or legal entity: NOT FOUND (searched: landing page, footer, docs, Telegram preview, JSON-LD). Terms and Risk links on the landing page point to "#", so no published Terms of Service. (H)
- Naming: Telegram posts say "Spread Core"; Polymarket builder profile is named "SpreadCore.xyz", verified=true. (H)

## 2. Kind and market model

- Kind: cross-venue aggregator and arbitrage terminal, Polymarket vs bookmakers, sports only. (H) https://spreadcore.xyz and https://docs.spreadcore.xyz/
- No market model of its own. Legs it trades:
  - Polymarket leg: binary outcome tokens on the Polymarket CLOB. Example in the demo UI: "Poly Brazil NO 11c" paired with "Pinnacle Brazil @ 1.13". (H for the UI text, M for the token model, defer to the Polymarket spec)
  - Bookmaker leg: fixed decimal odds at Pinnacle, Stake, Duel, Empire, Roobet, BC.Game, Mellstroy, SX and "more". (H landing page) Docs list Stake, Pinnacle, Empire, Mellstroy, Roobet, Shuffle. (H https://docs.spreadcore.xyz/getting-started/bk-preimushestva-i-nedostatki) Telegram says 13 books by 2026-07-17 and Gamdom added 2026-06-30. (H)
  - Kalshi: "Added Kalshi" in the 2026-09-29 post (my translation). How it is used (as a PM leg vs the books) and which markets: NOT FOUND. The landing page and docs still describe Polymarket only. (H)
- Arb types in the dashboard: Prematch (market-buy, fee-inclusive), LIVE, Paused, LIMIT (no Polymarket fee, best-price ladder). (H https://docs.spreadcore.xyz/getting-started/panel-nastroek-vilok)

## 3. Chains and collateral

- SpreadCore itself: no chain. It never custodies funds (claim). (H landing FAQ)
- Polymarket leg: Polymarket's own chain and collateral (Polygon, USDC family per Polymarket spec). PolyMart's listing says users pay Polygon gas for USDC deposits and withdrawals. (M https://polymart.app/spreadcore)
- Subscription payment: crypto via WhitePay, inside the Telegram bot. (H landing page) Chain and token for that payment: NOT FOUND.
- Bookmaker legs are custodial off-chain balances (crypto casinos and Pinnacle). (M)

## 4. Read API

- exists: none. No public or documented API, no API keys, no OpenAPI, no SDK, no GitHub repo found. (H landing page, docs sitemap has 8 pages, none about an API)
- Docs: https://docs.spreadcore.xyz/ (GitBook, Russian, user guide only). (H)
- Private backend: the login page's inline JS calls `/api/login` and `/api/login/2fa`; the login uses a 6-digit authenticator code. robots.txt disallows `/api/`, `/auth/`, `/billing`, `/webhook/`. Not probed. (H)
- Feed: the terminal streams prices over WebSocket to the logged-in browser ("WS LIVE 36ms" in the demo, "<100 ms" and "sub-second" claims). Endpoint and protocol: NOT FOUND. Latency numbers are marketing claims. (L)
- Rate limits: NOT FOUND.
- Telegram alerts (fills, new forks, auto-cancels) go to a bot the subscriber creates; the subscriber pastes a Bot Token into the SpreadCore settings. That is not a data API for us. (H https://docs.spreadcore.xyz/getting-started/quickstart)

Adjacent public data (belongs to the Polymarket adapter, not a SpreadCore API) - unauthenticated GETs confirmed 2026-10-19:

- `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY|WEEK|MONTH|ALL&limit=N` returns rows `{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}`. (H) Note: this endpoint is not listed in https://docs.polymarket.com/llms.txt; the docs only reference the web leaderboard https://builders.polymarket.com ("matched volume can take up to 24 hours to appear"). Treat the endpoint as undocumented and subject to change.
- `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=DAY|WEEK|MONTH|ALL` returns a time series `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}`. (H, undocumented as above; the DAY response was ~17 MB, so avoid it)
- Fixtures (all raw rows, subsets only): `docs/research/fixtures/spreadcore/`.

## 5. Trade path

- Polymarket leg is automated by SpreadCore with the subscriber's credentials:
  - Settings take a Private Key and a Funder Address (public Polymarket wallet address), plus a "connection type"; for a regular wallet such as MetaMask the docs say to use type 2. 2FA must be enabled or trading is impossible. (H https://docs.spreadcore.xyz/getting-started/quickstart)
  - Polymarket's wallet docs map signatureType 2 to the legacy GNOSIS_SAFE wallet (MetaMask or Rabby external signer). Accounts deployed on or after 2026-05-04 use the new DEPOSIT_WALLET (type 3), which has scoped Session Keys. (H https://docs.polymarket.com/trading/wallets-auth.md and https://docs.polymarket.com/trading/session-keys.md) Whether SpreadCore supports type 3 or Session Keys: NOT FOUND. The docs mention type 2 only, and the same page asks for at least one 5+ share trade "so the bot sees your address".
  - Order types: BUY limit or market, with auto-cancel (a) if the bookmaker odds move against the order, (b) N minutes before kickoff. Many resting limits at once (docs mention up to ~50 events). (H https://docs.spreadcore.xyz/getting-started/publish-your-docs and obzor-dashborda)
  - Orders carry SpreadCore's Polymarket builder code, which is how its volume is publicly attributed. (H leaderboard row; mechanism per https://docs.polymarket.com/programs/builders/overview.md)
- Bookmaker leg is MANUAL. The terminal shows the direction, price and a deep link per book; the user places the bet. The calculator "shows the exact stake to place at the book"; a Telegram message fires when the Polymarket limit fills "and you place on the book". (H landing "How it works" step 3; docs publish-your-docs; PolyMart "You handle this leg yourself" M) This contradicts the discovery hint that SpreadCore "places the hedge through the user's own accounts". Only the Polymarket leg is shown as auto-executed. Whether any book (e.g. Stake, which has a "Mirror URL" setting) is driven automatically: NOT FOUND.
- Key custody: the user types a raw wallet private key into SpreadCore's settings. Despite "your keys" and "we never custody funds" on the landing page, SpreadCore's service must hold the key (or a derived credential) to auto-cancel and alert while the user is away. Server-side storage is my inference (M); the docs do not say where the key lives.

## 6. PayBox reachability

- paybox_reachable: no.
- SpreadCore has no on-chain surface and no programmatic API for us to call. The model it offers (hand over a wallet private key) is incompatible with a non-custodial PayBox wallet.
- The Polymarket leg is reachable only through the Polymarket adapter (signed CLOB orders; Session Keys where applicable), not through SpreadCore.
- Bookmaker legs are custodial KYC'd or crypto-casino accounts, not reachable by transaction proposals.
- Not attempted (read-only run): subscription payment to WhitePay.

## 7. Fees

- Subscription (USD, paid in crypto via WhitePay in the Telegram bot): Trial $0 for 3 days (new users); 14 days $160; 30 days $299; 90 days $799. (H landing page and JSON-LD)
- No per-trade fee from SpreadCore stated; PolyMart says "no per-trade fee". (M) The SpreadCore builder fee setting on Polymarket (taker up to 100 bps, maker up to 50 bps, default 0, paid by the user on top of platform fees per https://docs.polymarket.com/programs/builders/fees.md): SpreadCore's actual rate NOT FOUND (no documented query endpoint). Polymarket can disable a builder code or revoke fee charging at its discretion. (H docs)
- Polymarket platform fees apply to market (taker) orders; limit orders show no Polymarket fee and earn a maker rebate in the UI. Docs example: fee of "$9" on a "$1000" market-taken fork (event-specific, from the dashboard help text). (H https://docs.spreadcore.xyz/getting-started/obzor-dashborda) Defer exact formulas to the Polymarket spec.
- Bookmaker costs: odds margin, withdrawal and gas costs, and bonus terms; paid by the user. (M)
- Demo math check (my arithmetic, M): "6,000 shares x 11c = $660", hedge at 1.13 needs stake 6000/1.13 = $5,309.73, locked profit 6000 - 660 - 5,309.73 = $30.27, which matches the displayed "+$30.27" and "+0.5%". The demo shows the hedge stake as "$530", which looks like a display typo. Takeaway: advertised edges are ~0.3-0.5% of capital per fork. (H for the displayed numbers)

## 8. Resolution and dispute risk

- SpreadCore does not resolve anything. "Winner auto-resolved POLY or BK" is internal PnL bookkeeping. (H)
- Each leg settles under its own venue's rules: Polymarket (oracle and dispute process per the Polymarket spec) and each bookmaker's house rules. The two rulebooks can differ (e.g. extra time, voids, postponements).
- The vendor's own admissions: risk is execution risk, "if only one leg fills (the fork moves, a book voids, you mis-size), you're temporarily exposed". (H landing FAQ). Docs warn Roobet may cancel tier 2-3 matches on an unseasoned account. (H docs, my paraphrase of Russian text). Calling the product "risk-free" is marketing.
- Account-level risk from the books: limit cuts for +EV betting, KYC requests after wins, a "profit trigger" at Mellstroy (video call at roughly $7-10k profit; one reported withdrawal block). (H docs, my translation) These are the practical dispute and counterparty risks, not oracle risk.

## 9. Geo, ToS and automation

- No Terms or Risk-notice page exists (links are "#"). (H)
- FAQ: legality "depends on where you live and each platform's terms. You're responsible for compliance". No geo-block statement. (H)
- Bookmakers used are largely offshore crypto casinos plus Pinnacle; some require KYC and may restrict arbing or profitable accounts. (M, inferred from the docs' own warnings)
- Automation: the product is itself an automation layer on Polymarket via builder-code orders. Polymarket's attitude toward third-party builders is the Builder Program (verified badge, tiers). SpreadCore's profile is verified=true. (H leaderboard row)
- docs.spreadcore.xyz robots.txt states `Content-Signal: ai-train=yes, search=yes, ai-input=yes`. spreadcore.xyz robots.txt allows `/` and disallows the private paths above. (H)

## 10. Liquidity (Polymarket volume attributed to SpreadCore's builder code)

Source: `data-api.polymarket.com/v1/builders/leaderboard` and `/v1/builders/volume`, fetched 2026-10-19. (H) "volume" is matched trade notional through orders carrying SpreadCore's builder code, so it is only the Polymarket leg of subscribers. Fixtures are in `docs/research/fixtures/spreadcore/`.

| Window (UTC) | Volume | Active users | Rank |
| --- | --- | --- | --- |
| ALL (since first trade ~late May 2026) | $159.74M | 253 | 10 |
| Oct 2026 (to 2026-10-19) | $19.70M | 70 | 6 |
| Sep 2026 | $41.70M | 92 | 4 |
| Aug 2026 | $38.62M | 124 | 4 |
| Jul 2026 | $37.81M | 100 | 6 |
| Jun 2026 | $21.91M | 65 | 13 |
| Week of 2026-10-11 | $6.83M | 48 | 7 |
| Week of 2026-10-04 | $8.62M | 59 | 6 |
| Peak week (2026-06-28) | $15.57M | 67 | 7 |

- Roughly $450k per active user per month in Sep (41.70M / 92, my arithmetic). Heavy users, small cohort. Active users and volume are drifting down from the Aug peak (124 users) to Oct (70 so far, partial month). (M, interpretation)
- Vendor self-claims (all L until corroborated): landing "$48M+ volume scanned" (stale vs leaderboard); Telegram 2026-06-30 ">$21M" June turnover with ">0.5% average fork ROI, >$100,000 profit"; 2026-07-17 ">$50M turnover, >$500,000 profit, 13 books"; 2026-09-03 ">$100M confirmed on builders.polymarket.com". The volume claims are corroborated by the leaderboard. The profit claims and "97% win rate" are NOT independently verified.
- Open interest or TVL: not applicable (no pool or book).

## 11. Event coverage and overlap

- Categories: sports and esports only - football (incl. qualifiers), basketball (demo: Lakers vs Celtics), tennis (added by 2026-05-30), baseball (by 2026-07-17), CS2, Dota 2. Markets: 3-way and draw legs seen; Totals and Spreads "coming" as of 2026-06-30. (H landing and Telegram posts)
- Politics, macro, crypto-price: NOT FOUND (bookmaker side does not cover them).
- Overlap with our aggregation layer: sports moneyline-type contracts exist on Polymarket, Kalshi and (per our other specs) other PM venues, so the same event universe feeds both its fork scanner and a PM-vs-PM scanner. Its book legs have no analogue in our PM-to-PM design.

## 12. Shared liquidity

- Shares liquidity with Polymarket: yes, entirely (every executed order is a Polymarket CLOB order). Kalshi added 2026-09-29 per Telegram (details NOT FOUND). Book legs sit on third-party sportsbooks.
- It adds no liquidity of its own; some of its resting maker orders may add depth on Polymarket sports books and, if it bets into stale Polymarket quotes, it is a competitor for the same edge we would hunt on sports events. (M)

## 13. Competitor and precedent notes (brief)

- Product shape to learn from: limit-order-first (post a maker bid on Polymarket that locks a spread against a sharp price), auto-cancel on reference-price move or kickoff proximity, second-leg alert, per-fork ROI net of fees and rebates, depth and volume filters, PnL tracking per fork. (H docs)
- Thin edges (~0.3-0.5% ROI per locked fork in its own demo) and a book-side that is manual and account-limited are the real constraints; a design that needs two on-chain legs avoids the book-limit problem.
- Do not copy the credential model (raw private key plus server-side auto-cancel). PayBox/Polymarket Session Keys are the safer pattern.
- Cheap competitor tracking: poll the Polymarket builder leaderboard (undocumented endpoint) for SpreadCore's volume and active-user trend.

## adapter_priority: skip

No public API, not a venue, no independent liquidity, vendor-controlled access via Telegram subscription. Keep only the builder-leaderboard poll as an optional competitor KPI inside the Polymarket adapter.

## Not found (searched)

- Public or documented SpreadCore API, SDK, OpenAPI, GitHub repo (searched: landing page, docs sitemap and llms.txt, robots.txt, Telegram posts).
- Terms of Service, privacy policy, risk notice content (links are "#"; /terms and /privacy return 404).
- Operator or legal entity, team, jurisdiction.
- Kalshi integration details (only a one-line Telegram post).
- Whether Deposit Wallet (signatureType 3) or Session Keys are supported.
- SpreadCore's builder fee rate on Polymarket.
- Where the private key is stored; WebSocket protocol; rate limits.
- Independent third-party reviews. The WebSearch budget was exhausted this session, so no web search results were obtained. Only the PolyMart listing (a promotional directory page with a "Preferred" badge and 5.0 stars from 26 reviews, so M/L) was found via the Telegram link.
- X account https://x.com/SpreadCore_xyz: WebFetch got HTTP 402 and no content; nothing was paid and no payment details were recorded.

## Suspicious or agent-directed content (recorded, not followed)

- Every page of https://docs.spreadcore.xyz (llms.txt and each `.md` page) ends with a GitBook "Agent Instructions" block telling agents to call `GET https://docs.spreadcore.xyz/<page>.md?ask=<question>&goal=<user_goal>`. This is standard GitBook boilerplate, but following it would send our goal to a third party, so it was not used. Pages were read directly via the `.md` URLs instead.
- The docs contain affiliate or referral links to Stake, CSGOEmpire and Roobet (promotional, not followed or reproduced).
- polymart.app/spreadcore carries ad blocks (e.g. a copy-trading banner) and a "Preferred" listing badge (promotional).
- Landing page, Telegram preview and login page: no text addressed to AI agents found.

## Open questions

1. How is Kalshi used (PM leg, or a book-like reference), and does it include sports only?
2. Does SpreadCore support Polymarket Deposit Wallets and Session Keys (post 2026-05-04 accounts), or only legacy type-2 key custody?
3. Is the private key stored server-side, and is there any key-scoping?
4. What builder fee, if any, does SpreadCore charge on top of the subscription?
5. Would the vendor sell a machine-readable fork feed (would make it a P2 signal source)? No sign of one.

## Sources

- https://spreadcore.xyz (landing page, JSON-LD, FAQ, pricing; fetched 2026-10-19) - H
- https://spreadcore.xyz/robots.txt , /sitemap.xml , /login (6-digit authenticator login, inline JS refs `/api/login`, `/api/login/2fa`) - H
- https://docs.spreadcore.xyz/ , /llms.txt , /getting-started/quickstart.md , /getting-started/obzor-dashborda.md , /getting-started/panel-nastroek-vilok.md , /getting-started/bk-preimushestva-i-nedostatki.md , /getting-started/publish-your-docs.md , /fishki-udobstva/editor.md , /fishki-udobstva/interactive-blocks.md (Russian, my translations) - H
- https://t.me/s/spreadcore (public channel preview, posts 1-45, 2026-04-29 to 2026-10-06; saved as fixture) - H for what was posted, L for the vendor's claims
- https://rdap.centralnic.com/xyz/domain/spreadcore.xyz (domain registration 2026-04-17) - H
- https://data-api.polymarket.com/v1/builders/leaderboard and /v1/builders/volume (fetched 2026-10-19; fixtures) - H for the response, endpoints undocumented
- https://builders.polymarket.com (leaderboard UI shows SpreadCore.xyz rank 6, $19.70M "1m Volume") - H
- https://docs.polymarket.com/programs/builders/overview.md , /programs/builders/fees.md , /trading/wallets-auth.md , /trading/session-keys.md - H
- https://polymart.app/spreadcore (third-party directory listing, updated Jul 22) - M/L
- https://www.youtube.com/watch?v=Ai--YzcErMM (title only: "SpreadCore - обзор вилок с Polymarlet"; content not reviewed) - L
