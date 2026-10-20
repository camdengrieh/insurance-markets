# PredicXion / NovaMarkets (novamarkets.space) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public GETs of the marketing site, its static JS, the GitBook docs (`.md` pages) and `gh api` reads. No account, no wallet, no POST, no signing, nothing paid. The site's own API was NOT called (see section 4).

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference/arithmetic; **L** = weak or stale. Anything older than 6 months is flagged.

Fixtures: none. There is no public GET read API, and the site's read endpoints are POST-only, so no response could be sampled within the ground rules.

---

## 0. Bottom line

1. **Live, but it is a rebranded, custodial, closed web app, not an on-chain venue.** `predicxion.io` 301-redirects to `www.novamarkets.space`; the site and docs are current (2026). (H)
2. **No documented API, no contracts, no chain, no wallet connect.** The only API is the front end's private `/api/pdx/...` proxy, every call is POST, and `robots.txt` disallows `/api/`. (H)
3. **Trading needs an email/password account** with an internal "nUSD" balance funded by sending USDT/USDC/DAI to a per-user deposit address. There is no signed-order or transaction-proposal path a PayBox wallet could use. (H)
4. **The headline product is a daily "zodiac" lottery with platform-fixed odds**, which is not an arbitrage leg. The "event" markets (BTC $180k, NBA 2028, iPhone 2027) are three sample cards on the homepage; live depth, pricing mechanism and fees are not documented. (H for what is shown, NOT FOUND for the rest)
5. **adapter_priority = skip.** Relationship between PredicXion and NovaMarkets: redirect (H) plus the internal `/pdx/` API prefix (M, inference) make "same project, rebranded" likely, but no page states it.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `curl -L https://predicxion.io` (and `www.`) | `301 location: https://www.novamarkets.space:443/` then `200` (Next.js, APISIX) on 2026-10-19 | H |
| `https://novamarkets.space` | 301 to `www.novamarkets.space` | H |
| Homepage | Title "NovaMarkets \| Predict the Future", footer "(c) 2026" | H |
| `sitemap.xml` | 6 URLs (home + `/markets` in 5 locales: en, ja, zh-tw, ar, vi); `lastmod` 2026-10-19T02:19Z | H |
| GitBook docs `novamarkets-1.gitbook.io/docs` | 200; Welcome page embeds an image whose filename carries the date 2026-08-12 (docs touched at least then) | M (inference from filename) |
| Telegram `t.me/s/NovaMarkets_Official` | channel header only, 1,049 members, no posts visible | H (members), posts NOT FOUND |
| X `x.com/NovaMktGlobal` | WebFetch got HTTP 402 from x.com; stopped, nothing read | NOT FOUND |
| Press release (chainwire.org, 2025-06-26) | PredicXion launch announcement, Tokyo dateline; this is 16 months old, **possibly stale** | H (that it exists), L (as current state) |

Verdict: **still_live = true** for novamarkets.space; the PredicXion brand itself is dead (domain redirects). Whether any PredicXion-era products (creator-led markets, tournaments, "yield-farming pools") still exist: NOT FOUND (none appear on the site or in the docs).

### Relationship PredicXion <-> NovaMarkets

- H: `predicxion.io` redirects to `novamarkets.space`.
- H: the site's JS calls endpoints under `/pdx/...` (e.g. `/pdx/v2/event/list`, `/pdx/bet_order/create`). `pdx` is plausibly "PredicXion" (M, inference).
- L: a GitHub org `PredicXion` exists (created 2026-04-29, one public repo `bullseye`, sports/esports computer vision). Not shown to be the same entity; ignore.
- NOT FOUND: any page of novamarkets.space, its docs, or my searches that mentions PredicXion or a rebrand. A single extended web search found no coverage linking the two (the search budget for the session was then exhausted).

---

## 2. Kind and market model

- **Kind (H, docs + code):** custodial centralized app with Web3 branding. Sign-up is email + password (+ optional invite code); deposits go to generated per-user addresses; balances are internal ("nUSD"); withdrawals have a security cooldown and Google-Authenticator step (error codes `WITHDRAW_SECURITY_COOLDOWN`, `GOOGLE_AUTH_REQUIRED`, `CAPTCHA_REQUIRED` in the JS). The Terms/Privacy call it "decentralized" and claim "on-chain smart contract-based" settlement, but no contract, chain or audit is published. (H that claims exist; NOT FOUND for evidence)
- **Products (H):**
  1. **Zodiac Predictions** - one round per day; platform reveals 3 "Featured" signs + 1 "Supreme" sign; bet on a sign or group at published fixed odds (Supreme single 9.2x, double 4.1x, triple 2.4x; Featured single 2.4x, double 60x, triple 245x/1,470x; Combo 735x/17,640x; Yin-Yang 0.7x; Color 1.55x; Season 2.4x). Payout = stake x odds, orders cannot be cancelled. Min 1 nUSD. Cut-off 9:00 PM, draw 9:30 PM (time zone not stated).
  2. **Event Prediction** - homepage shows three sample binary-looking events (BTC >= $180,000 on any major exchange before 23:59 UTC 2026-12-31; Apple "AI-native" iPhone in 2027; 2028 NBA champion). The app lets a user pick an `optionId` and a `betAmount`; there is no limit-price field, so this is not a visible order book. Pricing/payout rule (parimutuel, fixed odds, AMM): NOT FOUND. Client fallback minimum bet 10 nUSD (`minBetAmount ?? "10"`, M - from JS).
  3. **Up/down, high/low, odd/even short-duration trading** - "Coming soon" on the homepage.
  4. Also "coming soon": yield products, One-Tap Swap; **Nova Card** (Visa/Mastercard crypto cards) is live per docs.
- **Outcome tokenisation:** none. Positions are rows in the operator's database (`bet_order`, `event/position/list`); no ERC-1155/ERC-20 outcome tokens. (M - inferred from the API names and absence of any chain)
- **Zodiac fairness arithmetic (M, assumes a uniform draw over 12 signs):** Lucky Single 9.2x on a 1-in-12 event returns about 76.7% of stake in expectation; Lucky Triple 2.4x on 3-in-12 about 60%; Season 2.4x on 1-in-4 about 60%. The docs are internally inconsistent in places (Yin-Yang 0.7x "total payout" would lose money on a win; Featured Double 60x vs 3-of-12 odds), so treat these as a house-banked game of chance, not a market. The draw/randomness source is not disclosed.

---

## 3. Chains and collateral

- **Deposit assets (H, docs "How to deposit"):** USDT, USDC, DAI, converted to **nUSD** inside the account. "Available networks may vary depending on the selected asset"; the networks are not listed in the docs (NOT FOUND). Minimum deposit 0.1 USDT.
- **Chains for trading:** none (trading is off-chain in the operator's ledger).
- **Token:** `$NOVA` is mentioned only in the Nova Card cashback offer, which says "NOVA has not yet officially launched" (H). No token address.
- NOT FOUND (searched: homepage, gitbook llms.txt + 6 doc pages, 30 JS chunks, GitHub): contract addresses, chain IDs, wallet-connect libraries (no wagmi/viem/ethers/WalletConnect/solana strings in the chunks loaded by `/` and `/markets`; other lazily loaded chunks were not enumerated).

---

## 4. Read API

- **Official/public API: none.** No developer docs, no OpenAPI, no `/docs`, no `llms.txt` on the main site (404); GitBook `llms.txt` lists only onboarding, zodiac, card and legal pages. (H)
- **Private front-end API (H, from site JS; endpoint names only):** the client calls `fetch('/api' + path)` with `path` under `/pdx/`. Likely base `https://www.novamarkets.space/api/pdx/...` (M - the `/api` prefix is same-origin; upstream host not seen).
  - Public reads (`requestPublic`): `/pdx/v2/event/list`, `/pdx/v2/event/info`, `/pdx/market/list` (categories), `/pdx/event/position/list`, `/pdx/bet_order/list` (activity).
  - Authenticated: `/pdx/auth/{register,login,login/verify,send_email_code,verify_email_code,signout,password/reset}`, `/pdx/user/{info,asset/list,address/list,event/summary,win/summary}`, `/pdx/bet_order/create`, `/pdx/exchange/stablecoin`, `/pdx/dispute/{create,get}`, `/pdx/coupon/{available,claim,my/list}`.
  - **All of these, including the "public" reads, are `method: "POST"`.** Under this job's rules (no POST) I did not call any of them, so no response shape was confirmed. Payload fields for orders seen in JS: `userId, eventId, optionId, betAmount, createTime` (H, JS).
- **robots.txt (H):** `Disallow: /api/` (also `/dashboard/`, `/assets/`, `/settings/`, `/security/`, `/records/`, `/coupons/`), `Crawl-delay: 1`. An adapter that scraped `/api/pdx/*` would violate it.
- **Auth/limits:** session token kept client-side (`AUTH_TOKEN_KEY`), exact header NOT FOUND. Rate limits NOT FOUND. Websocket/SSE: none found in the chunks inspected.
- **Sitemap/SSR:** `/markets` is client-rendered; the HTML contains no market data besides the three homepage sample cards.

---

## 5. Trade path

- **None for an agent.** Order placement = authenticated POST `/pdx/bet_order/create` from an email/password session behind CAPTCHA/2FA flows. No API keys, no EIP-712/Ed25519 signed orders, no on-chain order submission. (H for the front-end flow; the absence of a key/signing scheme is NOT FOUND, not proven)

## 6. PayBox reachability

- **paybox_reachable = no.** A PayBox EVM wallet could only perform a plain ERC-20 transfer to a deposit address, and that address exists only after creating an account (registration plus email code, not automatable here and not something this research may do). After funding, every trade is a session-authenticated call to a private API. No transaction proposal or signed order is accepted. Funds are custodial from the moment they are sent (unknown withdrawal terms), so even the funding leg carries counterparty risk.

---

## 7. Fees

- Prediction trading fees / rake / exchange-to-nUSD spread / withdrawal fees: **NOT FOUND** (searched: Terms, Privacy, Fees and Limits, deposit and zodiac pages; the Terms are silent). The only fee table is for **Nova Card** (funding 1.9% / 0.95% / 0.5%, transaction 0% / 0.8% / 2.5%, issuance 10-99 USDT), which is irrelevant to trading. (H)
- For the zodiac game the house edge is implicit in the odds (section 2, M).

## 8. Resolution mechanism and dispute risk

- **Zodiac (H, docs):** platform announces the winning signs at the daily draw; "the system" auto-settles; lost stakes are not refunded; cancelled orders are refunded. No oracle, no randomness proof.
- **Events (H, partial):** sample cards say settlement is by an exchange spot price or "the official result"; the resolver and timing are not documented. The app has an **appeal/dispute** action for participants (`/pdx/dispute/create`), outcome handling not documented. Terms say disputes go "first ... through community governance or on-chain arbitration", with BVI or "another neutral jurisdiction" law as fallback. No governance system or arbitration contract is published (NOT FOUND).
- **Risk: high.** Single operator controls markets, draws, settlement and withdrawals; no verifiable on-chain record.

## 9. Geo / ToS / automation

- **Jurisdiction restrictions:** none stated in the Terms (NOT FOUND). Entity: only "Nova Markets", no registered legal entity named. Governing law "decentralized principles", fallback BVI. No KYC mentioned in sign-up steps (Nova Card issuance presumably has KYC; not read). Gambling/lottery licensing: NOT FOUND.
- **Automation:** the Terms have no API/bot clause; conduct rules ban "market manipulation", "exploiting bugs or interfering with the normal operation of the platform". `robots.txt` bars `/api/` for all agents. Duplicate-account and "cash-out" abuse can void campaign rewards (cashback page). (H)

## 10. Liquidity

- **No verifiable figure.** The homepage shows three unlabeled stat pairs on the sample cards (18,842 / $8.56M; 17,235 / $8.32M; 13,335 / $6.23M). They are in server-rendered HTML for a page cached with `s-maxage=31536000`, are unlabeled, and sit on a market (BTC $180k by end-2026) with no way to check; treat as **marketing copy, L**. (H that they are displayed, L as volume/OI.)
- DefiLlama `/protocols` (fetched 2026-10-19, 9.3 MB): no entry matching "predicxion", "novamarkets" or "nova markets". (H)
- Telegram channel: 1,049 members on 2026-10-19. (H)
- No on-chain TVL is measurable because no contract is published.

## 11. Category overlap (arbitrage relevance)

- Sample event categories: crypto price (BTC >= $180k by 2026-12-31), tech (Apple iPhone 2027), sports (NBA champion 2028). These would nominally overlap long-dated Polymarket/Kalshi markets, but (a) the cards are static samples with no live odds, (b) no API means no prices to compare, (c) the zodiac product has no analogue anywhere. **No usable arbitrage overlap.** (M)
- Shares liquidity with another venue: NOT FOUND; appears to be a standalone internal ledger. The press release mentions Polymarket only as market context.

## 12. Adapter recommendation

- **adapter_priority = skip.** Reasons: custodial email/password account; no public or documented API (private POST-only, `robots.txt`-disallowed); no chain or contracts; no verifiable liquidity; fixed-odds lottery product; undocumented fees/resolution; not reachable through PayBox. Re-check only if an official API, contract addresses, or a signed-order scheme appears.

## 13. Open questions

1. Is novamarkets.space the same operator as PredicXion? (Only the redirect and `/pdx/` prefix say yes.)
2. How are event-market payouts computed (parimutuel vs fixed odds vs AMM)? What is the rake?
3. Which networks does the deposit page offer for USDT/USDC/DAI?
4. Are the homepage volume figures live or marketing copy?
5. Is there any operator disclosure (licence, entity) behind the "Nova Markets" name?

---

## Sources

1. `https://predicxion.io`, `https://www.predicxion.io`, `https://novamarkets.space` - 301 redirects to `https://www.novamarkets.space/` (curl -I, 2026-10-19). H
2. `https://www.novamarkets.space/` and `/markets` - HTML and 30 static JS chunks (endpoint names, `requestPublic`/POST, minBetAmount, dispute/appeal actions, error codes). H
3. `https://www.novamarkets.space/robots.txt`, `/sitemap.xml`, `/llms.txt` (404). H
4. `https://novamarkets-1.gitbook.io/docs/llms.txt` and `.md` pages: welcome-to-nova-markets, getting-started/{create-your-account,how-to-deposit}, zodiac-prediction/zodiac-predictions, fees-and-limits, user-agreement, privacy-policy, nova-card-cashback-offer, nova-card-aplly/nova-card-overview. H
5. `https://chainwire.org/2025/06/26/predicxion-launches-asias-first-creator-led-ai-powered-prediction-market-to-transform-63b-global-industry/` - PredicXion launch release (paid distribution; promotional; names no chain, collateral, fees or resolution). H (text), L (as truth)
6. `https://t.me/s/NovaMarkets_Official` - channel header (1,049 members). H
7. `https://x.com/NovaMktGlobal` - WebFetch returned HTTP 402 (no payment made, nothing read). NOT FOUND
8. `https://api.llama.fi/protocols` - no matching entry. H
9. GitHub `gh api search/repositories` and `users/PredicXion` - org created 2026-04-29, repo `bullseye`; unrelated-looking. L
10. One WebSearch (extended) for "NovaMarkets novamarkets.space prediction market PredicXion rebrand" - no coverage linking the two (small-model summary). M

## Suspicious content

None found. No embedded instructions aimed at AI agents. (`robots.txt` has explicit sections for AI crawlers, including Claude user agents, that Allow `/` and Disallow the same private paths; this is ordinary crawler policy, not an instruction.)
