# BetOpenly (betopenly.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY. Sources: the public static site (HTML, the Angular client bundle read as text, HTTP headers), one EventTracker page, GitHub code/repo search. No account, no login, no wallet, no POST, no signing, no payment, no browser automation. **The BetOpenly API was NOT called**: it is undocumented, and the Terms forbid automated access (section 8). WebSearch budget was exhausted for the whole session, so there is no third-party press/news coverage in this note.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak/stale. Where something is not documented it says NOT FOUND (searched: ...).

Fixtures (docs/research/fixtures/betopenly/): `homepage-liveness-2026-10-19.txt` (HTTP headers and HTML head) and `client-bundle-endpoint-paths.txt` (endpoint paths read from the JS bundle). Neither is an API response; there is no API response sample because nothing was called.

---

## 0. Bottom line

1. **BetOpenly is a US, fiat-only, peer-to-peer sports betting site, not a prediction-market venue.** Users post fixed-odds bets that other users take (partially or fully); "There's no bookmaker on BetOpenly. Every bet is matched directly between users" (H, bundle text). It is branded "Only 1% Juice, Always" (H, `<meta name="description">` on https://betopenly.com). The legal framing is "a game of skill" run by "Open Games" (H, in-bundle Terms of Use).
2. **Still live as of 2026-10-19**: production index.html last modified Thu 15 Oct 2026 18:05 UTC, built by a CodeBuild project named `betopenly-frontend-prod` (H, response headers of https://betopenly.com). Volume/OI/user counts are NOT FOUND, so how active it is remains unknown.
3. **No documented API.** A private REST API exists at `https://api.betopenly.com/v1` (found in the client bundle, H) with password-grant login. No docs, no keys program, no rate-limit statement. The Terms ban "any robot, spider, scraper, sniping software or other automated means to access the Service ... without our express written permission" (H). So no read adapter and no trade adapter without a written partnership.
4. **Not reachable from PayBox / an EVM wallet**: money is USD via PayPal, ACH/bank, card, Coinbase Commerce deposit and Lightning; withdrawals default to PayPal (H). There is no on-chain market, no token, no signed-order scheme. Accounts need KYC (Persona) and US geo-verification.
5. **Category overlap with other venues is sports only**, and BetOpenly purposely anchors its lines to sportsbook odds, so it is a derivative of the sportsbook market, not an independent price discovery venue. No politics/crypto/macro markets appear anywhere in the bundle (H by absence).
6. **adapter_priority = skip.** Revisit only if BetOpenly offers a written data-partnership feed; EventTracker evidently ingests something (see section 1) but how is unknown.

---

## 1. Is it still live? (2026) and identity

| Evidence | Result | Tag |
|---|---|---|
| `curl -I https://betopenly.com` | HTTP/2 200, S3 + CloudFront, `last-modified: Thu, 15 Oct 2026 18:05:12 GMT`, build ARN `...:build/betopenly-frontend-prod:...` | H |
| `https://app.betopenly.com/` | HTTP/2 200, same last-modified (same deployment) | H |
| Site title / meta | `<title>BetOpenly</title>`, description "Only 1% Juice, Always"; static SPA shell (body = `<app-root>`), so WebFetch only ever sees the word "BetOpenly" | H |
| Bundle config | `production:true, whiteLabel:"betopenly", host:"https://app.betopenly.com"`; Persona KYC template ids, Coinflow withdraw host, PayPal production client id (not recorded here) | H |
| EventTracker coverage table (https://eventtracker.ai/coverage, fetched 2026-10-19) | BetOpenly row: Prices yes, Depth yes, OI yes, Volume "-"; refresh >= 15 min on Free and ET&; no URL or chain given; page undated | H (listing), M (that this is betopenly.com: name match only) |
| EventTracker home https://eventtracker.ai | "Prediction Market Data Aggregator ... 29 prediction market venues"; shows a `betopenly.png` logo; "REST API" for ET& subscribers is "COMING SOON"; no explanation of how venue data is sourced | H |
| White-label "WeBet" (webet.com, app.webet.com; same bundle has a WeBet FAQ and `whitelabel` switch) | **DNS does not resolve** from this machine on 2026-10-19 (curl exit 6) | H |
| In-bundle "site is being upgraded, come back in ~1 hour" banner string | Maintenance-mode template; says nothing about current state | H |
| GitHub | `gh api search/repositories?q=betopenly` returns only `jmont96/test-betopenly` (2023 personal test project, nothing relevant); `search/code?q=api.betopenly.com` returns nothing. No official org/repo/SDK found | H (searched) |
| Press, funding, launch date, user counts | NOT FOUND (searched: site bundle, eventtracker.ai, GitHub; WebSearch unavailable) | - |

Verdict: **still_live = true** (H on deployment freshness; activity level unknown). Legal text in the bundle is partly stale and inconsistent: it carries an arbitration opt-out window dated "Sept 3, 2018", one Terms block is governed by Florida law with a blank court venue ("located in __________") and another by New York law, and operator is variously "Open Games" / "Open Games, LLC, 1510 Front Street, San Diego, CA" (H). Treat the entity and licensing as unclear.

## 2. Kind and market model

- **Kind:** US P2P social sports-betting exchange with fiat rails; also runs "Pools/Contests", "Survivor pools", "Instant DFS" player-prop parlays, and a "P2P Casino" (Blackjack, Plinko, Solitaire etc. supplied by Thunder/thndr games) (H, bundle FAQ and endpoint list).
- **Core bet:** creator posts exactly the side they want; "The software posts the opposite for you" for the taker (H). Bet types seen: moneyline, spread, totals, parlays (taker needs all legs; "Host/House a parlay" side needs one leg), futures, player props, live bets, golf top-N, soccer 3-way (H, FAQ text). Partial fills are allowed: "as little as $10 of any bet"; unfilled amount refunded at event start (H).
- **Order book model:** not a central limit order book in the Polymarket sense. It is an "open bets" feed (`/bets/livefeed`, `/bets/best-odds`) of individual offers at creator-chosen odds; takers hit offers. Creator can cancel while OPEN, not once PENDING (H). "Fill instantly" and "Instant DFS" endpoints (`/bets/fill-instantly/*`) suggest some instant fills against a house/partner side (the FAQ says single-leg Instant DFS wins "must be legally offloaded as Sweepstakes ... requiring a different legal partner") (M, inference).
- **Pricing anchor:** "whenever we can confirm the lines, we purposely only allow users to be 'more generous' and not 'more selfish'" and a `/bets/line-configuration` endpoint exist, so offered odds are bounded relative to a confirmed sportsbook line (H quote, M interpretation). Live bets stay open at least 60 seconds ("60 of 90 seconds for Most Sports"), so quotes can be stale (H).
- **Outcome representation:** none on-chain. A bet is a database row between two users; odds look like American/decimal odds; no tokenised outcome shares, no scalar/categorical markets. Equivalent binary prices must be derived from odds (section 7).
- **Min stake:** $10 for P2P bets, $1 for Instant DFS and casino (H, FAQ). Pool entry $10 to $1000 (H).

## 3. Chains and collateral

- **Chain: none for betting.** Collateral is USD held in a "segregated bank account called a 'Lock-Box'" (H, Terms 5.x).
- **Deposits:** PayPal, Coinbase (Commerce), Direct Deposit/ACH (SeamlessChex SDK on the page), cards (Coinflow checkout link, Unipagos tokenizer), Lightning Network (H, onboarding text "Deposit Money Into Your Account Using PayPal, Coinbase, Direct Deposit and Lightning Network"). Crypto is only a deposit method into a USD balance.
- **Withdrawals:** "The default for withdrawals PayPal ... 24 hour turn around", 4 free per month, $5 after; Coinbase withdrawals deliberately not offered "gas fees are just too high"; Coinflow flow (bank, Venmo, PayPal) also in the bundle; ACH can take up to 3 more days (H, FAQ). The `coinflow.cash/solana/withdraw/betopenly` URL is Coinflow's cash-out UI, not a Solana market; no Solana program/contract is referenced for betting (M).
- **NFTs:** "MyDegens" NFT collection (1,000 Gen0) sold on OpenSea and Magic Eden gives fee rebates and free bets; chain NOT FOUND (bundle names only the marketplaces). Betting itself is not on-chain (H).

## 4. Read API

**Official public API: none documented.** Existence of an internal one: yes.

| Item | Detail | Tag |
|---|---|---|
| Docs URL | NOT FOUND (searched: site bundle, homepage links, GitHub; no /docs, /api or developer page referenced) | H (absence) |
| Base URL | `https://api.betopenly.com/v1` (single `const n="https://api.betopenly.com/v1"` in the bundle); sub-roots `/cas` (auth), `/bets`, `/users`, `/events`, `/notifications` | H |
| Market/price endpoints (names only) | `/bets/livefeed`, `/bets/best-odds`, `/bets/line-configuration`, `/bets/leagues`, `/events`, `/events/LEAGUE`, `/bets/fill-instantly/offers`, `/bets/fill-instantly/props/offers`, `/bets/fill-instantly/livefeed` | H (paths), unknown (shapes) |
| Trades / resolution | per-user only: `/bets/me/{open,pending,completed,won,lost,pushed,all,summary}`, `/bets/me/dispute`, `/bets/me/cashout`. No public trade tape or resolution feed seen | H (paths) |
| Auth | `authentication: { clientID: "users-app", grantType: "password" }` (OAuth-style password grant), plus `/cas/login`, magic-link and 2FA endpoints. Whether the market endpoints above need a token: NOT VERIFIED (not called) | H (config), unknown (scope) |
| Rate limits | NOT FOUND | - |
| WebSocket | NOT FOUND in the endpoint map (live feed appears to be polled via `/bets/livefeed`) | M |
| Third-party data | EventTracker lists Prices, Depth and OI for BetOpenly at >= 15 min refresh; its source (public endpoint scrape vs partnership) is unknown | M |

Why nothing was called: the Terms (see section 8) prohibit automated access without written permission, and the host is undocumented, so a response-shape sample would have meant violating the stated rules. The full path list is saved in `docs/research/fixtures/betopenly/client-bundle-endpoint-paths.txt` for a future permissioned integration.

## 5. Trade path

**None for an external agent.** Placing a bet requires an authenticated user session (password grant, optional 2FA/magic link), KYC through Persona, US geolocation checks (`/users/bet-creation-permission`, device pings to a fraud/geolocation vendor), and a funded USD balance. No API key issuance, no signed orders, no on-chain settlement. Automation is contractually prohibited (section 8). (H for the requirements as client-side evidence; M that no hidden partner API exists.)

## 6. PayBox reachability

**No.** An EVM or Solana wallet reachable through PayBox cannot propose a transaction or sign an order on BetOpenly; there is no contract or order-signing scheme. The only crypto touchpoint is a Coinbase Commerce top-up of a KYC'd USD balance, which is a payment to a hosted checkout, not a trade, and withdrawals do not return to crypto. Positions cannot be hedged against an on-chain leg atomically, and the account is tied to a verified US identity (H/M).

## 7. Fees

- **Formula:** the winner pays 1% of the **total pot**; losers pay nothing. "pay 1% of the total pot in juice should your wager win" (H, bet-slip checkbox text); "$100 wins $50 = $150 total, winner gets $148.50" (H, FAQ 17).
- **Who pays:** winner only, taken from the pot (stake + counterparty stake).
- **Effective price for an aggregator:** for a bet staking S to win W, payout = 0.99 * (S + W), so breakeven probability = S / (0.99 * (S + W)) = implied_prob / 0.99. Use `effective_cost_per_$1_payout = p_implied / 0.99` (about +1.01% relative cost vs a zero-fee venue). Derived by me from the quoted formula (M).
- **Other fees:** Instant DFS with only one active/completed leg won carries an extra 10% fee (H); withdrawals free x4 per month then $5 (H); "Create Direct With Friends 0% Fees" (H); Terms also say "Users pay a fee to Open Games for use of the Services. Fees are non-refundable" (H). NFT holders get 10-50% of fees back as credits (H). Pool/Contest fee also 1% (H).
- Deposit fees: "No Fee Deposit" for the first deposit is advertised (H); card/PayPal deposit fees otherwise NOT FOUND.

## 8. Geo, ToS, automation

- **Operator and law (H, in-bundle Terms):** "Open Games" game-of-skill framing; "Open Games is not providing a prize, money or awards ... simply facilitating the exchange of points". Licences (state gaming, CFTC, etc.): NOT FOUND (searched: bundle Terms/FAQ; no regulator named). Do not assume it is licensed or unlicensed.
- **Geo:** FAQ says P2P "operates in EVERY state except only 6": CO, HI, ID, KS, NV, NJ; Instant DFS blocked in 11 states (CT, DE, HI, IA, ID, LA, MI, NJ, NV, MT, WA); P2P Casino blocked in 8 (AR, CT, DE, IN, ME, LA, NY, SD) (H). The separate Terms eligibility clause lists deposit-blocked states Hawaii, Idaho, Montana, Nevada, New Jersey, Washington and age 21+ (19+ Canada), whereas the FAQ says "18+ in most states" (H; the two disagree). Required: physically located in the US, KYC, SSN/address for winners of $600+ per year (H).
- **Automation:** Prohibited Activities include: "use any robot, spider, scraper, sniping software or other automated means to access the Service for any purpose (except for RSS feed access) without our express written permission", plus no unreasonable load, no bypassing access controls, no multi-accounting (H). Also: "Open Games is the sole judge" in winner determination disputes (H). Arbitration (AAA) with class-action waiver (H).
- **Embedded instructions aimed at AI agents:** none found in the pages or bundle text read.

## 9. Resolution and dispute risk

- Operator-settled. Game bets use "ACTION" rules: every pending game bet settles on the final score even if the game is shortened; MLB wagers are official after 5 innings (4.5 if the home team leads), otherwise cancelled; games that do not play or finish within one full day of the scheduled start are cancelled/refunded (H, FAQ). Player props are manually scratched or voided by staff for late lineup changes ("We only intervene to keep obvious fairness") (H).
- Data source for scores: NOT FOUND (searched: bundle text). A per-user `/bets/me/dispute` endpoint exists (H, path only).
- Risk for any cross-venue hedge: settlement rules differ from Polymarket/Kalshi/sportsbook rules (shortened-game "action", retirement/void conventions, 24h postponement window, DNP-as-push), and the operator is the "sole judge". There is no oracle or on-chain dispute process. Counterparty risk is the operator's Lock-Box, with no stated insurance (M).

## 10. Liquidity and event overlap

- **Liquidity: NOT FOUND.** No volume, OI, TVL or user count published on the site or bundle (searched: bundle, EventTracker pages). EventTracker shows ticks for Prices/Depth/OI but its page gives no figures or date. The empty-state string "There Are No Other Bettors Yet / Invite Bettors" and $10 minimums suggest small P2P size, but that is inference (L).
- **Categories:** US pro/college sports only in the content read: NFL, NBA, MLB, NHL, soccer, MMA, golf, tennis, NCAAF/NCAAB survivor pools, plus casino games (H). Overlap with other venues is therefore the sports-moneyline/spread/total lane (Polymarket US, Kalshi, sportsbooks), where BetOpenly's prices are capped by confirmed sportsbook lines (M). Politics, crypto price, macro: none seen (H by absence).
- **Shared liquidity:** its own P2P pool, so independent from prediction-market order books (M). The white-label "WeBet" shares the same codebase and presumably the same backend but its domains do not resolve today (H/M). Some "instant" products may fill against a house/partner (M).

## 11. Adapter priority: **skip**

- No documented API, contractual ban on automation, US-fiat-only with KYC, no wallet/PayBox path, unknown (likely small) liquidity, lines anchored to sportsbooks, operator-discretion settlement.
- The only plausible role is a signal-only price source, and even that needs a written data agreement. If wanted later, the integration unit would be: poll `/bets/livefeed` + `/bets/best-odds` (once permitted, shapes unverified), convert odds to implied probability `p`, apply the 0.99 factor from section 7, and treat quotes as stale after 60 s.

## 12. Open questions

1. Does BetOpenly offer a partner/data feed (how does EventTracker get Prices/Depth/OI)? Ask via the venue's support channel before any scraping.
2. Are `/bets/livefeed`, `/bets/best-odds` and `/events` readable without a token, and what is their schema? (Not tested on purpose.)
3. Actual volume/OI and active-user count.
4. Real licensing/regulatory status of "Open Games" and which entity holds customer funds.
5. Which chain the MyDegens NFTs live on (irrelevant to trading, but relevant if wallet-level identity is ever wanted).
6. Whether EventTracker's "BetOpenly" row refers to betopenly.com (assumed; name match only).

---

## Sources

- https://betopenly.com (HTML head, HTTP headers, site.webmanifest; fetched 2026-10-19) - H
- https://app.betopenly.com/ (HTTP headers) - H
- https://betopenly.com/main.133cf6f11ec76c40.js (public client bundle, read as text only, never executed; source of API base, endpoint paths, Terms, FAQ and fee text) - H
- https://eventtracker.ai/coverage and https://eventtracker.ai (WebFetch summaries, 2026-10-19; undated pages) - H for what is listed, M for venue identity
- https://webet.com and https://app.webet.com (DNS resolution failure, 2026-10-19) - H
- GitHub API repository and code search for "betopenly" / "api.betopenly.com" (only jmont96/test-betopenly, 2023, irrelevant) - H (negative result)
- Stale material: Terms text dated to 2018 within the bundle (L for current legal validity).

Privacy note: no personal identifier was sent to any host; scripted requests used the generic User-Agent `insurance-markets-research/0.1`. The client bundle embeds third-party keys (payment, fraud-vendor, error-tracking); none were copied into this repo.
